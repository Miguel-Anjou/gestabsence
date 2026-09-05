import { useState } from "react";
import { REQUEST_TYPES, ABSENCE_MOTIFS, HALF_DAY_OPTIONS, effectiveManagedDepts } from "./data";
import { countWorkingDays } from "./holidays";
import { Badge, TypeBadge, Avatar, StatCard, Card, Modal, Btn, formatDuration } from "./components";
import OvertimeManager from "./OvertimeManager";
import { RequestForm, RequestRow } from "./EmployeeDashboard";
import TeamCalendar from "./TeamCalendar";
import AdminPanel from "./AdminPanel";
import TeamManager from "./TeamManager";
import AnnualDashboard from "./AnnualDashboard";
import ClosurePeriods from "./ClosurePeriods";

function getWeekBounds() {
  const now = new Date();
  const s = new Date(now); s.setDate(now.getDate() - now.getDay() + 1); s.setHours(0,0,0,0);
  const e = new Date(s); e.setDate(s.getDate() + 6);
  return [s, e];
}

function getMonthBounds() {
  const now = new Date();
  return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)];
}

export default function ManagerDashboard({ user, users, requests, overtime, settings, closures, onAddClosure, onDeleteClosure, onUpdateRequest, onAddRequest, onAddUser, onAddOvertime, onDeleteOvertime, onAddRecovery, onUpdateUser, onResetSoldes, onSaveSettings, onDeleteRequest, onEditRequest }) {
  const [mainTab, setMainTab] = useState("absences");
  const [tab, setTab] = useState("pending");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [teamOnly, setTeamOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState("");
  const [absenceMotif, setAbsenceMotif] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [reqSearch, setReqSearch] = useState("");
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [addReqForm, setAddReqForm] = useState({ userId: "", type: "absence", subType: "full", startDate: "", endDate: "", reason: "", absenceMotif: "", heureDebut: "", heureFin: "" });
  const [addReqError, setAddReqError] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [showPersonalForm, setShowPersonalForm] = useState(false);
  const [editPersonalReq, setEditPersonalReq] = useState(null);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", department: user.managedDepts?.[0] || "", role: "employee" });

  const managedDepts   = effectiveManagedDepts(user);
  const mgrUserIds     = user.managedUserIds || [];  // équipe définie manuellement

  // Tous les salariés actifs (responsables et chefs d'équipe voient tout le monde)
  const managedUsers = users.filter(u =>
    u.id !== user.id &&
    (u.role === "employee" || u.role === "manager" || u.role === "teamleader") && !u.archived
  );
  const managedUserIds = managedUsers.map(u => u.id);

  // Équipe directe (définie manuellement, sinon = tous managedUsers)
  const myTeamUsers = mgrUserIds.length > 0
    ? users.filter(u => mgrUserIds.includes(u.id) && !u.archived)
    : managedUsers;

  const archiveCutoff = new Date(); archiveCutoff.setDate(archiveCutoff.getDate() - 30);
  const archiveCutoffStr = archiveCutoff.toISOString().split("T")[0];
  const allRequests = requests.filter(r =>
    managedUserIds.includes(r.userId) &&
    (r.status === "pending" || r.status === "chef_approved" || (r.endDate || r.startDate) >= archiveCutoffStr)
  );

  const filterByPeriod = (reqs) => {
    if (periodFilter === "week") {
      const [s, e] = getWeekBounds();
      return reqs.filter(r => { const d = new Date(r.startDate); return d >= s && d <= e; });
    }
    if (periodFilter === "month") {
      const [s, e] = getMonthBounds();
      return reqs.filter(r => { const d = new Date(r.startDate); return d >= s && d <= e; });
    }
    return reqs;
  };

  const isTeamLeader = user.role === "teamleader";
  let filtered = filterByPeriod(allRequests);
  if (tab === "pending") {
    if (isTeamLeader) {
      filtered = filtered.filter(r => r.status === "pending" && r.type !== "absence" && r.type !== "retard");
    } else {
      filtered = filtered.filter(r => (r.status === "pending" || r.status === "chef_approved") && r.type !== "absence" && r.type !== "retard");
    }
  }
  else if (tab === "myvalidations") filtered = filtered.filter(r => r.chefValidatedBy === user.id && r.status === "chef_approved");
  else if (tab === "approved") filtered = filtered.filter(r => r.status === "approved");
  else if (tab === "rejected") filtered = filtered.filter(r => r.status === "rejected");
  if (deptFilter !== "all") filtered = filtered.filter(r => { const u = users.find(x => x.id === r.userId); return u?.department === deptFilter; });
  if (typeFilter !== "all") filtered = filtered.filter(r => r.type === typeFilter);
  if (teamOnly && mgrUserIds.length > 0) filtered = filtered.filter(r => mgrUserIds.includes(r.userId));
  if (reqSearch.trim()) {
    const q = reqSearch.trim().toLowerCase();
    filtered = filtered.filter(r => {
      const u = users.find(x => x.id === r.userId);
      return (u?.name || "").toLowerCase().includes(q) || (u?.department || "").toLowerCase().includes(q);
    });
  }
  filtered = [...filtered].reverse();

  const needsValidation = (r) => r.type !== "absence" && r.type !== "retard";
  const pending = isTeamLeader
    ? allRequests.filter(r => r.status === "pending" && needsValidation(r)).length
    : allRequests.filter(r => (r.status === "pending" || r.status === "chef_approved") && needsValidation(r)).length;
  const myValidationsWaiting = isTeamLeader
    ? allRequests.filter(r => r.chefValidatedBy === user.id && r.status === "chef_approved").length
    : 0;
  const weekCount = filterByPeriod(allRequests.filter(r => {
    const [s,e] = getWeekBounds(); const d = new Date(r.startDate); return d>=s&&d<=e;
  })).length;

  // Absences today — T12:00:00 évite le décalage UTC±1/2
  const today = new Date(); today.setHours(0,0,0,0);
  const absentToday = allRequests.filter(r => {
    if (r.status !== "approved") return false;
    const s = new Date(r.startDate + "T12:00:00"); const e = new Date((r.endDate || r.startDate) + "T12:00:00");
    return s <= today && today <= e;
  }).length;

  const handleAction = (action) => {
    if (action === "rejected" && !comment.trim()) {
      alert("⚠️ Un commentaire est obligatoire en cas de refus.");
      return;
    }
    onUpdateRequest(selected.id, action, comment, absenceMotif, null);
    setSelected(null); setComment(""); setAbsenceMotif("");
  };

  const handleEditAbsence = () => {
    onEditRequest(selected.id, { absenceMotif, comment });
    setSelected(null); setComment(""); setAbsenceMotif("");
  };

  const handleAddManagerRequest = () => {
    const f = addReqForm;
    if (!f.userId || !f.startDate) { setAddReqError("Salarié et date sont obligatoires."); return; }
    const isHalfDay  = f.subType === "morning" || f.subType === "afternoon";
    const isRetard   = f.type === "retard";
    const isAbsence  = f.type === "absence";
    const useHoraire = (isRetard || isAbsence) && f.heureDebut && f.heureFin;
    // Absence sans horaires et journée entière → peut avoir une date de fin
    const absenceMultiDay = isAbsence && !useHoraire && f.subType === "full";
    if (!isHalfDay && !isRetard && !isAbsence && !f.endDate) { setAddReqError("Veuillez indiquer une date de fin."); return; }
    if (absenceMultiDay && !f.endDate) { setAddReqError("Veuillez indiquer une date de fin."); return; }

    // Calcul durée depuis les horaires si renseignés
    let days = 0.5;
    let durationLabel = "";
    if (absenceMultiDay) {
      days = countWorkingDays(f.startDate, f.endDate) || 1;
    } else if (useHoraire) {
      const [dh, dm] = f.heureDebut.split(":").map(Number);
      const [fh, fm] = f.heureFin.split(":").map(Number);
      const diffMin = (fh * 60 + fm) - (dh * 60 + dm);
      if (diffMin <= 0) { setAddReqError("L'heure de fin doit être après l'heure de début."); return; }
      days = Math.round(diffMin / 60 * 100) / 100;
      const h = Math.floor(diffMin / 60), m = diffMin % 60;
      durationLabel = `${h}h${m > 0 ? String(m).padStart(2,"0") : ""}`;
    } else if (!isRetard && !isAbsence) {
      const endDate = isHalfDay ? f.startDate : f.endDate;
      days = countWorkingDays(f.startDate, endDate) || 1;
    }

    const endDate = (isHalfDay || isRetard || (isAbsence && !absenceMultiDay)) ? f.startDate : f.endDate;
    const reasonFinal = f.reason.trim() || (durationLabel ? `Durée : ${durationLabel}` : "");
    const heureInfo = useHoraire ? ` · ${f.heureDebut}–${f.heureFin}` : "";

    // Le salarié a-t-il déjà une demande active sur cette période ? On garde la modale
    // ouverte pour que le responsable puisse voir son planning (ci-dessous) et corriger.
    const conflicts = requests.filter(r =>
      r.userId === f.userId &&
      (r.status === "pending" || r.status === "chef_approved" || r.status === "approved") &&
      r.startDate <= endDate && (r.endDate || r.startDate) >= f.startDate
    );
    if (conflicts.length > 0) {
      setAddReqError(`⚠️ Ce salarié a déjà ${conflicts.length > 1 ? "des demandes" : "une demande"} sur cette période (voir son planning ci-dessus). Modifiez les dates ou annulez.`);
      return;
    }

    onAddRequest({
      userId: f.userId, type: f.type, subType: f.subType,
      startDate: f.startDate, endDate, days,
      reason: reasonFinal || (isRetard ? "Retard" : "Absence"),
      absenceMotif: f.absenceMotif,
      heureDebut: f.heureDebut, heureFin: f.heureFin,
      status: "approved",
      comment: `Saisi par le responsable${heureInfo}`,
    });
    setAddReqForm({ userId: "", type: "absence", subType: "full", startDate: "", endDate: "", reason: "", absenceMotif: "", heureDebut: "", heureFin: "" });
    setAddReqError(""); setShowAddRequest(false);
  };

  const handleAddUser = () => {
    if (!newUser.name || !newUser.email || !newUser.password) return;
    onAddUser({ ...newUser, soldeConges: 25 });
    setNewUser({ name: "", email: "", password: "", department: user.managedDepts?.[0] || "", role: "employee" });
    setShowAddUser(false);
  };

  const getUserById = (id) => users.find(u => u.id === id);

  if (mainTab === "myconges") {
    const { L=8, M=8, Me=8, J=8, V=8 } = user?.horaire || {};
    const myHoursPerDay = (L + M + Me + J + V) / 5 || 8;
    const myOwnRequests = requests.filter(r => r.userId === user.id);
    const ownPending = myOwnRequests.filter(r => r.status === "pending" || r.status === "chef_approved").length;
    const allSorted = [...myOwnRequests].sort((a, b) => b.startDate.localeCompare(a.startDate));
    const handlePersonalSubmit = (formData) => {
      onAddRequest({ userId: user.id, status: "pending", comment: "", absenceMotif: "", ...formData });
      setShowPersonalForm(false);
    };
    const handlePersonalEdit = (formData) => {
      onEditRequest(editPersonalReq.id, { ...formData, status: "pending" });
      setEditPersonalReq(null);
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <TopTabs mainTab={mainTab} setMainTab={setMainTab} user={user} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: "20px", fontWeight: "700", color: "#1a1a2e" }}>Mes congés & absences</h2>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#888" }}>Vos propres demandes — validées par votre responsable</p>
          </div>
          <Btn onClick={() => setShowPersonalForm(true)}>+ Nouvelle demande</Btn>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
          <StatCard label="Congés payés" value={`${user.soldeConges}j`} sub="disponibles" color="#0F6E56" bg="#E1F5EE" />
          <StatCard label="RTT" value={`${user.soldeRTT || 0}j`} sub="disponibles" color="#185FA5" bg="#E6F1FB" />
          <StatCard label="H. récup." value={`${user.soldeHeures || 0}h`} sub="disponibles" color="#B45309" bg="#FEF3C7" />
          <StatCard label="En attente" value={ownPending} sub="demande(s)" color="#BA7517" bg="#FAEEDA" />
        </div>
        <Card>
          {allSorted.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#bbb" }}>
              <div style={{ fontSize: "32px" }}>📭</div>
              <p>Aucune demande pour l'instant</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {allSorted.map(req => (
                <RequestRow key={req.id} req={req} onEdit={r => setEditPersonalReq(r)} onDelete={onDeleteRequest} hoursPerDay={myHoursPerDay} users={users} />
              ))}
            </div>
          )}
        </Card>
        <Modal open={showPersonalForm} onClose={() => setShowPersonalForm(false)} title="Nouvelle demande">
          <RequestForm user={user} onSubmit={handlePersonalSubmit} onCancel={() => setShowPersonalForm(false)} />
        </Modal>
        <Modal open={!!editPersonalReq} onClose={() => setEditPersonalReq(null)} title="Modifier la demande">
          {editPersonalReq && <RequestForm initial={editPersonalReq} user={user} onSubmit={handlePersonalEdit} onCancel={() => setEditPersonalReq(null)} />}
        </Modal>
      </div>
    );
  }

  if (mainTab === "overtime") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <TopTabs mainTab={mainTab} setMainTab={setMainTab} user={user} />
        <OvertimeManager
          user={user}
          users={users}
          overtime={overtime || []}
          requests={requests}
          onAddOvertime={onAddOvertime}
          onDeleteOvertime={onDeleteOvertime}
          onAddRecovery={onAddRecovery}
        />
      </div>
    );
  }

  if (mainTab === "admin") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <TopTabs mainTab={mainTab} setMainTab={setMainTab} user={user} />
        <AdminPanel
          users={users}
          settings={settings}
          closures={closures||[]}
          onAddClosure={onAddClosure}
          onDeleteClosure={onDeleteClosure}
          onUpdateUser={onUpdateUser}
          onAddUser={onAddUser}
          onResetSoldes={onResetSoldes}
          onSaveSettings={onSaveSettings}
        />
      </div>
    );
  }

  if (mainTab === "team") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <TopTabs mainTab={mainTab} setMainTab={setMainTab} user={user} />
        <TeamManager
          user={user}
          users={users}
          requests={requests}
          onAddUser={onAddUser}
          onUpdateUser={onUpdateUser}
          onArchiveUser={(id) => onUpdateUser(id, { archived: true })}
        />
      </div>
    );
  }

  if (mainTab === "calendar") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <TopTabs mainTab={mainTab} setMainTab={setMainTab} user={user} />
        <TeamCalendar
          users={users}
          requests={requests}
          managedDepts={managedDepts}
          teamUserIds={mgrUserIds}
          onAddRequest={onAddRequest}
          onUpdateRequest={onUpdateRequest}
          onEditRequest={onEditRequest}
          currentUser={user}
          closures={closures||[]}
        />
      </div>
    );
  }

  if (mainTab === "analytics") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <TopTabs mainTab={mainTab} setMainTab={setMainTab} user={user} />
        <AnnualDashboard users={users} requests={requests} overtime={overtime||[]} managedDepts={managedDepts} settings={settings} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <TopTabs mainTab={mainTab} setMainTab={setMainTab} user={user} />
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>{user.role === "admin" ? "Administration RH" : "Tableau de bord Responsable"}</h2>
          <p style={styles.sub}>
            {managedDepts.join(", ")} · {managedUsers.length} salarié(s)
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Btn variant="outline" onClick={() => { setAddReqForm({...addReqForm, type: user.role === "teamleader" ? "absence" : "absence"}); setShowAddRequest(true); }}>📋 Saisir absence / retard</Btn>
          {(user.role === "admin" || user.role === "manager") && (
            <Btn variant="outline" onClick={() => setShowAddUser(true)}>+ Salarié</Btn>
          )}
        </div>
      </div>

      <div style={styles.statsRow}>
        <StatCard label="En attente" value={pending} sub="à traiter" color="#BA7517" bg="#FAEEDA" />
        <StatCard label="Cette semaine" value={weekCount} sub="demande(s)" color="#185FA5" bg="#E6F1FB" />
        <StatCard label="Absents aujourd'hui" value={absentToday} sub="salarié(s)" color="#993556" bg="#FBEAF0" />
        <StatCard label="Salariés gérés" value={managedUsers.length} sub="dans vos services" color="#534AB7" bg="#EEEDFE" />
      </div>

      <Card>
        <div style={styles.toolbar}>
          <div style={styles.tabs}>
            {[
              ["pending","En attente"],
              ...(isTeamLeader ? [["myvalidations","Mes validations"]] : []),
              ["approved","Approuvées"],
              ["rejected","Refusées"],
              ["all","Toutes"]
            ].map(([k,l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ ...styles.tab, ...(tab===k ? styles.tabActive : {}) }}>
                {l}
                {k === "pending" && pending > 0 && <span style={styles.badge}>{pending}</span>}
                {k === "myvalidations" && myValidationsWaiting > 0 && <span style={styles.badge}>{myValidationsWaiting}</span>}
              </button>
            ))}
          </div>
          <div style={styles.filters}>
            {mgrUserIds.length > 0 && (
              <button onClick={() => setTeamOnly(v => !v)} style={{
                padding: "7px 14px", border: `1.5px solid ${teamOnly ? "#1D9E75" : "#e0e0e0"}`,
                borderRadius: "8px", cursor: "pointer", fontSize: "13px",
                fontFamily: "'DM Sans', sans-serif", fontWeight: teamOnly ? "600" : "400",
                background: teamOnly ? "#E1F5EE" : "#fff", color: teamOnly ? "#0F6E56" : "#555",
                whiteSpace: "nowrap",
              }}>
                {teamOnly ? "👥 Mon équipe ✓" : "🌍 Tous · Mon équipe ?"}
              </button>
            )}
            <select style={styles.select} value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}>
              <option value="all">Toute période</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
            </select>
            <select style={styles.select} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="all">Tous les services</option>
              {managedDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={styles.select} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">Tous types</option>
              {Object.entries(REQUEST_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <input
          value={reqSearch}
          onChange={e => setReqSearch(e.target.value)}
          placeholder="🔍 Rechercher par nom ou service…"
          style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none", marginBottom: "10px" }}
        />
        <div style={{ fontSize: "12px", color: "#999", marginBottom: "10px" }}>{filtered.length} demande(s)</div>

        {filtered.length === 0 ? (
          <div style={styles.empty}><span style={{ fontSize: "32px" }}>✅</span><p>Aucune demande dans cette catégorie</p></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filtered.map(req => {
              const emp = getUserById(req.userId);
              return (
                <div key={req.id} onClick={() => { setSelected(req); setComment((req.type === "absence" || req.type === "retard") ? (req.comment || "") : ""); setAbsenceMotif(req.absenceMotif || ""); }} style={styles.row}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                    <Avatar initials={emp?.avatar || "??"} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: "500", color: "#222" }}>{emp?.name}</div>
                      <div style={{ fontSize: "12px", color: "#999" }}>
                        {emp?.department} · {new Date(req.startDate).toLocaleDateString("fr-FR")}
                        {req.endDate !== req.startDate && ` → ${new Date(req.endDate).toLocaleDateString("fr-FR")}`}
                        {" · "}{formatDuration(req)}
                        {req.subType === "morning" && " · 🌅 Matin"}
                        {req.subType === "afternoon" && " · 🌆 Après-midi"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <TypeBadge type={req.type} />
                    <Badge status={req.status} />
                    {req.status === "chef_approved" && tab !== "myvalidations" && (
                      <span style={{ fontSize: "11px", background: "#EDE9FE", color: "#7C3AED", padding: "2px 7px", borderRadius: "10px", whiteSpace: "nowrap" }}>
                        ✓ {users.find(u => u.id === req.chefValidatedBy)?.name || "Chef d'équipe"}
                      </span>
                    )}
                    {req.status === "chef_approved" && tab === "myvalidations" && (
                      <span style={{ fontSize: "11px", background: "#FFF7ED", color: "#B45309", padding: "2px 7px", borderRadius: "10px", whiteSpace: "nowrap" }}>
                        ⏳ En attente responsable
                      </span>
                    )}
                    {req.status === "pending" && !isTeamLeader && (
                      <span style={{ fontSize: "11px", background: "#FFF7ED", color: "#B45309", padding: "2px 7px", borderRadius: "10px", whiteSpace: "nowrap" }}>
                        ⏳ Pas encore validé par chef
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Team overview */}
      <Card style={{ marginTop: "0.5rem" }}>
        <h3 style={styles.sectionTitle}>Vue équipe <span style={{ fontSize:"12px", color:"#999", fontWeight:"400" }}>({myTeamUsers.length} membres)</span></h3>
        <input
          value={teamSearch}
          onChange={e => setTeamSearch(e.target.value)}
          placeholder="🔍 Rechercher un membre (nom, service)…"
          style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none", marginBottom: "12px" }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
          {myTeamUsers.filter(emp => {
            const q = teamSearch.trim().toLowerCase();
            if (!q) return true;
            return (emp.name||"").toLowerCase().includes(q) || (emp.department||"").toLowerCase().includes(q);
          }).map(emp => {
            const empReqs = allRequests.filter(r => r.userId === emp.id);
            const pending = empReqs.filter(r => r.status === "pending").length;
            const [s, e] = getMonthBounds();
            const monthCount = empReqs.filter(r => { const d = new Date(r.startDate); return d>=s&&d<=e; }).length;
            const isAbsent = allRequests.some(r => {
              if (r.userId !== emp.id || r.status !== "approved") return false;
              const s = new Date(r.startDate); const e = new Date(r.endDate);
              return s <= today && today <= e;
            });
            return (
              <div key={emp.id} style={styles.empCard}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Avatar initials={emp.avatar} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: "500", color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.name}</div>
                    <div style={{ fontSize: "11px", color: "#999" }}>{emp.department}</div>
                  </div>
                  {isAbsent && <span style={{ fontSize: "10px", background: "#FCEBEB", color: "#A32D2D", padding: "2px 6px", borderRadius: "4px" }}>Absent</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "12px", color: "#777", flexWrap: "wrap", gap: "4px" }}>
                  <span>CP: <strong style={{ color: "#0F6E56" }}>{emp.soldeConges}j</strong></span>
                  {(emp.soldeRTT||0) > 0 && <span>RTT: <strong style={{ color: "#0369A1" }}>{emp.soldeRTT}j</strong></span>}
                  {(emp.soldeHeures||0) > 0 && <span>HR: <strong style={{ color: "#B45309" }}>{emp.soldeHeures}h</strong></span>}
                  {pending > 0 && <span style={{ color: "#BA7517" }}>{pending} en attente</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Modal: request detail */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setAbsenceMotif(""); }} title="Traiter la demande">
        {selected && (() => {
          const emp = getUserById(selected.userId);
          const isAbsence = selected.type === "absence";
          const existingMotif = ABSENCE_MOTIFS.find(m => m.value === (absenceMotif || selected.absenceMotif));
          return (
            <div>
              {/* Salarié */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", background: "#f9f9f9", borderRadius: "10px", marginBottom: "1rem" }}>
                <Avatar initials={emp?.avatar} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "500" }}>{emp?.name}</div>
                  <div style={{ fontSize: "13px", color: "#999" }}>{emp?.department}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "#999" }}>Solde CP</div>
                  <div style={{ fontWeight: "700", color: "#0F6E56" }}>{emp?.soldeConges}j</div>
                </div>
                {emp?.soldeRTT > 0 && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "11px", color: "#999" }}>RTT</div>
                    <div style={{ fontWeight: "700", color: "#0369A1" }}>{emp?.soldeRTT}j</div>
                  </div>
                )}
              </div>

              {/* Badges */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "1rem", flexWrap: "wrap" }}>
                <TypeBadge type={selected.type} />
                <Badge status={selected.status} />
                {selected.subType && selected.subType !== "full" && (
                  <span style={{ background: "#f0f0f0", color: "#555", padding: "3px 10px", borderRadius: "20px", fontSize: "12px" }}>
                    {selected.subType === "morning" ? "🌅 Matin" : "🌆 Après-midi"}
                  </span>
                )}
              </div>

              {/* Détails */}
              <div style={styles.detailGrid}>
                <div style={styles.detailRow}><span style={styles.dl}>Période</span>
                  <span>{new Date(selected.startDate).toLocaleDateString("fr-FR")}{selected.endDate !== selected.startDate ? ` → ${new Date(selected.endDate).toLocaleDateString("fr-FR")}` : ""}</span>
                </div>
                {selected.heureDebut && selected.heureFin && (
                  <div style={styles.detailRow}><span style={styles.dl}>Horaires</span><span>{selected.heureDebut} → {selected.heureFin}</span></div>
                )}
                <div style={styles.detailRow}><span style={styles.dl}>Durée</span><span>{formatDuration(selected)}</span></div>
                <div style={styles.detailRow}><span style={styles.dl}>Motif salarié</span><span style={{ maxWidth: "220px", textAlign: "right" }}>{selected.reason}</span></div>
                {existingMotif && (
                  <div style={styles.detailRow}><span style={styles.dl}>Motif RH</span>
                    <span style={{ color: "#185FA5" }}>{existingMotif.icon} {existingMotif.label}</span>
                  </div>
                )}
                {selected.comment && (
                  <div style={styles.detailRow}><span style={styles.dl}>Commentaire</span><span style={{ maxWidth: "220px", textAlign: "right" }}>{selected.comment}</span></div>
                )}
              </div>

              {/* Conflits équipe : autres absences sur la même période */}
              {(() => {
                const conflicts = allRequests.filter(r =>
                  r.id !== selected.id &&
                  r.status === "approved" &&
                  r.startDate <= (selected.endDate || selected.startDate) &&
                  (r.endDate || r.startDate) >= selected.startDate
                );
                if (conflicts.length === 0) return null;
                return (
                  <div style={{ background: "#FFF7ED", border: "1px solid #FCD34D", borderRadius: "8px", padding: "10px 12px", fontSize: "12px", color: "#92400E", marginBottom: "1rem" }}>
                    <div style={{ fontWeight: "600", marginBottom: "4px" }}>⚠️ {conflicts.length} autre(s) absence(s) sur cette période :</div>
                    {conflicts.slice(0, 4).map(r => {
                      const u = users.find(x => x.id === r.userId);
                      return <div key={r.id} style={{ marginTop: "2px" }}>· {u?.name} ({REQUEST_TYPES[r.type]?.label})</div>;
                    })}
                    {conflicts.length > 4 && <div style={{ marginTop: "2px", color: "#B45309" }}>+ {conflicts.length - 4} autres…</div>}
                  </div>
                );
              })()}

              {selected.status === "chef_approved" && !isTeamLeader && selected.type !== "absence" && selected.type !== "retard" && (
                <div style={{ background: "#EDE9FE", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#7C3AED", marginBottom: "1rem" }}>
                  ✅ Validé par <strong>{users.find(u => u.id === selected.chefValidatedBy)?.name || "le chef d'équipe"}</strong> — en attente de votre validation finale
                </div>
              )}
              {selected.status === "pending" && !isTeamLeader && selected.type !== "absence" && selected.type !== "retard" && (
                <div style={{ background: "#FFF7ED", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#B45309", marginBottom: "1rem" }}>
                  ⏳ Pas encore validé par le chef d'équipe
                </div>
              )}

              {/* Historique de validation */}
              {(selected.chefValidatedBy || selected.validatedBy) && (
                <div style={{ background: "#f8f8f8", borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: "#555", marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "5px" }}>
                  <div style={{ fontWeight: "600", color: "#888", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Historique</div>
                  <div style={{ color: "#555" }}>📨 Soumis le {new Date(selected.createdAt).toLocaleDateString("fr-FR")} par <strong>{users.find(u => u.id === selected.userId)?.name}</strong></div>
                  {selected.chefValidatedBy && (
                    <div style={{ color: "#7C3AED" }}>✓ 1re validation — <strong>{users.find(u => u.id === selected.chefValidatedBy)?.name || "Chef d'équipe"}</strong></div>
                  )}
                  {selected.validatedBy && (
                    <div style={{ color: selected.status === "approved" ? "#0F6E56" : "#A32D2D" }}>
                      {selected.status === "approved" ? "✅" : "❌"} Décision finale — <strong>{users.find(u => u.id === selected.validatedBy)?.name || "—"}</strong>
                      {selected.validatedAt && <span style={{ color: "#999" }}> · {new Date(selected.validatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>}
                    </div>
                  )}
                </div>
              )}
              {(isAbsence || selected.type === "retard") ? (
                /* Absence / retard : pas de validation, seulement modification */
                (user.role === "teamleader" || user.role === "manager" || user.role === "admin") ? (
                  <>
                    <div style={{ background: "#F0FDF4", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#166534", marginBottom: "1rem" }}>
                      ℹ️ Les absences et retards sont enregistrés directement — aucune validation requise. Vous pouvez modifier les informations ci-dessous.
                    </div>
                    {isAbsence && (
                      <div style={{ marginTop: "1rem" }}>
                        <label style={{ fontSize: "13px", fontWeight: "500", color: "#555", display: "block", marginBottom: "6px" }}>
                          Motif d'absence (RH)
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                          {ABSENCE_MOTIFS.map(m => (
                            <button key={m.value} onClick={() => setAbsenceMotif(m.value)} style={{
                              padding: "8px 10px", border: `1.5px solid ${absenceMotif === m.value ? "#185FA5" : "#e0e0e0"}`,
                              borderRadius: "8px", background: absenceMotif === m.value ? "#E6F1FB" : "#fff",
                              color: absenceMotif === m.value ? "#185FA5" : "#444",
                              cursor: "pointer", fontSize: "12px", textAlign: "left",
                              fontFamily: "'DM Sans', sans-serif", fontWeight: absenceMotif === m.value ? "600" : "400",
                            }}>{m.icon} {m.label}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: "1rem" }}>
                      <label style={{ fontSize: "13px", fontWeight: "500", color: "#555", display: "block", marginBottom: "5px" }}>Note interne</label>
                      <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Ajouter une note visible par le salarié..."
                        style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", resize: "vertical", minHeight: "70px" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "1rem" }}>
                      <Btn variant="ghost" onClick={() => { setSelected(null); setAbsenceMotif(""); setComment(""); }}>Fermer</Btn>
                      <Btn variant="success" onClick={handleEditAbsence}>Sauvegarder</Btn>
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: "1rem", textAlign: "right" }}>
                    <Btn variant="ghost" onClick={() => setSelected(null)}>Fermer</Btn>
                  </div>
                )
              ) : (
                /* Autres types : workflow de validation classique */
                <>
                  {(() => {
                    const requester = users.find(u => u.id === selected.userId);
                    const requesterIsManager = requester?.role === "manager";
                    const statusOk = selected.status === "pending" || selected.status === "chef_approved";
                    // Seul l'admin peut valider les demandes des responsables
                    if (requesterIsManager) return user.role === "admin" && statusOk;
                    // Responsable et admin peuvent gérer chefs d'équipe et salariés
                    // Chef d'équipe gère uniquement les salariés (pas les autres chefs d'équipe)
                    const requesterIsTL = requester?.role === "teamleader";
                    if (requesterIsTL) return (user.role === "manager" || user.role === "admin") && statusOk;
                    // Salariés : workflow normal (teamleader 1er niveau, manager/admin final)
                    return (
                      (user.role === "teamleader" && selected.status === "pending") ||
                      (user.role === "manager" && statusOk) ||
                      (user.role === "admin" && statusOk)
                    );
                  })() ? (
                    <>
                      <div style={{ marginTop: "1rem" }}>
                        <label style={{ fontSize: "13px", fontWeight: "500", color: "#555", display: "block", marginBottom: "5px" }}>Commentaire <span style={{ color: "#A32D2D", fontSize: "11px" }}>(obligatoire en cas de refus)</span></label>
                        <textarea
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                          placeholder="Ajouter un commentaire visible par le salarié..."
                          style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", resize: "vertical", minHeight: "70px" }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "1rem", flexWrap: "wrap" }}>
                        <Btn variant="ghost" onClick={() => { setSelected(null); setAbsenceMotif(""); }}>Fermer</Btn>
                        <Btn variant="danger" onClick={() => handleAction("rejected")}>Refuser</Btn>
                        {user.role === "manager" && selected.status === "pending" && (() => {
                          const req2 = users.find(u => u.id === selected.userId);
                          return req2?.role === "employee";
                        })() && (
                          <Btn variant="outline" onClick={() => handleAction("chef_approved")}>→ Chef d'équipe</Btn>
                        )}
                        <Btn variant="success" onClick={() => handleAction("approved")}>
                          {isTeamLeader ? "✓ Valider (1er niveau)" : selected.status === "chef_approved" ? "✓ Approuver définitivement" : "✓ Approuver directement"}
                        </Btn>
                      </div>
                    </>
                  ) : (
                    <div style={{ marginTop: "1rem", textAlign: "right" }}>
                      <Btn variant="ghost" onClick={() => setSelected(null)}>Fermer</Btn>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Modal: saisir absence/retard pour un salarié */}
      <Modal open={showAddRequest} onClose={() => { setShowAddRequest(false); setAddReqError(""); }} title="Saisir une absence / retard">
        <div>
          <div style={{ background: "#E6F1FB", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#185FA5", marginBottom: "1rem" }}>
            ℹ️ La demande sera directement <strong>approuvée</strong> et visible dans le planning du salarié.
          </div>
          <div style={mfld}>
            <label style={mlbl}>Salarié *</label>
            <select style={minp} value={addReqForm.userId} onChange={e => setAddReqForm({...addReqForm, userId: e.target.value})}>
              <option value="">-- Sélectionnez un salarié --</option>
              {mgrUserIds.length > 0 && (
                <optgroup label="Mon équipe">
                  {managedUsers.filter(u => mgrUserIds.includes(u.id)).map(u => <option key={u.id} value={u.id}>{u.name} — {u.department}</option>)}
                </optgroup>
              )}
              <optgroup label={mgrUserIds.length > 0 ? "Tous les salariés" : "Salariés"}>
                {managedUsers.filter(u => !mgrUserIds.includes(u.id)).map(u => <option key={u.id} value={u.id}>{u.name} — {u.department}</option>)}
              </optgroup>
            </select>
          </div>
          {addReqForm.userId && (() => {
            const todayStr = new Date().toISOString().split("T")[0];
            const empPlanning = requests
              .filter(r => r.userId === addReqForm.userId && r.status !== "rejected" && (r.endDate || r.startDate) >= todayStr)
              .sort((a, b) => a.startDate.localeCompare(b.startDate));
            if (empPlanning.length === 0) return null;
            const formEnd = addReqForm.endDate || addReqForm.startDate;
            return (
              <div style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "10px 12px", fontSize: "12px", marginBottom: "1rem", maxHeight: "160px", overflowY: "auto" }}>
                <div style={{ fontWeight: "600", color: "#555", marginBottom: "6px" }}>📅 Planning du salarié</div>
                {empPlanning.map(r => {
                  const overlap = addReqForm.startDate && r.startDate <= formEnd && (r.endDate || r.startDate) >= addReqForm.startDate;
                  const statusLabel = r.status === "approved" ? "validé" : r.status === "pending" ? "en attente" : "validé chef";
                  return (
                    <div key={r.id} style={{ padding: "3px 6px", borderRadius: "6px", marginBottom: "2px", background: overlap ? "#FCEBEB" : "transparent", color: overlap ? "#A32D2D" : "#666" }}>
                      {overlap ? "⚠️ " : "· "}{r.startDate}{r.endDate && r.endDate !== r.startDate ? ` → ${r.endDate}` : ""} — {REQUEST_TYPES[r.type]?.label || r.type} ({statusLabel})
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <div style={mfld}>
            <label style={mlbl}>Type *</label>
            <select style={minp} value={addReqForm.type} onChange={e => setAddReqForm({...addReqForm, type: e.target.value, subType: "full"})}>
              <optgroup label="Absences (notées par le responsable)">
                <option value="absence">📋 Absence</option>
                <option value="retard">⏰ Retard</option>
              </optgroup>
              <optgroup label="Congés">
                <option value="conge">☀️ Congé payé</option>
                <option value="conge_sans_solde">📭 Congé sans solde</option>
                <option value="conge_exceptionnel">⭐ Congé exceptionnel</option>
                <option value="rtt">🕐 Repos</option>
              </optgroup>
            </select>
          </div>
          {addReqForm.type === "absence" && (
            <div style={mfld}>
              <label style={mlbl}>Motif d'absence (qualification RH)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {ABSENCE_MOTIFS.map(m => (
                  <button key={m.value} onClick={() => setAddReqForm({...addReqForm, absenceMotif: m.value})} style={{
                    padding: "7px 10px", border: `1.5px solid ${addReqForm.absenceMotif === m.value ? "#185FA5" : "#e0e0e0"}`,
                    borderRadius: "8px", background: addReqForm.absenceMotif === m.value ? "#E6F1FB" : "#fff",
                    color: addReqForm.absenceMotif === m.value ? "#185FA5" : "#444",
                    cursor: "pointer", fontSize: "12px", textAlign: "left", fontFamily: "'DM Sans', sans-serif",
                  }}>{m.icon} {m.label}</button>
                ))}
              </div>
            </div>
          )}
          {addReqForm.type !== "retard" && (
            <div style={mfld}>
              <label style={mlbl}>Durée</label>
              <div style={{ display: "flex", gap: "6px" }}>
                {HALF_DAY_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => setAddReqForm({...addReqForm, subType: o.value})} style={{
                    flex: 1, padding: "7px 4px", border: `1.5px solid ${addReqForm.subType === o.value ? "#1D9E75" : "#e0e0e0"}`,
                    borderRadius: "8px", background: addReqForm.subType === o.value ? "#E1F5EE" : "#fff",
                    color: addReqForm.subType === o.value ? "#0F6E56" : "#555",
                    cursor: "pointer", fontSize: "11px", fontFamily: "'DM Sans', sans-serif",
                    fontWeight: addReqForm.subType === o.value ? "600" : "400",
                  }}>{o.label}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: (addReqForm.subType === "full" && addReqForm.type !== "retard" && !(addReqForm.type === "absence" && (addReqForm.heureDebut || addReqForm.subType !== "full"))) ? "1fr 1fr" : "1fr", gap: "10px", marginBottom: "1rem" }}>
            <div>
              <label style={mlbl}>Date *</label>
              <input style={minp} type="date" value={addReqForm.startDate} onChange={e => setAddReqForm({...addReqForm, startDate: e.target.value})} />
            </div>
            {addReqForm.subType === "full" && addReqForm.type !== "retard" && !(addReqForm.type === "absence" && addReqForm.heureDebut) && (
              <div>
                <label style={mlbl}>Date de fin *</label>
                <input style={minp} type="date" value={addReqForm.endDate} min={addReqForm.startDate} onChange={e => setAddReqForm({...addReqForm, endDate: e.target.value})} />
              </div>
            )}
          </div>
          {/* Horaires pour retard et absence */}
          {(addReqForm.type === "retard" || addReqForm.type === "absence") && (
            <div style={mfld}>
              <label style={mlbl}>Horaires <span style={{ color: "#aaa", fontWeight: "400" }}>(optionnel — calcul automatique de la durée)</span></label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "11px", color: "#888", display: "block", marginBottom: "3px" }}>Heure de début</label>
                  <input style={minp} type="time" value={addReqForm.heureDebut} onChange={e => setAddReqForm({...addReqForm, heureDebut: e.target.value})} />
                </div>
                <div>
                  <label style={{ fontSize: "11px", color: "#888", display: "block", marginBottom: "3px" }}>Heure de fin</label>
                  <input style={minp} type="time" value={addReqForm.heureFin} onChange={e => setAddReqForm({...addReqForm, heureFin: e.target.value})} />
                </div>
              </div>
              {addReqForm.heureDebut && addReqForm.heureFin && addReqForm.heureDebut < addReqForm.heureFin && (() => {
                const [dh, dm] = addReqForm.heureDebut.split(":").map(Number);
                const [fh, fm] = addReqForm.heureFin.split(":").map(Number);
                const diff = (fh * 60 + fm) - (dh * 60 + dm);
                const h = Math.floor(diff/60), m = diff%60;
                return (
                  <div style={{ fontSize: "12px", color: "#185FA5", marginTop: "6px", background: "#E6F1FB", borderRadius: "6px", padding: "6px 10px" }}>
                    ⏱ Durée calculée : <strong>{h}h{m > 0 ? String(m).padStart(2,"0") : ""}</strong>
                  </div>
                );
              })()}
            </div>
          )}
          <div style={mfld}>
            <label style={mlbl}>Motif / Commentaire <span style={{ color: "#aaa", fontWeight: "400" }}>(optionnel)</span></label>
            <textarea style={{ ...minp, resize: "vertical", minHeight: "60px" }} value={addReqForm.reason} onChange={e => setAddReqForm({...addReqForm, reason: e.target.value})} placeholder="Précisez..." />
          </div>
          {addReqError && <div style={{ background: "#FCEBEB", color: "#A32D2D", borderRadius: "8px", padding: "10px", fontSize: "13px", marginBottom: "1rem" }}>{addReqError}</div>}
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowAddRequest(false)}>Annuler</Btn>
            <Btn onClick={handleAddManagerRequest}>Enregistrer (approuvé)</Btn>
          </div>
        </div>
      </Modal>

      {/* Modal: add user */}
      <Modal open={showAddUser} onClose={() => setShowAddUser(false)} title="Ajouter un salarié">
        <div>
          <div style={styles.formField}>
            <label style={styles.fl}>Nom complet *</label>
            <input style={styles.fi} value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} placeholder="Prénom Nom" />
          </div>
          <div style={styles.formField}>
            <label style={styles.fl}>Identifiant (login) *</label>
            <input style={styles.fi} value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} placeholder="prenom.nom" />
          </div>
          <div style={styles.formField}>
            <label style={styles.fl}>Mot de passe *</label>
            <input style={styles.fi} type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
          </div>
          <div style={styles.formField}>
            <label style={styles.fl}>Service</label>
            <select style={styles.fi} value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})}>
              {managedDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={styles.formField}>
            <label style={styles.fl}>Rôle</label>
            <select style={styles.fi} value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
              <option value="employee">Salarié</option>
              <option value="manager">Responsable</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "1rem" }}>
            <Btn variant="ghost" onClick={() => setShowAddUser(false)}>Annuler</Btn>
            <Btn onClick={handleAddUser}>Créer le compte</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const styles = {
  container: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" },
  title: { margin: 0, fontFamily: "'Syne', sans-serif", fontSize: "24px", fontWeight: "700", color: "#1a1a2e" },
  sub: { margin: "4px 0 0", fontSize: "13px", color: "#888" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" },
  toolbar: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "1rem" },
  tabs: { display: "flex", gap: "4px", background: "#f5f5f5", borderRadius: "8px", padding: "3px", flexWrap: "wrap" },
  tab: { padding: "6px 12px", border: "none", background: "transparent", borderRadius: "6px", cursor: "pointer", fontSize: "13px", color: "#666", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: "6px" },
  tabActive: { background: "#fff", color: "#1a1a2e", fontWeight: "500", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  badge: { background: "#BA7517", color: "#fff", borderRadius: "10px", padding: "1px 6px", fontSize: "11px", fontWeight: "600" },
  filters: { display: "flex", gap: "8px", flexWrap: "wrap" },
  select: { padding: "6px 10px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", background: "#fff", cursor: "pointer" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1.5px solid #f0f0f0", borderRadius: "10px", cursor: "pointer", gap: "12px" },
  empty: { textAlign: "center", padding: "2rem", color: "#999", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" },
  sectionTitle: { margin: "0 0 1rem", fontFamily: "'Syne', sans-serif", fontSize: "16px", fontWeight: "600", color: "#1a1a2e" },
  empCard: { background: "#fafafa", border: "1.5px solid #f0f0f0", borderRadius: "10px", padding: "12px" },
  detailGrid: { display: "flex", flexDirection: "column", gap: "0" },
  detailRow: { display: "flex", justifyContent: "space-between", fontSize: "14px", padding: "8px 0", borderBottom: "1px solid #f5f5f5" },
  dl: { color: "#999", fontWeight: "500" },
  formField: { marginBottom: "1rem" },
  fl: { display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "5px" },
  fi: { width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" },
};

function TopTabs({ mainTab, setMainTab, user }) {
  return (
    <div style={{ display: "flex", gap: "4px", background: "#fff", borderRadius: "12px", padding: "5px", border: "1px solid #eee", flexWrap: "wrap" }}>
      {[["absences", "📋 Absences"], ["overtime", "⏱ H. récupérables"], ["team", "👥 Équipe"], ["calendar", "📅 Calendrier"], ["analytics", "📊 Statistiques"], ...(user?.role === "admin" || user?.role === "manager" ? [["admin", "⚙️ Admin"]] : []), ...(user?.role !== "employee" ? [["myconges", "🏖 Mes congés"]] : [])].map(([k, l]) => (
        <button key={k} onClick={() => setMainTab(k)} style={{
          padding: "8px 14px", border: "none", borderRadius: "8px", cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif", fontSize: "13px", fontWeight: mainTab === k ? "600" : "400",
          background: mainTab === k ? "linear-gradient(135deg, #1D9E75, #0F6E56)" : "transparent",
          color: mainTab === k ? "#fff" : "#666",
          transition: "all 0.15s",
        }}>{l}</button>
      ))}
    </div>
  );
}

const mfld = { marginBottom: '1rem' };
const mlbl = { display: 'block', fontSize: '13px', fontWeight: '500', color: '#555', marginBottom: '5px' };
const minp = { width: '100%', padding: '9px 12px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif", outline: 'none', background: '#fff' };

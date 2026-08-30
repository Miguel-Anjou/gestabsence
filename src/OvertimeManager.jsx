import { useState } from "react";
import { Avatar, Card, Modal, StatCard, Btn } from "./components";
import { effectiveManagedDepts } from "./data";

const DAYS = ["L","M","Me","J","V","S","D"];
const DAYS_LABELS = { L:"Lundi",M:"Mardi",Me:"Mercredi",J:"Jeudi",V:"Vendredi",S:"Samedi",D:"Dimanche" };

export default function OvertimeManager({ user, users, overtime, requests, onAddOvertime, onDeleteOvertime, onAddRecovery }) {
  // Responsable : voir TOUS les salariés de ses services
  const managedDepts = effectiveManagedDepts(user);
  const managedUsers = users.filter(u =>
    managedDepts.includes(u.department) && u.id !== user.id &&
    (u.role === "employee" || u.role === "manager" || u.role === "teamleader")
  );

  const [subTab, setSubTab]           = useState("hs");   // "hs" | "recup"
  const [showFormHR, setShowFormHR]   = useState(false);
  const [showFormRec, setShowFormRec] = useState(false);
  const [form, setForm]               = useState({ userId: managedUsers[0]?.id || "", date: "", hours: "", reason: "" });
  const [recForm, setRecForm]         = useState({ userId: managedUsers[0]?.id || "", date: "", hours: "", reason: "Récupération HR" });
  const [formError, setFormError]     = useState("");
  const [recError, setRecError]       = useState("");
  const [filterUser, setFilterUser]   = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const myOvertime = overtime.filter(o => managedUsers.some(u => u.id === o.userId));
  const now = new Date();

  const filtered = myOvertime.filter(o => {
    if (filterUser !== "all" && o.userId !== filterUser) return false;
    if (filterPeriod === "week") {
      const s = new Date(now); s.setDate(now.getDate() - now.getDay() + 1); s.setHours(0,0,0,0);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      const d = new Date(o.date); return d >= s && d <= e;
    }
    if (filterPeriod === "month") {
      const d = new Date(o.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalHours = filtered.reduce((s, o) => s + o.hours, 0);
  const totalThisMonth = myOvertime.filter(o => {
    const d = new Date(o.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, o) => s + o.hours, 0);

  // Récupérations notées par le responsable (type "recup_noted")
  const recupNoted = overtime.filter(o =>
    managedUsers.some(u => u.id === o.userId) && o.isRecovery
  );

  // Demandes de récupération salarié (type recuperation dans requests)
  const recupRequests = (requests || []).filter(r =>
    managedUsers.some(u => u.id === r.userId) && r.type === "recuperation"
  );

  // Compteurs par salarié
  const balances = managedUsers.map(u => {
    const totalHR    = myOvertime.filter(o => o.userId === u.id && !o.isRecovery).reduce((s, o) => s + o.hours, 0);
    const totalRecup = myOvertime.filter(o => o.userId === u.id && o.isRecovery).reduce((s, o) => s + o.hours, 0);
    const net        = totalHR - totalRecup;
    return { ...u, totalHR, totalRecup, net };
  }).filter(u => u.totalHR > 0 || u.soldeHeures > 0);

  const getUserById = id => users.find(u => u.id === id);

  // ─── Saisir HR ────────────────────────────────────────────────────────────
  const handleSubmitHR = () => {
    if (!form.userId || !form.date || !form.hours || !form.reason) {
      setFormError("Tous les champs sont obligatoires."); return;
    }
    const h = parseFloat(form.hours);
    if (isNaN(h) || h <= 0 || h > 24) { setFormError("Nombre d'heures invalide."); return; }
    onAddOvertime({ ...form, hours: h, createdBy: user.id, isRecovery: false });
    setForm({ userId: managedUsers[0]?.id || "", date: "", hours: "", reason: "" });
    setFormError(""); setShowFormHR(false);
  };

  // ─── Noter une récupération ───────────────────────────────────────────────
  const handleSubmitRec = () => {
    if (!recForm.userId || !recForm.date || !recForm.hours) {
      setRecError("Tous les champs sont obligatoires."); return;
    }
    const h = parseFloat(recForm.hours);
    const emp = getUserById(recForm.userId);
    const solde = emp?.soldeHeures || 0;
    if (isNaN(h) || h <= 0) { setRecError("Nombre d'heures invalide."); return; }
    if (h > solde) { setRecError(`Solde insuffisant — ${emp?.name} n'a que ${solde}h disponibles.`); return; }
    onAddRecovery({ ...recForm, hours: h, createdBy: user.id, isRecovery: true });
    setRecForm({ userId: managedUsers[0]?.id || "", date: "", hours: "", reason: "Récupération HR" });
    setRecError(""); setShowFormRec(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: "700", color: "#1a1a2e" }}>
            Heures récupérables & Récupérations
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#888" }}>
            {managedDepts.join(", ")} · {managedUsers.length} salarié(s)
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Btn variant="outline" onClick={() => setShowFormRec(true)}>🔄 Noter récupération</Btn>
          <Btn onClick={() => setShowFormHR(true)}>+ Saisir des H. récupérables</Btn>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
        <StatCard label="HR ce mois"        value={`${totalThisMonth}h`} sub="heures récupérables" color="#534AB7" bg="#EEEDFE" />
        <StatCard label="HR (filtre actif)" value={`${totalHours}h`}     sub="dans la sélection"      color="#185FA5" bg="#E6F1FB" />
        <StatCard label="Récup. notées"     value={`${recupNoted.reduce((s,o)=>s+o.hours,0)}h`} sub="par les responsables" color="#1D9E75" bg="#E1F5EE" />
        <StatCard label="Demandes récup."   value={recupRequests.filter(r=>r.status==="pending").length} sub="en attente salarié" color="#BA7517" bg="#FAEEDA" />
      </div>

      {/* Sous-onglets */}
      <div style={{ display: "flex", gap: "4px", background: "#f5f5f5", borderRadius: "10px", padding: "4px", alignSelf: "flex-start" }}>
        {[["hs","⏱ Heures saisies"],["recup","🔄 Récupérations"],["compteurs","📊 Compteurs"]].map(([k,l]) => (
          <button key={k} onClick={() => setSubTab(k)} style={{
            padding: "7px 14px", border: "none", borderRadius: "7px", cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
            background: subTab===k ? "#fff" : "transparent",
            color: subTab===k ? "#1a1a2e" : "#888", fontWeight: subTab===k ? "600" : "400",
            boxShadow: subTab===k ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}>{l}</button>
        ))}
      </div>

      {/* ── H. récupérables saisies ─────────────────────────────────────────────────────── */}
      {subTab === "hs" && (
        <Card>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "1rem", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <select style={ss} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                <option value="all">Tous les salariés</option>
                {managedUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select style={ss} value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
                <option value="all">Toute période</option>
                <option value="week">Cette semaine</option>
                <option value="month">Ce mois</option>
              </select>
            </div>
            <span style={{ fontSize: "12px", color: "#999" }}>{filtered.filter(o=>!o.isRecovery).length} entrée(s) · {filtered.filter(o=>!o.isRecovery).reduce((s,o)=>s+o.hours,0)}h</span>
          </div>
          {filtered.filter(o => !o.isRecovery).length === 0 ? (
            <EmptyState icon="🕐" msg="Aucune heure récupérable enregistrée" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filtered.filter(o => !o.isRecovery).map(ot => (
                <OTRow key={ot.id} ot={ot} emp={getUserById(ot.userId)} onDelete={setConfirmDelete} color="#534AB7" sign="+" />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Récupérations notées ───────────────────────────────────────────── */}
      {subTab === "recup" && (
        <Card>
          <p style={{ fontSize: "13px", color: "#666", margin: "0 0 1rem" }}>
            Heures récupérées notées par les responsables + demandes soumises par les salariés.
          </p>
          {/* Récupérations responsable */}
          {recupNoted.length > 0 && (
            <>
              <div style={{ fontSize: "12px", fontWeight: "600", color: "#1D9E75", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Notées par les responsables</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1rem" }}>
                {recupNoted.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(ot => (
                  <OTRow key={ot.id} ot={ot} emp={getUserById(ot.userId)} onDelete={setConfirmDelete} color="#1D9E75" sign="-" label="récupéré" />
                ))}
              </div>
            </>
          )}
          {/* Demandes salariés */}
          {recupRequests.length > 0 && (
            <>
              <div style={{ fontSize: "12px", fontWeight: "600", color: "#B45309", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Demandes salariés</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {recupRequests.sort((a,b)=>new Date(b.startDate)-new Date(a.startDate)).map(r => {
                  const emp = getUserById(r.userId);
                  return (
                    <div key={r.id} style={{ ...rowStyle, background: "#fffbf0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                        <Avatar initials={emp?.avatar||"??"} size={32} />
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: "500" }}>{emp?.name}</div>
                          <div style={{ fontSize: "12px", color: "#999" }}>{new Date(r.startDate).toLocaleDateString("fr-FR")} · {r.days}j · {r.reason}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "20px",
                        background: r.status==="approved"?"#E1F5EE":r.status==="rejected"?"#FCEBEB":"#FAEEDA",
                        color: r.status==="approved"?"#0F6E56":r.status==="rejected"?"#A32D2D":"#BA7517",
                        fontWeight: "500" }}>
                        {r.status==="approved"?"Approuvée":r.status==="rejected"?"Refusée":"En attente"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {recupNoted.length === 0 && recupRequests.length === 0 && (
            <EmptyState icon="🔄" msg="Aucune récupération enregistrée" />
          )}
        </Card>
      )}

      {/* ── Compteurs ──────────────────────────────────────────────────────── */}
      {subTab === "compteurs" && (
        <Card>
          <h3 style={{ margin: "0 0 1rem", fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: "600" }}>Compteurs individuels</h3>
          {balances.length === 0 ? (
            <EmptyState icon="📊" msg="Aucune donnée" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
              {balances.map(emp => {
                const pct = emp.totalHR > 0 ? Math.round((emp.totalRecup / emp.totalHR) * 100) : 0;
                return (
                  <div key={emp.id} style={{ background: "#f9f9f9", borderRadius: "12px", padding: "14px", border: "1.5px solid #eee" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                      <Avatar initials={emp.avatar} size={32} />
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: "600" }}>{emp.name}</div>
                        <div style={{ fontSize: "11px", color: "#999" }}>{emp.department}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                        <span style={{ color: "#666" }}>H. récupérables saisies</span>
                        <span style={{ fontWeight: "600", color: "#534AB7" }}>+{emp.totalHR}h</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                        <span style={{ color: "#666" }}>Récupérées</span>
                        <span style={{ fontWeight: "600", color: "#1D9E75" }}>-{emp.totalRecup}h</span>
                      </div>
                      <div style={{ height: "1px", background: "#e0e0e0", margin: "2px 0" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                        <span style={{ fontWeight: "600" }}>Solde net</span>
                        <span style={{ fontWeight: "700", color: emp.net > 0 ? "#B45309" : "#1D9E75" }}>{emp.net}h</span>
                      </div>
                      {/* Barre de progression */}
                      {emp.totalHR > 0 && (
                        <div style={{ background: "#e0e0e0", borderRadius: "4px", height: "6px", marginTop: "4px" }}>
                          <div style={{ background: "#1D9E75", height: "6px", borderRadius: "4px", width: `${pct}%`, transition: "width 0.3s" }} />
                        </div>
                      )}
                      {emp.totalHR > 0 && <div style={{ fontSize: "11px", color: "#999", textAlign: "right" }}>{pct}% récupéré</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ─── Modals ─────────────────────────────────────────────────────────── */}
      {/* Saisir HR */}
      <Modal open={showFormHR} onClose={() => { setShowFormHR(false); setFormError(""); }} title="Saisir des heures récupérables">
        <HRForm form={form} setForm={setForm} managedUsers={managedUsers} error={formError} onSubmit={handleSubmitHR} onCancel={() => setShowFormHR(false)} />
      </Modal>

      {/* Noter récupération */}
      <Modal open={showFormRec} onClose={() => { setShowFormRec(false); setRecError(""); }} title="Noter des heures récupérées">
        <div style={{ background: "#E1F5EE", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#0F6E56", marginBottom: "1rem" }}>
          🔄 Ces heures seront <strong>déduites</strong> du compteur HR du salarié.
        </div>
        <HRForm form={recForm} setForm={setRecForm} managedUsers={managedUsers} error={recError}
          onSubmit={handleSubmitRec} onCancel={() => setShowFormRec(false)}
          users={users} showSolde />
      </Modal>

      {/* Confirmer suppression */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Supprimer cette entrée ?">
        {confirmDelete && (() => {
          const emp = getUserById(confirmDelete.userId);
          return (
            <div>
              <div style={{ padding: "12px", background: "#f9f9f9", borderRadius: "10px", marginBottom: "1rem", fontSize: "14px" }}>
                <strong>{emp?.name}</strong> · {new Date(confirmDelete.date).toLocaleDateString("fr-FR")} · <strong style={{ color: "#534AB7" }}>{confirmDelete.isRecovery ? "-" : "+"}{confirmDelete.hours}h</strong>
                <div style={{ color: "#888", marginTop: "4px" }}>{confirmDelete.reason}</div>
              </div>
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>Annuler</Btn>
                <Btn variant="danger" onClick={() => { onDeleteOvertime(confirmDelete.id, confirmDelete.userId, confirmDelete.hours, confirmDelete.isRecovery); setConfirmDelete(null); }}>
                  Supprimer
                </Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────
function OTRow({ ot, emp, onDelete, color, sign, label }) {
  return (
    <div style={{ ...rowStyle, background: "#fafafa" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
        <Avatar initials={emp?.avatar || "??"} size={32} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: "500" }}>{emp?.name}</div>
          <div style={{ fontSize: "12px", color: "#999" }}>
            {emp?.department} · {new Date(ot.date).toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"long" })}
          </div>
          <div style={{ fontSize: "12px", color: "#555" }}>{ot.reason}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "16px", fontWeight: "700", color, fontFamily: "'Syne', sans-serif" }}>
            {sign}{ot.hours}h
          </div>
          <div style={{ fontSize: "11px", color: "#bbb" }}>
            {new Date(ot.createdAt).toLocaleDateString("fr-FR")}
          </div>
        </div>
        <button onClick={() => onDelete(ot)} style={{ background: "#FCEBEB", border: "none", color: "#A32D2D", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", fontSize: "12px" }}>✕</button>
      </div>
    </div>
  );
}

function HRForm({ form, setForm, managedUsers, error, onSubmit, onCancel, users, showSolde }) {
  const emp = users?.find(u => u.id === form.userId);
  return (
    <div>
      <div style={fs}>
        <label style={ls}>Salarié *</label>
        <select style={is} value={form.userId} onChange={e => setForm({...form, userId: e.target.value})}>
          {managedUsers.map(u => <option key={u.id} value={u.id}>{u.name} — {u.department}</option>)}
        </select>
        {showSolde && emp && (
          <div style={{ fontSize: "12px", color: "#B45309", marginTop: "4px" }}>
            Solde disponible : <strong>{emp.soldeHeures || 0}h</strong>
          </div>
        )}
      </div>
      <div style={fs}>
        <label style={ls}>Date *</label>
        <input style={is} type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
      </div>
      <div style={fs}>
        <label style={ls}>Nombre d'heures * <span style={{ color: "#aaa", fontWeight: 400 }}>(ex: 1.5 pour 1h30)</span></label>
        <input style={is} type="number" min="0.25" max="24" step="0.25" value={form.hours} onChange={e => setForm({...form, hours: e.target.value})} placeholder="0.00" />
      </div>
      <div style={fs}>
        <label style={ls}>Motif *</label>
        <textarea style={{ ...is, resize: "vertical", minHeight: "60px" }} value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="Raison..." />
      </div>
      {error && <div style={{ background: "#FCEBEB", color: "#A32D2D", borderRadius: "8px", padding: "10px", fontSize: "13px", marginBottom: "1rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onCancel}>Annuler</Btn>
        <Btn onClick={onSubmit}>Enregistrer</Btn>
      </div>
    </div>
  );
}

function EmptyState({ icon, msg }) {
  return (
    <div style={{ textAlign: "center", padding: "2rem", color: "#bbb" }}>
      <div style={{ fontSize: "30px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontSize: "13px" }}>{msg}</div>
    </div>
  );
}

const ss = { padding: "6px 10px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", background: "#fff" };
const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: "1.5px solid #f0f0f0", borderRadius: "10px", gap: "12px" };
const fs = { marginBottom: "1rem" };
const ls = { display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "5px" };
const is = { width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none" };

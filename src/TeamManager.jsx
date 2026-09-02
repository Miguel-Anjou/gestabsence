import { useState } from "react";
import { DEPARTMENTS } from "./data";
import { Avatar, Card, Modal, Btn, StatCard } from "./components";

const DAYS_KEYS   = ["L","M","Me","J","V","S","D"];
const DAYS_LABELS = { L:"Lundi", M:"Mardi", Me:"Mercredi", J:"Jeudi", V:"Vendredi", S:"Samedi", D:"Dimanche" };
const DEFAULT_HORAIRE = { L:8, M:8, Me:8, J:8, V:8, S:0, D:0 };

export default function TeamManager({ user, users, requests, onAddUser, onUpdateUser, onArchiveUser }) {
  const [subTab, setSubTab]       = useState("all");
  const [search, setSearch]       = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [editUser, setEditUser]   = useState(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(null);
  const [showDeptConfig, setShowDeptConfig] = useState(false);
  const [deptDraft, setDeptDraft] = useState(user.managedDepts || []);
  const [newUser, setNewUser]     = useState({
    name: "", email: "", password: "",
    department: user.managedDepts?.[0] || DEPARTMENTS[0],
    role: "employee", soldeConges: 25, soldeRTT: 10, soldeHeures: 0,
    horaire: { ...DEFAULT_HORAIRE },
  });
  const [addError, setAddError] = useState("");

  const managedDepts = user.managedDepts || [];
  const isAdmin      = user.role === "admin";
  const isTeamLeader = user.role === "teamleader";
  const isManager    = user.role === "manager";
  const depts        = DEPARTMENTS;

  const toggleDeptDraft = (dept) =>
    setDeptDraft(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]);

  const saveDepts = () => {
    onUpdateUser(user.id, { managedDepts: deptDraft });
    setShowDeptConfig(false);
  };

  // Admin et manager voient tous les salariés (la config "Mes services" n'affecte pas la visibilité ici).
  // Teamleader : limité à ses services configurés, ou tout si aucun configuré.
  const deptMatch = (u) => {
    if (isAdmin || isManager) return true;
    if (isTeamLeader) return managedDepts.length === 0 || managedDepts.includes(u.department);
    return managedDepts.includes(u.department);
  };

  // Un chef d'équipe ne peut pas modifier un autre chef d'équipe.
  const canEditUser = (emp) => !(isTeamLeader && emp.role === "teamleader");

  // Tous les salariés actifs visibles
  const allActive = users.filter(u =>
    (u.role === "employee" || u.role === "manager" || u.role === "teamleader") &&
    !u.archived && u.id !== user.id && deptMatch(u)
  );

  // Salariés archivés
  const allArchived = users.filter(u =>
    (u.role === "employee" || u.role === "manager" || u.role === "teamleader") &&
    u.archived && u.id !== user.id && deptMatch(u)
  );

  // Équipe directe (managedUserIds)
  const myTeamIds = user.managedUserIds || [];
  const myTeam    = allActive.filter(u => myTeamIds.includes(u.id));

  const handleToggleTeam = (empId) => {
    const newIds = myTeamIds.includes(empId)
      ? myTeamIds.filter(id => id !== empId)
      : [...myTeamIds, empId];
    onUpdateUser(user.id, { managedUserIds: newIds });
  };

  const source   = showArchived ? allArchived : (subTab === "team" ? myTeam : allActive);
  const displayed = source.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchDept   = deptFilter === "all" || u.department === deptFilter;
    return matchSearch && matchDept;
  });

  const totalH = (horaire) => Object.values(horaire || {}).reduce((s, h) => s + (parseFloat(h) || 0), 0);

  const handleAddUser = () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      setAddError("Nom, identifiant et mot de passe sont obligatoires."); return;
    }
    if (users.some(u => u.email === newUser.email.trim())) {
      setAddError("Cet identifiant est déjà utilisé."); return;
    }
    onAddUser({ ...newUser, email: newUser.email.trim(), name: newUser.name.trim(), soldeConges: parseInt(newUser.soldeConges)||25, archived: false });
    setNewUser({ name: "", email: "", password: "", department: user.managedDepts?.[0] || DEPARTMENTS[0], role: "employee", soldeConges: 25, soldeRTT: 10, soldeHeures: 0, horaire: { ...DEFAULT_HORAIRE } });
    setAddError(""); setShowAdd(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: "700", color: "#1a1a2e" }}>
            Gestion des équipes
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#888" }}>
            {allActive.length} actif(s) · {allArchived.length} archivé(s)
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {!isAdmin && !isTeamLeader && (
            <Btn variant="outline" onClick={() => { setDeptDraft(managedDepts); setShowDeptConfig(true); }}>
              🏢 Mes services {managedDepts.length > 0 ? `(${managedDepts.length})` : "(tous)"}
            </Btn>
          )}
          <Btn variant="outline" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "👥 Actifs" : `📦 Archivés (${allArchived.length})`}
          </Btn>
          <Btn onClick={() => setShowAdd(true)}>+ Ajouter un salarié</Btn>
        </div>
      </div>

      {/* Panneau de configuration des services gérés */}
      {showDeptConfig && !isAdmin && !isTeamLeader && (
        <Card style={{ border: "1.5px solid #1D9E75" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <div style={{ fontWeight: "600", fontSize: "14px", color: "#1a1a2e" }}>🏢 Mes services gérés</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                Sélectionnez les services dont vous êtes responsable. Laissez tout décoché pour voir tous les services.
              </div>
            </div>
            <button onClick={() => setShowDeptConfig(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#aaa" }}>✕</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
            {DEPARTMENTS.map(dept => {
              const selected = deptDraft.includes(dept);
              return (
                <button key={dept} onClick={() => toggleDeptDraft(dept)} style={{
                  padding: "7px 14px", borderRadius: "20px", fontSize: "13px", cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", fontWeight: selected ? "600" : "400",
                  border: `1.5px solid ${selected ? "#1D9E75" : "#ddd"}`,
                  background: selected ? "#E1F5EE" : "#fff",
                  color: selected ? "#0F6E56" : "#555",
                }}>
                  {selected ? "✓ " : ""}{dept}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowDeptConfig(false)}>Annuler</Btn>
            <Btn onClick={saveDepts}>Enregistrer</Btn>
          </div>
        </Card>
      )}

      {/* Stats */}
      {!showArchived && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
          <StatCard label="Total actifs"   value={allActive.length}  sub="dans vos services"  color="#1a1a2e" bg="#f0f0f0" />
          <StatCard label="Mon équipe"     value={myTeam.length}     sub="membres assignés"   color="#1D9E75" bg="#E1F5EE" />
          <StatCard label="Services"       value={depts.length}      sub="gérés"              color="#185FA5" bg="#E6F1FB" />
          <StatCard label="En attente"     value={requests.filter(r => allActive.some(u=>u.id===r.userId) && r.status==="pending").length} sub="demandes" color="#BA7517" bg="#FAEEDA" />
        </div>
      )}

      {/* Bannière archivés */}
      {showArchived && (
        <div style={{ background: "#f5f5f5", border: "1.5px solid #ddd", borderRadius: "10px", padding: "12px 16px", fontSize: "13px", color: "#666" }}>
          📦 Affichage des salariés archivés — leurs demandes sont conservées mais ils ne peuvent plus se connecter.
        </div>
      )}

      {/* Sous-onglets (seulement si pas archivés) */}
      {!showArchived && (
        <div style={{ display: "flex", gap: "4px", background: "#f5f5f5", borderRadius: "10px", padding: "4px", alignSelf: "flex-start" }}>
          {[["all",`Tous (${allActive.length})`],["team",`Mon équipe (${myTeam.length})`]].map(([k,l]) => (
            <button key={k} onClick={() => setSubTab(k)} style={{
              padding: "7px 16px", border: "none", borderRadius: "7px", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
              background: subTab===k ? "#fff" : "transparent",
              color: subTab===k ? "#1a1a2e" : "#888", fontWeight: subTab===k ? "600" : "400",
              boxShadow: subTab===k ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}>{l}</button>
          ))}
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          style={{ padding: "7px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", minWidth: "200px", flex: 1 }}
          placeholder="🔍 Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
        />
        <select style={ss} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="all">Tous les services</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Liste */}
      <Card>
        <div style={{ fontSize: "12px", color: "#999", marginBottom: "10px" }}>{displayed.length} salarié(s)</div>
        {displayed.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "#bbb" }}>
            <div style={{ fontSize: "30px" }}>👥</div>
            <div style={{ fontSize: "13px", marginTop: "8px" }}>Aucun salarié trouvé</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {displayed.map(emp => {
              const empReqs    = requests.filter(r => r.userId === emp.id);
              const pending    = empReqs.filter(r => r.status === "pending").length;
              const h          = totalH(emp.horaire);
              const isInTeam   = myTeamIds.includes(emp.id);
              return (
                <div key={emp.id} style={{ ...rowStyle, opacity: emp.archived ? 0.6 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                    <Avatar initials={emp.avatar} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "500", color: "#222" }}>{emp.name}</span>
                        {isInTeam && !showArchived && (
                          <span style={{ fontSize: "10px", background: "#E1F5EE", color: "#0F6E56", padding: "2px 7px", borderRadius: "10px", fontWeight: "600" }}>MON ÉQUIPE</span>
                        )}
                        {emp.archived && (
                          <span style={{ fontSize: "10px", background: "#f0f0f0", color: "#999", padding: "2px 7px", borderRadius: "10px" }}>ARCHIVÉ</span>
                        )}
                      </div>
                      <div style={{ fontSize: "12px", color: "#999" }}>
                        {emp.department} · {emp.email}
                        {h > 0 && <span style={{ color: "#185FA5" }}> · {h}h/sem</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {!showArchived && (
                      <>
                        {canEditUser(emp) && <span style={{ fontSize: "11px", background: "#E1F5EE", color: "#0F6E56", padding: "3px 7px", borderRadius: "6px" }}>{emp.soldeConges}j CP</span>}
                        {canEditUser(emp) && (emp.soldeRTT||0)>0 && <span style={{ fontSize: "11px", background: "#E0F2FE", color: "#0369A1", padding: "3px 7px", borderRadius: "6px" }}>{emp.soldeRTT}j RTT</span>}
                        {(emp.soldeHeures||0)>0 && <span style={{ fontSize: "11px", background: "#FEF3C7", color: "#B45309", padding: "3px 7px", borderRadius: "6px" }}>{emp.soldeHeures}h HS</span>}
                        {pending>0 && <span style={{ fontSize: "11px", background: "#FAEEDA", color: "#BA7517", padding: "3px 7px", borderRadius: "6px" }}>{pending} ⏳</span>}
                        <button
                          onClick={() => handleToggleTeam(emp.id)}
                          title={isInTeam ? "Retirer de mon équipe" : "Ajouter à mon équipe"}
                          style={{ background: isInTeam ? "#FCEBEB" : "#E1F5EE", border: "none", borderRadius: "6px", padding: "5px 9px", cursor: "pointer", fontSize: "13px", color: isInTeam ? "#A32D2D" : "#0F6E56" }}>
                          {isInTeam ? "✖" : "➕"}
                        </button>
                        {canEditUser(emp) && (
                          <Btn size="sm" variant="ghost" onClick={() => setEditUser(emp)}>✎</Btn>
                        )}
                        {(isAdmin || isManager) && (
                          <button onClick={() => setConfirmArchive(emp)} title="Archiver ce salarié"
                            style={{ background: "#f5f5f5", border: "none", borderRadius: "6px", padding: "5px 9px", cursor: "pointer", fontSize: "13px", color: "#888" }}>
                            📦
                          </button>
                        )}
                      </>
                    )}
                    {showArchived && (
                      <Btn size="sm" variant="success" onClick={() => onUpdateUser(emp.id, { archived: false })}>
                        ↩ Réactiver
                      </Btn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modal : ajouter salarié */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setAddError(""); }} title="Ajouter un salarié">
        <UserForm data={newUser} setData={setNewUser} depts={depts} error={addError}
          onSubmit={handleAddUser} onCancel={() => setShowAdd(false)} submitLabel="Créer le compte" />
      </Modal>

      {/* Modal : modifier salarié */}
      {editUser && (
        <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Modifier — ${editUser.name}`}>
          <EditUserForm
            user={editUser} depts={depts} allUsers={users}
            currentManagerId={user.id}
            currentManagerRole={user.role}
            onSave={(updates) => { onUpdateUser(editUser.id, updates); setEditUser(null); }}
            onCancel={() => setEditUser(null)}
          />
        </Modal>
      )}

      {/* Modal : confirmer archivage */}
      <Modal open={!!confirmArchive} onClose={() => setConfirmArchive(null)} title="Archiver ce salarié ?">
        {confirmArchive && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", background: "#f9f9f9", borderRadius: "10px", marginBottom: "1rem" }}>
              <Avatar initials={confirmArchive.avatar} size={40} />
              <div>
                <div style={{ fontWeight: "500" }}>{confirmArchive.name}</div>
                <div style={{ fontSize: "13px", color: "#999" }}>{confirmArchive.department}</div>
              </div>
            </div>
            <div style={{ background: "#FAEEDA", borderRadius: "8px", padding: "12px", fontSize: "13px", color: "#BA7517", marginBottom: "1.25rem" }}>
              ⚠️ Le salarié ne pourra plus se connecter. Ses données et son historique sont conservés. Vous pourrez le réactiver à tout moment.
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setConfirmArchive(null)}>Annuler</Btn>
              <Btn variant="danger" onClick={() => {
                onUpdateUser(confirmArchive.id, { archived: true });
                setConfirmArchive(null);
              }}>📦 Archiver</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Formulaire création salarié ──────────────────────────────────────────────
function UserForm({ data, setData, depts, error, onSubmit, onCancel, submitLabel }) {
  const totalH = Object.values(data.horaire || {}).reduce((s, h) => s + (parseFloat(h)||0), 0);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <Field label="Nom complet *"><input style={inp} placeholder="Marie Dupont" value={data.name} onChange={e => setData({...data, name: e.target.value})} /></Field>
        <Field label="Identifiant (login) *"><input style={inp} placeholder="marie.dupont" value={data.email} onChange={e => setData({...data, email: e.target.value})} /></Field>
        <Field label="Mot de passe *"><input style={inp} type="password" value={data.password} onChange={e => setData({...data, password: e.target.value})} /></Field>
        <Field label="Service">
          <select style={inp} value={data.department} onChange={e => setData({...data, department: e.target.value})}>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Rôle">
          <select style={inp} value={data.role} onChange={e => setData({...data, role: e.target.value})}>
            <option value="employee">Salarié</option>
            <option value="teamleader">Chef d'équipe</option>
            <option value="manager">Responsable</option>
          </select>
        </Field>
        <Field label="Solde CP (jours)"><input style={inp} type="number" min="0" max="50" value={data.soldeConges} onChange={e => setData({...data, soldeConges: e.target.value})} /></Field>
        <Field label="Solde RTT (jours)"><input style={inp} type="number" min="0" max="30" value={data.soldeRTT||0} onChange={e => setData({...data, soldeRTT: parseFloat(e.target.value)||0})} /></Field>
      </div>
      <HoraireEditor horaire={data.horaire||DEFAULT_HORAIRE} onChange={h => setData({...data, horaire: h})} totalH={totalH} />
      {error && <div style={{ background: "#FCEBEB", color: "#A32D2D", borderRadius: "8px", padding: "10px", fontSize: "13px", marginBottom: "1rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onCancel}>Annuler</Btn>
        <Btn onClick={onSubmit}>{submitLabel||"Enregistrer"}</Btn>
      </div>
    </div>
  );
}

// ─── Formulaire modification salarié ─────────────────────────────────────────
function EditUserForm({ user: emp, depts, allUsers, currentManagerId, currentManagerRole, onSave, onCancel }) {
  const [data, setData] = useState({
    name:       emp.name,
    email:      emp.email,
    department: emp.department,
    role:       emp.role,
    soldeConges:  emp.soldeConges,
    soldeRTT:     emp.soldeRTT    || 0,
    soldeHeures:  emp.soldeHeures || 0,
    password:   "",
    horaire: { ...DEFAULT_HORAIRE, ...(emp.horaire||{}) },
  });
  const [error, setError] = useState("");

  const totalH = Object.values(data.horaire).reduce((s, h) => s + (parseFloat(h)||0), 0);

  const handleSave = () => {
    if (!data.name.trim()) { setError("Le nom est obligatoire."); return; }
    if (!data.email.trim()) { setError("L'identifiant est obligatoire."); return; }
    const emailTaken = allUsers.some(u => u.id !== emp.id && u.email === data.email.trim());
    if (emailTaken) { setError("Cet identifiant est déjà utilisé par un autre compte."); return; }
    if (data.password && data.password.length < 6) { setError("Le mot de passe doit comporter au moins 6 caractères."); return; }
    const updates = { ...data, name: data.name.trim(), email: data.email.trim() };
    if (!data.password) delete updates.password;
    onSave(updates);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <Field label="Nom complet *"><input style={inp} value={data.name} onChange={e => setData({...data, name: e.target.value})} /></Field>
        <Field label="Identifiant (login) *"><input style={inp} value={data.email} onChange={e => setData({...data, email: e.target.value.toLowerCase().trim()})} /></Field>
        <Field label="Service">
          <select style={inp} value={data.department} onChange={e => setData({...data, department: e.target.value})}>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Rôle">
          <select style={inp} value={data.role} onChange={e => setData({...data, role: e.target.value})}>
            <option value="employee">Salarié</option>
            <option value="teamleader">Chef d'équipe</option>
            <option value="manager">Responsable</option>
            {currentManagerRole === "admin" && <option value="admin">Admin RH</option>}
          </select>
        </Field>
        <Field label="Nouveau mot de passe">
          <input style={inp} type="password" placeholder="(laisser vide = inchangé)" value={data.password} onChange={e => setData({...data, password: e.target.value})} />
        </Field>
        <Field label="Solde CP (jours)"><input style={inp} type="number" min="0" value={data.soldeConges} onChange={e => setData({...data, soldeConges: parseInt(e.target.value)||0})} /></Field>
        <Field label="Solde RTT (jours)"><input style={inp} type="number" min="0" value={data.soldeRTT} onChange={e => setData({...data, soldeRTT: parseFloat(e.target.value)||0})} /></Field>
        <Field label="Solde HS (heures)"><input style={inp} type="number" min="0" step="0.5" value={data.soldeHeures} onChange={e => setData({...data, soldeHeures: parseFloat(e.target.value)||0})} /></Field>
      </div>
      <HoraireEditor horaire={data.horaire} onChange={h => setData({...data, horaire: h})} totalH={totalH} />
      {data.password && (
        <div style={{ background: "#FEF3C7", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", color: "#92400E", marginTop: "0.5rem" }}>
          ⚠️ Un nouveau mot de passe sera défini. Le salarié devra le modifier à sa prochaine connexion.
        </div>
      )}
      {error && <div style={{ background: "#FCEBEB", color: "#A32D2D", borderRadius: "8px", padding: "10px", fontSize: "13px", marginTop: "0.5rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "1rem" }}>
        <Btn variant="ghost" onClick={onCancel}>Annuler</Btn>
        <Btn onClick={handleSave}>Sauvegarder</Btn>
      </div>
    </div>
  );
}

// ─── Éditeur d'horaire ────────────────────────────────────────────────────────
function HoraireEditor({ horaire, onChange, totalH }) {
  return (
    <div style={{ marginTop: "0.75rem", marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#1a1a2e", marginBottom: "8px" }}>
        Horaire hebdomadaire <span style={{ color: "#999", fontWeight: "400" }}>({totalH}h/semaine)</span>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
        {DAYS_KEYS.map(d => (
          <div key={d} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "11px", color: "#666", marginBottom: "4px", fontWeight: "500" }}>{d}</div>
            <input type="number" min="0" max="12" step="0.5" value={horaire?.[d]??0}
              onChange={e => onChange({...horaire, [d]: parseFloat(e.target.value)||0})}
              style={{ width: "100%", padding: "6px 4px", border: "1.5px solid #e0e0e0", borderRadius: "6px", fontSize: "13px", textAlign: "center", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }}
              title={DAYS_LABELS[d]} />
            <div style={{ fontSize: "10px", color: "#bbb", marginTop: "2px" }}>h</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
        {[["35h", {L:7,M:7,Me:7,J:7,V:7,S:0,D:0}],["39h", {L:8,M:8,Me:8,J:8,V:7,S:0,D:0}],["40h", {L:8,M:8,Me:8,J:8,V:8,S:0,D:0}]].map(([label, h]) => (
          <button key={label} onClick={() => onChange(h)} style={{ padding: "4px 10px", fontSize: "11px", border: "1.5px solid #ddd", borderRadius: "6px", background: "#f9f9f9", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", color: "#555" }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: "0.25rem" }}>
      <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#555", marginBottom: "4px" }}>{label}</label>
      {children}
    </div>
  );
}

const ss = { padding: "7px 10px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", background: "#fff" };
const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1.5px solid #f0f0f0", borderRadius: "10px", gap: "8px" };
const inp = { width: "100%", padding: "8px 10px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none" };

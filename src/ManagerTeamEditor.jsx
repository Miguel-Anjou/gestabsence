import { useState } from "react";
import { Avatar, Card, Btn } from "./components";

export default function ManagerTeamEditor({ users, onUpdateUser }) {
  const managers = users.filter(u => (u.role === "manager" || u.role === "admin") && !u.archived);
  const employees = users.filter(u => (u.role === "employee" || u.role === "teamleader") && !u.archived);
  const [selectedMgr, setSelectedMgr] = useState(managers[0]?.id || "");
  const [search, setSearch] = useState("");

  const mgr = users.find(u => u.id === selectedMgr);
  const mgrTeamIds = mgr?.managedUserIds || [];

  const toggle = (empId) => {
    const current = mgr?.managedUserIds || [];
    const updated = current.includes(empId)
      ? current.filter(id => id !== empId)
      : [...current, empId];
    onUpdateUser(selectedMgr, { managedUserIds: updated });
  };

  const filtered = employees.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.department.toLowerCase().includes(search.toLowerCase())
  );

  // Grouper par service
  const byDept = {};
  filtered.forEach(u => {
    if (!byDept[u.department]) byDept[u.department] = [];
    byDept[u.department].push(u);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        <h3 style={{ margin: "0 0 4px", fontFamily: "'Syne', sans-serif", fontSize: "17px", fontWeight: "700", color: "#1a1a2e" }}>
          Composition des équipes
        </h3>
        <p style={{ margin: 0, fontSize: "13px", color: "#888" }}>
          Définissez quels salariés appartiennent à l'équipe de chaque responsable.
          Un responsable peut aussi traiter les demandes de salariés hors équipe.
        </p>
      </div>

      {/* Sélection du responsable */}
      <div>
        <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "6px" }}>Responsable</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {managers.map(m => (
            <button key={m.id} onClick={() => setSelectedMgr(m.id)} style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "8px 14px", border: `1.5px solid ${selectedMgr === m.id ? "#1D9E75" : "#e0e0e0"}`,
              borderRadius: "10px", background: selectedMgr === m.id ? "#E1F5EE" : "#fff",
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>
              <Avatar initials={m.avatar} size={26} />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "13px", fontWeight: "500", color: selectedMgr === m.id ? "#0F6E56" : "#222" }}>{m.name}</div>
                <div style={{ fontSize: "11px", color: "#999" }}>{m.department} · {(m.managedUserIds||[]).length} membre(s)</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {mgr && (
        <>
          {/* Info */}
          <div style={{ background: "#E6F1FB", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#185FA5" }}>
            ℹ️ <strong>{mgr.name}</strong> peut traiter <strong>toutes</strong> les demandes de l'entreprise, mais son tableau de bord "Mon équipe" n'affiche que les salariés cochés ici.
          </div>

          {/* Recherche */}
          <input
            style={{ padding: "8px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif" }}
            placeholder="🔍 Filtrer les salariés..."
            value={search} onChange={e => setSearch(e.target.value)}
          />

          {/* Actions globales */}
          <div style={{ display: "flex", gap: "8px" }}>
            <Btn size="sm" variant="ghost" onClick={() => onUpdateUser(selectedMgr, { managedUserIds: employees.map(u => u.id) })}>
              ✅ Tout sélectionner
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => onUpdateUser(selectedMgr, { managedUserIds: [] })}>
              ⬜ Tout désélectionner
            </Btn>
          </div>

          {/* Liste par service */}
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {Object.entries(byDept).sort().map(([dept, emps]) => {
                const allInTeam = emps.every(u => mgrTeamIds.includes(u.id));
                const someInTeam = emps.some(u => mgrTeamIds.includes(u.id));
                return (
                  <div key={dept}>
                    {/* En-tête service avec case "tout le service" */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input type="checkbox" checked={allInTeam} ref={el => { if (el) el.indeterminate = someInTeam && !allInTeam; }}
                          onChange={() => {
                            const current = mgr?.managedUserIds || [];
                            const ids = emps.map(u => u.id);
                            const updated = allInTeam
                              ? current.filter(id => !ids.includes(id))
                              : [...new Set([...current, ...ids])];
                            onUpdateUser(selectedMgr, { managedUserIds: updated });
                          }}
                          style={{ width: "16px", height: "16px", cursor: "pointer" }}
                        />
                        <span style={{ fontWeight: "600", fontSize: "13px", color: "#1a1a2e" }}>{dept}</span>
                        <span style={{ fontSize: "11px", color: "#999" }}>{emps.filter(u => mgrTeamIds.includes(u.id)).length}/{emps.length}</span>
                      </div>
                    </div>
                    {/* Salariés du service */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingLeft: "24px" }}>
                      {emps.map(emp => {
                        const inTeam = mgrTeamIds.includes(emp.id);
                        return (
                          <label key={emp.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "8px 10px", borderRadius: "8px", background: inTeam ? "#f0fdf8" : "#fafafa", border: `1px solid ${inTeam ? "#a7f3d0" : "#f0f0f0"}` }}>
                            <input type="checkbox" checked={inTeam} onChange={() => toggle(emp.id)}
                              style={{ width: "15px", height: "15px", cursor: "pointer", flexShrink: 0 }} />
                            <Avatar initials={emp.avatar} size={28} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "13px", fontWeight: "500", color: "#222" }}>{emp.name}</div>
                              <div style={{ fontSize: "11px", color: "#999" }}>{emp.email}</div>
                            </div>
                            {inTeam && <span style={{ fontSize: "10px", color: "#0F6E56", fontWeight: "600" }}>✓ ÉQUIPE</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "#bbb", fontSize: "13px" }}>Aucun salarié trouvé</div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

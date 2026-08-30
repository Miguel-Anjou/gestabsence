import { useState } from "react";
import { Card, StatCard, Avatar } from "./components";
import { REQUEST_TYPES } from "./data";
import { exportToExcel, exportToPDF } from "./exportUtils";

const MONTHR_FR = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];

export default function AnnualDashboard({ users, requests, overtime, managedDepts, settings }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [deptFilter, setDeptFilter] = useState("all");

  const scopeUsers = users.filter(u =>
    (u.role === "employee" || u.role === "manager" || u.role === "teamleader") &&
    !u.archived &&
    managedDepts.includes(u.department) &&
    (deptFilter === "all" || u.department === deptFilter)
  );

  const yearReqs = requests.filter(r => {
    const d = new Date(r.startDate);
    return d.getFullYear() === year && scopeUsers.some(u => u.id === r.userId);
  });

  // ─── KPIs globaux ──────────────────────────────────────────────────────────
  const totalAbsences = yearReqs.filter(r => r.type === "absence" && r.status === "approved").reduce((s,r) => s + r.days, 0);
  const totalConges   = yearReqs.filter(r => r.type === "conge" && r.status === "approved").reduce((s,r) => s + r.days, 0);
  const totalRetards  = yearReqs.filter(r => r.type === "retard" && r.status === "approved").length;
  const totalHR       = overtime.filter(o => !o.isRecovery && scopeUsers.some(u => u.id === o.userId) && new Date(o.date).getFullYear() === year).reduce((s,o) => s + o.hours, 0);
  const nonAutorisees = yearReqs.filter(r => r.absenceMotif === "absence_non_autorisee" && r.status === "approved").length;

  // Taux absentéisme = jours absences / (nb salariés × jours ouvrés théoriques)
  const joursOuvres = 228; // ~228j ouvrés/an
  const txAbsenteisme = scopeUsers.length > 0
    ? Math.round((totalAbsences / (scopeUsers.length * joursOuvres)) * 100 * 10) / 10
    : 0;

  // ─── Par mois ──────────────────────────────────────────────────────────────
  const monthly = MONTHR_FR.map((label, m) => {
    const mReqs = yearReqs.filter(r => new Date(r.startDate).getMonth() === m && r.status === "approved");
    return {
      label,
      absences: mReqs.filter(r => r.type === "absence").reduce((s,r) => s+r.days, 0),
      conges:   mReqs.filter(r => r.type === "conge").reduce((s,r) => s+r.days, 0),
      retards:  mReqs.filter(r => r.type === "retard").length,
    };
  });
  const maxVal = Math.max(...monthly.map(m => m.absences + m.conges), 1);

  // ─── Par salarié ───────────────────────────────────────────────────────────
  const byEmployee = scopeUsers.map(u => {
    const ureqs = yearReqs.filter(r => r.userId === u.id && r.status === "approved");
    const uHR   = overtime.filter(o => o.userId === u.id && !o.isRecovery && new Date(o.date).getFullYear() === year).reduce((s,o) => s+o.hours, 0);
    return {
      ...u,
      absences:   ureqs.filter(r => r.type === "absence").reduce((s,r) => s+r.days, 0),
      conges:     ureqs.filter(r => r.type === "conge").reduce((s,r) => s+r.days, 0),
      rtt:        ureqs.filter(r => r.type === "rtt").reduce((s,r) => s+r.days, 0),
      retards:    ureqs.filter(r => r.type === "retard").length,
      arretsM:    ureqs.filter(r => r.absenceMotif === "arret_maladie").reduce((s,r) => s+r.days, 0),
      nonAuto:    ureqs.filter(r => r.absenceMotif === "absence_non_autorisee").length,
      hs:         uHR,
      txAbs:      joursOuvres > 0 ? Math.round((ureqs.filter(r=>r.type==="absence").reduce((s,r)=>s+r.days,0) / joursOuvres) * 100 * 10) / 10 : 0,
    };
  }).sort((a,b) => b.absences - a.absences);

  // ─── Alertes CP N-1 ────────────────────────────────────────────────────────
  const limitN1 = new Date(now.getFullYear(), 4, 31); // 31 mai
  const daysToLimit = Math.ceil((limitN1 - now) / 86400000);
  const n1Alerts = scopeUsers.filter(u => u.soldeN1 > 0 && daysToLimit <= 60 && daysToLimit > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: "700", color: "#1a1a2e" }}>
            Bilan annuel
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#888" }}>{scopeUsers.length} salarié(s) · {deptFilter === "all" ? "Tous les services" : deptFilter}</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={() => setYear(y=>y-1)} style={navBtn}>◀</button>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: "700", fontSize: "18px", color: "#1a1a2e" }}>{year}</span>
          <button onClick={() => setYear(y=>y+1)} style={navBtn}>▶</button>
          <select style={ss} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="all">Tous les services</option>
            {managedDepts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={() => exportToExcel({ requests, users, month: now.getMonth(), year, scope: deptFilter, company: settings?.company || "ENVIE ANJOU" })}
            style={{ padding: "8px 14px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontFamily: "'DM Sans', sans-serif" }}>
            📊 Export Excel (mois en cours)
          </button>
        </div>
      </div>

      {/* Alertes CP N-1 */}
      {n1Alerts.length > 0 && (
        <div style={{ background: "#FAEEDA", border: "1.5px solid #f0c040", borderRadius: "12px", padding: "12px 16px" }}>
          <div style={{ fontWeight: "600", color: "#BA7517", marginBottom: "6px" }}>
            ⚠️ {n1Alerts.length} salarié(s) ont des CP N-1 à prendre avant le 31 mai ({daysToLimit} jours restants)
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {n1Alerts.map(u => (
              <span key={u.id} style={{ background: "#fff", border: "1px solid #f0c040", borderRadius: "8px", padding: "4px 10px", fontSize: "12px", color: "#BA7517" }}>
                {u.name} — <strong>{u.soldeN1}j N-1</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
        <StatCard label="Taux absentéisme" value={`${txAbsenteisme}%`} sub="sur l'année" color="#A32D2D" bg="#FCEBEB" />
        <StatCard label="Jours absences"   value={totalAbsences}      sub="approuvées"  color="#185FA5" bg="#E6F1FB" />
        <StatCard label="Jours congés"     value={totalConges}        sub="approuvés"   color="#1D9E75" bg="#E1F5EE" />
        <StatCard label="Retards"          value={totalRetards}       sub="enregistrés" color="#BA7517" bg="#FAEEDA" />
        <StatCard label="H. récupérables"     value={`${totalHR}h`}      sub="saisies"     color="#534AB7" bg="#EEEDFE" />
        <StatCard label="Absences n/auto." value={nonAutorisees}      sub="signalées"   color="#993556" bg="#FBEAF0" />
      </div>

      {/* Graphique mensuel */}
      <Card>
        <h3 style={sTitle}>Absences & congés par mois — {year}</h3>
        <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", height: "160px", padding: "0 4px" }}>
          {monthly.map((m, i) => {
            const total = m.absences + m.conges;
            const hAbs  = (m.absences / maxVal) * 130;
            const hCon  = (m.conges  / maxVal) * 130;
            const isCur = i === now.getMonth() && year === now.getFullYear();
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                {total > 0 && <div style={{ fontSize: "9px", color: "#555", fontWeight: "600" }}>{total}</div>}
                <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "130px", gap: "1px" }}>
                  {m.absences > 0 && <div style={{ width: "100%", height: `${hAbs}px`, background: "#185FA5", borderRadius: "2px 2px 0 0", minHeight: "3px" }} title={`${m.absences}j absence`} />}
                  {m.conges   > 0 && <div style={{ width: "100%", height: `${hCon}px`, background: "#1D9E75", borderRadius: m.absences > 0 ? "0" : "2px 2px 0 0", minHeight: "3px" }} title={`${m.conges}j congé`} />}
                  {total === 0    && <div style={{ width: "100%", height: "3px", background: "#f0f0f0", borderRadius: "2px" }} />}
                </div>
                <div style={{ fontSize: "9px", color: isCur ? "#1D9E75" : "#999", fontWeight: isCur ? "700" : "400" }}>{m.label}</div>
                {m.retards > 0 && <div style={{ fontSize: "8px", color: "#BA7517" }}>⏰{m.retards}</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: "12px", marginTop: "6px", justifyContent: "center" }}>
          {[["#1D9E75","Congés"],["#185FA5","Absences"],["#BA7517","Retards"]].map(([c,l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#666" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: c }} />{l}
            </div>
          ))}
        </div>
      </Card>

      {/* Tableau détaillé par salarié */}
      <Card>
        <h3 style={sTitle}>Détail par salarié — {year}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#1a1a2e", color: "#fff" }}>
                {["Salarié","Service","Absences","Arrêts M.","Congés","Repos","Retards","Non auto.","HR","Tx Abs.","Solde CP","CP N-1"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: h === "Salarié" ? "left" : "center", fontWeight: "600", fontSize: "11px", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byEmployee.map((u, i) => (
                <tr key={u.id} style={{ background: i%2===0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Avatar initials={u.avatar} size={26} />
                      <span style={{ fontWeight: "500", whiteSpace: "nowrap" }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px", color: "#666", whiteSpace: "nowrap" }}>{u.department}</td>
                  <CellVal val={u.absences} unit="j" warn={u.absences > 10} />
                  <CellVal val={u.arretsM} unit="j" warn={u.arretsM > 5} />
                  <CellVal val={u.conges} unit="j" />
                  <CellVal val={u.rtt} unit="j" />
                  <CellVal val={u.retards} unit="" warn={u.retards > 3} />
                  <CellVal val={u.nonAuto} unit="" warn={u.nonAuto > 0} />
                  <CellVal val={u.hs} unit="h" color="#534AB7" />
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: "600",
                      background: u.txAbs > 5 ? "#FCEBEB" : u.txAbs > 2 ? "#FAEEDA" : "#f0f0f0",
                      color: u.txAbs > 5 ? "#A32D2D" : u.txAbs > 2 ? "#BA7517" : "#666" }}>
                      {u.txAbs}%
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: "600", color: u.soldeConges < 5 ? "#A32D2D" : "#1D9E75" }}>
                    {u.soldeConges}j
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: u.soldeN1 > 0 ? "600" : "400", color: u.soldeN1 > 0 ? "#BA7517" : "#bbb" }}>
                    {u.soldeN1 > 0 ? `${u.soldeN1}j ⚠️` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Absences non autorisées */}
      {byEmployee.filter(u => u.nonAuto > 0).length > 0 && (
        <Card>
          <h3 style={sTitle}>⚠️ Absences non autorisées</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {byEmployee.filter(u => u.nonAuto > 0).map(u => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: "#FCEBEB", borderRadius: "10px" }}>
                <Avatar initials={u.avatar} size={30} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "500" }}>{u.name}</div>
                  <div style={{ fontSize: "12px", color: "#999" }}>{u.department}</div>
                </div>
                <span style={{ fontWeight: "700", color: "#A32D2D" }}>{u.nonAuto} absence(s) non autorisée(s)</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function CellVal({ val, unit, warn, color }) {
  if (!val || val === 0) return <td style={{ padding: "8px 10px", textAlign: "center", color: "#ddd" }}>—</td>;
  return (
    <td style={{ padding: "8px 10px", textAlign: "center" }}>
      <span style={{ fontWeight: "500", color: warn ? "#A32D2D" : color || "#333" }}>
        {val}{unit}
      </span>
    </td>
  );
}

const navBtn = { background: "#f0f0f0", border: "none", borderRadius: "8px", padding: "5px 10px", cursor: "pointer", fontSize: "14px" };
const ss = { padding: "6px 10px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", background: "#fff" };
const sTitle = { margin: "0 0 1rem", fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: "600", color: "#1a1a2e" };

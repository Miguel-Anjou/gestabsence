import { useState } from "react";
import { getFrenchHolidays } from "./holidays";
import { REQUEST_TYPES, ABSENCE_MOTIFS, HALF_DAY_OPTIONS, DEPARTMENTS } from "./data";
import { Avatar, Modal, Btn, Badge, TypeBadge, formatDuration } from "./components";
import { countWorkingDays } from "./holidays";

const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DAYS_FR   = ["L","M","M","J","V","S","D"];

// Types disponibles dans le calendrier (saisie responsable)
const CAL_TYPES = [
  { group: "Congés / Récupération", options: [
    { value: "conge",              label: "☀️ Congé payé" },
    { value: "conge_sans_solde",   label: "📭 Congé sans solde" },
    { value: "conge_exceptionnel", label: "⭐ Congé exceptionnel" },
    { value: "rtt",                label: "🕐 Repos" },
    { value: "recuperation",       label: "🔄 Récupération HR" },
  ]},
  { group: "Absences / Retards", options: [
    { value: "absence", label: "📋 Absence" },
    { value: "retard",  label: "⏰ Retard" },
  ]},
];

export default function TeamCalendar({ users, requests, managedDepts, teamUserIds = [], onAddRequest, onUpdateRequest, onEditRequest, currentUser, closures }) {
  const now = new Date();
  const [year, setYear]           = useState(now.getFullYear());
  const [month, setMonth]         = useState(now.getMonth());
  const [filterDept, setFilterDept] = useState("all");
  const [teamOnly, setTeamOnly]   = useState(false);
  const [viewMode, setViewMode]   = useState("month"); // "month" | "quarter"

  // Modal saisie / édition
  const [modal, setModal]         = useState(null);
  const [form, setForm]           = useState({});
  const [formError, setFormError] = useState("");
  // Sélection multi-jours
  const [selecting, setSelecting]   = useState(null); // { user, startDate }
  const [hoverDate, setHoverDate]   = useState(null);
  const [calComment, setCalComment] = useState("");

  // Génère un tableau de jours pour un mois donné
  const buildMonthDays = (y, m) => {
    const h = getFrenchHolidays(y);
    const hDates = h.map(x => x.date);
    const arr = [];
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
      const date = new Date(y, m, d);
      const dateStr = localDateStr(y, m, d);
      const dow = date.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = hDates.includes(dateStr);
      const holiday = h.find(x => x.date === dateStr);
      const closure = (closures||[]).find(c => c.startDate <= dateStr && c.endDate >= dateStr);
      arr.push({ d, dateStr, dow, isWeekend, isHoliday, holidayLabel: holiday?.label, closure, isClosure: !!closure, m, y });
    }
    return arr;
  };

  const holidays    = getFrenchHolidays(year);
  const holidayDates= holidays.map(h => h.date);

  const deptUsers = users.filter(u =>
    !u.archived &&
    (u.role === "employee" || u.role === "manager" || u.role === "teamleader") &&
    (filterDept === "all" || u.department === filterDept) &&
    (!teamOnly || teamUserIds.includes(u.id))
  );

  // Fix timezone : construire dateStr en local (pas UTC) pour éviter décalage d'1 jour
  const localDateStr = (y, m, d) => `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

  const days = [];
  for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) {
    const date    = new Date(year, month, d);
    const dateStr = localDateStr(year, month, d);
    const dow     = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = holidayDates.includes(dateStr);
    const holiday   = holidays.find(h => h.date === dateStr);
    const closure = (closures||[]).find(c => c.startDate <= dateStr && c.endDate >= dateStr);
    days.push({ d, dateStr, dow, isWeekend, isHoliday, holidayLabel: holiday?.label, closure, isClosure: !!closure });
  }

  const getUserDayReq = (userId, dateStr) =>
    requests.find(r => r.userId === userId && r.status !== "rejected" && r.startDate <= dateStr && (r.endDate || r.startDate) >= dateStr);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y=>y-1); } else setMonth(m=>m-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y=>y+1); } else setMonth(m=>m+1); };

  // Gestion sélection multi-jours
  const handleCellMouseDown = (user, day) => {
    if (day.isWeekend || day.isHoliday) return;
    // Seul l'admin peut modifier les cellules d'un responsable
    if (user.role === "manager" && currentUser?.role !== "admin") return;
    // Responsable et admin peuvent modifier les cellules d'un chef d'équipe
    if (user.role === "teamleader" && currentUser?.role !== "admin" && currentUser?.role !== "manager") return;
    const existing = getUserDayReq(user.id, day.dateStr);
    if (existing) {
      openCellDirect(user, day, existing);
      return;
    }
    setSelecting({ user, startDate: day.dateStr });
    setHoverDate(day.dateStr);
  };

  const handleCellMouseEnter = (user, day) => {
    if (!selecting) return;
    if (selecting.user.id !== user.id) return;
    if (!day.isWeekend && !day.isHoliday) setHoverDate(day.dateStr);
  };

  const handleCellMouseUp = (user, day) => {
    if (!selecting) return;
    if (selecting.user.id !== user.id) { setSelecting(null); setHoverDate(null); return; }
    const start = selecting.startDate <= day.dateStr ? selecting.startDate : day.dateStr;
    const end   = selecting.startDate <= day.dateStr ? day.dateStr : selecting.startDate;
    setSelecting(null); setHoverDate(null);
    // Ouvrir modal avec la période sélectionnée
    openCellRange(user, day, start, end);
  };

  const openCellDirect = (user, day, existing) => {
    setModal({ user, day, existingReq: existing });
    setFormError("");
    setForm({
      type: existing.type, subType: existing.subType || "full",
      startDate: existing.startDate, endDate: existing.endDate || existing.startDate,
      reason: existing.reason || "", absenceMotif: existing.absenceMotif || "",
      heureDebut: existing.heureDebut || "", heureFin: existing.heureFin || "",
      retardH: existing.durationMinutes ? String(Math.floor(existing.durationMinutes / 60)) : "",
      retardM: existing.durationMinutes ? String(existing.durationMinutes % 60) : "",
    });
  };

  const openCellRange = (user, day, startDate, endDate) => {
    setModal({ user, day: {...day, dateStr: startDate}, existingReq: null });
    setFormError("");
    setForm({
      type: "absence", subType: "full",
      startDate, endDate,
      reason: "", absenceMotif: "", heureDebut: "", heureFin: "", retardH: "", retardM: "",
    });
  };

  const openCell = (user, day) => handleCellMouseDown(user, day);

  const closeModal = () => { setModal(null); setForm({}); setFormError(""); setCalComment(""); };

  const handleSave = () => {
    if (!form.type) { setFormError("Veuillez choisir un type."); return; }

  const isHalfDay  = form.subType === "morning" || form.subType === "afternoon";
    const isRetard   = form.type === "retard";
    const isAbsence  = form.type === "absence";
    const useHoraire = isAbsence && form.heureDebut && form.heureFin;
    const absenceMultiDay = isAbsence && !useHoraire && form.subType === "full";

    let retardMinutes = 0;
    if (isRetard) {
      retardMinutes = (parseInt(form.retardH, 10) || 0) * 60 + (parseInt(form.retardM, 10) || 0);
      if (retardMinutes <= 0) { setFormError("Veuillez indiquer la durée du retard."); return; }
    }

    let days_count = 0.5;
    let durationMinutes = null;
    if (isRetard) {
      durationMinutes = retardMinutes;
      days_count = Math.round(retardMinutes / 60 * 100) / 100;
    } else if (useHoraire) {
      const [dh,dm] = form.heureDebut.split(":").map(Number);
      const [fh,fm] = form.heureFin.split(":").map(Number);
      const diff = (fh*60+fm)-(dh*60+dm);
      if (diff <= 0) { setFormError("L'heure de fin doit être après l'heure de début."); return; }
      days_count = Math.round(diff/60*100)/100;
      durationMinutes = diff;
    } else if (!isRetard && !isAbsence) {
      days_count = isHalfDay ? 0.5 : (countWorkingDays(form.startDate, form.endDate || form.startDate) || 1);
    } else if (absenceMultiDay) {
      days_count = countWorkingDays(form.startDate, form.endDate || form.startDate) || 1;
    }

    const endDate = (isHalfDay || isRetard || (isAbsence && !absenceMultiDay)) ? form.startDate : (form.endDate || form.startDate);

    const reqData = {
      userId: modal.user.id,
      type: form.type, subType: form.subType,
      startDate: form.startDate, endDate,
      days: days_count, durationMinutes,
      reason: form.reason || (isRetard ? "Retard" : isAbsence ? "Absence" : ""),
      absenceMotif: form.absenceMotif || "",
      heureDebut: form.heureDebut || "", heureFin: form.heureFin || "",
      status: "approved",
      comment: `Saisi depuis le calendrier par ${currentUser?.name || "le responsable"}`,
    };

    if (modal.existingReq) {
      onEditRequest(modal.existingReq.id, {
        type: reqData.type,
        subType: reqData.subType,
        startDate: reqData.startDate,
        endDate: reqData.endDate,
        days: reqData.days,
        reason: reqData.reason,
        absenceMotif: reqData.absenceMotif,
        heureDebut: reqData.heureDebut,
        heureFin: reqData.heureFin,
        status: "approved",
        comment: reqData.comment,
      });
    } else {
      // Sélection multi-jours : un jour au milieu de la plage peut déjà être occupé
      // même si le jour de départ était libre. On garde la modale ouverte pour laisser
      // voir le planning du salarié (affiché ci-dessous) plutôt que de fermer sans explication.
      const conflicts = requests.filter(r =>
        r.userId === reqData.userId &&
        r.status !== "rejected" &&
        r.startDate <= reqData.endDate && (r.endDate || r.startDate) >= reqData.startDate
      );
      if (conflicts.length > 0) {
        setFormError(`⚠️ Ce salarié a déjà ${conflicts.length > 1 ? "des demandes" : "une demande"} sur cette période (voir son planning ci-dessus). Modifiez les dates ou annulez.`);
        return;
      }
      onAddRequest(reqData);
    }
    closeModal();
  };

  const handleDelete = () => {
    if (modal.existingReq) {
      onUpdateRequest(modal.existingReq.id, "rejected", "Supprimé depuis le calendrier", "", null);
    }
    closeModal();
  };

  const isInSelection = (userId, dateStr) => {
    if (!selecting || selecting.user.id !== userId || !hoverDate) return false;
    const s = selecting.startDate <= hoverDate ? selecting.startDate : hoverDate;
    const e = selecting.startDate <= hoverDate ? hoverDate : selecting.startDate;
    return dateStr >= s && dateStr <= e;
  };

  const isHalfDay  = form.subType === "morning" || form.subType === "afternoon";
  const isRetard   = form.type === "retard";
  const isAbsence  = form.type === "absence";
  const showEndDate= !isHalfDay && !isRetard && !(isAbsence && (form.heureDebut || form.subType !== "full"));
  const showHoraires= isAbsence;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Contrôles */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={prevMonth} style={navBtn}>◀</button>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: "700", fontSize: "18px", color: "#1a1a2e", minWidth: "160px", textAlign: "center" }}>
            {MONTHS_FR[month]} {year}
          </span>
          <button onClick={nextMonth} style={navBtn}>▶</button>
          <button onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); }} style={{ ...navBtn, fontSize: "12px", padding: "5px 10px" }}>
            Aujourd'hui
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Toggle vue mois / trimestre */}
          <div style={{ display: "flex", background: "#f5f5f5", borderRadius: "8px", padding: "3px" }}>
            {[["month","Mois"],["quarter","Trimestre"]].map(([k,l]) => (
              <button key={k} onClick={() => setViewMode(k)} style={{
                padding: "5px 12px", border: "none", borderRadius: "6px", cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", fontSize: "12px",
                background: viewMode === k ? "#fff" : "transparent",
                color: viewMode === k ? "#1a1a2e" : "#888",
                fontWeight: viewMode === k ? "600" : "400",
                boxShadow: viewMode === k ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>{l}</button>
            ))}
          </div>
          <span style={{ fontSize: "12px", color: "#999" }}>{viewMode === "quarter" ? "Vue lecture seule sur 3 mois" : "Cliquez sur une cellule pour saisir"}</span>
          {teamUserIds.length > 0 && (
            <button onClick={() => setTeamOnly(v => !v)} style={{
              padding: "5px 12px", border: `1.5px solid ${teamOnly ? "#1D9E75" : "#e0e0e0"}`,
              borderRadius: "8px", cursor: "pointer", fontSize: "12px",
              fontFamily: "'DM Sans', sans-serif", fontWeight: teamOnly ? "600" : "400",
              background: teamOnly ? "#E1F5EE" : "#fff", color: teamOnly ? "#0F6E56" : "#555",
              whiteSpace: "nowrap",
            }}>
              👥 {teamOnly ? "Mon équipe ✓" : "Mon équipe"}
            </button>
          )}
          <select style={selectStyle} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            <option value="all">Tous les services</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Légende */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "12px" }}>
        {Object.entries(REQUEST_TYPES).map(([k,v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: v.color }} />
            <span style={{ color: "#666" }}>{v.label}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: "#e0e0e0" }} />
          <span style={{ color: "#666" }}>Week-end / Férié</span>
        </div>
      </div>

      {/* Vue trimestrielle */}
      {viewMode === "quarter" && (() => {
        const months = [0, 1, 2].map(offset => {
          let m = month + offset, y = year;
          if (m > 11) { m -= 12; y += 1; }
          return { m, y, days: buildMonthDays(y, m) };
        });
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {months.map(({ m, y, days: mDays }) => (
              <div key={`${y}-${m}`}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: "700", fontSize: "14px", color: "#1a1a2e", padding: "6px 0", borderBottom: "2px solid #1a1a2e", marginBottom: "6px" }}>
                  {MONTHS_FR[m]} {y}
                </div>
                <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid #eee" }}>
                  <table style={{ borderCollapse: "collapse", minWidth: "100%", background: "#fff" }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: "150px", position: "sticky", left: 0, background: "#1a1a2e", color: "#fff", zIndex: 2, fontSize: "11px" }}>Salarié</th>
                        {mDays.map(day => (
                          <th key={day.d} title={day.holidayLabel || ""} style={{ ...thStyle, background: day.isHoliday ? "#f0e6ff" : day.isWeekend ? "#f5f5f5" : "#1a1a2e", color: day.isHoliday || day.isWeekend ? "#666" : "#fff", minWidth: "24px", width: "24px", fontSize: "9px", padding: "3px 1px" }}>
                            <div>{DAYS_FR[(day.dow+6)%7]}</div>
                            <div style={{ fontWeight: "700" }}>{day.d}</div>
                            {day.isHoliday && <div style={{ fontSize: "7px", color: "#9c5dbd" }}>🎌</div>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {deptUsers.map((u, ui) => (
                        <tr key={u.id} style={{ background: ui % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ ...tdStyle, position: "sticky", left: 0, background: ui%2===0?"#fff":"#fafafa", zIndex: 1, borderRight: "2px solid #eee", fontSize: "11px", padding: "3px 6px" }}>
                            <span style={{ fontWeight: "500", whiteSpace: "nowrap" }}>{u.name}</span>
                          </td>
                          {mDays.map(day => {
                            const req = getUserDayReq(u.id, day.dateStr);
                            const type = req ? REQUEST_TYPES[req.type] : null;
                            return (
                              <td key={day.d} style={{ ...tdStyle, padding: "2px 1px", background: day.isHoliday ? "#f5eeff" : day.isWeekend ? "#f5f5f5" : req ? (type?.bg || "#f0f0f0") : "transparent", textAlign: "center" }}>
                                {req && !day.isWeekend && !day.isHoliday && (
                                  <div style={{ width: "18px", height: "18px", borderRadius: "3px", background: req.status === "pending" ? "#fff" : type?.color, border: req.status === "pending" ? `1.5px dashed ${type?.color}` : "none", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px" }}>
                                    {type?.icon}
                                  </div>
                                )}
                                {day.isHoliday && <div style={{ fontSize: "9px", color: "#9c5dbd" }}>🎌</div>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Grille calendrier */}
      {viewMode === "month" && <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #eee" }}>
        <table style={{ borderCollapse: "collapse", minWidth: "100%", background: "#fff" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: "170px", position: "sticky", left: 0, background: "#1a1a2e", color: "#fff", zIndex: 2 }}>
                Salarié
              </th>
              {days.map(({ d, dow, isWeekend, isHoliday, holidayLabel, isClosure }) => (
                <th key={d} title={holidayLabel || ""} style={{
                  ...thStyle,
                  background: isHoliday ? "#f0e6ff" : isWeekend ? "#f5f5f5" : "#1a1a2e",
                  color: isHoliday || isWeekend ? "#666" : "#fff",
                  minWidth: "32px", width: "32px", fontSize: "10px", padding: "4px 2px",
                }}>
                  <div>{DAYS_FR[(dow+6)%7]}</div>
                  <div style={{ fontWeight: "700" }}>{d}</div>
                  {isHoliday && <div style={{ fontSize: "8px", color: "#9c5dbd" }}>🎌</div>}
                  {isClosure && !isHoliday && !isWeekend && <div style={{ fontSize: "8px", color: "#185FA5" }}>🏢</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deptUsers.map((u, ui) => (
              <tr key={u.id} style={{ background: ui%2===0 ? "#fff" : "#fafafa" }}>
                <td style={{ ...tdStyle, position: "sticky", left: 0, background: ui%2===0 ? "#fff" : "#fafafa", zIndex: 1, borderRight: "2px solid #eee" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Avatar initials={u.avatar} size={24} />
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "500", whiteSpace: "nowrap" }}>{u.name}</div>
                      <div style={{ fontSize: "10px", color: "#999" }}>{u.department}</div>
                    </div>
                  </div>
                </td>
                {days.map((day) => {
                  const { d, dateStr, isWeekend, isHoliday } = day;
                  const req  = getUserDayReq(u.id, dateStr);
                  const type = req ? REQUEST_TYPES[req.type] : null;
                  const isPending = req?.status === "pending";
                  const isToday = dateStr === now.toISOString().split("T")[0];

                  return (
                    <td key={d}
                      onMouseDown={() => !isWeekend && !isHoliday && handleCellMouseDown(u, day)}
                      onMouseEnter={() => handleCellMouseEnter(u, day)}
                      onMouseUp={() => !isWeekend && !isHoliday && handleCellMouseUp(u, day)}
                      title={req ? `${type?.label} — ${req.reason || ""}${req.heureDebut ? ` · ${req.heureDebut}→${req.heureFin}` : ""}` : isHoliday ? day.holidayLabel : "Cliquer ou glisser pour saisir"}
                      style={{
                        ...tdStyle,
                        background: isHoliday ? "#f5eeff"
                          : isWeekend ? "#f5f5f5"
                          : isInSelection(u.id, dateStr) ? "#bbf7d0"
                          : req ? (isPending ? "#fff" : type?.bg)
                          : "transparent",
                        padding: "3px 2px",
                        textAlign: "center",
                        cursor: !isWeekend && !isHoliday ? "pointer" : "default",
                        outline: isToday ? "2px solid #1D9E75" : "none",
                        outlineOffset: "-2px",
                        userSelect: "none",
                        transition: "background 0.08s",
                      }}
                    >
                      {req && !isWeekend && !isHoliday ? (
                        <div style={{
                          width: "22px", height: "22px", borderRadius: "4px",
                          background: isPending ? "#fff" : type?.color,
                          border: isPending ? `2px dashed ${type?.color}` : "none",
                          margin: "0 auto", display: "flex", alignItems: "center",
                          justifyContent: "center", fontSize: "11px",
                        }}>
                          {req.subType === "morning" ? "AM" : req.subType === "afternoon" ? "PM" : type?.icon}
                        </div>
                      ) : isHoliday ? (
                        <div style={{ fontSize: "11px", textAlign: "center", color: "#9c5dbd" }}>🎌</div>
                      ) : !isWeekend ? (
                        <div style={{ width: "22px", height: "22px", borderRadius: "4px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#ddd" }}>
                          +
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            {deptUsers.length === 0 && (
              <tr><td colSpan={days.length+1} style={{ textAlign: "center", padding: "2rem", color: "#aaa", fontSize: "13px" }}>Aucun salarié dans ce service</td></tr>
            )}
          </tbody>
        </table>
      </div>}

      {/* Jours fériés */}
      {viewMode === "month" && days.some(d => d.isHoliday) && (
        <div style={{ background: "#f5eeff", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", color: "#6b3fa0" }}>
          🎌 {days.filter(d => d.isHoliday).map(d => `${d.d} — ${d.holidayLabel}`).join(" · ")}
        </div>
      )}

      {/* ─── Modal saisie / édition ─────────────────────────────────────────── */}
      <Modal
        open={!!modal}
        onClose={closeModal}
        title={modal?.existingReq ? "Modifier la saisie" : "Saisir une absence / congé"}
      >
        {modal && (
          <div>
            {/* Salarié + date */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: "#f9f9f9", borderRadius: "10px", marginBottom: "1rem" }}>
              <Avatar initials={modal.user.avatar} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "600", fontSize: "14px" }}>{modal.user.name}</div>
                <div style={{ fontSize: "12px", color: "#999" }}>{modal.user.department}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: "700", color: "#1a1a2e", fontSize: "15px" }}>
                  {new Date(modal.day.dateStr).toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"long" })}
                </div>
                {modal.existingReq && (
                  <div style={{ marginTop: "4px" }}><Badge status={modal.existingReq.status} /></div>
                )}
              </div>
            </div>

            {/* Si demande existante : résumé + validation + supprimer */}
            {modal.existingReq && (() => {
              const req     = modal.existingReq;
              const rowUser = modal.user;
              const statusOk = req.status === "pending" || req.status === "chef_approved";
              const needsDouble = ["conge","conge_sans_solde","conge_exceptionnel","rtt","recuperation"].includes(req.type);
              const requesterIsManager = rowUser.role === "manager";
              const requesterIsTL      = rowUser.role === "teamleader";
              const actorRole = currentUser?.role;
              let canAct = false;
              if (requesterIsManager) canAct = actorRole === "admin" && statusOk;
              else if (requesterIsTL)  canAct = (actorRole === "manager" || actorRole === "admin") && statusOk;
              else canAct = statusOk && (
                (actorRole === "teamleader" && req.status === "pending") ||
                (actorRole === "manager" && statusOk) ||
                (actorRole === "admin"   && statusOk)
              );

              const handleCalAction = (action) => {
                let finalAction = action;
                if (action === "approved" && actorRole === "teamleader" && needsDouble) finalAction = "chef_approved";
                onUpdateRequest(req.id, finalAction, calComment, req.absenceMotif || "", null);
                closeModal();
              };

              return (
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "13px" }}>
                      <TypeBadge type={req.type} />
                      <span style={{ marginLeft: "8px", color: "#555" }}>{formatDuration(req)}</span>
                      {req.reason && <span style={{ color: "#888", marginLeft: "6px" }}>· {req.reason}</span>}
                    </div>
                    <button onClick={handleDelete} style={{ background: "#FCEBEB", border: "none", color: "#A32D2D", borderRadius: "6px", padding: "5px 10px", cursor: "pointer", fontSize: "12px" }}>
                      🗑 Supprimer
                    </button>
                  </div>
                  {canAct && (
                    <div style={{ marginTop: "10px", background: "#f9f9f9", border: "1px solid #eee", borderRadius: "8px", padding: "10px 12px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#555", marginBottom: "5px" }}>
                        Commentaire <span style={{ color: "#999", fontWeight: 400 }}>(obligatoire en cas de refus)</span>
                      </label>
                      <textarea
                        value={calComment}
                        onChange={e => setCalComment(e.target.value)}
                        placeholder="Ajouter un commentaire..."
                        style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", resize: "vertical", minHeight: "55px" }}
                      />
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px", flexWrap: "wrap" }}>
                        <Btn variant="danger" onClick={() => {
                          if (!calComment.trim()) { alert("Un commentaire est obligatoire en cas de refus."); return; }
                          handleCalAction("rejected");
                        }}>Refuser</Btn>
                        {actorRole === "manager" && req.status === "pending" && rowUser.role === "employee" && (
                          <Btn variant="outline" onClick={() => handleCalAction("chef_approved")}>→ Chef d'équipe</Btn>
                        )}
                        <Btn variant="success" onClick={() => handleCalAction("approved")}>
                          {actorRole === "teamleader" && needsDouble ? "✓ Valider (1er niveau)" : req.status === "chef_approved" ? "✓ Approuver définitivement" : "✓ Approuver"}
                        </Btn>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Type */}
            <div style={fs}>
              <label style={ls}>Type *</label>
              <select style={is} value={form.type} onChange={e => setForm({...form, type: e.target.value, subType: "full", heureDebut: "", heureFin: ""})}>
                {CAL_TYPES.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Motif absence RH */}
            {isAbsence && (
              <div style={fs}>
                <label style={ls}>Qualification RH</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {ABSENCE_MOTIFS.map(m => (
                    <button key={m.value} onClick={() => setForm({...form, absenceMotif: m.value})} style={{
                      padding: "7px 8px", border: `1.5px solid ${form.absenceMotif===m.value ? "#185FA5" : "#e0e0e0"}`,
                      borderRadius: "8px", background: form.absenceMotif===m.value ? "#E6F1FB" : "#fff",
                      color: form.absenceMotif===m.value ? "#185FA5" : "#444",
                      cursor: "pointer", fontSize: "12px", textAlign: "left",
                      fontFamily: "'DM Sans', sans-serif", fontWeight: form.absenceMotif===m.value ? "600" : "400",
                    }}>{m.icon} {m.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Durée (sauf retard) */}
            {!isRetard && (
              <div style={fs}>
                <label style={ls}>Durée</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {HALF_DAY_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setForm({...form, subType: o.value})} style={{
                      flex: 1, padding: "7px 4px", border: `1.5px solid ${form.subType===o.value ? "#1D9E75" : "#e0e0e0"}`,
                      borderRadius: "8px", background: form.subType===o.value ? "#E1F5EE" : "#fff",
                      color: form.subType===o.value ? "#0F6E56" : "#555",
                      cursor: "pointer", fontSize: "11px", fontFamily: "'DM Sans', sans-serif",
                      fontWeight: form.subType===o.value ? "600" : "400",
                    }}>{o.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Dates */}
            <div style={{ display: "grid", gridTemplateColumns: showEndDate ? "1fr 1fr" : "1fr", gap: "10px", marginBottom: "1rem" }}>
              <div>
                <label style={ls}>Date de début</label>
                <input style={is} type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
              </div>
              {showEndDate && (
                <div>
                  <label style={ls}>Date de fin</label>
                  <input style={is} type="date" value={form.endDate} min={form.startDate} onChange={e => setForm({...form, endDate: e.target.value})} />
                </div>
              )}
            </div>

            {/* Durée du retard : obligatoire */}
            {isRetard && (
              <div style={fs}>
                <label style={ls}>Durée du retard *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "#888", display: "block", marginBottom: "3px" }}>Heures</label>
                    <input style={is} type="number" min="0" max="23" step="1" value={form.retardH || ""}
                      onChange={e => setForm({...form, retardH: e.target.value})} placeholder="0" />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "#888", display: "block", marginBottom: "3px" }}>Minutes</label>
                    <input style={is} type="number" min="0" max="59" step="1" value={form.retardM || ""}
                      onChange={e => setForm({...form, retardM: e.target.value})} placeholder="0" />
                  </div>
                </div>
              </div>
            )}

            {/* Horaires */}
            {showHoraires && (
              <div style={fs}>
                <label style={ls}>Horaires <span style={{ color: "#aaa", fontWeight: 400 }}>(optionnel)</span></label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "#888", display: "block", marginBottom: "3px" }}>Heure début</label>
                    <input style={is} type="time" value={form.heureDebut} onChange={e => setForm({...form, heureDebut: e.target.value})} />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "#888", display: "block", marginBottom: "3px" }}>Heure fin</label>
                    <input style={is} type="time" value={form.heureFin} onChange={e => setForm({...form, heureFin: e.target.value})} />
                  </div>
                </div>
                {form.heureDebut && form.heureFin && form.heureDebut < form.heureFin && (() => {
                  const [dh,dm] = form.heureDebut.split(":").map(Number);
                  const [fh,fm] = form.heureFin.split(":").map(Number);
                  const diff = (fh*60+fm)-(dh*60+dm);
                  const h = Math.floor(diff/60), m = diff%60;
                  return <div style={{ fontSize: "12px", color: "#185FA5", marginTop: "6px", background: "#E6F1FB", borderRadius: "6px", padding: "6px 10px" }}>⏱ Durée : <strong>{h}h{m>0?String(m).padStart(2,"0"):""}</strong></div>;
                })()}
              </div>
            )}

            {/* Motif */}
            <div style={fs}>
              <label style={ls}>Motif <span style={{ color: "#aaa", fontWeight: 400 }}>(optionnel)</span></label>
              <input style={is} value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="Précisez..." />
            </div>

            {formError && <div style={{ background: "#FCEBEB", color: "#A32D2D", borderRadius: "8px", padding: "10px", fontSize: "13px", marginBottom: "1rem" }}>{formError}</div>}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={closeModal}>Annuler</Btn>
              <Btn onClick={handleSave}>
                {modal.existingReq ? "Modifier" : "Enregistrer (approuvé)"}
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const navBtn    = { background: "#f0f0f0", border: "none", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontSize: "14px", fontFamily: "'DM Sans', sans-serif" };
const selectStyle = { padding: "6px 10px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", background: "#fff" };
const thStyle   = { padding: "6px 4px", textAlign: "center", borderBottom: "2px solid #e0e0e0", fontFamily: "'DM Sans', sans-serif", fontWeight: "600" };
const tdStyle   = { padding: "6px 4px", borderBottom: "1px solid #f0f0f0", minWidth: "32px" };
const fs = { marginBottom: "1rem" };
const ls = { display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "5px" };
const is = { width: "100%", padding: "8px 10px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none" };

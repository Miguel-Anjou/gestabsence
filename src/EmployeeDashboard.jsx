import { useState } from "react";
import { REQUEST_TYPES, HALF_DAY_OPTIONS, ABSENCE_MOTIFS } from "./data";
import { Badge, TypeBadge, StatCard, Card, Modal, Btn, formatDuration } from "./components";
import { countWorkingDays, getFrenchHolidays } from "./holidays";
import { exportToPDF } from "./exportUtils";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getWeekRequests(requests, userId) {
  const now = new Date();
  const s = new Date(now); s.setDate(now.getDate() - now.getDay() + 1); s.setHours(0,0,0,0);
  const e = new Date(s); e.setDate(s.getDate() + 6);
  return requests.filter(r => r.userId === userId && new Date(r.startDate) >= s && new Date(r.startDate) <= e);
}
function getMonthRequests(requests, userId) {
  const now = new Date();
  return requests.filter(r => r.userId === userId && new Date(r.startDate).getMonth() === now.getMonth() && new Date(r.startDate).getFullYear() === now.getFullYear());
}
function halfDayLabel(subType) {
  if (subType === "morning")   return " · Matin";
  if (subType === "afternoon") return " · Après-midi";
  return "";
}
function calcDays(type, subType, startDate, endDate, manualDays) {
  if (subType === "morning" || subType === "afternoon") return 0.5;
  if (manualDays) return parseFloat(manualDays);
  return countWorkingDays(startDate, endDate) || 1;
}

// Types que le SALARIÉ peut demander — filtrés selon les droits de l'utilisateur
function getEmployeeRequestTypes(user) {
  const tempsLibre = [];
  if (user?.canRtt !== false)          tempsLibre.push({ value: "rtt",         label: "🕐 Repos" });
  if (user?.canRecuperation !== false) tempsLibre.push({ value: "recuperation",label: "🔄 Récupération HR" });
  const groups = [
    { group: "Congés", options: [
      { value: "conge",             label: "☀️ Congé payé" },
      { value: "conge_sans_solde",  label: "📭 Congé sans solde" },
      { value: "conge_exceptionnel",label: "⭐ Congé exceptionnel" },
    ]},
  ];
  if (tempsLibre.length > 0) groups.push({ group: "Temps libre", options: tempsLibre });
  return groups;
}

const MONTHR_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DOW_FR    = ["D","L","M","M","J","V","S"];

// ─── Formulaire de demande (création + édition) ───────────────────────────────
export function RequestForm({ initial, user, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    type:        initial?.type        || "conge",
    subType:     initial?.subType     || "full",
    startDate:   initial?.startDate   || "",
    endDate:     initial?.endDate     || "",
    reason:      initial?.reason      || "",
    days:        initial?.days        || "",
    heureDebut:  initial?.heureDebut  || "",
    heureFin:    initial?.heureFin    || "",
  });
  const [error, setError] = useState("");

  const isHalfDay   = form.subType === "morning" || form.subType === "afternoon";
  const isRecup     = form.type === "recuperation";
  const reasonOptional = ["conge","rtt","recuperation"].includes(form.type);

  const computedDays = form.startDate
    ? calcDays(form.type, form.subType, form.startDate, form.endDate || form.startDate, form.days && !isHalfDay ? form.days : null)
    : null;

  const handleSubmit = () => {
    if (!form.startDate) { setError("Veuillez indiquer une date de début."); return; }
    if (!reasonOptional && !form.reason.trim()) { setError("Veuillez indiquer un motif."); return; }
    if (!isHalfDay && !isRecup && !form.endDate) { setError("Veuillez indiquer une date de fin."); return; }

    const days = calcDays(form.type, form.subType, form.startDate, form.endDate || form.startDate, form.days || null);
    // Pour récupération : calcul depuis horaires si renseignés
    let finalDays = days;
    let durationMinutes = null;
    if (isRecup && form.heureDebut && form.heureFin) {
      const [dh, dm] = form.heureDebut.split(":").map(Number);
      const [fh, fm] = form.heureFin.split(":").map(Number);
      const diffMin = (fh * 60 + fm) - (dh * 60 + dm);
      if (diffMin > 0) {
        durationMinutes = diffMin;
        finalDays = Math.round(diffMin / 60 * 100) / 100;
      }
    }
    onSubmit({ ...form, days: finalDays, durationMinutes, endDate: (isHalfDay || isRecup) ? form.startDate : form.endDate, heureDebut: isRecup ? form.heureDebut : "", heureFin: isRecup ? form.heureFin : "" });
    setError("");
  };

  return (
    <div>
      {/* Type */}
      <div style={fld}>
        <label style={lbl}>Type de demande *</label>
        <select style={inp} value={form.type} onChange={e => setForm({...form, type: e.target.value, subType: "full"})}>
          {getEmployeeRequestTypes(user).map(g => (
            <optgroup key={g.group} label={g.group}>
              {g.options.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}{o.value === "recuperation" && user.soldeHeures > 0 ? ` (${user.soldeHeures}h dispo)` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Demi-journée — ou horaires pour récupération */}
      {isRecup ? (
        <div style={fld}>
          <label style={lbl}>Horaires de récupération</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "#888", display: "block", marginBottom: "4px" }}>Heure de début</label>
              <input style={inp} type="time" value={form.heureDebut}
                onChange={e => setForm({...form, heureDebut: e.target.value})} />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "#888", display: "block", marginBottom: "4px" }}>Heure de fin</label>
              <input style={inp} type="time" value={form.heureFin}
                onChange={e => setForm({...form, heureFin: e.target.value})} />
            </div>
          </div>
          {form.heureDebut && form.heureFin && form.heureDebut < form.heureFin && (
            <div style={{ fontSize: "12px", color: "#B45309", marginTop: "6px", background: "#FEF3C7", borderRadius: "6px", padding: "6px 10px" }}>
              ⏱ {(() => {
                const [dh, dm] = form.heureDebut.split(":").map(Number);
                const [fh, fm] = form.heureFin.split(":").map(Number);
                const diff = (fh * 60 + fm) - (dh * 60 + dm);
                return `${Math.floor(diff/60)}h${diff%60 > 0 ? String(diff%60).padStart(2,"0") : ""}`;
              })()} de récupération
            </div>
          )}
        </div>
      ) : (
        <div style={fld}>
          <label style={lbl}>Durée</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {HALF_DAY_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setForm({...form, subType: o.value})} style={{
                flex: 1, padding: "8px 6px",
                border: `1.5px solid ${form.subType === o.value ? "#1D9E75" : "#e0e0e0"}`,
                borderRadius: "8px",
                background: form.subType === o.value ? "#E1F5EE" : "#fff",
                color: form.subType === o.value ? "#0F6E56" : "#555",
                cursor: "pointer", fontSize: "12px",
                fontWeight: form.subType === o.value ? "600" : "400",
                fontFamily: "'DM Sans', sans-serif",
              }}>{o.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Dates */}
      <div style={{ display: "grid", gridTemplateColumns: (isHalfDay || isRecup) ? "1fr" : "1fr 1fr", gap: "10px", marginBottom: "1rem" }}>
        <div>
          <label style={lbl}>{isHalfDay ? "Date *" : "Date de début *"}</label>
          <input style={inp} type="date" value={form.startDate}
            onChange={e => setForm({...form, startDate: e.target.value, endDate: isHalfDay ? e.target.value : form.endDate})} />
        </div>
        {!isHalfDay && !isRecup && (
          <div>
            <label style={lbl}>Date de fin *</label>
            <input style={inp} type="date" value={form.endDate} min={form.startDate}
              onChange={e => setForm({...form, endDate: e.target.value})} />
          </div>
        )}
      </div>

      {/* Preview */}
      {computedDays !== null && (
        <div style={{ background: "#f0fdf8", border: "1px solid #a7f3d0", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", color: "#0F6E56", marginBottom: "1rem" }}>
          📅 <strong>{computedDays} {computedDays <= 1 ? "jour ouvré" : "jours ouvrés"}</strong>
          {isHalfDay && ` · ${form.subType === "morning" ? "Matin" : "Après-midi"}`}
          {" · Jours fériés exclus"}
        </div>
      )}

      {/* Motif */}
      <div style={fld}>
        <label style={lbl}>Motif {reasonOptional ? <span style={{ color: "#aaa", fontWeight: "400" }}>(optionnel)</span> : "*"}</label>
        <textarea style={{ ...inp, resize: "vertical", minHeight: "70px" }}
          value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}
          placeholder="Décrivez la raison de votre demande..." />
      </div>

      {error && <div style={{ background: "#FCEBEB", color: "#A32D2D", borderRadius: "8px", padding: "10px", fontSize: "13px", marginBottom: "1rem" }}>{error}</div>}

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onCancel}>Annuler</Btn>
        <Btn onClick={handleSubmit}>{initial ? "Modifier" : "Envoyer la demande"}</Btn>
      </div>
    </div>
  );
}

// ─── Ligne de demande ─────────────────────────────────────────────────────────
export function RequestRow({ req, onEdit, onDelete, hoursPerDay = 8, users = [] }) {
  const [open, setOpen] = useState(false);
  const t = REQUEST_TYPES[req.type];
  const isConge = ["conge","conge_sans_solde","conge_exceptionnel","rtt","recuperation"].includes(req.type);
  const canEdit = isConge && req.status !== "rejected" && req.status !== "approved";
  const canDelete = req.status === "pending" || req.status === "chef_approved";
  const motif = ABSENCE_MOTIFS.find(m => m.value === req.absenceMotif);

  return (
    <>
      <div onClick={() => setOpen(true)} style={rowStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
          <div style={{ fontSize: "20px" }}>{t?.icon || "📋"}</div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "500", color: "#222" }}>
              {t?.label}{halfDayLabel(req.subType)}
            </div>
            <div style={{ fontSize: "12px", color: "#999" }}>
              {new Date(req.startDate).toLocaleDateString("fr-FR")}
              {req.endDate && req.endDate !== req.startDate && ` → ${new Date(req.endDate).toLocaleDateString("fr-FR")}`}
              {req.days >= 0 && ` · ${formatDuration(req, hoursPerDay)}`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {canEdit && (
            <button onClick={e => { e.stopPropagation(); onEdit(req); }} title="Modifier"
              style={{ background: "#f0f0f0", border: "none", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", fontSize: "13px" }}>✎</button>
          )}
          {canDelete && onDelete && (
            <button onClick={e => { e.stopPropagation(); if (window.confirm("Annuler cette demande ? Cette action est définitive.")) onDelete(req); }} title="Annuler la demande"
              style={{ background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", fontSize: "13px" }}>🗑</button>
          )}
          <Badge status={req.status} />
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Détail de la demande">
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
            <TypeBadge type={req.type} />
            <Badge status={req.status} />
            {req.subType && req.subType !== "full" && (
              <span style={{ background: "#f0f0f0", color: "#555", padding: "3px 10px", borderRadius: "20px", fontSize: "12px" }}>
                {req.subType === "morning" ? "🌅 Matin" : "🌆 Après-midi"}
              </span>
            )}
          </div>
          {[
            ["Période", `${new Date(req.startDate).toLocaleDateString("fr-FR")}${req.endDate && req.endDate !== req.startDate ? ` → ${new Date(req.endDate).toLocaleDateString("fr-FR")}` : ""}`],
            ["Durée", formatDuration(req, hoursPerDay)],
            req.heureDebut && req.heureFin && ["Horaires", `${req.heureDebut} → ${req.heureFin}`],
            req.reason && ["Motif", req.reason],
            motif && ["Qualification RH", `${motif.icon} ${motif.label}`],
            ["Soumis le", new Date(req.createdAt).toLocaleDateString("fr-FR")],
            req.chefValidatedBy && req.status !== "pending" && ["1re validation", users.find(u => u.id === req.chefValidatedBy)?.name || "Chef d'équipe"],
            req.validatedBy && ["Décision finale", `${req.status === "approved" ? "✅ Approuvé" : "❌ Refusé"} par ${users.find(u => u.id === req.validatedBy)?.name || "—"}${req.validatedAt ? ` · ${new Date(req.validatedAt).toLocaleDateString("fr-FR")}` : ""}`],
            req.comment && ["Commentaire RH", req.comment],
          ].filter(Boolean).map(([k,v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", padding: "8px 0", borderBottom: "1px solid #f5f5f5" }}>
              <span style={{ color: "#999", fontWeight: "500" }}>{k}</span>
              <span style={{ maxWidth: "220px", textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

// ─── Planning mensuel salarié ──────────────────────────────────────────────────
function MyPlanning({ requests, userId, closures, user, onAddRequest, onEditRequest, onDeleteRequest }) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [calModal, setCalModal]   = useState(null); // { dateStr, req } | null
  const [calEditing, setCalEditing] = useState(false);
  const [hoveredDay, setHoveredDay] = useState(null);

  const { L=8, M=8, Me=8, J=8, V=8 } = user?.horaire || {};
  const hoursPerDay = (L + M + Me + J + V) / 5 || 8;

  const firstDay    = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const holidays    = getFrenchHolidays(year);

  const myReqs = requests.filter(r => r.userId === userId);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

  // Construire les jours
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const date = new Date(year, month, d);
    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const holiday = holidays.find(h => h.date === dateStr);
    const req = myReqs.find(r => {
      if (r.status === "rejected") return false;
      return r.startDate <= dateStr && (r.endDate || r.startDate) >= dateStr;
    });
    days.push({ d, dateStr, dow, isWeekend, holiday, req });
  }

  const startDow = (firstDay.getDay() + 6) % 7;
  const gridCells = [];
  for (let i = 0; i < startDow; i++) gridCells.push(null);
  days.forEach(d => gridCells.push(d));

  const monthReqs = myReqs.filter(r => {
    const d = new Date(r.startDate);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const isEditable = (req) => req && (req.status === "pending" || req.status === "chef_approved");

  const closeModal = () => { setCalModal(null); setCalEditing(false); };

  const handleCellClick = (day) => {
    if (day.isWeekend || day.holiday) return;
    setCalEditing(false);
    setCalModal({ dateStr: day.dateStr, req: day.req || null });
  };

  const handleFormSubmit = (formData) => {
    if (calModal.req) {
      onEditRequest(calModal.req.id, { ...formData, status: "pending" });
    } else {
      onAddRequest({ userId, status: "pending", comment: "", absenceMotif: "", ...formData });
    }
    closeModal();
  };

  const handleDelete = () => {
    onDeleteRequest(calModal.req.id);
    closeModal();
  };

  const modalTitle = calModal?.req && !calEditing
    ? "Détail de la demande"
    : calModal?.req
      ? "Modifier la demande"
      : "Nouvelle demande";

  return (
    <div>
      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <button onClick={prevMonth} style={navBtn}>◀</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: "700", fontSize: "18px", color: "#1a1a2e" }}>
            {MONTHR_FR[month]} {year}
          </div>
          <div style={{ fontSize: "12px", color: "#999" }}>{monthReqs.length} demande(s) ce mois</div>
        </div>
        <button onClick={nextMonth} style={navBtn}>▶</button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={{ fontSize: "11px", color: "#aaa", fontStyle: "italic" }}>
          Cliquez sur un jour pour créer ou modifier une demande
        </div>
        <button onClick={() => exportToPDF({ user, requests, month, year })} style={{ padding: "5px 12px", background: "#fff", border: "1.5px solid #e0e0e0", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", color: "#555" }}>
          🖨️ Imprimer fiche mensuelle
        </button>
      </div>

      {/* En-têtes jours */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px", marginBottom: "3px" }}>
        {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: "11px", fontWeight: "600", color: "#999", padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Grille */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px" }}>
        {gridCells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const isToday = day.dateStr === todayStr;
          const t = day.req ? REQUEST_TYPES[day.req.type] : null;
          const isPending = day.req?.status === "pending";
          const clickable = !day.isWeekend && !day.holiday;
          const isHovered = hoveredDay === day.dateStr && clickable;

          let bg = "#fafafa";
          let border = "1px solid #f0f0f0";
          let color = "#333";
          if (day.isWeekend || day.holiday) { bg = "#f5f5f5"; color = "#bbb"; }
          if (t && !day.isWeekend) {
            bg = t.bg;
            border = `1px solid ${t.color}40`;
            if (isPending) { bg = "#fff"; border = `1.5px dashed ${t.color}`; }
          }
          if (isToday) border = "2px solid #1D9E75";
          if (isHovered && !t) { bg = "#E1F5EE"; border = "1.5px solid #1D9E75"; }
          else if (isHovered && t) { border = `2px solid ${t.color}`; }

          const titleText = day.req
            ? `${t?.label}${day.req.reason ? ` — ${day.req.reason}` : ""}${day.holiday ? ` · ${day.holiday.label}` : ""}`
            : (clickable ? "Cliquer pour ajouter une demande" : (day.holiday?.label || ""));

          return (
            <div
              key={day.d}
              title={titleText}
              onClick={() => handleCellClick(day)}
              onMouseEnter={() => clickable && setHoveredDay(day.dateStr)}
              onMouseLeave={() => setHoveredDay(null)}
              style={{
                borderRadius: "8px", padding: "6px 4px", minHeight: "54px",
                background: bg, border,
                display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
                cursor: clickable ? "pointer" : "default",
                transition: "background 0.1s, border 0.1s",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: isToday ? "700" : "500", color: isToday ? "#1D9E75" : color }}>
                {day.d}
              </div>
              {day.holiday && !day.isWeekend && (
                <div style={{ fontSize: "7px", color: "#9c5dbd", textAlign: "center", lineHeight: "1.2", marginTop: "1px" }}>
                  🎌 {day.holiday.label}
                </div>
              )}
              {t && !day.isWeekend && (
                <div style={{ fontSize: "9px", color: t.color, fontWeight: "600", textAlign: "center", lineHeight: "1.2" }}>
                  {t.icon}
                  {isPending && <span style={{ fontSize: "8px", color: "#BA7517" }}> ?</span>}
                </div>
              )}
              {day.req?.subType === "morning" && !day.isWeekend && (
                <div style={{ fontSize: "8px", color: "#666" }}>AM</div>
              )}
              {day.req?.subType === "afternoon" && !day.isWeekend && (
                <div style={{ fontSize: "8px", color: "#666" }}>PM</div>
              )}
              {isHovered && !day.req && (
                <div style={{ fontSize: "14px", color: "#1D9E75", lineHeight: "1" }}>+</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Légende */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
        {Object.entries(REQUEST_TYPES).map(([k,v]) => {
          const hasAny = myReqs.some(r => r.type === k);
          if (!hasAny) return null;
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#666" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: v.color }} />
              {v.label}
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#666" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "2px", border: "1.5px dashed #888" }} />
          En attente
        </div>
      </div>

      {/* Jours fériés du mois */}
      {days.some(d => d.holiday && !d.isWeekend) && (
        <div style={{ background: "#f5eeff", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", color: "#6b3fa0", marginTop: "10px" }}>
          🎌 {days.filter(d => d.holiday && !d.isWeekend).map(d => `${d.d} — ${d.holiday.label}`).join(" · ")}
        </div>
      )}

      {/* Liste résumé du mois */}
      {monthReqs.length > 0 && (
        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#555", marginBottom: "2px" }}>Récapitulatif</div>
          {monthReqs.sort((a,b) => a.startDate.localeCompare(b.startDate)).map(r => {
            const t = REQUEST_TYPES[r.type];
            return (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: t?.bg || "#f9f9f9", borderRadius: "8px" }}>
                <div style={{ fontSize: "12px" }}>
                  <span style={{ color: t?.color, fontWeight: "600" }}>{t?.icon} {t?.label}</span>
                  {halfDayLabel(r.subType) && <span style={{ color: "#666" }}>{halfDayLabel(r.subType)}</span>}
                  <span style={{ color: "#888" }}> · {new Date(r.startDate + "T12:00:00").toLocaleDateString("fr-FR", { day:"numeric", month:"short" })}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "11px", color: "#666" }}>{formatDuration(r, hoursPerDay)}</span>
                  <Badge status={r.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal calendrier ── */}
      <Modal open={!!calModal} onClose={closeModal} title={modalTitle}>
        {calModal && (
          calModal.req && !calEditing ? (
            /* Vue détail */
            (() => {
              const r = calModal.req;
              const t = REQUEST_TYPES[r.type];
              const editable = isEditable(r);
              const sameDay = r.startDate === (r.endDate || r.startDate);
              const dateLabel = sameDay
                ? new Date(r.startDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
                : `${new Date(r.startDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} → ${new Date((r.endDate || r.startDate) + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem", padding: "10px 12px", background: t?.bg || "#f9f9f9", borderRadius: "10px" }}>
                    <span style={{ fontSize: "24px" }}>{t?.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: "600", color: t?.color, fontSize: "14px" }}>{t?.label}</div>
                      <div style={{ fontSize: "12px", color: "#888" }}>{dateLabel}{halfDayLabel(r.subType)}</div>
                    </div>
                    <Badge status={r.status} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "1rem", fontSize: "13px", color: "#444" }}>
                    <div><strong>Durée :</strong> {formatDuration(r, hoursPerDay)}</div>
                    {r.reason && <div><strong>Motif :</strong> {r.reason}</div>}
                    {r.comment && <div style={{ background: "#f5f5f5", borderRadius: "6px", padding: "6px 10px" }}><strong>Commentaire :</strong> {r.comment}</div>}
                    {r.status === "chef_approved" && <div style={{ color: "#BA7517", fontSize: "12px", background: "#FEF3C7", borderRadius: "6px", padding: "6px 10px" }}>⏳ Validation finale en attente du responsable</div>}
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {editable && <Btn onClick={() => setCalEditing(true)} variant="outline">✏️ Modifier</Btn>}
                    {editable && <Btn onClick={handleDelete} variant="danger">🗑️ Annuler la demande</Btn>}
                    <Btn onClick={closeModal} variant="ghost" style={{ marginLeft: "auto" }}>Fermer</Btn>
                  </div>
                </div>
              );
            })()
          ) : (
            /* Formulaire création / modification */
            <RequestForm
              initial={calModal.req
                ? { ...calModal.req }
                : { startDate: calModal.dateStr, endDate: calModal.dateStr }
              }
              user={user}
              onSubmit={handleFormSubmit}
              onCancel={closeModal}
            />
          )
        )}
      </Modal>
    </div>
  );
}

// ─── Dashboard principal salarié ──────────────────────────────────────────────
export default function EmployeeDashboard({ user, users = [], requests, overtime, closures, onAddRequest, onEditRequest, onDeleteRequest }) {
  const [mainTab, setMainTab] = useState("dashboard");
  const { L=8, M=8, Me=8, J=8, V=8 } = user?.horaire || {};
  const hoursPerDay = (L + M + Me + J + V) / 5 || 8;
  const [showForm, setShowForm]  = useState(false);
  const [editReq, setEditReq]    = useState(null);
  const [showHR, setShowHR]      = useState(false);

  const archiveCutoff = new Date(); archiveCutoff.setDate(archiveCutoff.getDate() - 30);
  const archiveCutoffStr = archiveCutoff.toISOString().split("T")[0];
  const myRequests = requests.filter(r =>
    r.userId === user.id &&
    (r.status === "pending" || r.status === "chef_approved" || (r.endDate || r.startDate) >= archiveCutoffStr)
  );
  const pendingCount = myRequests.filter(r => r.status === "pending" || r.status === "chef_approved").length;
  const approvedCongeDays = myRequests.filter(r => r.status === "approved" &&
    ["conge","conge_sans_solde","conge_exceptionnel"].includes(r.type)
  ).reduce((s, r) => s + r.days, 0);

  const myOvertime = (overtime || []).filter(o => o.userId === user.id);
  const myHR    = myOvertime.filter(o => !o.isRecovery).reduce((s,o) => s + o.hours, 0);
  const myRecup = myOvertime.filter(o =>  o.isRecovery).reduce((s,o) => s + o.hours, 0);
  const netHR   = Math.max(0, user.soldeHeures || 0);

  const handleSubmit = (formData) => {
    onAddRequest({ userId: user.id, status: "pending", comment: "", absenceMotif: "", ...formData });
    setShowForm(false);
  };
  const handleEdit = (formData) => {
    onEditRequest(editReq.id, { ...formData, status: "pending" });
    setEditReq(null);
  };

  // Toutes les demandes triées par date desc (pour l'historique)
  const allSorted = [...myRequests].sort((a,b) => b.startDate.localeCompare(a.startDate));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: "24px", fontWeight: "700", color: "#1a1a2e" }}>
            Bonjour, {user.name.split(" ")[0]} 👋
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#888" }}>
            {user.department} · {new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Btn onClick={() => setShowForm(true)}>+ Nouvelle demande</Btn>
      </div>

      {/* Soldes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
        <div style={{ position: "relative" }}>
          <StatCard label="Congés payés *"  value={`${user.soldeConges}j`}  sub="disponibles"           color="#0F6E56" bg="#E1F5EE" />
          <div style={{ fontSize: "11px", color: "#888", marginTop: "4px", lineHeight: "1.4", fontStyle: "italic", padding: "0 2px" }}>
            * Indication uniquement — seul votre bulletin de paie fait foi.
          </div>
        </div>

        {user.canRtt !== false && (user.soldeRTT || 0) > 0 && (
          <StatCard label="RTT / Repos"   value={`${user.soldeRTT}j`}     sub="disponibles"            color="#0369A1" bg="#E0F2FE" />
        )}
        <div onClick={() => setShowHR(true)} style={{ cursor: "pointer" }}>
          <StatCard label="H. récupérables ⓘ" value={`${netHR}h`}         sub="à récupérer"            color="#B45309" bg="#FEF3C7" />
        </div>
        <StatCard label="Congés pris"    value={`${approvedCongeDays}j`} sub="cette année"           color="#185FA5" bg="#E6F1FB" />
        <StatCard label="En attente"     value={pendingCount}             sub="demande(s)"            color="#BA7517" bg="#FAEEDA" />
      </div>

      {/* Onglets tableau de bord / planning / historique */}
      <div style={{ display: "flex", gap: "4px", background: "#f5f5f5", borderRadius: "10px", padding: "4px", alignSelf: "flex-start" }}>
        {[["dashboard","📋 Mes demandes"],["planning","📅 Planning"],["history","🕐 Historique"]].map(([k,l]) => (
          <button key={k} onClick={() => setMainTab(k)} style={{
            padding: "7px 14px", border: "none", borderRadius: "7px", cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
            background: mainTab===k ? "#fff" : "transparent",
            color: mainTab===k ? "#1a1a2e" : "#888", fontWeight: mainTab===k ? "600" : "400",
            boxShadow: mainTab===k ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}>{l}</button>
        ))}
      </div>

      {/* ── Mes demandes (récentes) ── */}
      {mainTab === "dashboard" && (
        <Card>
          {myRequests.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#bbb" }}>
              <div style={{ fontSize: "32px" }}>📭</div>
              <p>Aucune demande pour l'instant</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {allSorted.slice(0, 10).map(req => (
                <RequestRow key={req.id} req={req} onEdit={r => setEditReq(r)} onDelete={onDeleteRequest} hoursPerDay={hoursPerDay} users={users} />
              ))}
              {allSorted.length > 10 && (
                <button onClick={() => setMainTab("history")} style={{ background: "none", border: "none", color: "#185FA5", fontSize: "13px", cursor: "pointer", padding: "8px", textAlign: "center" }}>
                  Voir les {allSorted.length - 10} demandes plus anciennes →
                </button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── Planning mensuel ── */}
      {mainTab === "planning" && (
        <Card>
          <MyPlanning requests={requests} userId={user.id} closures={closures||[]} user={user}
            onAddRequest={onAddRequest} onEditRequest={onEditRequest} onDeleteRequest={onDeleteRequest} />
        </Card>
      )}

      {/* ── Historique complet ── */}
      {mainTab === "history" && (
        <Card>
          <div style={{ fontSize: "13px", color: "#888", marginBottom: "1rem" }}>
            {allSorted.length} demande(s) au total
          </div>
          {allSorted.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#bbb" }}>
              <div style={{ fontSize: "32px" }}>🕐</div>
              <p>Aucun historique</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {allSorted.map(req => (
                <RequestRow key={req.id} req={req} onEdit={r => setEditReq(r)} onDelete={onDeleteRequest} hoursPerDay={hoursPerDay} users={users} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Modal : nouvelle demande */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nouvelle demande">
        <RequestForm user={user} onSubmit={handleSubmit} onCancel={() => setShowForm(false)} />
      </Modal>

      {/* Modal : modifier */}
      <Modal open={!!editReq} onClose={() => setEditReq(null)} title="Modifier la demande">
        {editReq && <RequestForm initial={editReq} user={user} onSubmit={handleEdit} onCancel={() => setEditReq(null)} />}
      </Modal>

      {/* Modal : détail HR */}
      <Modal open={showHR} onClose={() => setShowHR(false)} title="Mes heures récupérables">
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "1.25rem" }}>
            {[["H. récupérables saisies", myHR, "#534AB7","#EEEDFE"],[" Récupérées", myRecup,"#1D9E75","#E1F5EE"],["Solde net", netHR,"#B45309","#FEF3C7"]].map(([label,val,color,bg]) => (
              <div key={label} style={{ background: bg, borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "22px", fontWeight: "700", color, fontFamily: "'Syne', sans-serif" }}>{val}h</div>
                <div style={{ fontSize: "11px", color }}>{label}</div>
              </div>
            ))}
          </div>
          {myOvertime.length === 0 ? (
            <div style={{ textAlign: "center", padding: "1.5rem", color: "#bbb", fontSize: "13px" }}>Aucune heure récupérable enregistrée</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
              {[...myOvertime].sort((a,b) => new Date(b.date)-new Date(a.date)).map(ot => (
                <div key={ot.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px",
                  background: ot.isRecovery ? "#f0fdf8" : "#f8f9ff", borderRadius: "8px",
                  border: `1px solid ${ot.isRecovery ? "#a7f3d0" : "#ddd6fe"}` }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "500" }}>{ot.reason}</div>
                    <div style={{ fontSize: "11px", color: "#999" }}>{new Date(ot.date).toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"long", year:"numeric" })}</div>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: ot.isRecovery ? "#1D9E75" : "#534AB7", fontFamily: "'Syne', sans-serif" }}>
                    {ot.isRecovery ? "-" : "+"}{ot.hours}h
                  </div>
                </div>
              ))}
            </div>
          )}
          {netHR >= 7 && (
            <div style={{ marginTop: "1rem", background: "#FEF3C7", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#B45309" }}>
              💡 Vous avez <strong>{netHR}h</strong> disponibles. Faites une demande de "Récupération HR".
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

const fld = { marginBottom: "1rem" };
const lbl = { display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "5px" };
const inp = { width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none", background: "#fff" };
const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1.5px solid #f0f0f0", borderRadius: "10px", cursor: "pointer", gap: "8px" };
const navBtn = { background: "#f0f0f0", border: "none", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontSize: "14px", fontFamily: "'DM Sans', sans-serif" };

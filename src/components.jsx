import { STATUS, REQUEST_TYPES } from "./data";

export function Badge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: "500",
      background: s.bg,
      color: s.color,
    }}>{s.label}</span>
  );
}

export function TypeBadge({ type }) {
  const t = REQUEST_TYPES[type] || REQUEST_TYPES.conge;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "3px 10px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: "500",
      background: t.bg,
      color: t.color,
    }}>{t.label}</span>
  );
}

export function Avatar({ initials, size = 36, color = "#1D9E75" }) {
  const colors = { A: "#1D9E75", B: "#185FA5", C: "#BA7517", D: "#993556", E: "#534AB7", F: "#A32D2D" };
  const c = colors[initials?.[0]] || "#1D9E75";
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: c,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontSize: size * 0.36,
      fontWeight: "600",
      flexShrink: 0,
    }}>{initials}</div>
  );
}

export function Card({ children, style }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "14px",
      border: "1px solid #eee",
      padding: "1.25rem",
      ...style,
    }}>{children}</div>
  );
}

export function StatCard({ label, value, sub, color = "#1D9E75", bg = "#E1F5EE" }) {
  return (
    <div style={{
      background: bg,
      borderRadius: "12px",
      padding: "1rem 1.25rem",
    }}>
      <div style={{ fontSize: "12px", color: color, fontWeight: "500", marginBottom: "4px", opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: "700", color, fontFamily: "'Syne', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color, opacity: 0.7, marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "1rem",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: "16px", padding: "1.5rem",
        maxWidth: "480px", width: "100%", maxHeight: "90vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: "18px" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#999" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      {label && <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "5px" }}>{label}</label>}
      <input style={{
        width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0",
        borderRadius: "8px", fontSize: "14px", boxSizing: "border-box",
        fontFamily: "'DM Sans', sans-serif", outline: "none",
      }} {...props} />
    </div>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      {label && <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "5px" }}>{label}</label>}
      <select style={{
        width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0",
        borderRadius: "8px", fontSize: "14px", boxSizing: "border-box",
        fontFamily: "'DM Sans', sans-serif", outline: "none", background: "#fff",
      }} {...props}>{children}</select>
    </div>
  );
}

export function Textarea({ label, ...props }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      {label && <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "5px" }}>{label}</label>}
      <textarea style={{
        width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0",
        borderRadius: "8px", fontSize: "14px", boxSizing: "border-box",
        fontFamily: "'DM Sans', sans-serif", outline: "none", resize: "vertical", minHeight: "80px",
      }} {...props} />
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", size = "md", style: extra, disabled }) {
  const base = {
    border: "none", cursor: "pointer", borderRadius: "8px",
    fontFamily: "'DM Sans', sans-serif", fontWeight: "500",
    padding: size === "sm" ? "6px 12px" : "10px 18px",
    fontSize: size === "sm" ? "13px" : "14px",
    opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto",
    ...extra,
  };
  const variants = {
    primary: { background: "linear-gradient(135deg, #1D9E75, #0F6E56)", color: "#fff" },
    danger: { background: "#FCEBEB", color: "#A32D2D" },
    success: { background: "#E1F5EE", color: "#0F6E56" },
    ghost: { background: "#f5f5f5", color: "#333" },
    outline: { background: "#fff", color: "#333", border: "1.5px solid #ddd" },
  };
  return <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled}>{children}</button>;
}

// ─── Formatage durée ──────────────────────────────────────────────────────────
// Affiche "1h30" si durationMinutes est défini, sinon "0.5j", "1j", etc.
export function formatDuration(req, hoursPerDay = 8) {
  if (req.durationMinutes && req.durationMinutes > 0) {
    const h = Math.floor(req.durationMinutes / 60);
    const m = req.durationMinutes % 60;
    return m > 0 ? `${h}h${String(m).padStart(2,"0")}` : `${h}h`;
  }
  if (!req.days && req.days !== 0) return "";
  const d = parseFloat(req.days);
  if (d < 1) {
    // 0.5 = demi-journée — durée basée sur le contrat horaire journalier
    const totalMin = Math.round(d * hoursPerDay * 60);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    if (req.heureDebut && req.heureFin) {
      // Recalcul depuis horaires réels
      const [dh, dm2] = req.heureDebut.split(":").map(Number);
      const [fh, fm2] = req.heureFin.split(":").map(Number);
      const diff = (fh * 60 + fm2) - (dh * 60 + dm2);
      if (diff > 0) {
        const rh = Math.floor(diff/60), rm = diff%60;
        return rm > 0 ? `${rh}h${String(rm).padStart(2,"0")}` : `${rh}h`;
      }
    }
    return `${h}h`;
  }
  return `${d} jour${d > 1 ? "s" : ""}`;
}

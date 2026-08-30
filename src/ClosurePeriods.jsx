import { useState } from "react";
import { Card, Btn } from "./components";

export default function ClosurePeriods({ closures, onAdd, onDelete }) {
  const [form, setForm] = useState({ label: "", startDate: "", endDate: "" });
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const handleAdd = () => {
    if (!form.label.trim() || !form.startDate || !form.endDate) {
      setError("Tous les champs sont obligatoires."); return;
    }
    if (form.endDate < form.startDate) {
      setError("La date de fin doit être après la date de début."); return;
    }
    onAdd({ ...form, id: `cl_${Date.now()}` });
    setForm({ label: "", startDate: "", endDate: "" });
    setError(""); setShowForm(false);
  };

  const upcoming = [...closures].sort((a,b) => a.startDate.localeCompare(b.startDate));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: "16px", fontWeight: "700", color: "#1a1a2e" }}>
            🏢 Fermetures collectives
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#888" }}>
            Ces périodes apparaissent sur le calendrier de tous les salariés.
          </p>
        </div>
        <Btn onClick={() => setShowForm(!showForm)}>+ Ajouter</Btn>
      </div>

      {showForm && (
        <div style={{ background: "#f9f9f9", borderRadius: "10px", padding: "14px", border: "1.5px solid #e0e0e0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <div>
              <label style={ls}>Intitulé *</label>
              <input style={is} placeholder="Ex: Fermeture estivale" value={form.label} onChange={e => setForm({...form, label: e.target.value})} />
            </div>
            <div>
              <label style={ls}>Date début *</label>
              <input style={is} type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
            </div>
            <div>
              <label style={ls}>Date fin *</label>
              <input style={is} type="date" value={form.endDate} min={form.startDate} onChange={e => setForm({...form, endDate: e.target.value})} />
            </div>
          </div>
          {error && <div style={{ color: "#A32D2D", fontSize: "12px", marginBottom: "8px" }}>{error}</div>}
          <div style={{ display: "flex", gap: "8px" }}>
            <Btn onClick={handleAdd}>Enregistrer</Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setError(""); }}>Annuler</Btn>
          </div>
        </div>
      )}

      {upcoming.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1.5rem", color: "#bbb", fontSize: "13px" }}>
          Aucune fermeture collective programmée
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {upcoming.map(cl => {
            const isPast = cl.endDate < new Date().toISOString().split("T")[0];
            return (
              <div key={cl.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderRadius: "10px", gap: "12px",
                background: isPast ? "#f9f9f9" : "#E6F1FB",
                border: `1.5px solid ${isPast ? "#e0e0e0" : "#bfdbfe"}`,
                opacity: isPast ? 0.6 : 1,
              }}>
                <div>
                  <div style={{ fontWeight: "500", fontSize: "14px", color: isPast ? "#999" : "#1a1a2e" }}>
                    🏢 {cl.label}
                  </div>
                  <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                    {new Date(cl.startDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                    {" → "}
                    {new Date(cl.endDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>
                <button onClick={() => onDelete(cl.id)} style={{
                  background: "#FCEBEB", border: "none", color: "#A32D2D",
                  borderRadius: "6px", padding: "5px 10px", cursor: "pointer", fontSize: "12px",
                }}>✕ Supprimer</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ls = { display: "block", fontSize: "12px", fontWeight: "500", color: "#555", marginBottom: "4px" };
const is = { width: "100%", padding: "8px 10px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" };

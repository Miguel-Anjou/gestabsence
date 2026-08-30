import { useState } from "react";

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Veuillez remplir tous les champs."); return; }
    setLoading(true);
    setError("");
    try {
      const ok = await onLogin({ email: email.trim(), password });
      if (!ok) setError("Identifiant ou mot de passe incorrect.");
    } catch (err) {
      setError("Erreur de connexion. Veuillez réessayer.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}><span style={styles.logoIcon}>📅</span></div>
        <h1 style={styles.title}>GestAbsence</h1>
        <p style={styles.subtitle}>Gestion des congés & absences</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Identifiant</label>
            <input style={styles.input} type="text" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="prenom.nom" autoFocus autoComplete="username" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Mot de passe</label>
            <input style={styles.input} type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" />
          </div>
          {error && <div style={styles.error}>{error}</div>}
          <button type="submit" style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <div style={styles.hint}>
          <p style={styles.hintTitle}>Comptes de démonstration</p>
          <div style={styles.hintGrid}>
            <div style={styles.hintItem}><strong>Salarié :</strong> marie.dupont / password1</div>
            <div style={styles.hintItem}><strong>Responsable :</strong> alice.lefebvre / manager1</div>
            <div style={styles.hintItem}><strong>Admin RH :</strong> admin / admin123</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: "1rem" },
  card: { background: "#fff", borderRadius: "20px", padding: "2.5rem 2rem", width: "100%", maxWidth: "400px", boxShadow: "0 25px 60px rgba(0,0,0,0.3)", textAlign: "center" },
  logo: { width: "60px", height: "60px", background: "linear-gradient(135deg, #1D9E75, #0F6E56)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" },
  logoIcon: { fontSize: "28px" },
  title: { fontFamily: "'Syne', sans-serif", fontSize: "28px", fontWeight: "700", color: "#1a1a2e", margin: "0 0 4px", letterSpacing: "-0.5px" },
  subtitle: { fontSize: "14px", color: "#888", margin: "0 0 2rem" },
  form: { textAlign: "left" },
  field: { marginBottom: "1rem" },
  label: { display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "6px" },
  input: { width: "100%", padding: "10px 14px", border: "1.5px solid #e0e0e0", borderRadius: "10px", fontSize: "15px", outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" },
  error: { background: "#FCEBEB", color: "#A32D2D", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", marginBottom: "1rem" },
  btn: { width: "100%", padding: "12px", background: "linear-gradient(135deg, #1D9E75, #0F6E56)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: "600", cursor: "pointer", marginTop: "8px", fontFamily: "'DM Sans', sans-serif" },
  hint: { marginTop: "1.5rem", background: "#f8f9fa", borderRadius: "10px", padding: "12px" },
  hintTitle: { fontSize: "11px", fontWeight: "600", color: "#999", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 8px" },
  hintGrid: { display: "flex", flexDirection: "column", gap: "4px" },
  hintItem: { fontSize: "12px", color: "#555", textAlign: "left" },
};

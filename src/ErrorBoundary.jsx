import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ error, info });
    console.error("ErrorBoundary:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "24px", fontFamily: "monospace", background: "#fff5f5", minHeight: "100vh" }}>
          <h2 style={{ color: "#c0392b", fontFamily: "sans-serif" }}>⚠️ Une erreur s'est produite</h2>
          <p style={{ fontFamily: "sans-serif", color: "#555" }}>
            Faites une capture d'écran de ce texte et envoyez-le pour diagnostic :
          </p>
          <pre style={{ background: "#fff", border: "1px solid #f0c0c0", borderRadius: "8px", padding: "16px", overflow: "auto", fontSize: "13px", color: "#c0392b", whiteSpace: "pre-wrap" }}>
{String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: "16px", padding: "10px 18px", background: "#185FA5", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "sans-serif" }}>
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

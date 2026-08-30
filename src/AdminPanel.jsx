import { useState, useRef, useEffect } from "react";
import { DEPARTMENTS, STATUS } from "./data";
import ManagerTeamEditor from "./ManagerTeamEditor";
import ClosurePeriods from "./ClosurePeriods";
import { Card, Btn, Avatar } from "./components";
import { fetchAuditLog } from "./supabase";

const AUDIT_OP_LABELS = { INSERT: "Création", UPDATE: "Modification", DELETE: "Suppression" };
const auditOpLabel = (op) => AUDIT_OP_LABELS[op] || op;
const auditStatusLabel = (status) => STATUS[status]?.label || status;

// Charge xlsx depuis CDN à la demande (réduit le bundle initial de ~500 KB)
let _xlsxCache = null;
async function loadXLSX() {
  if (_xlsxCache) return _xlsxCache;
  if (typeof window !== "undefined" && window.XLSX) { _xlsxCache = window.XLSX; return _xlsxCache; }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => { _xlsxCache = window.XLSX; resolve(_xlsxCache); };
    s.onerror = () => reject(new Error("Impossible de charger la librairie Excel"));
    document.head.appendChild(s);
  });
}

export default function AdminPanel({ users, onUpdateUser, onAddUser, onResetSoldes, settings, onSaveSettings, closures, onAddClosure, onDeleteClosure }) {
  const [tab, setTab] = useState("company");
  const [localSettings, setLocalSettings] = useState(settings || { company: "Mon Entreprise", resetDate: "06-01", rttDefault: 0, emailNotif: false, emailProvider: "outlook", emailFrom: "", emailPass: "" });
  useEffect(() => { if (settings) setLocalSettings(s => ({ ...settings, emailPass: s.emailPass })); }, [settings]);
  const [saved, setSaved] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [auditLog, setAuditLog] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState(null); // null | "loading" | "ok" | "error"
  const [testMsg, setTestMsg] = useState("");
  const fileRef = useRef();

  const handleTestEmail = async () => {
    const s = localSettings;
    if (!s.emailService || !s.emailTemplate || !s.emailPublicKey) {
      setTestStatus("error"); setTestMsg("Renseignez d'abord Service ID, Template ID et Clé publique."); return;
    }
    const to = testEmail.trim();
    if (!to || !to.includes("@")) {
      setTestStatus("error"); setTestMsg("Saisissez une adresse email valide."); return;
    }
    setTestStatus("loading"); setTestMsg("");
    try {
      if (!window.emailjs) {
        await new Promise((res, rej) => {
          const sc = document.createElement("script");
          sc.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
          sc.onload = res; sc.onerror = () => rej(new Error("Impossible de charger EmailJS"));
          document.head.appendChild(sc);
        });
      }
      window.emailjs.init(s.emailPublicKey);
      await window.emailjs.send(s.emailService, s.emailTemplate, {
        to_email:        to,
        to_name:         "Administrateur",
        employee_name:   "Jean Dupont (test)",
        manager_name:    "Vous-même",
        company_name:    s.company || "Mon Entreprise",
        request_type:    "Congé payé",
        request_start:   new Date().toLocaleDateString("fr-FR"),
        request_end:     new Date().toLocaleDateString("fr-FR"),
        request_days:    "1 jour(s)",
        request_reason:  "Test de configuration GestAbsence",
        status:          "🧪 Email de test",
        comment:         "Si vous recevez cet email, la configuration EmailJS est correcte.",
        date_traitement: new Date().toLocaleDateString("fr-FR"),
      });
      setTestStatus("ok"); setTestMsg(`Email envoyé à ${to}`);
    } catch (err) {
      setTestStatus("error"); setTestMsg(err.message || "Échec de l'envoi — vérifiez vos identifiants EmailJS.");
    }
  };

  const save = () => {
    onSaveSettings(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const [importMode, setImportMode] = useState("new"); // "new" | "soldes"
  const [userSearch, setUserSearch] = useState("");

  const cleanStr = (s) => {
    s = String(s).toLowerCase().trim();
    const map = {"é":"e","è":"e","ê":"e","ë":"e","à":"a","â":"a","ü":"u","ù":"u","û":"u","ô":"o","î":"i","ï":"i","ç":"c"};
    s = s.replace(/[éèêëàâüùûôîïç]/g, c => map[c] || c);
    s = s.replace(/[^a-z0-9]/g, ".").replace(/\.+/g, ".").replace(/^\.|\.$/, "");
    return s;
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const XLSX = await loadXLSX().catch(err => { setImportResult({ success: false, msg: err.message }); return null; });
    if (!XLSX) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (importMode === "soldes") {
          // ── Mode mise à jour des soldes CP depuis fichier paie ──────────────
          // Format : Matricule | (vide) | Nom | Prénom | CP N-1 | CP N
          let updated = 0;
          const notInApp = [];      // présents dans le fichier, introuvables dans l'appli
          const updatedIds = new Set();
          for (const row of rows) {
            const nom    = row[2], prenom = row[3];
            const cpN1   = parseFloat(row[4] || 0);
            const cpN    = parseFloat(row[5] || 0);
            if (!nom || !prenom || isNaN(cpN)) continue;
            if (String(nom).toUpperCase().includes("NOM")) continue;
            const solde   = Math.round((cpN1 + cpN) * 100) / 100;
            const prenom1 = String(prenom).trim().split(" ")[0];
            const nom1    = String(nom).trim().split(" ")[0];
            const login   = `${cleanStr(prenom1)}.${cleanStr(nom1)}`;
            // Trouver le salarié par login ou nom
            const found = users.find(u =>
              u.email === login ||
              u.name.toLowerCase().includes(String(nom).toLowerCase().split(" ")[0].toLowerCase())
            );
            if (found) {
              await onUpdateUser(found.id, { soldeConges: solde });
              updatedIds.add(found.id);
              updated++;
            } else {
              notInApp.push(`${String(prenom).trim()} ${String(nom).trim()}`);
            }
          }
          // Salariés actifs de l'appli absents du fichier de paie (on exclut les responsables/admins)
          const notInFile = users
            .filter(u => !u.archived && u.role === "employee" && !updatedIds.has(u.id))
            .map(u => u.name);
          setImportResult({ success: true, count: updated, mode: "soldes", notInApp, notInFile });
        } else {
          // ── Mode import nouveaux salariés (format standard) ─────────────────
          const imported = [];
          const seen = {};
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // Détecte format paie (Matricule|vide|Nom|Prénom|CP N-1|CP N)
            const isPayeFormat = row[1] === null || row[1] === undefined || row[1] === "";
            if (isPayeFormat && row[2] && row[3]) {
              const nom    = String(row[2]).trim();
              const prenom = String(row[3]).trim();
              if (nom.toUpperCase().includes("NOM")) continue;
              const cpN1   = parseFloat(row[4] || 0);
              const cpN    = parseFloat(row[5] || 0);
              const solde  = Math.round((cpN1 + cpN) * 100) / 100;
              const p1     = prenom.split(" ")[0];
              const n1     = nom.split(" ")[0];
              let   login  = `${cleanStr(p1)}.${cleanStr(n1)}`;
              if (seen[login]) { seen[login]++; login += seen[login]; } else seen[login] = 0;
              const avatar = (prenom[0] + nom[0]).toUpperCase();
              if (isNaN(solde) || !nom || !prenom) continue;
              imported.push({ name: `${prenom} ${nom}`, email: login, password: "Envie2026!", department: DEPARTMENTS[0], role: "employee", soldeConges: solde, soldeRTT: 0, soldeHeures: 0, avatar, archived: false, horaire: {L:8,M:8,Me:8,J:8,V:8,S:0,D:0} });
            } else {
              // Format standard : Nom | Login | Mdp | Service | Rôle
              const [name, email, password, department, role] = row;
              if (!name || !email || !password) continue;
              const dept = DEPARTMENTS.includes(department) ? department : DEPARTMENTS[0];
              imported.push({ name: String(name).trim(), email: String(email).trim(), password: String(password).trim(), department: dept, role: role === "manager" ? "manager" : "employee", soldeConges: 25, soldeHeures: 0, archived: false });
            }
          }
          imported.forEach(u => onAddUser(u));
          setImportResult({ success: true, count: imported.length, mode: "new" });
        }
      } catch (err) {
        setImportResult({ success: false, msg: err.message });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleReset = () => {
    if (window.confirm(`Réinitialiser le solde de TOUS les salariés à 25 jours ?\n\nCette opération est irréversible.`)) {
      onResetSoldes();
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await loadXLSX().catch(() => null);
    if (!XLSX) { alert("Impossible de charger la librairie Excel."); return; }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Nom complet", "Identifiant (login)", "Mot de passe", "Service", "Rôle (employee/manager)"],
      ["Marie Dupont", "marie.dupont", "mdp123", "Comptabilité", "employee"],
      ["Jean Martin", "jean.martin", "mdp456", "Commercial", "manager"],
    ]);
    ws["!cols"] = [22,20,14,16,20].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Salariés");
    XLSX.writeFile(wb, "modele_import_salaries.xlsx");
  };

  const empUsers = users.filter(u => u.role === "employee" || u.role === "manager" || u.role === "teamleader");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: "700", color: "#1a1a2e" }}>
          ⚙️ Administration
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#888" }}>Configuration générale de GestAbsence</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", background: "#f5f5f5", borderRadius: "10px", padding: "4px", flexWrap: "wrap" }}>
        {[["company","🏢 Entreprise"],["users","👥 Salariés"],["teams","👔 Équipes"],["rights","⚖️ Droits"],["import","📥 Import"],["closures","🏢 Fermetures"],["audit","📋 Audit"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "8px 16px", border: "none", borderRadius: "7px", cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
            background: tab === k ? "#fff" : "transparent",
            color: tab === k ? "#1a1a2e" : "#888",
            fontWeight: tab === k ? "600" : "400",
            boxShadow: tab === k ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}>{l}</button>
        ))}
      </div>

      {/* Company settings */}
      {tab === "company" && (
        <Card>
          <h3 style={sectionTitle}>Paramètres de l'entreprise</h3>
          <div style={fieldStyle}>
            <label style={labelStyle}>Nom de l'entreprise</label>
            <input style={inputStyle} value={localSettings.company} onChange={e => setLocalSettings({...localSettings, company: e.target.value})} placeholder="Mon Entreprise" />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Date de réinitialisation annuelle des soldes</label>
            <select style={inputStyle} value={localSettings.resetDate} onChange={e => setLocalSettings({...localSettings, resetDate: e.target.value})}>
              <option value="01-01">1er janvier</option>
              <option value="06-01">1er juin</option>
              <option value="manual">Manuelle (bouton dans Réinitialisation)</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Jours RTT par défaut (par salarié/an)</label>
            <input style={inputStyle} type="number" min="0" max="25" value={localSettings.rttDefault} onChange={e => setLocalSettings({...localSettings, rttDefault: parseInt(e.target.value)||0})} />
            <p style={{ fontSize: "12px", color: "#999", margin: "4px 0 0" }}>Ces jours RTT seront ajoutés au solde lors de la réinitialisation annuelle.</p>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>🔔 Notifications email (via EmailJS)</label>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <input type="checkbox" checked={localSettings.emailNotif} onChange={e => setLocalSettings({...localSettings, emailNotif: e.target.checked})} style={{ width: "16px", height: "16px" }} />
              <span style={{ fontSize: "13px", color: "#555" }}>Activer les notifications email</span>
            </div>
            {localSettings.emailNotif && (
              <div style={{ background: "#f0f4ff", borderRadius: "10px", padding: "14px", marginTop: "8px" }}>
                <p style={{ fontSize: "13px", fontWeight: "600", margin: "0 0 4px", color: "#185FA5" }}>
                  ⚙️ Configuration EmailJS — fonctionne avec tout fournisseur email
                </p>
                <p style={{ fontSize: "12px", color: "#6b7280", margin: "0 0 12px" }}>
                  Compatible : Gmail, Outlook, Orange, OVH, Yahoo, SFR, et tout autre email
                </p>

                <div style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "4px" }}>
                    Domaine email des salariés <span style={{ color: "#999" }}>(ex: monentreprise.fr)</span>
                  </label>
                  <input style={{ ...inputStyle, marginBottom: "0" }} placeholder="monentreprise.fr" value={localSettings.emailDomain || ""} onChange={e => setLocalSettings({...localSettings, emailDomain: e.target.value})} />
                  <div style={{ fontSize: "11px", color: "#999", marginTop: "3px" }}>
                    Les emails seront envoyés à <strong>identifiant@monentreprise.fr</strong> pour chaque salarié.
                    Si vos salariés ont des adresses différentes, laissez vide et saisissez l'adresse complète comme identifiant de connexion.
                  </div>
                </div>

                <div style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "4px" }}>EmailJS — Service ID</label>
                  <input style={{ ...inputStyle, marginBottom: "0" }} placeholder="service_xxxxxxx" value={localSettings.emailService || ""} onChange={e => setLocalSettings({...localSettings, emailService: e.target.value})} />
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "4px" }}>EmailJS — Template ID</label>
                  <input style={{ ...inputStyle, marginBottom: "0" }} placeholder="template_xxxxxxx" value={localSettings.emailTemplate || ""} onChange={e => setLocalSettings({...localSettings, emailTemplate: e.target.value})} />
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "4px" }}>EmailJS — Clé publique</label>
                  <input style={{ ...inputStyle, marginBottom: "0" }} placeholder="xxxxxxxxxxxxxxxxxxxx" value={localSettings.emailPublicKey || ""} onChange={e => setLocalSettings({...localSettings, emailPublicKey: e.target.value})} />
                </div>

                {/* Bouton test */}
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "12px", marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#166534", marginBottom: "8px" }}>🧪 Envoyer un email de test</div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      style={{ ...inputStyle, marginBottom: "0", flex: "1", minWidth: "200px" }}
                      type="email"
                      placeholder="votre@email.fr"
                      value={testEmail}
                      onChange={e => { setTestEmail(e.target.value); setTestStatus(null); }}
                    />
                    <Btn onClick={handleTestEmail} disabled={testStatus === "loading"}>
                      {testStatus === "loading" ? "Envoi…" : "Tester"}
                    </Btn>
                  </div>
                  {testStatus === "ok"    && <div style={{ marginTop: "8px", fontSize: "12px", color: "#166534" }}>✅ {testMsg}</div>}
                  {testStatus === "error" && <div style={{ marginTop: "8px", fontSize: "12px", color: "#991b1b" }}>❌ {testMsg}</div>}
                </div>

                <div style={{ background: "#fff", border: "1px solid #dbeafe", borderRadius: "8px", padding: "12px", fontSize: "12px", color: "#1e40af" }}>
                  <strong>📋 Comment configurer (5 minutes) :</strong>
                  <ol style={{ margin: "6px 0 0", paddingLeft: "16px", lineHeight: "1.8" }}>
                    <li>Allez sur <strong>emailjs.com</strong> → créez un compte gratuit</li>
                    <li>Cliquez <strong>Email Services</strong> → <strong>Add New Service</strong></li>
                    <li>Choisissez votre fournisseur : <strong>Gmail, Outlook, OVH...</strong> ou "Custom SMTP"</li>
                    <li>Connectez votre adresse email RH et validez</li>
                    <li>Cliquez <strong>Email Templates</strong> → <strong>Create New Template</strong></li>
                    <li>Copiez-collez ce contenu dans le template :</li>
                  </ol>
                  <div style={{ background: "#f8fafc", borderRadius: "6px", padding: "8px", marginTop: "8px", fontFamily: "monospace", fontSize: "11px", color: "#374151", whiteSpace: "pre-wrap" }}>
{`Objet : [GestAbsence] Demande de {{request_type}} — {{status}}

Bonjour {{to_name}},

Votre demande de {{request_type}} du {{request_start}} au {{request_end}} ({{request_days}}) a été traitée.

Statut : {{status}}
Commentaire : {{comment}}

Traité le {{date_traitement}} par {{manager_name}}
— {{company_name}}`}
                  </div>
                  <div style={{ marginTop: "8px", color: "#6b7280" }}>
                    7. Copiez le <strong>Service ID</strong>, <strong>Template ID</strong> et votre <strong>clé publique</strong> (Account → General) dans les champs ci-dessus.
                  </div>
                </div>
              </div>
            )}
          </div>
          <Btn onClick={save}>{saved ? "✅ Sauvegardé !" : "Sauvegarder"}</Btn>
        </Card>
      )}

      {/* Users management */}
      {tab === "users" && (
        <Card>
          <h3 style={sectionTitle}>Gestion des salariés ({empUsers.length})</h3>
          <input
            style={{ ...inputStyle, marginBottom: "12px" }}
            placeholder="🔍 Rechercher un salarié (nom, login, service)…"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
          />
          {(() => {
            const q = userSearch.trim().toLowerCase();
            const filtered = q
              ? empUsers.filter(u =>
                  (u.name || "").toLowerCase().includes(q) ||
                  (u.email || "").toLowerCase().includes(q) ||
                  (u.department || "").toLowerCase().includes(q))
              : empUsers;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "500px", overflowY: "auto" }}>
                {filtered.length === 0
                  ? <div style={{ color: "#999", fontSize: "13px", padding: "12px", textAlign: "center" }}>Aucun salarié trouvé</div>
                  : filtered.map(u => <UserRow key={u.id} user={u} onUpdate={onUpdateUser} />)}
              </div>
            );
          })()}
        </Card>
      )}

      {/* Teams */}
      {tab === "teams" && (
        <Card>
          <ManagerTeamEditor users={users} onUpdateUser={onUpdateUser} />
        </Card>
      )}

      {/* Import */}
      {tab === "import" && (
        <Card>
          <h3 style={sectionTitle}>Import en masse via Excel</h3>
          <p style={{ fontSize: "13px", color: "#666", marginBottom: "1rem" }}>
            Deux modes disponibles : importer de nouveaux salariés, ou mettre à jour les soldes CP depuis votre fichier de paie mensuel.
          </p>

          {/* Sélection du mode */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "1.25rem" }}>
            {[["new","👥 Importer des salariés"],["soldes","📊 Mettre à jour les soldes CP"]].map(([k,l]) => (
              <button key={k} onClick={() => setImportMode(k)} style={{
                flex: 1, padding: "10px 14px", border: `1.5px solid ${importMode===k ? "#1D9E75" : "#e0e0e0"}`,
                borderRadius: "10px", background: importMode===k ? "#E1F5EE" : "#fff",
                color: importMode===k ? "#0F6E56" : "#555", cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", fontSize: "13px", fontWeight: importMode===k ? "600" : "400",
              }}>{l}</button>
            ))}
          </div>

          {importMode === "soldes" ? (
            <div style={{ background: "#f0fdf8", border: "1px solid #a7f3d0", borderRadius: "10px", padding: "14px", marginBottom: "1.25rem", fontSize: "13px" }}>
              <strong style={{ color: "#0F6E56" }}>📁 Format attendu — fichier de paie mensuel</strong>
              <p style={{ margin: "8px 0 0", color: "#555" }}>
                Glissez directement votre fichier <strong>solde_congés_payés_fin_[mois].xlsx</strong> tel quel.<br/>
                Les colonnes utilisées : <strong>Colonne C = Nom, D = Prénom, E = CP N-1, F = CP N</strong><br/>
                Le solde total (N-1 + N) est calculé automatiquement et mis à jour pour chaque salarié trouvé.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "10px", marginBottom: "1rem", flexWrap: "wrap" }}>
              <Btn variant="outline" onClick={downloadTemplate}>📥 Télécharger le modèle</Btn>
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", marginBottom: "1.5rem" }}>
            <Btn onClick={() => fileRef.current?.click()}>
              {importMode === "soldes" ? "📊 Importer le fichier de paie" : "📤 Importer le fichier .xlsx"}
            </Btn>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleImportExcel} />
          </div>

          {importResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{
                padding: "12px 16px", borderRadius: "10px",
                background: importResult.success ? "#E1F5EE" : "#FCEBEB",
                color: importResult.success ? "#0F6E56" : "#A32D2D",
                fontSize: "14px", fontWeight: "500",
              }}>
                {importResult.success && importResult.mode === "soldes"
                  ? `✅ Soldes CP mis à jour pour ${importResult.count} salarié(s) !`
                  : importResult.success
                  ? `✅ ${importResult.count} salarié(s) importé(s) avec succès !`
                  : `❌ Erreur : ${importResult.msg}`}
              </div>

              {importResult.mode === "soldes" && importResult.notInApp?.length > 0 && (
                <div style={{ padding: "12px 16px", borderRadius: "10px", background: "#FFF7ED", border: "1.5px solid #FED7AA", fontSize: "13px" }}>
                  <div style={{ fontWeight: "600", color: "#C2410C", marginBottom: "6px" }}>
                    ⚠️ {importResult.notInApp.length} personne(s) dans le fichier de paie, introuvable(s) dans l'application :
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "18px", color: "#92400E", lineHeight: "1.8" }}>
                    {importResult.notInApp.map((name, i) => <li key={i}>{name}</li>)}
                  </ul>
                </div>
              )}

              {importResult.mode === "soldes" && importResult.notInFile?.length > 0 && (
                <div style={{ padding: "12px 16px", borderRadius: "10px", background: "#EFF6FF", border: "1.5px solid #BFDBFE", fontSize: "13px" }}>
                  <div style={{ fontWeight: "600", color: "#1D4ED8", marginBottom: "6px" }}>
                    ℹ️ {importResult.notInFile.length} salarié(s) présent(s) dans l'application, absent(s) du fichier de paie :
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "18px", color: "#1E40AF", lineHeight: "1.8" }}>
                    {importResult.notInFile.map((name, i) => <li key={i}>{name}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: "1.5rem", background: "#f9f9f9", borderRadius: "10px", padding: "14px" }}>
            <p style={{ fontSize: "13px", fontWeight: "600", margin: "0 0 8px" }}>Format attendu du fichier Excel :</p>
            <table style={{ fontSize: "12px", borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: "#eee" }}>
                  {["Nom complet","Login","Mot de passe","Service","Rôle"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", border: "1px solid #ddd" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {["Marie Dupont","marie.dupont","mdp123","Comptabilité","employee"].map((v, i) => (
                    <td key={i} style={{ padding: "6px 10px", border: "1px solid #ddd", color: "#555" }}>{v}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: "11px", color: "#999", marginTop: "8px" }}>
              Services disponibles : {DEPARTMENTS.join(", ")}
            </p>
          </div>
        </Card>
      )}


      {/* Fermetures collectives */}
      {tab === "closures" && (
        <Card>
          <ClosurePeriods
            closures={closures||[]}
            onAdd={onAddClosure}
            onDelete={onDeleteClosure}
          />
        </Card>
      )}

      {/* Droits RTT / Récupération */}
      {tab === "rights" && (
        <Card>
          <h3 style={sectionTitle}>⚖️ Droits — RTT et Récupération HR</h3>
          <p style={{ fontSize: "13px", color: "#888", marginBottom: "1.25rem" }}>
            Définissez, salarié par salarié, s'il peut soumettre des demandes de Repos (RTT) et/ou de Récupération d'heures.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  {["Salarié","Département","Rôle","🕐 RTT / Repos","🔄 Récupération HR"].map(h => (
                    <th key={h} style={{ padding: "9px 12px", textAlign: "left", borderBottom: "1.5px solid #eee", color: "#555", fontWeight: "600", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.filter(u => !u.archived && (u.role === "employee" || u.role === "teamleader")).map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "9px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Avatar initials={u.avatar} size={28} />
                        <span style={{ fontWeight: "500" }}>{u.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "9px 12px", color: "#666" }}>{u.department}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: "11px", background: "#f0f0f0", borderRadius: "4px", padding: "2px 6px", color: "#555" }}>
                        {u.role === "teamleader" ? "Chef d'équipe" : "Salarié"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <div
                          onClick={() => onUpdateUser(u.id, { canRtt: !(u.canRtt !== false) })}
                          style={{
                            width: "40px", height: "22px", borderRadius: "11px", cursor: "pointer",
                            background: u.canRtt !== false ? "#1D9E75" : "#ccc",
                            position: "relative", transition: "background 0.2s",
                          }}
                        >
                          <div style={{
                            position: "absolute", top: "3px",
                            left: u.canRtt !== false ? "21px" : "3px",
                            width: "16px", height: "16px", borderRadius: "50%",
                            background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                            transition: "left 0.2s",
                          }} />
                        </div>
                        <span style={{ fontSize: "12px", color: u.canRtt !== false ? "#0F6E56" : "#aaa", fontWeight: "500" }}>
                          {u.canRtt !== false ? "Autorisé" : "Refusé"}
                        </span>
                      </label>
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <div
                          onClick={() => onUpdateUser(u.id, { canRecuperation: !(u.canRecuperation !== false) })}
                          style={{
                            width: "40px", height: "22px", borderRadius: "11px", cursor: "pointer",
                            background: u.canRecuperation !== false ? "#7C3AED" : "#ccc",
                            position: "relative", transition: "background 0.2s",
                          }}
                        >
                          <div style={{
                            position: "absolute", top: "3px",
                            left: u.canRecuperation !== false ? "21px" : "3px",
                            width: "16px", height: "16px", borderRadius: "50%",
                            background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                            transition: "left 0.2s",
                          }} />
                        </div>
                        <span style={{ fontSize: "12px", color: u.canRecuperation !== false ? "#534AB7" : "#aaa", fontWeight: "500" }}>
                          {u.canRecuperation !== false ? "Autorisé" : "Refusé"}
                        </span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.filter(u => !u.archived && (u.role === "employee" || u.role === "teamleader")).length === 0 && (
              <div style={{ textAlign: "center", padding: "2rem", color: "#bbb", fontSize: "13px" }}>
                Aucun salarié actif.
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Journal d'audit */}
      {tab === "audit" && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={sectionTitle}>Journal d'audit — modifications des demandes</h3>
            <Btn onClick={async () => {
              setAuditLoading(true);
              try { const rows = await fetchAuditLog(200); setAuditLog(rows); }
              catch { setAuditLog([]); }
              finally { setAuditLoading(false); }
            }}>
              {auditLoading ? "Chargement…" : auditLog === null ? "📋 Charger l'historique" : "🔄 Rafraîchir"}
            </Btn>
          </div>
          {auditLog === null && !auditLoading && (
            <div style={{ textAlign: "center", padding: "2rem", color: "#bbb" }}>
              <div style={{ fontSize: "32px" }}>📋</div>
              <p style={{ fontSize: "13px" }}>Cliquez sur "Charger l'historique" pour afficher les dernières modifications.</p>
            </div>
          )}
          {auditLog !== null && auditLog.length === 0 && (
            <div style={{ textAlign: "center", padding: "2rem", color: "#bbb", fontSize: "13px" }}>
              Aucun événement trouvé dans audit_log. Vérifiez que la table et le trigger sont configurés.
            </div>
          )}
          {auditLog && auditLog.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    {["Date","Opération","Demande","Ancien statut","Nouveau statut","Par"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1.5px solid #eee", color: "#555", fontWeight: "600" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((row, i) => {
                    const changedAt = row.changed_at || "";
                    const oldStatus = row.old_status || "—";
                    const newStatus = row.new_status || "—";
                    const reqId = row.record_id || "—";
                    const op = row.action || "—";
                    const by = row.changed_by || "—";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "8px 10px", color: "#666" }}>{changedAt ? new Date(changedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td style={{ padding: "8px 10px" }}><span style={{ background: op === "UPDATE" ? "#E6F1FB" : "#F0FDF4", color: op === "UPDATE" ? "#1E40AF" : "#166534", padding: "2px 7px", borderRadius: "4px", fontWeight: "500" }}>{auditOpLabel(op)}</span></td>
                        <td style={{ padding: "8px 10px", color: "#888", fontFamily: "monospace" }}>{String(reqId).slice(0, 12)}…</td>
                        <td style={{ padding: "8px 10px", color: "#A32D2D" }}>{oldStatus === "—" ? oldStatus : auditStatusLabel(oldStatus)}</td>
                        <td style={{ padding: "8px 10px", color: "#0F6E56" }}>{newStatus === "—" ? newStatus : auditStatusLabel(newStatus)}</td>
                        <td style={{ padding: "8px 10px", color: "#555" }}>{by}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function UserRow({ user, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [solde, setSolde] = useState(user.soldeConges);
  const [pwd, setPwd] = useState("");

  const save = () => {
    onUpdate(user.id, { soldeConges: parseInt(solde) || 25, ...(pwd ? { password: pwd } : {}) });
    setEditing(false);
    setPwd("");
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", border: "1.5px solid #f0f0f0", borderRadius: "10px" }}>
      <Avatar initials={user.avatar} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: "500" }}>{user.name}</div>
        <div style={{ fontSize: "11px", color: "#999" }}>{user.department} · {user.role}</div>
      </div>
      {editing ? (
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <div>
            <label style={{ fontSize: "10px", color: "#999", display: "block" }}>CP</label>
            <input type="number" value={solde} onChange={e => setSolde(e.target.value)} style={{ width: "50px", padding: "4px 6px", border: "1.5px solid #ddd", borderRadius: "6px", fontSize: "13px" }} />
          </div>
          <div>
            <label style={{ fontSize: "10px", color: "#999", display: "block" }}>Nouveau mdp</label>
            <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="(inchangé)" style={{ width: "90px", padding: "4px 6px", border: "1.5px solid #ddd", borderRadius: "6px", fontSize: "13px" }} />
          </div>
          <Btn size="sm" onClick={save}>✓</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setEditing(false)}>✕</Btn>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", background: "#E1F5EE", color: "#0F6E56", padding: "3px 8px", borderRadius: "6px", fontWeight: "500" }}>{user.soldeConges}j CP</span>
          {(user.soldeHeures || 0) > 0 && <span style={{ fontSize: "12px", background: "#EEEDFE", color: "#534AB7", padding: "3px 8px", borderRadius: "6px", fontWeight: "500" }}>{user.soldeHeures}h HR</span>}
          <Btn size="sm" variant="ghost" onClick={() => setEditing(true)}>✎</Btn>
        </div>
      )}
    </div>
  );
}

const sectionTitle = { margin: "0 0 1rem", fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: "600", color: "#1a1a2e" };
const fieldStyle = { marginBottom: "1.25rem" };
const labelStyle = { display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "5px" };
const inputStyle = { width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none" };

// Service de notifications email universel via EmailJS
// Compatible avec : Gmail, Outlook, Yahoo, OVH, et tout serveur SMTP

let emailjsReady = false;

async function loadEmailJS() {
  if (window.emailjs) { emailjsReady = true; return; }
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js";
    s.onload = () => { emailjsReady = true; resolve(); };
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

const TYPE_LABELS = {
  conge: "Congé payé", conge_sans_solde: "Congé sans solde",
  conge_exceptionnel: "Congé exceptionnel", rtt: "RTT",
  recuperation: "Récupération HS", absence: "Absence", retard: "Retard",
};
const STATUS_LABELS = {
  approved: "✅ Approuvée", rejected: "❌ Refusée", pending: "⏳ En attente",
};

function isConfigured(s) {
  return s?.emailNotif && s?.emailService && s?.emailTemplate && s?.emailPublicKey;
}

// Construit l'adresse email du destinataire
// Priorité : emailFull (ex: marie.dupont@entreprise.fr) > login@domain > login seul
function buildEmail(login, domain) {
  if (!login) return null;
  // Si le login contient déjà un @, c'est déjà une adresse complète
  if (login.includes("@")) return login;
  // Sinon on ajoute le domaine si configuré
  if (domain) return `${login}@${domain}`;
  return null; // pas d'email possible sans domaine
}

export async function sendStatusNotification({ request, employee, manager, status, comment, settings }) {
  if (!isConfigured(settings)) return;
  const toEmail = buildEmail(employee?.email, settings.emailDomain);
  if (!toEmail) return;

  try {
    await loadEmailJS();
    if (!window.emailjs) return;
    window.emailjs.init(settings.emailPublicKey);

    await window.emailjs.send(settings.emailService, settings.emailTemplate, {
      to_email:        toEmail,
      to_name:         employee?.name || "",
      employee_name:   employee?.name || "",
      manager_name:    manager?.name  || "Votre responsable",
      company_name:    settings.company || "Mon Entreprise",
      request_type:    TYPE_LABELS[request?.type] || request?.type,
      request_start:   request?.startDate ? new Date(request.startDate).toLocaleDateString("fr-FR") : "",
      request_end:     request?.endDate   ? new Date(request.endDate).toLocaleDateString("fr-FR")   : "",
      request_days:    request?.type === "retard" ? `${(request.days||0)*8}h` : `${request?.days || 1} jour(s)`,
      request_reason:  request?.reason || "",
      status:          STATUS_LABELS[status] || status,
      comment:         comment || "Aucun commentaire",
      date_traitement: new Date().toLocaleDateString("fr-FR"),
    });
    console.log("✅ Email envoyé →", toEmail);
  } catch (err) {
    console.warn("Email non envoyé :", err.message);
  }
}

export async function sendNewRequestNotification({ request, employee, managers, settings }) {
  if (!isConfigured(settings)) return;

  try {
    await loadEmailJS();
    if (!window.emailjs) return;
    window.emailjs.init(settings.emailPublicKey);

    for (const mgr of managers) {
      const toEmail = buildEmail(mgr?.email, settings.emailDomain);
      if (!toEmail) continue;

      await window.emailjs.send(settings.emailService, settings.emailTemplate, {
        to_email:        toEmail,
        to_name:         mgr.name,
        employee_name:   employee?.name || "",
        manager_name:    mgr.name,
        company_name:    settings.company || "Mon Entreprise",
        request_type:    TYPE_LABELS[request?.type] || request?.type,
        request_start:   request?.startDate ? new Date(request.startDate).toLocaleDateString("fr-FR") : "",
        request_end:     request?.endDate   ? new Date(request.endDate).toLocaleDateString("fr-FR")   : "",
        request_days:    `${request?.days || 1} jour(s)`,
        request_reason:  request?.reason || "",
        status:          "🆕 Nouvelle demande à traiter",
        comment:         `${employee?.name} a soumis une demande de ${(TYPE_LABELS[request?.type]||"").toLowerCase()}.`,
        date_traitement: new Date().toLocaleDateString("fr-FR"),
      });
    }
  } catch (err) {
    console.warn("Email responsable non envoyé :", err.message);
  }
}

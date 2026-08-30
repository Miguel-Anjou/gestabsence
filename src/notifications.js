// ─── Système de notifications ─────────────────────────────────────────────────
// Salariés : notifications in-app (stockées dans le state)
// Responsables/chefs d'équipe : email via EmailJS

import { sendStatusNotification, sendNewRequestNotification } from "./emailService";

// ─── Créer une notification in-app ───────────────────────────────────────────
export function createNotification({ userId, type, title, message, reqId, color = "#185FA5" }) {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    userId,
    type,      // "request_approved" | "request_rejected" | "request_pending" | "solde_warning" | "n1_expiring"
    title,
    message,
    reqId,
    color,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

// ─── Dispatcher : notifie selon le rôle ──────────────────────────────────────
export async function dispatchNotification({
  action,         // "submitted" | "approved" | "rejected" | "chef_approved"
  request,
  employee,
  actor,          // qui a effectué l'action
  managers,       // liste des responsables/chefs concernés
  settings,
  addNotification, // callback pour ajouter une notif in-app
}) {
  const TYPE_LABELS = {
    conge: "Congé payé", conge_sans_solde: "Congé sans solde",
    conge_exceptionnel: "Congé exceptionnel", rtt: "Repos",
    recuperation: "Récupération HR", absence: "Absence", retard: "Retard",
  };
  const typeLabel = TYPE_LABELS[request?.type] || request?.type || "";
  const dateLabel = request?.startDate
    ? new Date(request.startDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
    : "";

  // ── Notification au SALARIÉ (in-app uniquement) ───────────────────────────
  if (action === "approved" && employee) {
    addNotification(createNotification({
      userId: employee.id,
      type: "request_approved",
      title: "✅ Demande approuvée",
      message: `Votre demande de ${typeLabel} du ${dateLabel} a été approuvée.`,
      reqId: request?.id,
      color: "#1D9E75",
    }));
  }

  if (action === "rejected" && employee) {
    addNotification(createNotification({
      userId: employee.id,
      type: "request_rejected",
      title: "❌ Demande refusée",
      message: `Votre demande de ${typeLabel} du ${dateLabel} a été refusée.`,
      reqId: request?.id,
      color: "#A32D2D",
    }));
  }

  if (action === "chef_approved" && employee) {
    addNotification(createNotification({
      userId: employee.id,
      type: "request_pending",
      title: "⏳ Validation en cours",
      message: `Votre demande de ${typeLabel} a été validée par le chef d'équipe. En attente du responsable.`,
      reqId: request?.id,
      color: "#7C3AED",
    }));
  }

  // ── Notification aux RESPONSABLES/CHEFS (email) ───────────────────────────
  if (action === "submitted" && managers?.length > 0) {
    // Email aux responsables/chefs quand un salarié soumet
    const mgrsToNotify = managers.filter(m =>
      m.role === "manager" || m.role === "admin" || m.role === "teamleader"
    );
    if (mgrsToNotify.length > 0) {
      await sendNewRequestNotification({
        request, employee, managers: mgrsToNotify, settings,
      });
    }
  }

  if ((action === "approved" || action === "rejected") && actor) {
    // Email au responsable supérieur si c'est un chef d'équipe qui valide
    if (actor.role === "teamleader" && managers?.length > 0) {
      const superManagers = managers.filter(m => m.role === "manager" || m.role === "admin");
      if (superManagers.length > 0) {
        await sendNewRequestNotification({
          request: { ...request, reason: `[Validé chef d'équipe] ${request?.reason || ""}` },
          employee,
          managers: superManagers,
          settings,
        });
      }
    }
    // Email au salarié si c'est un responsable → déjà géré par sendStatusNotification dans App.jsx
    if (actor.role === "manager" || actor.role === "admin") {
      await sendStatusNotification({ request, employee, manager: actor, status: action, comment: request?.comment, settings });
    }
  }
}

// ─── Alerte solde N-1 ─────────────────────────────────────────────────────────
export function checkN1Expiry(user, addNotification) {
  if (!user.soldeN1 || user.soldeN1 <= 0) return;
  const now = new Date();
  const limit = new Date(now.getFullYear(), 4, 31); // 31 mai
  const daysLeft = Math.ceil((limit - now) / 86400000);
  if (daysLeft <= 30 && daysLeft > 0) {
    addNotification(createNotification({
      userId: user.id,
      type: "n1_expiring",
      title: `⚠️ CP N-1 expirent dans ${daysLeft} jours`,
      message: `Vous avez ${user.soldeN1}j de congés N-1 à prendre avant le 31 mai.`,
      color: "#BA7517",
    }));
  }
}

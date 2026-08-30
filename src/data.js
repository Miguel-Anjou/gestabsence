export const DEPARTMENTS = [
  "Livreur", "Vente", "Collecte", "SAV", "Froid", "Lavage", "PEM", "Cuisson", "Logistique", "Chef d'équipe"
];

// Départements visibles selon le rôle.
// - admin / chef d'équipe : toute l'entreprise
// - responsable : ses services assignés, ou tout si aucun n'est configuré
// - salarié : ses services (généralement aucun)
export function effectiveManagedDepts(user) {
  if (!user) return [];
  if (user.role === "admin" || user.role === "teamleader") return DEPARTMENTS;
  if (user.role === "manager") {
    const md = user.managedDepts || [];
    return md.length ? md : DEPARTMENTS;
  }
  return user.managedDepts || [];
}

// ─── Types de demandes salarié ────────────────────────────────────────────────
export const REQUEST_TYPES = {
  conge:            { label: "Congé payé",           color: "#1D9E75", bg: "#E1F5EE", icon: "☀️" },
  conge_sans_solde: { label: "Congé sans solde",      color: "#6B7280", bg: "#F3F4F6", icon: "📭" },
  conge_exceptionnel:{ label: "Congé exceptionnel",   color: "#7C3AED", bg: "#EDE9FE", icon: "⭐" },
  rtt:              { label: "Repos",                   color: "#0369A1", bg: "#E0F2FE", icon: "🕐" },
  recuperation:     { label: "Récupération HR",        color: "#B45309", bg: "#FEF3C7", icon: "🔄" },
  absence:          { label: "Absence",               color: "#185FA5", bg: "#E6F1FB", icon: "📋" },
  retard:           { label: "Retard",                color: "#BA7517", bg: "#FAEEDA", icon: "⏰" },
};

// ─── Motifs d'absence (saisis par le responsable) ────────────────────────────
export const ABSENCE_MOTIFS = [
  { value: "arret_maladie",       label: "Arrêt maladie",           icon: "🏥" },
  { value: "accident_travail",    label: "Accident de travail",     icon: "⚠️" },
  { value: "conge_sans_solde",    label: "Congé sans solde",        icon: "📭" },
  { value: "absence_non_autorisee",label: "Absence non autorisée", icon: "🚫" },
  { value: "autre",               label: "Autre",                   icon: "📝" },
];

// ─── Demi-journée ─────────────────────────────────────────────────────────────
export const HALF_DAY_OPTIONS = [
  { value: "full",       label: "Journée entière" },
  { value: "morning",   label: "Matin seulement" },
  { value: "afternoon", label: "Après-midi seulement" },
];

export const STATUS = {
  pending:       { label: "En attente",          color: "#BA7517", bg: "#FAEEDA" },
  chef_approved: { label: "Validé chef équipe",  color: "#7C3AED", bg: "#EDE9FE" },
  approved:      { label: "Approuvée",           color: "#1D9E75", bg: "#E1F5EE" },
  rejected:      { label: "Refusée",             color: "#A32D2D", bg: "#FCEBEB" },
};

// ─── Heures récupérables ───────────────────────────────────────────────────
// { id, userId, date, hours, reason, createdBy, createdAt }
export const INITIAL_OVERTIME = [
  { id: "ot1", userId: "u1", date: "2025-04-28", hours: 2.5, reason: "Clôture mensuelle",  createdBy: "m1", createdAt: "2025-04-29" },
  { id: "ot2", userId: "u3", date: "2025-04-25", hours: 3,   reason: "Déploiement urgent", createdBy: "m3", createdAt: "2025-04-26" },
  { id: "ot3", userId: "u2", date: "2025-04-22", hours: 1.5, reason: "Réunion client",      createdBy: "m2", createdAt: "2025-04-23" },
];

export const INITIAL_USERS = [
  // soldeN1 = congés N-1 (à prendre avant le 31 mai)
  { id: "u1", name: "Marie Dupont",    email: "marie.dupont",    password: "password1", role: "employee", department: "Comptabilité", avatar: "MD", soldeConges: 25, soldeRTT: 10, soldeHeures: 2.5, horaire: {L:8,M:8,Me:8,J:8,V:8,S:0,D:0} },
  { id: "u2", name: "Pierre Martin",   email: "pierre.martin",   password: "password2", role: "employee", department: "Commercial",   avatar: "PM", soldeConges: 22, soldeRTT: 8,  soldeHeures: 1.5, horaire: {L:8,M:8,Me:8,J:8,V:8,S:0,D:0} },
  { id: "u3", name: "Sophie Bernard",  email: "sophie.bernard",  password: "password3", role: "employee", department: "Technique",    avatar: "SB", soldeConges: 18, soldeRTT: 10, soldeHeures: 3,   horaire: {L:8,M:8,Me:8,J:8,V:7,S:0,D:0} },
  { id: "u4", name: "Lucas Moreau",    email: "lucas.moreau",    password: "password4", role: "employee", department: "Marketing",    avatar: "LM", soldeConges: 25, soldeRTT: 10, soldeHeures: 0,   horaire: {L:8,M:8,Me:8,J:8,V:8,S:0,D:0} },
  { id: "u5", name: "Emma Petit",      email: "emma.petit",      password: "password5", role: "employee", department: "Logistique",   avatar: "EP", soldeConges: 20, soldeRTT: 7,  soldeHeures: 0,   horaire: {L:7,M:7,Me:7,J:7,V:7,S:0,D:0} },
  { id: "u6", name: "Thomas Leroy",    email: "thomas.leroy",    password: "password6", role: "employee", department: "RH",           avatar: "TL", soldeConges: 25, soldeRTT: 10, soldeHeures: 0,   horaire: {L:8,M:8,Me:8,J:8,V:8,S:0,D:0} },
  { id: "u7", name: "Camille Roux",    email: "camille.roux",    password: "password7", role: "employee", department: "Technique",    avatar: "CR", soldeConges: 15, soldeRTT: 5,  soldeHeures: 0,   horaire: {L:8,M:8,Me:8,J:8,V:8,S:0,D:0} },
  { id: "u8", name: "Julien Simon",    email: "julien.simon",    password: "password8", role: "employee", department: "Commercial",   avatar: "JS", soldeConges: 23, soldeRTT: 9,  soldeHeures: 0,   horaire: {L:8,M:8,Me:8,J:8,V:8,S:0,D:0} },
  { id: "m1", name: "Alice Lefebvre",  email: "alice.lefebvre",  password: "manager1",  role: "manager",  department: "Comptabilité", managedDepts: ["Comptabilité","RH"], horaire: {L:8,M:8,Me:8,J:8,V:8,S:0,D:0},                   avatar: "AL", soldeConges: 25, soldeRTT: 10, soldeHeures: 0 },
  { id: "m2", name: "Benoit Girard",   email: "benoit.girard",   password: "manager2",  role: "manager",  department: "Commercial",   managedDepts: ["Commercial","Marketing"],               avatar: "BG", soldeConges: 25, soldeRTT: 10, soldeHeures: 0 },
  { id: "m3", name: "Claire Fontaine", email: "claire.fontaine", password: "manager3",  role: "manager",  department: "Technique",    managedDepts: ["Technique","Logistique"],               avatar: "CF", soldeConges: 25, soldeRTT: 10, soldeHeures: 0 },
  { id: "admin", name: "Admin RH",     email: "admin",           password: "admin123",  role: "admin",    department: "Direction",    managedDepts: DEPARTMENTS,                             avatar: "RH", soldeConges: 25, soldeRTT: 10, soldeHeures: 0 },
];

const today = new Date();
const fmt   = (d) => d.toISOString().split("T")[0];
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

export const INITIAL_REQUESTS = [
  { id: "r1", userId: "u1", type: "conge",    subType: "full",      startDate: fmt(addDays(today,10)), endDate: fmt(addDays(today,17)), days: 5,   status: "pending",  reason: "Vacances d'été",       createdAt: fmt(today),             comment: "", absenceMotif: "" },
  { id: "r2", userId: "u2", type: "absence",  subType: "full",      startDate: fmt(addDays(today,-3)), endDate: fmt(addDays(today,-3)), days: 1,   status: "approved", reason: "Rendez-vous médical",  createdAt: fmt(addDays(today,-5)), comment: "Approuvé", absenceMotif: "arret_maladie" },
  { id: "r3", userId: "u3", type: "retard",   subType: "full",      startDate: fmt(today),             endDate: fmt(today),             days: 0.25,status: "pending",  reason: "Problème de transport",createdAt: fmt(today),             comment: "", absenceMotif: "" },
  { id: "r4", userId: "u4", type: "conge",    subType: "full",      startDate: fmt(addDays(today,20)), endDate: fmt(addDays(today,30)), days: 7,   status: "rejected", reason: "Congé personnel",      createdAt: fmt(addDays(today,-2)), comment: "Période déjà chargée", absenceMotif: "" },
  { id: "r5", userId: "u5", type: "absence",  subType: "full",      startDate: fmt(addDays(today,5)),  endDate: fmt(addDays(today,6)),  days: 2,   status: "pending",  reason: "Formation externe",    createdAt: fmt(addDays(today,-1)), comment: "", absenceMotif: "" },
  { id: "r6", userId: "u7", type: "conge",    subType: "morning",   startDate: fmt(addDays(today,14)), endDate: fmt(addDays(today,14)), days: 0.5, status: "approved", reason: "RDV personnel",        createdAt: fmt(addDays(today,-3)), comment: "", absenceMotif: "" },
  { id: "r7", userId: "u8", type: "retard",   subType: "full",      startDate: fmt(addDays(today,-1)), endDate: fmt(addDays(today,-1)), days: 0.5, status: "approved", reason: "Embouteillages",       createdAt: fmt(addDays(today,-1)), comment: "", absenceMotif: "" },
  { id: "r8", userId: "u6", type: "rtt",      subType: "afternoon", startDate: fmt(addDays(today,30)), endDate: fmt(addDays(today,30)), days: 0.5, status: "pending",  reason: "Après-midi perso",     createdAt: fmt(today),             comment: "", absenceMotif: "" },
  { id: "r9", userId: "u3", type: "recuperation", subType: "full",  startDate: fmt(addDays(today,7)),  endDate: fmt(addDays(today,7)),  days: 1,   status: "pending",  reason: "Récupération",      createdAt: fmt(today),             comment: "", absenceMotif: "" },
];

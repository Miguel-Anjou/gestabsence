import { getFrenchHolidays } from "./holidays";
import { REQUEST_TYPES, STATUS } from "./data";

// ─── XLSX chargé depuis CDN (pas bundlé — cf. main.js live qui charge
// cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js dynamiquement) ──
let xlsxReady = false;
async function loadXLSX() {
  if (window.XLSX) { xlsxReady = true; return; }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => { xlsxReady = true; resolve(); };
    s.onerror = () => reject(new Error("Impossible de charger la librairie Excel."));
    document.head.appendChild(s);
  });
}

const MONTHR_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DAYS_FR   = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, "0"); }

function fmtDate(d) {
  return `${pad2(d.getDate())}-${MONTHR_FR[d.getMonth()].substring(0,4)}-${String(d.getFullYear()).slice(2)}`;
}

function isWeekend(d) { const dow = d.getDay(); return dow === 0 || dow === 6; }

// Heures travaillées théoriques pour un jour donné selon l'horaire du salarié
function heuresJour(user, date) {
  if (!user.horaire) return 0;
  const keys = ["D","L","M","Me","J","V","S"];
  return parseFloat(user.horaire[keys[date.getDay()]] || 0);
}

// Trouve les demandes approuvées qui couvrent ce jour pour ce salarié
function getReqForDay(requests, userId, dateStr) {
  return requests.filter(r =>
    r.userId === userId &&
    r.status === "approved" &&
    r.startDate <= dateStr &&
    (r.endDate || r.startDate) >= dateStr
  );
}

// Durée en heures d'une demande (depuis durationMinutes ou heures du jour)
function getDurationH(req, user, date) {
  if (req.durationMinutes && req.durationMinutes > 0) {
    return Math.round(req.durationMinutes / 60 * 100) / 100;
  }
  if (req.heureDebut && req.heureFin) {
    const [dh, dm] = req.heureDebut.split(":").map(Number);
    const [fh, fm] = req.heureFin.split(":").map(Number);
    const diff = (fh * 60 + fm) - (dh * 60 + dm);
    return diff > 0 ? Math.round(diff / 60 * 100) / 100 : 0;
  }
  const h = heuresJour(user, date);
  if (req.subType === "morning" || req.subType === "afternoon") return h / 2;
  return h;
}

// ─── EXPORT EXCEL — 1 feuille par salarié ─────────────────────────────────────
export async function exportToExcel({ requests, users, month, year, scope = "all", company = "ENVIE ANJOU" }) {
  await loadXLSX();
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const scopeUsers = users.filter(u =>
    (u.role === "employee" || u.role === "manager") &&
    (scope === "all" || u.department === scope)
  ).sort((a, b) => a.name.localeCompare(b.name));

  const holidays   = getFrenchHolidays(year);
  const holidaySet = new Set(holidays.map(h => h.date));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel  = `${MONTHR_FR[month]} ${year}`;

  scopeUsers.forEach(user => {
    const rows = buildEmployeeSheet(user, requests, year, month, daysInMonth, holidaySet, company, monthLabel);
    const ws   = XLSX.utils.aoa_to_sheet(rows.data);

    // Largeurs colonnes
    ws["!cols"] = [
      { wch: 12 }, // jour
      { wch: 12 }, // date
      { wch: 8  }, // H travaillées
      { wch: 8  }, // H fériées
      { wch: 8  }, // CP
      { wch: 8  }, // AM (arrêt maladie)
      { wch: 8  }, // ABS
      { wch: 8  }, // ACC travail
      { wch: 8  }, // AP (autres)
      { wch: 8  }, // Forma
      { wch: 8  }, // sig salarié
      { wch: 8  }, // sig encadrant
    ];

    // Hauteurs lignes
    ws["!rows"] = rows.data.map((_, i) => ({ hpt: rows.cumul.includes(i) ? 16 : 14 }));

    // Fusions cellules header
    ws["!merges"] = rows.merges;

    // Styles (couleurs fond pour cumuls)
    applyStyles(ws, rows);

    // Nom feuille : nom tronqué à 31 chars (limite Excel)
    const sheetName = user.name.substring(0, 28).replace(/[:\\\/\?\*\[\]]/g, "");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const label = `${MONTHR_FR[month]}_${year}`;
  XLSX.writeFile(wb, `${company}_${label}.xlsx`);
}

// ─── Construction d'une feuille salarié ───────────────────────────────────────
function buildEmployeeSheet(user, requests, year, month, daysInMonth, holidaySet, company, monthLabel) {
  const data    = [];
  const merges  = [];
  const cumul   = []; // indices des lignes de cumul (pour coloration)

  // ── Ligne 1 : titre entreprise + nom salarié
  data.push([company, "", "n° Sitel", "", "", "", "Nom du salarié", "", user.name, "", user.department, ""]);
  merges.push({ s:{r:0,c:0}, e:{r:0,c:1} });
  merges.push({ s:{r:0,c:6}, e:{r:0,c:7} });
  merges.push({ s:{r:0,c:8}, e:{r:0,c:10} });

  // ── Ligne 2 : mois de / au
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month, daysInMonth);
  data.push([`Mois de`, monthLabel, "", "", "", "", "du", fmtDate(firstDay), "au", fmtDate(lastDay), "", ""]);

  // ── Ligne 3 : contrat du / au
  data.push(["contrat du", "", "", "", "", "", "", "", "", "", "", ""]);

  // ── Ligne 4 : en-têtes colonnes horaires
  data.push(["", "", "", "", "", "horaires", "", "", "", "", "", ""]);
  merges.push({ s:{r:3,c:5}, e:{r:3,c:9} });

  // ── Ligne 5 : sous-en-têtes
  data.push([
    "jours", "dates",
    "Heures\ntravaillées", "heures\nfériées", "heures\nCP",
    "heures\nAM", "heures\nABS", "heures\nacc\ntravail",
    "AP", "heures\nForma",
    "signature\nsalarié", "signature\nencadrant"
  ]);

  // ── Données journalières, groupées par semaine
  let weekRows  = [];
  let weekNum   = 0;
  let cumWeek   = { trav:0, ferie:0, cp:0, am:0, abs:0, acc:0, ap:0, forma:0 };
  let cumMonth  = { trav:0, ferie:0, cp:0, am:0, abs:0, acc:0, ap:0, forma:0 };

  const pushCumulSemaine = (num) => {
    const i = data.length;
    cumul.push(i);
    data.push([
      `CUMUL SEMAINE ${num}`,
      "",
      fmtH(cumWeek.trav), fmtH(cumWeek.ferie),
      fmtH(cumWeek.cp), fmtH(cumWeek.am),
      fmtH(cumWeek.abs), fmtH(cumWeek.acc),
      fmtH(cumWeek.ap), fmtH(cumWeek.forma),
      "", ""
    ]);
    merges.push({ s:{r:i,c:0}, e:{r:i,c:1} });
    cumWeek = { trav:0, ferie:0, cp:0, am:0, abs:0, acc:0, ap:0, forma:0 };
    weekRows = [];
  };

  for (let d = 1; d <= daysInMonth; d++) {
    const date    = new Date(year, month, d);
    const dateStr = date.toISOString().split("T")[0];
    const dow     = date.getDay(); // 0=dim
    const isWE    = isWeekend(date);
    const isFerie = holidaySet.has(dateStr);
    const dayLabel= DAYS_FR[dow];

    // Semaine ISO (lundi=1)
    const isoWeek = getISOWeek(date);
    if (weekNum === 0) weekNum = isoWeek;
    if (isoWeek !== weekNum && dow === 1) {
      // Nouveau lundi = cumul semaine précédente
      pushCumulSemaine(weekNum);
      weekNum = isoWeek;
    }

    // Heures théoriques
    const hTheo = isWE ? 0 : heuresJour(user, date);

    // Demandes du jour
    const reqs = getReqForDay(requests, user.id, dateStr);

    let hTrav = isWE || isFerie ? 0 : hTheo;
    let hFerie = 0, hCP = 0, hAM = 0, hABS = 0, hACC = 0, hAP = 0, hForma = 0;

    if (isFerie && !isWE) { hFerie = hTheo; hTrav = 0; }

    reqs.forEach(req => {
      const h = getDurationH(req, user, date);
      hTrav = Math.max(0, hTrav - h);
      if (req.type === "conge" || req.type === "conge_exceptionnel" || req.type === "conge_sans_solde" || req.type === "rtt" || req.type === "recuperation") hCP  += h;
      else if (req.type === "absence" && req.absenceMotif === "arret_maladie")      hAM  += h;
      else if (req.type === "absence" && req.absenceMotif === "accident_travail")   hACC += h;
      else if (req.type === "absence")                                              hABS += h;
      else if (req.type === "retard")                                               hABS += h;
    });

    // Ligne du jour
    const rowIdx = data.length;
    data.push([
      isWE ? "" : dayLabel,
      fmtDate(date),
      isWE ? "" : fmtH(hTrav),
      fmtH(hFerie),
      fmtH(hCP),
      fmtH(hAM),
      fmtH(hABS),
      fmtH(hACC),
      fmtH(hAP),
      fmtH(hForma),
      "", ""
    ]);

    // Accumuler
    cumWeek.trav  += hTrav;  cumMonth.trav  += hTrav;
    cumWeek.ferie += hFerie; cumMonth.ferie += hFerie;
    cumWeek.cp    += hCP;    cumMonth.cp    += hCP;
    cumWeek.am    += hAM;    cumMonth.am    += hAM;
    cumWeek.abs   += hABS;   cumMonth.abs   += hABS;
    cumWeek.acc   += hACC;   cumMonth.acc   += hACC;
    cumWeek.ap    += hAP;    cumMonth.ap    += hAP;
    cumWeek.forma += hForma; cumMonth.forma += hForma;
  }

  // Dernier cumul semaine
  pushCumulSemaine(weekNum);

  // ── Cumul mensuel
  const ciM = data.length;
  cumul.push(ciM);
  data.push([
    "CUMUL MENSUEL", "",
    fmtH(cumMonth.trav), fmtH(cumMonth.ferie),
    fmtH(cumMonth.cp), fmtH(cumMonth.am),
    fmtH(cumMonth.abs), fmtH(cumMonth.acc),
    fmtH(cumMonth.ap), fmtH(cumMonth.forma),
    "", ""
  ]);
  merges.push({ s:{r:ciM,c:0}, e:{r:ciM,c:1} });

  // ── Récapitulatif bas de page
  data.push([]);
  data.push(["Récapitulatif mois", "", "", "", "", "", "", "", "", "", "", ""]);
  data.push(["Heures travaillées", fmtH(cumMonth.trav), "", "", "heures AM",    fmtH(cumMonth.am),  "", "", "", "", "", ""]);
  data.push(["Heures fériées",     fmtH(cumMonth.ferie),"", "", "heures acc travail", fmtH(cumMonth.acc),"","","","","",""]);
  data.push(["Heures CP",          fmtH(cumMonth.cp),  "", "", "",              "",    "", "", "", "", "", ""]);

  return { data, merges, cumul };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtH(h) {
  if (!h || h === 0) return "";
  const rounded = Math.round(h * 100) / 100;
  return rounded;
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function applyStyles(ws, rows) {
  // Rien à faire ici sans SheetJS Pro — les fusions et largeurs suffisent
  // Les lignes cumul sont identifiables par leur index dans rows.cumul
}

// ─── EXPORT PDF — récapitulatif salarié via impression navigateur ────────────
// RECONSTRUCTION APPROXIMATIVE : le bundle live n'embarque aucune librairie PDF
// (pas de jsPDF détecté), seulement `window.print()` — donc l'implémentation
// d'origine ouvre très probablement une fenêtre avec une vue imprimable HTML
// et déclenche l'impression (→ "Enregistrer en PDF" côté navigateur). La mise
// en page exacte n'a pas pu être retrouvée et est à ajuster/vérifier.
export function exportToPDF({ user, requests, month, year }) {
  const monthReqs = requests.filter(r => {
    const d = new Date(r.startDate);
    return r.userId === user.id && d.getMonth() === month && d.getFullYear() === year;
  }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  const rowsHtml = monthReqs.map(r => `
    <tr>
      <td>${fmtDate(new Date(r.startDate))}</td>
      <td>${r.endDate ? fmtDate(new Date(r.endDate)) : "—"}</td>
      <td>${REQUEST_TYPES[r.type]?.label || r.type || ""}</td>
      <td>${r.days ?? "—"}</td>
      <td>${STATUS[r.status]?.label || r.status || ""}</td>
    </tr>`).join("");

  const html = `
    <html><head><title>Récapitulatif ${MONTHR_FR[month]} ${year} — ${user.name}</title>
    <style>
      body { font-family: sans-serif; padding: 24px; }
      h1 { font-size: 18px; } h2 { font-size: 14px; color: #555; font-weight: normal; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 13px; }
      th { background: #f5f5f5; }
    </style></head>
    <body>
      <h1>Récapitulatif des demandes</h1>
      <h2>${user.name} — ${MONTHR_FR[month]} ${year}</h2>
      <table>
        <thead><tr><th>Début</th><th>Fin</th><th>Type</th><th>Jours</th><th>Statut</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="5">Aucune demande ce mois-ci.</td></tr>'}</tbody>
      </table>
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
}

// ─── filterRequests (gardé pour compatibilité Analytics) ─────────────────────
export function filterRequests(requests, users, month, year, scope) {
  return requests.filter(r => {
    const d = new Date(r.startDate);
    const matchPeriod = month !== null
      ? d.getMonth() === month && d.getFullYear() === year
      : d.getFullYear() === year;
    const u = users.find(x => x.id === r.userId);
    const matchScope = scope === "all" || u?.department === scope;
    return matchPeriod && matchScope;
  }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
}

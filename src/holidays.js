// Jours fériés français — calculés dynamiquement pour n'importe quelle année

function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function getFrenchHolidays(year) {
  const easter = easterDate(year);
  const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmt = (d) => d.toISOString().split("T")[0];

  return [
    { date: fmt(new Date(year, 0, 1)),  label: "Jour de l'An" },
    { date: fmt(add(easter, 1)),         label: "Lundi de Pâques" },
    { date: fmt(new Date(year, 4, 1)),  label: "Fête du Travail" },
    { date: fmt(new Date(year, 4, 8)),  label: "Victoire 1945" },
    { date: fmt(add(easter, 39)),        label: "Ascension" },
    { date: fmt(add(easter, 50)),        label: "Lundi de Pentecôte" },
    { date: fmt(new Date(year, 6, 14)), label: "Fête Nationale" },
    { date: fmt(new Date(year, 7, 15)), label: "Assomption" },
    { date: fmt(new Date(year, 10, 1)), label: "Toussaint" },
    { date: fmt(new Date(year, 10, 11)),label: "Armistice" },
    { date: fmt(new Date(year, 11, 25)),label: "Noël" },
  ];
}

export function isHoliday(dateStr, year) {
  const holidays = getFrenchHolidays(year || new Date(dateStr).getFullYear());
  return holidays.some(h => h.date === dateStr);
}

export function isWeekend(dateStr) {
  const d = new Date(dateStr);
  return d.getDay() === 0 || d.getDay() === 6;
}

// Calcule le nombre de jours ouvrés entre deux dates (hors week-ends et fériés)
export function countWorkingDays(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const year = start.getFullYear();
  const holidays = getFrenchHolidays(year).map(h => h.date);
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    const s = cur.toISOString().split("T")[0];
    if (d !== 0 && d !== 6 && !holidays.includes(s)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

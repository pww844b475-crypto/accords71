// Calendrier français : jours fériés, jours de travail pendant une période de congés, jours à pointer.
import { congesPointage } from './calculs.js';

const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateDe = s => { const [a, m, j] = s.split('-').map(Number); return new Date(a, m - 1, j); };
const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Dimanche de Pâques (algorithme de Meeus / Jones / Butcher). */
export function paques(annee) {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

/** Les 11 jours fériés légaux de l'année (France métropolitaine, hors Alsace-Moselle). */
export function joursFeries(annee) {
  const p = paques(annee);
  return [
    [`${annee}-01-01`, "Jour de l'an"], [iso(plus(p, 1)), 'Lundi de Pâques'], [`${annee}-05-01`, 'Fête du Travail'], [`${annee}-05-08`, 'Victoire 1945'],
    [iso(plus(p, 39)), 'Jeudi de l\'Ascension'], [iso(plus(p, 50)), 'Lundi de Pentecôte'], [`${annee}-07-14`, 'Fête nationale'], [`${annee}-08-15`, 'Assomption'],
    [`${annee}-11-01`, 'Toussaint'], [`${annee}-11-11`, 'Armistice 1918'], [`${annee}-12-25`, 'Noël'],
  ].map(([date, nom]) => ({ date, nom }));
}

const JOURS_NOMS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const libelleDate = s => { const d = dateDe(s); return `${JOURS_NOMS[d.getDay()]} ${d.getDate()} ${MOIS_NOMS[d.getMonth()]}`; };

/** Jours fériés compris entre deux dates (incluses). */
export function feriesDans(debut, fin) {
  const a = dateDe(debut), b = dateDe(fin), res = [];
  for (let an = a.getFullYear(); an <= b.getFullYear(); an++) for (const f of joursFeries(an)) { const d = dateDe(f.date); if (d >= a && d <= b) res.push({ ...f, jour: d.getDay(), libelle: libelleDate(f.date) }); }
  return res.sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Jours à pointer pour une période de congés payés (accord, art. 4.1.2).
 * joursHab : jours de travail fixes (0 = dimanche … 6 = samedi) ou null ; joursSemaine : jours travaillés par semaine ;
 * joursTravaillesSaisis : jours de travail prévus pendant les congés si les jours varient ; feriesChomes : fériés fermés par le magasin pendant les congés.
 * La période est limitée au mois indiqué (annee, mois) si on le précise.
 */
export function pointerConges({ debut, fin, joursHab = null, joursSemaine = 5, joursTravaillesSaisis = 0, feriesChomes = 0, annee = null, mois = null }) {
  let a = dateDe(debut), b = dateDe(fin);
  if (annee && mois) { const premier = new Date(annee, mois - 1, 1), dernier = new Date(annee, mois, 0); if (a < premier) a = premier; if (b > dernier) b = dernier; }
  if (b < a) return { erreur: 'La date de fin est avant la date de début.', pointes: 0, joursTravailles: 0, feries: [], feriesChomes: 0, absTravail: 0, duree: 0 };
  const duree = Math.round((b - a) / 86400000) + 1;
  let joursTravailles;
  if (Array.isArray(joursHab) && joursHab.length) { const set = new Set(joursHab.map(Number)); joursTravailles = 0; for (let d = new Date(a); d <= b; d = plus(d, 1)) if (set.has(d.getDay())) joursTravailles++; }
  else if (joursTravaillesSaisis > 0) joursTravailles = Math.round(joursTravaillesSaisis);
  else joursTravailles = Math.round(duree * (joursSemaine || 5) / 7);
  const feries = feriesDans(iso(a), iso(b));
  const ouvrables = feries.filter(f => f.jour !== 0);                 // un dimanche n'est pas un jour ouvrable : un férié le dimanche ne change pas le décompte
  const chomes = Math.min(Math.max(0, Math.round(feriesChomes)), ouvrables.length);
  const hebdo = Math.min(6, Math.max(1, Math.round(joursSemaine || 5)));
  const p = congesPointage({ joursHebdo: hebdo, joursAbsence: joursTravailles, joursFeriesChomes: chomes }).lignes[0];
  // Pour la tenue : un férié fermé qui tombe un de vos jours de travail est payé (compté présent) ; sinon il n'enlève rien aux jours de travail manqués
  let payesTravailles;
  if (Array.isArray(joursHab) && joursHab.length) { const set = new Set(joursHab.map(Number)); payesTravailles = Math.min(chomes, ouvrables.filter(f => set.has(f.jour)).length); }
  else payesTravailles = chomes;
  return { pointes: p ? p.brut : 0, joursTravailles, feries, feriesChomes: chomes, absTravail: Math.max(0, joursTravailles - payesTravailles), duree, debut: iso(a), fin: iso(b) };
}

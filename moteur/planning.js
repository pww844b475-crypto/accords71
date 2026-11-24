// Lecture d'un planning hebdomadaire (PDF texte du logiciel d'horaires) et calculs qui en découlent.
// Fonctions pures : elles travaillent sur la liste des morceaux de texte du PDF (texte + position), rien n'est enregistré.
const JOURS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const RE_NUM = /^\d+\.\d\d$/;
const RE_NUMS = /^-?\d+\.\d\d$/;                                     // colonnes de gauche : l'écart de la semaine peut être négatif
const RE_PLAGE = /^[a-z]?(\d\d)\.(\d\d) ?-(\d\d)\.(\d\d) ([A-Z0-9]+)$/;      // « 08.00 -16.00 SERVI » (une lettre parasite peut précéder)
const RE_DETAIL_PLAGE = /^(\d{1,2})\.(\d\d)-(\d{1,2})\.(\d\d)$/;               // « 14.00-17.00 » ou « 9.00-12.00 »
const CODES_CONNUS = new Set(['REPO', 'JNTR', 'DELC', 'DIMTE', 'D100', 'MALA', 'FOSE', 'ECART', 'HD', 'TREST', 'DIMHA', 'JFCP', 'CONG']);
const IGNORES = /^(?:[a-z]|e?Temptation|\d)$/;                          // petits morceaux parasites du PDF
export const SENS_CODES = { REPO: 'repos', JNTR: 'journée non travaillée', DELC: 'délégation (heures dans la journée)', DIMTE: 'heures travaillées le dimanche', D100: 'dimanche majoré à 100 %', MALA: 'maladie (à confirmer)', FOSE: 'plage avec horaire (formation, à confirmer)', ECART: 'heures en plus du contrat ce jour-là', HD: 'total des heures en plus de la semaine (affiché le dimanche)', TREST: 'nombre de titres-restaurant du mois (dernier jour du mois)', DIMHA: 'dimanche habituel (à confirmer)', JFCP: 'jour férié chômé payé', CONG: 'congé payé' };
const minutes = (h, m) => +h * 60 + +m;
const hhmm = s => { const [h, m] = s.split('.'); return minutes(h, m); };      // « 5.45 » = 5 h 45
const hhmmSigne = s => (s.startsWith('-') ? -1 : 1) * hhmm(s.replace('-', ''));  // « -0.36 » = - 36 min

/** Découpe les morceaux de texte en mots avec une position, et regroupe les mots par ligne (y croissant vers le bas). */
function lignes(items, tol = 2.5) {
  const mots = [];
  for (const it of items) {
    const txt = String(it.str ?? it.t ?? '');
    if (!txt.trim()) continue;
    if (!/\s/.test(txt.trim())) { mots.push({ t: txt.trim(), x: it.x, y: it.y }); continue; }
    const largeur = it.w || 0; let pos = 0;
    for (const m of txt.matchAll(/\S+/g)) { mots.push({ t: m[0], x: it.x + (largeur ? largeur * (m.index / txt.length) : m.index * 4), y: it.y }); pos++; }
  }
  mots.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const w of mots) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(r.y - w.y) <= tol) r.w.push(w); else rows.push({ y: w.y, w: [w] });
  }
  for (const r of rows) r.w.sort((a, b) => a.x - b.x);
  return rows;
}

/** Lit une page : retourne { debut: 'AAAA-MM-JJ' | null, section, personnes: [...], inconnus: [...] }. */
export function lirePlanning(items) {
  const rows = lignes(items);
  const texte = rows.map(r => r.w.map(w => w.t).join(' ')).join('\n');
  const mDates = texte.match(/Du (\d\d)\/(\d\d)\/(\d{4}) au (\d\d)\/(\d\d)\/(\d{4})/);
  const debut = mDates ? `${mDates[3]}-${mDates[2]}-${mDates[1]}` : null;
  const mSection = texte.match(/Section : ([^\n]+)/);
  const entete = rows.find(r => r.w.filter(w => JOURS.includes(w.t)).length >= 7);
  if (!entete) return { debut, section: mSection ? mSection[1].trim() : '', personnes: [], inconnus: [], erreur: 'En-tête des jours introuvable' };
  const centres = entete.w.filter(w => JOURS.includes(w.t)).map(w => w.x).slice(0, 7);
  const bornes = centres.map((c, i) => [i === 0 ? c - 80 : c - 40, i < 6 ? centres[i + 1] - 40 : Infinity]);
  const gaucheMax = centres[0] - 80;
  const col = x => { const i = bornes.findIndex(([a, b]) => x >= a && x < b); return i < 0 ? null : i; };
  const debuts = [];
  for (const r of rows) {
    const g = r.w.filter(w => w.x < gaucheMax);
    const nums = g.filter(w => RE_NUMS.test(w.t));
    if (nums.length >= 3 && g.length >= 5) debuts.push({ y: r.y, nums: nums.slice(0, 3).map(w => w.t), nom: g.filter(w => !RE_NUMS.test(w.t)).map(w => w.t).join(' ') });
    else if (nums.length === 2 && g.length >= 5) debuts.push({ y: r.y, nums: [...nums.map(w => w.t), '0.00'], nom: g.filter(w => !RE_NUMS.test(w.t)).map(w => w.t).join(' ') });
  }
  const pied = rows.find(r => { const t = r.w.map(w => w.t).join(' '); return /Proposition de planning/.test(t) || (/ACCUEIL.*ENCAISS.*NOUVELT/.test(t) && !/\d\d\.\d\d/.test(t)); });   // pied de page : légende des postes
  const dernierY = pied ? pied.y - 1000 : (rows.length ? rows[rows.length - 1].y + 1 : 0);
  const personnes = [], inconnus = [];
  debuts.forEach((d, k) => {
    const bas = k + 1 < debuts.length ? debuts[k + 1].y : dernierY + 1000;
    const bloc = rows.filter(r => r.y >= d.y - 1 && r.y < bas - 1);
    const jours = JOURS.map(() => ({ total: null, plages: [], codes: [] }));
    for (const r of bloc) for (const w of r.w) {
      if (w.x < gaucheMax) continue;
      if (Math.abs(r.y - d.y) < 3 && w.x < centres[0] - 40) continue;                          // colonne « Solde modulation » à gauche du lundi
      const c = col(w.x + 1);
      if (c != null && RE_NUM.test(w.t) && Math.abs(r.y - d.y) <= 20 && r.y > d.y - 1 && jours[c].total == null) jours[c].total = hhmm(w.t);
    }
    for (const r of bloc.slice(1)) {
      const parCol = {};
      for (const w of r.w) { if (w.x < gaucheMax) continue; const c = col(w.x + 1); if (c != null) (parCol[c] ||= []).push(w.t); }
      for (const [c, toks] of Object.entries(parCol)) {
        const ligne = toks.join(' '), m = ligne.match(RE_PLAGE);
        if (m) jours[c].plages.push({ debut: minutes(m[1], m[2]), fin: minutes(m[3], m[4]), poste: m[5] });
        else if (RE_NUM.test(ligne) && Math.abs(r.y - d.y) <= 20) continue;                     // total du jour déjà lu
        else {
          const code = ligne.match(/^([A-Z][A-Z0-9]{1,5})(?: \(([^)]*)\))?$/);
          if (code) { jours[c].codes.push({ code: code[1], detail: code[2] || '' }); if (!CODES_CONNUS.has(code[1])) inconnus.push(code[1]); }
          else if (!RE_NUM.test(ligne) && !IGNORES.test(ligne)) inconnus.push(ligne);
        }
      }
    }
    // les heures du tableau sont écrites en heures.minutes (« 30.30 » = 30 h 30)
    personnes.push({ nom: d.nom, theorie: hhmm(d.nums[0]) / 60, realisees: hhmm(d.nums[1]) / 60, ecart: hhmmSigne(d.nums[2]) / 60, jours });
  });
  return { debut, section: mSection ? mSection[1].trim() : '', personnes, inconnus: [...new Set(inconnus)] };
}

/** Minutes de délégation (DELC) d'un jour : « DELC (14.00-17.00) ». */
export function minutesDelegation(jour) {
  let t = 0;
  for (const c of jour.codes) { const m = c.code === 'DELC' && c.detail.match(RE_DETAIL_PLAGE); if (m) t += minutes(m[3], m[4]) - minutes(m[1], m[2]); }
  return t;
}
/** Minutes d'une plage donnée par un code (« FOSE (9.00-17.00) »), hors délégation. */
const minutesCodesPlage = jour => jour.codes.reduce((t, c) => { const m = c.code === 'FOSE' && c.detail.match(RE_DETAIL_PLAGE); return t + (m ? minutes(m[3], m[4]) - minutes(m[1], m[2]) : 0); }, 0);
/** Minutes « ECART » d'un jour (heures en plus du contrat : « ECART (2.30) »). */
const minutesEcart = jour => jour.codes.reduce((t, c) => {
  if (c.code !== 'ECART') return t;
  const pl = c.detail.match(RE_DETAIL_PLAGE);
  return t + (pl ? minutes(pl[3], pl[4]) - minutes(pl[1], pl[2]) : RE_NUM.test(c.detail) ? hhmm(c.detail) : 0);
}, 0);
const semaineAvecConge = p => p.jours.some(j => j.codes.some(c => c.code === 'CONG'));   // le code CONG n'est écrit qu'une fois pour toute la période de congé
const JUSTIFIES = new Set(['JFCP', 'CONG']);              // journées payées par un code (férié, congé) : le total du jour n'a pas de plage
const minutesPlages = jour => jour.plages.reduce((s, p) => s + p.fin - p.debut, 0);
/** Vérifie qu'une personne est lue sans erreur : plages + délégation = total de chaque jour, et somme = heures réalisées. */
export function controlerPersonne(p) {
  const problemes = []; let somme = 0;
  p.jours.forEach((j, i) => {
    let m = minutesPlages(j) + minutesDelegation(j) + minutesCodesPlage(j);
    if (j.total != null && m < j.total) m += Math.min(minutesEcart(j), j.total - m);          // heures en plus hors plage (ex. délégation un jour de repos)
    if (j.total != null && m < j.total && (j.codes.some(c => JUSTIFIES.has(c.code)) || (semaineAvecConge(p) && m === 0))) m = j.total;   // férié ou congé payé : total du jour sans plage
    somme += m;
    if (j.total != null && j.total !== m) problemes.push(`${JOURS[i]} : total ${Math.floor(j.total / 60)} h ${String(j.total % 60).padStart(2, '0')} ≠ plages ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);
  });
  if (Math.abs(somme - Math.round(p.realisees * 60)) > 0) problemes.push(`somme ${(somme / 60).toFixed(2)} h ≠ heures réalisées ${p.realisees.toFixed(2)} h`);
  return problemes;
}

// ---- Du planning vers la paie ----
const dateISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ajouteJours = (iso, n) => { const [a, m, j] = iso.split('-').map(Number); return new Date(a, m - 1, j + n); };
const couvre = (plages, a, b) => {                       // les plages (fusionnées) couvrent-elles tout [a, b] ?
  const tri = [...plages].sort((x, y) => x[0] - y[0]); let cur = a;
  for (const [d, f] of tri) { if (d <= cur && f > cur) cur = f; if (cur >= b) return true; }
  return cur >= b;
};

/**
 * semaines : [{ debut: 'AAAA-MM-JJ' (lundi), personne: {...} }] pour une seule personne, un mois cible (annee, mois).
 * Règles : les heures en plus d'une semaine sont rattachées au mois de son dimanche ; les jours de présence, titres-restaurant,
 * fermetures et heures de nuit sont comptés jour par jour dans le mois.
 */
export function resumerMois(semaines, annee, mois) {
  const r = { semaines: [], heuresSemaine: 0, heuresEnPlus: [], delegationMin: 0, dimanche100: 0, dimancheTotal: 0, joursPresence: 0, joursRepos: 0, joursNonTravailles: 0,
    tickets: 0, ticketsTREST: null, fermetures: 0, nuit10: 0, nuit30: 0, absences: {}, codesInconnus: [], semainesIgnorees: [] };
  const theories = [];
  for (const s of semaines) {
    const dimanche = ajouteJours(s.debut, 6), duMois = dimanche.getFullYear() === annee && dimanche.getMonth() + 1 === mois;
    const p = s.personne;
    r.semaines.push({ debut: s.debut, rattacheeAuMois: duMois, theorie: p.theorie, realisees: p.realisees, ecart: p.ecart });
    if (duMois) { theories.push(p.theorie); r.heuresEnPlus.push(Math.max(0, +(p.realisees - p.theorie).toFixed(2))); }
    else r.semainesIgnorees.push(s.debut);
    p.jours.forEach((j, i) => {
      const d = ajouteJours(s.debut, i);
      for (const c of j.codes) if (!CODES_CONNUS.has(c.code)) r.codesInconnus.push(c.code);
      const dansLeMois = d.getFullYear() === annee && d.getMonth() + 1 === mois;
      const delMin = minutesDelegation(j);
      if (duMois) {
        r.delegationMin += delMin;
        for (const c of j.codes) {
          const m = c.detail.match(/^(\d+)\.(\d+)$/);
          if (c.code === 'D100' && m) r.dimanche100 += minutes(m[1], m[2]);
          if (c.code === 'DIMTE' && m) r.dimancheTotal += minutes(m[1], m[2]);
        }
      }
      if (!dansLeMois) return;
      const travaille = j.plages.length > 0 || delMin > 0 || minutesCodesPlage(j) > 0;
      if (travaille) r.joursPresence++;
      if (j.codes.some(c => c.code === 'REPO')) r.joursRepos++;
      if (j.codes.some(c => c.code === 'JNTR')) r.joursNonTravailles++;
      for (const c of j.codes) if (c.code === 'MALA' || c.code === 'JFCP') r.absences[c.code] = (r.absences[c.code] || 0) + 1;
      if (semaineAvecConge(p) && j.total > 0 && !j.plages.length && !delMin && !j.codes.some(c => c.code === 'JFCP')) r.absences.CONG = (r.absences.CONG || 0) + 1;
      for (const c of j.codes) if (c.code === 'TREST' && RE_NUM.test(c.detail)) r.ticketsTREST = (r.ticketsTREST || 0) + Math.round(+c.detail);
      const intervalles = j.plages.map(p => [p.debut, p.fin]);
      for (const c of j.codes) { const m = (c.code === 'DELC' || c.code === 'FOSE') && c.detail.match(RE_DETAIL_PLAGE); if (m) intervalles.push([minutes(m[1], m[2]), minutes(m[3], m[4])]); }
      if (couvre(intervalles, 12 * 60, 13 * 60 + 30)) r.tickets++;
      if (couvre(intervalles, 18 * 60 + 30, 20 * 60)) r.tickets++;
      if (j.plages.some(p => p.fin > 19 * 60 + 30)) r.fermetures++;
      for (const [a, b] of intervalles) {
        const inter = (x, y) => Math.max(0, Math.min(b, y) - Math.max(a, x));
        r.nuit10 += inter(21 * 60, 22 * 60) + inter(5 * 60, 6 * 60);
        r.nuit30 += inter(22 * 60, 24 * 60) + inter(0, 5 * 60);
      }
    });
  }
  const freq = {}; for (const t of theories) freq[t] = (freq[t] || 0) + 1;
  r.heuresSemaine = +(Object.entries(freq).sort((a, b) => b[1] - a[1])[0] || [0])[0];
  r.codesInconnus = [...new Set(r.codesInconnus)];
  return r;
}

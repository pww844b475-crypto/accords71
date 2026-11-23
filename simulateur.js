// Écran « Simulateur de fiche de paie ». Rien n'est enregistré ni envoyé : tout se calcule dans le navigateur.
import { simulerPaie, simulerDecembre, repartirHeures, repartirTotal, compterJoursHabituels } from './moteur/paie.js';
import { entretienTenue, fraisTransport, primeAstreinte } from './moteur/calculs.js';
import { lancerAssistant } from './assistant.js';
import { pointerConges, feriesDans } from './moteur/calendrier.js';
import { ouvrirImport } from './importPlanning.js';

const eur = x => (x < 0 ? '−' : '') + Math.abs(x).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
const virg = x => String(x).replace('.', ',');
const num = v => {
  const t = String(v ?? '').trim().toLowerCase().replace('−', '-');
  const hm = t.match(/^(\d+)\s*h\s*(\d{1,2})?$/);               // « 6h30 » = 6 h 30 min = 6,5 h
  if (hm) return +hm[1] + (hm[2] ? +hm[2] / 60 : 0);
  const n = parseFloat(t.replace(',', '.')); return Number.isFinite(n) ? n : 0;
};
const dateFr = iso => iso.split('-').reverse().join('/');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Jours ouvrés d'un mois = du lundi au vendredi, sans les jours fériés (relevé sur une fiche de décembre 2025 : 23 jours du lundi au vendredi
// moins le 25 décembre = 22 jours ouvrés pour le calcul de l'indemnité de tenue). Le champ reste modifiable.
export function joursOuvres(annee, mois) {
  const fin = new Date(annee, mois, 0).getDate(), p = n => String(n).padStart(2, '0');
  let n = 0;
  for (let j = 1; j <= fin; j++) { const w = new Date(annee, mois - 1, j).getDay(); if (w !== 0 && w !== 6) n++; }
  return n - feriesDans(`${annee}-${p(mois)}-01`, `${annee}-${p(mois)}-${p(fin)}`).filter(f => f.jour >= 1 && f.jour <= 5).length;
}

// Semaines (lundi au dimanche) rattachées au mois : le logiciel de paie met les heures en plus sur le dimanche de la semaine,
// donc une semaine appartient au mois où elle se termine (son dimanche).
export function semainesDuMois(annee, mois) {
  const res = [], fin = new Date(annee, mois, 0).getDate();
  for (let j = 1; j <= fin; j++) {
    const d = new Date(annee, mois - 1, j);
    if (d.getDay() === 0) { const debut = new Date(d); debut.setDate(debut.getDate() - 6); res.push({ debut, fin: new Date(d) }); }
  }
  return res;
}
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const jm = d => `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;

export async function ouvrirSimulateur({ vue, h, remplir, retour }, init = null) {
  let T;
  try { T = await fetch('data/taux-paie.json').then(r => r.json()); }
  catch { remplir(vue, h('p', { class: 'erreur' }, 'Taux indisponibles hors connexion : ouvrez une fois le simulateur avec du réseau.')); return; }

  const valeurs = { ...(init || {}) };
  const champ = (id, label, { defaut = '', aide, placeholder, signe = false } = {}) => {
    const d0 = valeurs[id]; const defautEff = d0 == null || d0 === 0 ? defaut : d0; valeurs[id] = defautEff;
    const input = h('input', { type: 'text', inputmode: signe ? 'text' : 'decimal', autocomplete: 'off', value: String(defautEff).replace('.', ','), placeholder: placeholder || '0', 'aria-label': label });
    input.addEventListener('input', () => { valeurs[id] = input.value; calculer(); });
    return h('label', { class: 'champ' }, h('span', { class: 'champ-label' }, label), input, aide ? h('small', { class: 'aide' }, aide) : null);
  };
  const champDate = (id, label) => {
    valeurs[id] = valeurs[id] || '';
    const input = h('input', { type: 'date', value: valeurs[id], 'aria-label': label });
    input.addEventListener('input', () => { valeurs[id] = input.value; calculer(); });
    return h('label', { class: 'champ' }, h('span', { class: 'champ-label' }, label), input);
  };
  const choix = (id, label, options, defaut) => {
    valeurs[id] = valeurs[id] ?? defaut;
    const sel = h('select', { 'aria-label': label }, options.map(([v, t]) => h('option', { value: v, selected: v === valeurs[id] }, t)));
    sel.addEventListener('change', () => { valeurs[id] = sel.value; calculer(); });
    return h('label', { class: 'champ' }, h('span', { class: 'champ-label' }, label), sel);
  };
  // Case à cocher qui révèle des champs
  const option = (id, label, ...contenu) => {
    valeurs[id] = !!valeurs[id];
    const zone = h('div', { class: 'champs option-zone' }, contenu); zone.hidden = !valeurs[id];
    const c = h('input', { type: 'checkbox', 'aria-label': label }); c.checked = valeurs[id];
    c.addEventListener('change', () => { valeurs[id] = c.checked; zone.hidden = !c.checked; calculer(); });
    return h('div', { class: 'option' }, h('label', { class: 'champ champ-case' }, c, h('span', {}, label)), zone);
  };

  const auj = new Date();
  const moisDefaut = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}`;
  valeurs.mois = valeurs.mois || moisDefaut;
  const champMois = h('input', { type: 'month', value: valeurs.mois, 'aria-label': 'Mois de la fiche' });
  const champOuvres = champ('joursOuvres', 'Jours ouvrés du mois (modifiable)', { aide: 'Lundi au vendredi, sans les jours fériés. Calculé automatiquement selon le mois.' });
  const majOuvres = () => {
    const [a, m] = champMois.value.split('-').map(Number);
    if (a && m) { const j = joursOuvres(a, m); valeurs.joursOuvres = String(j); champOuvres.querySelector('input').value = String(j); }
  };
  const majSemaines = () => {
    const [a, m] = champMois.value.split('-').map(Number); if (!a || !m) return;
    const sem = semainesDuMois(a, m);
    [0, 1, 2, 3, 4, 5].forEach(i => { const lab = vue.querySelector(`input[aria-label="Semaine ${i}"]`)?.closest('label'); if (!lab) return; lab.hidden = i >= sem.length; if (i < sem.length) lab.querySelector('.champ-label').textContent = `Semaine du ${jm(sem[i].debut)} au ${jm(sem[i].fin)} (h)`; if (i >= sem.length) valeurs['sem' + i] = ''; });
  };
  champMois.addEventListener('input', () => { valeurs.mois = champMois.value; majOuvres(); majSemaines(); calculer(); });
  majOuvres();

  const zoneResultat = h('div', { class: 'carte reponse-finale simu-res', 'aria-live': 'polite' });
  const zoneDetail = h('div');
  const secteur = choix('secteur', 'Secteur (pause payée)', [['5', 'Bureaux, rayons, autres : 5 % du travail effectif'], ['6.67', 'Caisses, drive, îlots de vente : 6,67 %'], ['0', 'Sans pause comptée (0 %)'], ['autre', 'Autre pourcentage…']], '5');
  const autrePct = champ('autrePct', 'Pourcentage de pause (%)', { placeholder: 'ex. 5,5' });
  autrePct.hidden = valeurs.secteur !== 'autre';
  secteur.querySelector('select').addEventListener('change', e => { autrePct.hidden = e.target.value !== 'autre'; });
  const region = choix('region', 'Titres-restaurant : magasin', [['autre', 'Hors Île-de-France (3,70 € retenus par titre)'], ['idf', 'Île-de-France (4 € retenus par titre)']], 'autre');
  const pasTaux = champ('pasTaux', 'Votre taux de prélèvement (%)', { placeholder: 'ex. 1,5', aide: 'Indiqué sur votre fiche de paie et sur impots.gouv.fr.' });
  valeurs.pasActif = !!valeurs.pasActif; pasTaux.hidden = !valeurs.pasActif;
  const pasBox = h('input', { type: 'checkbox', 'aria-label': 'Prélèvement à la source' }); pasBox.checked = valeurs.pasActif;
  pasBox.addEventListener('change', () => { valeurs.pasActif = pasBox.checked; pasTaux.hidden = !pasBox.checked; calculer(); });

  function calculer() {
    const pct = valeurs.secteur === 'autre' ? num(valeurs.autrePct) : num(valeurs.secteur);
    const ouvres = Math.max(0, Math.round(num(valeurs.joursOuvres)));
    // Jours de présence du mois : jours habituels de la semaine comptés dans le calendrier, sinon planning saisi, sinon jours par semaine, sinon mois complet
    const [aa, mm] = String(valeurs.mois || '').split('-').map(Number);
    const joursDuMois = aa && mm ? new Date(aa, mm, 0).getDate() : 30;
    let prevus = ouvres, origine = 'mois complet';
    if (valeurs.memesJours && Array.isArray(valeurs.joursHab) && valeurs.joursHab.length && aa && mm) { prevus = compterJoursHabituels(aa, mm, valeurs.joursHab); origine = 'vos jours habituels'; }
    else if (num(valeurs.joursMois) > 0) { prevus = Math.round(num(valeurs.joursMois)); origine = 'votre planning'; }
    else if (num(valeurs.joursSemaine) > 0) { prevus = Math.round(num(valeurs.joursSemaine) * joursDuMois / 7); origine = 'vos jours par semaine'; }
    // Congés payés : dates saisies -> jours de travail, jours fériés fermés, jours à pointer (calcul automatique), sauf si les jours pointés sont donnés à la main
    let cpPointes = valeurs.optCp ? num(valeurs.cpJours) : 0, cpAbs = 0, cpInfo = null;
    if (valeurs.optCp && valeurs.cpDebut && valeurs.cpFin && !(num(valeurs.cpJours) > 0)) {
      cpInfo = pointerConges({ debut: valeurs.cpDebut, fin: valeurs.cpFin, joursHab: valeurs.memesJours ? valeurs.joursHab : null, joursSemaine: Math.min(6, num(valeurs.joursSemaine) || 5), joursTravaillesSaisis: num(valeurs.cpJoursTrav), feriesChomes: num(valeurs.cpFerie), annee: aa, mois: mm });
      if (!cpInfo.erreur) { cpPointes = cpInfo.pointes; cpAbs = cpInfo.absTravail; } else cpInfo = null;
    }
    const abs = Math.max(0, Math.round(num(valeurs.joursAbsence))) + cpAbs;
    const enPlus = Math.max(0, Math.round(num(valeurs.joursEnPlus)));
    const trav = Math.max(0, prevus - abs + enPlus);
    const tenue = ouvres > 0 ? (entretienTenue({ joursTravailles: trav, joursOuvres: ouvres }).lignes[0]?.brut || 0) : 0;
    const feriesMois = aa && mm ? feriesDans(`${aa}-${String(mm).padStart(2, '0')}-01`, `${aa}-${String(mm).padStart(2, '0')}-${String(joursDuMois).padStart(2, '0')}`).filter(f => f.jour >= 1 && f.jour <= 5) : [];
    const km = num(valeurs.km);
    const transport = km > 0 ? (fraisTransport({ km, jours: num(valeurs.joursTransport) > 0 ? Math.round(num(valeurs.joursTransport)) : trav }).lignes[1]?.brut || 0) : 0;
    const plus = !!valeurs.optPlus, deleg = plus && !!valeurs.estDeleg, sp = !!valeurs.optSpec;
    const semaines = plus ? [0, 1, 2, 3, 4, 5].map(i => num(valeurs['sem' + i])) : [];
    const parSemaine = plus && semaines.some(x => x > 0);
    const ast = !!valeurs.optAst, astH = ast ? num(valeurs.astHeures) : 0;
    const primeAst = ast ? (primeAstreinte({ magasin: valeurs.astMagasin || 'standard', semaines: num(valeurs.astSemaines) }).lignes[1]?.brut || 0) : 0;
    if (astH > 0 && parSemaine) semaines.push(astH);
    const total = (plus ? num(valeurs.hPlus) : 0) + (!parSemaine ? astH : 0);
    const rep = !plus && !(astH > 0) ? repartirHeures(0, []) : parSemaine ? repartirHeures(num(valeurs.heuresSemaine), semaines) : repartirTotal(num(valeurs.heuresSemaine), total);
    const e = {
      salaireBase: num(valeurs.salaireBase), heuresSemaine: num(valeurs.heuresSemaine), pausePct: pct,
      tauxHoraire: num(valeurs.tauxHoraire), primeAstreinte: primeAst,
      semainesEnPlus: (plus || astH > 0) && parSemaine ? semaines : undefined, totalEnPlus: !parSemaine ? total : 0,
      dimanche: sp ? num(valeurs.dimanche) : 0, dimanche100: sp ? num(valeurs.dimanche100) : 0, ferie: sp ? num(valeurs.ferie) : 0, nuit30: sp ? num(valeurs.nuit30) : 0, nuit10: sp ? num(valeurs.nuit10) : 0,
      cpJours: valeurs.optCp ? cpPointes : 0, cpRefBrute: valeurs.optCp ? num(valeurs.cpRef) : 0, cpIndemniteJour: valeurs.optCp ? num(valeurs.cpInd) : 0,
      hsExoAuto: true, autresBrut: valeurs.optAutres ? num(valeurs.autresBrut) : 0,
      tenue, transport, tickets: Math.floor(num(valeurs.tickets)), partSalarieTicket: valeurs.region === 'idf' ? 4 : 3.7,
      autresRetenues: num(valeurs.autresRetenues), pas: { actif: !!valeurs.pasActif, taux: num(valeurs.pasTaux) },
    };
    if (!(e.salaireBase > 0 || e.tauxHoraire > 0) || !(e.heuresSemaine > 0)) {
      remplir(zoneResultat, h('p', { class: 'note' }, 'Renseignez le salaire de base (ou le salaire par heure) et les heures par semaine pour voir le résultat.')); remplir(zoneDetail); return;
    }
    // Décembre : le 13e mois est dans la paie, avec la déduction des acomptes déjà reçus
    let dec = null, r;
    if (valeurs.optPrime && mm === 12 && valeurs.anc6 !== false) {
      const exc = valeurs.acompteExc === false ? 0 : num(valeurs.acompteExcMontant);
      const recu75 = valeurs.acompte75 === true || (valeurs.acompte75 == null && num(valeurs.acompte75Montant) > 0);
      dec = simulerDecembre(e, { brutCumulNov: num(valeurs.brutCumulNov), acompteExc: exc, acompte75Recu: recu75, acompte75Montant: num(valeurs.acompte75Montant) }, T);
      r = dec.r;
    } else r = simulerPaie(e, T);
    const ligne = (t, v, fort) => h('div', { class: 'simu-ligne' + (fort ? ' fort' : '') }, h('span', {}, t), h('strong', {}, v));
    const [a, m] = (valeurs.mois || '').split('-').map(Number);
    const periode = a && m ? `${MOIS[m - 1]} ${a}` : '';
    remplir(zoneResultat,
      h('h3', {}, `Votre fiche estimée${periode ? ' · ' + periode : ''}`),
      h('div', { class: 'simu-resume' },
        h('span', { class: 'tag' + (deleg ? ' ok' : '') }, deleg ? `Heures de délégation : OUI (${virg(rep.total)} h)` : 'Heures de délégation : non'),
        h('span', { class: 'tag' + (plus && !deleg ? ' ok' : '') }, plus && !deleg ? `Heures en plus du contrat : OUI (${virg(rep.total)} h)` : 'Heures supplémentaires : non')),
      plus ? h('p', { class: 'note' }, `${parSemaine ? 'Répartition semaine par semaine' : 'Répartition automatique du total (heures étalées sur le mois, approximation : donnez le détail par semaine pour plus de précision)'} : ${virg(rep.hc10)} h à 10 %, ${virg(rep.hc25)} h à 25 % (heures complémentaires), ${virg(rep.hs25)} h à 25 % et ${virg(rep.hs50)} h à 50 % (heures supplémentaires).`) : null,
      ligne('Salaire brut', eur(r.brut), true),
      ligne('Cotisations salariales', eur(-r.totalCotisations)),
      ligne('Net social', eur(r.netSocial)),
      r.indemnitesNonSoumises ? ligne('+ Indemnités non soumises (tenue, transport)', eur(r.indemnitesNonSoumises)) : null,
      r.ticketsPartSalarie ? ligne('− Titres-restaurant (votre part)', eur(-r.ticketsPartSalarie)) : null,
      r.autresRetenues ? ligne(dec ? '− Autres retenues et acomptes déjà reçus' : '− Autres retenues', eur(-r.autresRetenues)) : null,
      ligne('Net à payer avant impôt', eur(r.netAvantImpot), true),
      valeurs.pasActif ? ligne(`− Prélèvement à la source (${virg(num(valeurs.pasTaux))} % de ${eur(r.baseImposable)})`, eur(-r.pas)) : null,
      ligne(valeurs.pasActif ? 'Net à payer après impôt' : 'Net à payer (sans prélèvement à la source)', eur(r.netAPayer), true),
      dec ? h('div', { class: 'carte', style: 'margin:10px 0' }, h('h3', {}, '13ᵉ mois dans cette paie'),
        ligne('Prime annuelle (1/12 du brut de l\'année, ' + eur(dec.brutAnnee) + ')', eur(dec.primeBrute)),
        ligne('Net estimé de la prime', eur(dec.netPrime)),
        dec.acompteExc ? ligne('− Acompte exceptionnel déjà reçu (net)', eur(-dec.acompteExc)) : null,
        dec.acompte75 ? ligne('− Acompte de début décembre déjà reçu (net)' + (dec.acompte75Estime ? ' : estimé (75 % de la prime estimée début décembre' + (dec.acompteExc ? ', moins l\'acompte exceptionnel' : '') + ')' : ''), eur(-dec.acompte75)) : null,
        !dec.acompte75 ? ligne('Acompte de début décembre prévu, pas encore reçu (75 % du brut' + (dec.acompteExc ? ' moins l\'acompte exceptionnel' : '') + ')', eur(dec.a75Prevu)) : null,
        ligne('Reste à percevoir du 13ᵉ mois sur cette fiche (net)', eur(dec.resteNet), true),
        h('p', { class: 'note' }, 'Les acomptes (75 % du BRUT de la prime) sont versés sans cotisations ; la fiche de décembre prélève les cotisations sur toute la prime et déduit les acomptes au net. Le reste est donc faible : relevé sur une fiche de décembre 2025. Estimation : le net de la prime dépend du plafond de la Sécurité sociale et des cotisations du mois.')) : null,
      r.cp ? h('p', { class: r.cp.referenceConnue ? 'note' : 'erreur' }, r.cp.referenceConnue
        ? `Congés payés : ${virg(r.cp.jours)} jour(s) à ${eur(r.cp.parJour)} par jour (${r.cp.regle === 'dixieme' ? 'règle du dixième de la période de référence, plus favorable que le maintien' : r.cp.regle === 'maintien' ? 'maintien du salaire, plus favorable que le dixième' : 'indemnité par jour saisie'}) contre ${eur(r.cp.maintienJour)} retirés par jour : solde ${eur(r.cp.solde)}.`
        : 'Congés payés : sans votre rémunération de référence (1er juin au 31 mai) ni l\'indemnité par jour de votre fiche, le calcul retient le maintien du salaire et donne un net trop bas si le dixième est plus favorable.') : null,
      cpInfo ? h('p', { class: 'note' }, `Congés du ${cpInfo.debut.split('-').reverse().join('/')} au ${cpInfo.fin.split('-').reverse().join('/')} : ${cpInfo.joursTravailles} jour(s) de travail${cpInfo.feries.length ? `, ${cpInfo.feries.length} jour(s) férié(s) dedans (${cpInfo.feries.map(f => f.libelle).join(', ')}), ${cpInfo.feriesChomes} fermé(s) par le magasin` : ''} : ${cpInfo.pointes} jour(s) pointés.`) : null,
      feriesMois.length ? h('p', { class: 'note' }, `Ce mois compte ${feriesMois.length} jour(s) férié(s) du lundi au vendredi (${feriesMois.map(f => f.libelle).join(', ')}). Ils sont retirés des jours ouvrés (${ouvres} jours ouvrés ce mois-ci), comme sur une fiche de paie de décembre 2025.`) : null,
      h('p', { class: 'note' }, `Taux horaire déduit de votre salaire de base : ${virg(r.details.tauxHoraire.toFixed(3))} €. Indemnité de tenue calculée : ${eur(tenue)} (${trav} jours de présence d'après ${origine}, sur ${ouvres} jours ouvrés du mois).`),
      h('p', { class: 'note' }, 'Estimation à quelques centimes près : la paie arrondit ligne par ligne. Elle ne remplace pas votre fiche de paie.'));
    remplir(zoneDetail,
      h('details', { class: 'textes' }, h('summary', {}, 'Voir le détail des lignes de salaire'),
        h('table', { class: 'simu-table' }, h('tbody', {}, r.lignes.map(l => h('tr', {}, h('td', {}, l.libelle), h('td', { class: 'd' }, l.base != null ? virg(l.base) : ''), h('td', { class: 'd' }, eur(l.montant))))))),
      h('details', { class: 'textes' }, h('summary', {}, 'Voir le détail des cotisations'),
        h('table', { class: 'simu-table' }, h('tbody', {}, r.cotisations.map(c => h('tr', {}, h('td', {}, c.libelle), h('td', { class: 'd' }, c.taux != null ? virg(c.taux) + ' %' : 'forfait'), h('td', { class: 'd' }, eur(-c.montant))))))));
  }

  // ---- Questions posées pas à pas (l'assistant) : mêmes clés que le formulaire ci-dessous ----
  const nbSemaines = v => { const [a, m] = String(v.mois || '').split('-').map(Number); return a && m ? semainesDuMois(a, m).length : 0; };
  const libSemaine = (v, i) => { const [a, m] = String(v.mois || '').split('-').map(Number); const s = a && m ? semainesDuMois(a, m)[i] : null; return s ? `du ${jm(s.debut)} au ${jm(s.fin)}` : ''; };
  const etapesPaie = () => [
    { id: 'mois', type: 'mois', emoji: '📅', court: 'Mois', question: 'Pour quel mois voulez-vous estimer votre paie ?', aide: 'Par défaut, le mois en cours. Vous pouvez choisir un mois passé pour comparer avec une fiche de paie reçue.' },
    { id: 'secteur', type: 'choix', emoji: '🏬', court: 'Secteur', question: 'Dans quel secteur travaillez-vous ?', aide: 'Cela change la durée de pause payée.', options: [['5', 'Bureaux, rayons, mise en rayon, autres', '🧑‍💼'], ['6.67', 'Caisses, drive ou îlots de vente', '🛒']] },
    { id: 'heuresSemaine', type: 'nombre', unite: 'h par semaine', emoji: '⏱️', court: 'Heures par semaine', question: 'Combien d\'heures par semaine prévoit votre contrat ?', aide: 'Exemple : 24, 30 ou 36. C\'est l\'horaire écrit sur votre fiche de paie (« horaire »).' },
    { id: 'joursSemaine', type: 'nombre', unite: 'jours par semaine', emoji: '📅', court: 'Jours par semaine', question: 'Combien de jours par semaine travaillez-vous ?', aide: 'Par exemple 3 si vous faites 3 jours par semaine, qu\'ils se suivent ou non. Cela sert à compter vos jours de présence du mois.' },
    { id: 'memesJours', type: 'ouinon', emoji: '🔁', court: 'Toujours les mêmes jours', question: 'Travaillez-vous toujours les mêmes jours de la semaine ?', aide: 'Répondez Non si votre planning change d\'une semaine à l\'autre.' },
    { id: 'joursHab', type: 'multi', emoji: '🗓️', court: 'Jours habituels', si: v => v.memesJours, question: v => `Quels sont vos jours de travail ? (${v.joursSemaine || '…'} jour(s) par semaine)`, aide: 'Touchez les jours concernés, puis « Continuer ».', options: [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [0, 'Dimanche']] },
    { id: 'joursMois', type: 'nombre', unite: 'jour(s)', emoji: '📅', optionnel: true, court: 'Jours de présence du mois', si: v => !v.memesJours, question: 'Combien de jours allez-vous travailler (ou avez-vous travaillé) ce mois-ci ?', aide: 'Comptez les jours où vous êtes au magasin d\'après votre planning. Si vous ne savez pas, touchez « Je ne sais pas » : je calculerai avec vos jours par semaine.' },
    { id: 'salaireBase', type: 'nombre', unite: '€', emoji: '💶', optionnel: true, court: 'Salaire de base', question: 'Quel est le « salaire de base » de votre fiche de paie ?', aide: 'C\'est le montant en haut de votre fiche, dans l\'encadré de gauche. Si vous ne l\'avez pas sous la main, touchez « Je ne sais pas ».' },
    { id: 'tauxHoraire', type: 'nombre', unite: '€ par heure', emoji: '💶', court: 'Salaire par heure', si: v => !(Number(v.salaireBase) > 0), question: 'Quel est votre salaire par heure ?', aide: 'C\'est le « taux horaire » de votre fiche de paie, sans les pauses.' },
    { id: 'optPlus', type: 'ouinon', emoji: '➕', court: 'Heures en plus du contrat', question: 'Avez-vous fait des heures en plus de votre contrat ce mois-ci ?', aide: 'Heures de délégation hors temps de travail, heures complémentaires ou heures supplémentaires.' },
    { id: 'estDeleg', type: 'ouinon', emoji: '🤝', court: 'Heures de délégation', si: v => v.optPlus, question: 'Ce sont des heures de délégation, faites en dehors de votre temps de travail ?', aide: 'Répondez Non si ce sont des heures demandées par le magasin.' },
    { id: 'hPlus', type: 'nombre', unite: 'h', emoji: '⏱️', court: 'Total des heures en plus', si: v => v.optPlus, question: 'Combien d\'heures en tout, sur le mois ?', aide: 'Comme sur le planning : 6,50 veut dire 6 h 30. Vous pourrez détailler semaine par semaine à la question suivante.' },
    { id: 'precis', type: 'ouinon', emoji: '🔎', court: 'Détail par semaine', si: v => v.optPlus && Number(v.hPlus) > 0, question: 'Voulez-vous détailler semaine par semaine ?', aide: 'C\'est plus précis : la paie calcule les majorations semaine par semaine. Sinon je répartis vos heures sur tout le mois.' },
    ...[0, 1, 2, 3, 4, 5].map(i => ({ id: 'sem' + i, type: 'nombre', unite: 'h', emoji: '📆', court: v => 'Semaine ' + libSemaine(v, i), si: v => v.optPlus && v.precis && Number(v.hPlus) > 0 && i < nbSemaines(v), question: v => `Combien d'heures en plus la semaine ${libSemaine(v, i)} ?`, aide: 'La paie met les heures en plus sur le dimanche de la semaine : cette semaine compte pour le mois où elle se termine. Tapez 0 s\'il n\'y en a pas eu.' })),
    { id: 'optSpec', type: 'ouinon', emoji: '🌙', court: 'Dimanche, férié ou nuit', question: 'Avez-vous travaillé un dimanche, un jour férié ou de nuit ?' },
    { id: 'dimanche', type: 'nombre', unite: 'h', emoji: '📆', court: 'Heures le dimanche', si: v => v.optSpec, question: 'Combien d\'heures avez-vous travaillé un dimanche habituel (majoré de 60 %) ?', aide: 'Les ouvertures habituelles du dimanche matin. Tapez 0 s\'il n\'y en a pas eu.' },
    { id: 'dimanche100', type: 'nombre', unite: 'h', emoji: '📆', court: 'Dimanche exceptionnel (+100 %)', si: v => v.optSpec, question: 'Combien d\'heures avez-vous travaillé un dimanche exceptionnel (majoré de 100 %) ?', aide: 'Un dimanche où le magasin ouvre toute la journée, hors ouvertures habituelles. Sur le planning : code D100. Tapez 0 s\'il n\'y en a pas eu.' },
    { id: 'ferie', type: 'nombre', unite: 'h', emoji: '🎉', court: 'Heures un jour férié', si: v => v.optSpec, question: 'Combien d\'heures avez-vous travaillé un jour férié ?', aide: 'Tapez 0 s\'il n\'y en a pas eu.' },
    { id: 'nuit30', type: 'nombre', unite: 'h', emoji: '🌙', court: 'Heures de nuit (22 h - 5 h)', si: v => v.optSpec, question: 'Combien d\'heures de nuit entre 22 h et 5 h du matin ?', aide: 'Tapez 0 s\'il n\'y en a pas eu.' },
    { id: 'nuit10', type: 'nombre', unite: 'h', emoji: '🌙', court: 'Heures de nuit (21-22 h, 5-6 h)', si: v => v.optSpec, question: 'Combien d\'heures entre 21 h et 22 h, ou entre 5 h et 6 h du matin ?', aide: 'Tapez 0 s\'il n\'y en a pas eu.' },
    { id: 'optAst', type: 'ouinon', emoji: '📞', court: 'Astreinte', question: 'Avez-vous été d\'astreinte ce mois-ci ?', aide: 'L\'astreinte : vous restez joignable en dehors de vos heures de travail, pour intervenir en cas d\'urgence (peu de salariés sont concernés).' },
    { id: 'astMagasin', type: 'choix', emoji: '🏬', court: 'Type de magasin (astreinte)', si: v => v.optAst, question: 'Dans quel type de magasin ?', aide: 'La prime d\'astreinte dépend des horaires d\'ouverture.', options: [['standard', 'Autre magasin', '🏬'], ['dimanche', 'Ouvert le dimanche après-midi ou jusqu\'à minuit', '🌆'], ['h24', 'Ouvert 24 h sur 24', '🌃']] },
    { id: 'astSemaines', type: 'nombre', unite: 'semaine(s)', emoji: '📆', court: 'Semaines d\'astreinte', si: v => v.optAst, question: 'Combien de semaines d\'astreinte ce mois-ci ?', aide: 'Une semaine complète compte pour 1.' },
    { id: 'astHeures', type: 'nombre', unite: 'h', emoji: '🚗', court: 'Heures d\'intervention', si: v => v.optAst, question: 'Avez-vous dû intervenir ? Combien d\'heures en tout, trajet compris ?', aide: 'Tapez 0 si vous n\'avez pas eu à vous déplacer.' },
    { id: 'optCp', type: 'ouinon', emoji: '🏖️', court: 'Congés payés', question: 'Avez-vous pris des congés payés ce mois-ci ?' },
    { id: 'cpDebut', type: 'date', emoji: '🏖️', court: 'Début des congés', si: v => v.optCp, question: 'Quel est le premier jour de vos congés payés ?', aide: 'La date du premier jour de congé, même si ce n\'est pas un jour où vous travailliez.' },
    { id: 'cpFin', type: 'date', emoji: '🏖️', court: 'Fin des congés', si: v => v.optCp, question: 'Et le dernier jour de vos congés ?', aide: 'Si vos congés continuent le mois suivant, mettez quand même le dernier jour : je ne compte que le mois de la paie.' },
    { id: 'cpJoursTrav', type: 'nombre', unite: 'jour(s)', emoji: '📅', optionnel: true, court: 'Jours de travail pendant les congés', si: v => v.optCp && !v.memesJours && v.cpDebut && v.cpFin, question: 'Combien de jours auriez-vous travaillé pendant ces congés ?', aide: v => { let est = ''; try { est = `D'après vos ${Number(v.joursSemaine) || 5} jours par semaine, j'estime ${pointerConges({ debut: v.cpDebut, fin: v.cpFin, joursSemaine: Math.min(6, Number(v.joursSemaine) || 5) }).joursTravailles} jour(s). `; } catch { /* pas d'estimation */ } return est + 'Corrigez si votre planning était différent, ou touchez « Je ne sais pas ».'; } },
    { id: 'cpFerie', type: 'nombre', unite: 'jour(s) férié(s)', emoji: '🎉', court: 'Fériés fermés pendant les congés', si: v => v.optCp && v.cpDebut && v.cpFin && feriesDans(v.cpDebut, v.cpFin).length > 0, question: v => `Pendant vos congés, il y a ${feriesDans(v.cpDebut, v.cpFin).map(f => f.libelle).join(' et ')}. Combien de ces jours fériés le magasin était-il fermé ?`, aide: 'Un jour férié fermé par le magasin n\'est pas décompté de vos congés (il est payé). Tapez 0 si le magasin était ouvert. L\'accord prévoit au moins 6 jours fériés fermés par an, fixés pour chaque magasin : demandez la liste à la direction.' },
    { id: 'cpConnu', type: 'ouinon', emoji: '🧾', court: 'Indemnité par jour connue', si: v => v.optCp, question: 'Connaissez-vous le montant payé par jour de congé ?', aide: 'C\'est le taux de la ligne « IND C.P. ACQUIS » sur votre dernière fiche de paie. Sans lui, mon calcul sera moins juste.' },
    { id: 'cpInd', type: 'nombre', unite: '€ par jour', emoji: '🧾', court: 'Indemnité par jour', si: v => v.optCp && v.cpConnu, question: 'Quel est ce montant par jour ?', aide: 'Recopiez le taux de la ligne « IND C.P. ACQUIS ».' },
    { id: 'cpRef', type: 'nombre', unite: '€', emoji: '💶', optionnel: true, court: 'Brut du 1er juin au 31 mai', si: v => v.optCp && !v.cpConnu, question: 'Combien avez-vous gagné de salaire brut du 1er juin au 31 mai ?', aide: 'Additionnez vos salaires bruts de cette période. Si vous ne le savez pas, touchez « Je ne sais pas ».' },
    { id: 'joursAbsence', type: 'nombre', unite: 'jour(s)', emoji: '🗓️', optionnel: true, court: 'Autres jours d\'absence', question: 'En dehors de vos congés payés, avez-vous manqué des jours de travail ce mois-ci ?', aide: 'Maladie, formation, absence autorisée… Combien de jours en tout ? Cela sert à calculer l\'indemnité de tenue. Tapez 0 si aucun.' },
    { id: 'joursEnPlus', type: 'nombre', unite: 'jour(s)', emoji: '➕', optionnel: true, court: 'Jours en plus de vos jours habituels', question: 'Avez-vous travaillé des jours qui ne sont pas vos jours habituels ?', aide: 'Un jour où vous avez travaillé alors que ce n\'est pas un de vos jours habituels (remplacement, jour échangé…). Combien de jours en tout ? Tapez 0 si aucun.' },
    { id: 'tickets', type: 'nombre', unite: 'titre(s)', emoji: '🍽️', court: 'Titres-restaurant', question: 'Combien de titres-restaurant avez-vous eus ce mois-ci ?', aide: 'Un titre par jour où votre horaire couvre 12 h - 13 h 30 ou 18 h 30 - 20 h. Tapez 0 si aucun.' },
    { id: 'region', type: 'choix', emoji: '🏬', court: 'Magasin (titres-restaurant)', si: v => Number(v.tickets) > 0, question: 'Dans quel magasin travaillez-vous ?', aide: 'La part que vous payez pour un titre n\'est pas la même.', options: [['autre', 'Hors Île-de-France', '🏬'], ['idf', 'En Île-de-France', '🗼']] },
    { id: 'optTransport', type: 'ouinon', emoji: '🚗', court: 'Indemnité de transport', question: 'Touchez-vous l\'indemnité de transport ?', aide: 'Elle concerne ceux qui viennent en voiture parce qu\'il n\'y a pas de transport en commun.' },
    { id: 'km', type: 'nombre', unite: 'km', emoji: '🚗', court: 'Distance domicile-travail', si: v => v.optTransport, question: 'Quelle distance faites-vous entre chez vous et le travail ?', aide: 'Distance aller simple, par le chemin le plus court.' },
    { id: 'optPrime', type: 'ouinon', emoji: '🎁', court: '13ᵉ mois dans la paie', si: v => String(v.mois || '').endsWith('-12'), question: 'Votre paie de décembre contient-elle le 13ᵉ mois (prime annuelle) ?', aide: 'Le 13ᵉ mois se touche en décembre : 75 % en acompte début décembre, le reste avec la fiche de paie de décembre. Je l\'ajoute avec la déduction des acomptes déjà reçus.' },
    { id: 'anc6', type: 'ouinon', emoji: '📅', court: '6 mois d\'ancienneté à fin novembre', si: v => v.optPrime && String(v.mois || '').endsWith('-12'), question: 'Aviez-vous au moins 6 mois d\'ancienneté à fin novembre ?', aide: 'C\'est la condition pour avoir la prime annuelle.' },
    { id: 'brutCumulNov', type: 'nombre', unite: '€', emoji: '💶', court: 'Brut de janvier à novembre', si: v => v.optPrime && v.anc6 !== false && String(v.mois || '').endsWith('-12'), question: 'Quel est le total de votre salaire brut de janvier à novembre ?', aide: 'Lisez le cumul du brut sur votre fiche de novembre. Le brut de décembre est ajouté automatiquement.' },
    { id: 'acompteExc', type: 'ouinon', emoji: '💸', court: 'Acompte demandé entre juin et novembre', si: v => v.optPrime && v.anc6 !== false && String(v.mois || '').endsWith('-12'), question: 'Aviez-vous demandé un acompte du 13ᵉ mois entre juin et novembre ?', aide: 'Un acompte exceptionnel est possible sur demande, entre le 1er juin et le 30 novembre.' },
    { id: 'acompteExcMontant', type: 'nombre', unite: '€', emoji: '💸', court: 'Montant net de cet acompte', si: v => v.optPrime && v.anc6 !== false && v.acompteExc && String(v.mois || '').endsWith('-12'), question: 'Quel montant net avez-vous reçu ?', aide: 'Le montant arrivé sur votre compte, pas le brut.' },
    { id: 'acompte75', type: 'ouinon', emoji: '💰', court: 'Acompte de début décembre reçu', si: v => v.optPrime && v.anc6 !== false && String(v.mois || '').endsWith('-12'), question: 'Avez-vous déjà reçu l\'acompte de début décembre (75 %) ?', aide: 'Il arrive début décembre, avant la fiche de paie. S\'il n\'est pas encore arrivé, répondez Non.' },
    { id: 'acompte75Montant', type: 'nombre', unite: '€', emoji: '💰', optionnel: true, court: 'Montant net de l\'acompte de décembre', si: v => v.optPrime && v.anc6 !== false && v.acompte75 && String(v.mois || '').endsWith('-12'), question: 'Quel montant net avez-vous reçu ?', aide: 'Touchez « Je ne sais pas » : je l\'estime (75 % de la prime estimée début décembre, moins l\'acompte exceptionnel déjà reçu).' },
    { id: 'optAutres', type: 'ouinon', emoji: '🎁', court: 'Autres éléments de salaire', question: 'Avez-vous une autre prime ou une régularisation sur cette paie ?', aide: 'Une prime exceptionnelle, un rappel de salaire… Sinon répondez Non.' },
    { id: 'autresBrut', type: 'nombre', signe: true, unite: '€', emoji: '🎁', court: 'Montant de cette prime', si: v => v.optAutres, question: 'De quel montant (en €) ?', aide: 'Tapez un signe moins devant si c\'est une retenue (exemple : -50).' },
    { id: 'optRet', type: 'ouinon', emoji: '✂️', court: 'Autres retenues sur le net', question: 'Y a-t-il d\'autres retenues sur votre paie ?', aide: 'Un acompte déjà versé, une opposition… Sinon répondez Non.' },
    { id: 'autresRetenues', type: 'nombre', unite: '€', emoji: '✂️', court: 'Montant des retenues', si: v => v.optRet, question: 'Pour quel montant en tout (en €) ?' },
    { id: 'pasActif', type: 'ouinon', emoji: '🧾', court: 'Prélèvement à la source', question: 'Voulez-vous voir aussi le net après l\'impôt (prélèvement à la source) ?', aide: 'Si vous répondez Non, je donne le net avant impôt.' },
    { id: 'pasTaux', type: 'nombre', unite: '%', emoji: '🧾', court: 'Taux de prélèvement', si: v => v.pasActif, question: 'Quel est votre taux de prélèvement à la source ?', aide: 'Il est écrit sur votre fiche de paie, ligne « taux personnalisé » (exemple : 1,5). Vous pouvez aussi le lire sur impots.gouv.fr.' },
  ];
  // Les réponses lues dans un planning importé ne sont pas redemandées (liste « importe »).
  const dejaLu = (v, id) => Array.isArray(v.importe) && v.importe.includes(id);
  const lancerQuestions = (auRecap = false, apresImport = false) => lancerAssistant({
    h, remplir, titre: apresImport ? 'J\'ai lu votre planning' : 'Estimation de ma fiche de paie', emoji: apresImport ? '📄' : '💶',
    intro: apresImport ? 'Vos horaires sont lus : heures, jours de présence, dimanche, titres-restaurant. Il reste ce qu\'un planning ne donne pas : votre salaire, vos congés, l\'astreinte, les retenues et l\'impôt. Vous pourrez revenir en arrière à tout moment.'
      : 'Je vous pose quelques questions simples pour estimer combien vous allez toucher ce mois-ci. Comptez 2 à 3 minutes. Vous pouvez revenir en arrière à tout moment.',
    etapes: etapesPaie().map(e => ({ ...e, si: v => !dejaLu(v, e.id) && (!e.si || e.si(v)) })), valeurs: { ...valeurs, lancerApres: undefined }, commencerAuRecap: auRecap,
    onFini: v => ouvrirSimulateur({ vue, h, remplir, retour }, { ...v, importe: [], lancerApres: undefined }), onAnnule: () => {},
  });
  const importer = () => ouvrirImport({ h, remplir, semainesDuMois, onFini: v => ouvrirSimulateur({ vue, h, remplir, retour }, { ...valeurs, ...v, lancerApres: true }) });

  const lignesTaux = T.taux.map(x => h('tr', {}, h('td', {}, x.libelle), h('td', { class: 'd' }, x.taux != null ? virg(x.taux) + ' %' : eur(x.montant)),
    h('td', { class: 'd' }, x.statut === 'verifie' ? '✓ vérifié' : 'à contrôler')));
  const perime = new Date().getFullYear() > T.annee;

  remplir(vue,
    h('button', { class: 'sec', type: 'button', onclick: retour }, '← Retour'),
    h('h2', { class: 'accueil-titre' }, '💶 Estimation de ma fiche de paie'),
    h('p', { class: 'accueil-sous' }, 'Rien n\'est enregistré : tout se calcule sur votre téléphone.'),
    perime ? h('p', { class: 'erreur' }, `Attention : les taux sont ceux de ${T.annee}. Ils ont peut-être changé : vérifiez-les avant de vous fier au résultat.`) : null,
    h('button', { type: 'button', class: 'as-prim as-bandeau', onclick: () => lancerQuestions(!!init) }, init ? '✏️ Corriger mes réponses pas à pas' : '🧭 Me poser les questions pas à pas'),
    h('button', { type: 'button', class: 'as-sec as-large', onclick: importer }, '📄 Importer mes plannings (PDF)'),
    zoneResultat, zoneDetail,
    h('details', { class: 'textes', open: !init }, h('summary', {}, '⚙️ Tout modifier sur une seule page'),
    h('div', { class: 'carte' }, h('h3', {}, '1. Votre fiche'),
      h('div', { class: 'champs' },
        h('label', { class: 'champ' }, h('span', { class: 'champ-label' }, 'Mois de la fiche'), champMois),
        champ('salaireBase', 'Salaire de base du mois (€)', { placeholder: 'ex. 1927,77', aide: 'La ligne « salaire de base » de l\'en-tête de la fiche (pauses comprises).' }),
        champ('tauxHoraire', 'Salaire par heure (si vous ne connaissez pas le salaire de base) (€)', { placeholder: 'ex. 12,31' }),
        champ('heuresSemaine', 'Heures de présence par semaine', { placeholder: 'ex. 36', aide: 'Horaire du contrat (« horaire TPR » sur la fiche).' }),
        champ('joursSemaine', 'Jours travaillés par semaine', { placeholder: 'ex. 3', aide: 'Sert à compter vos jours de présence. Pour choisir vos jours exacts (lundi, mardi…), utilisez les questions pas à pas.' }), champ('joursMois', 'Jours de présence prévus ce mois-ci (si vous le connaissez)', { aide: 'Remplace le calcul automatique.' }), champ('joursEnPlus', 'Jours travaillés en plus de vos jours habituels', { aide: 'Remplacement, jour échangé…' }), secteur, autrePct)),
    h('div', { class: 'carte' }, h('h3', {}, '2. Ce qui change ce mois-ci'), h('p', { class: 'note' }, 'Cochez ce qui vous concerne. Heures en temps de présence, comme sur la fiche.'),
      option('optPlus', 'J\'ai fait des heures en plus de mon contrat (délégation, compléments, heures supplémentaires)',
        champ('hPlus', 'Total d\'heures en plus du contrat sur le mois', { placeholder: 'ex. 31,5', aide: 'Comme sur la fiche et le planning, en heures décimales : 6,50 = 6 h 30. Les 10 %, 25 % et 50 % sont calculés automatiquement.' }),
        h('details', { class: 'plein' }, h('summary', {}, 'Plus précis : semaine par semaine (lundi au dimanche, rattachée au mois où elle se termine)'),
          h('div', { class: 'champs' }, ...[0, 1, 2, 3, 4, 5].map(i => { const c = champ('sem' + i, 'Semaine ' + i, { placeholder: '0' }); c.classList.add('semaine'); return c; }))),
        h('label', { class: 'champ champ-case plein' }, (() => { const c = h('input', { type: 'checkbox', 'aria-label': 'Heures de délégation hors temps de travail' }); valeurs.estDeleg = !!valeurs.estDeleg; c.checked = valeurs.estDeleg; c.addEventListener('change', () => { valeurs.estDeleg = c.checked; calculer(); }); return c; })(), h('span', {}, 'Ce sont des heures de délégation hors temps de travail'))),
      option('optSpec', 'J\'ai travaillé un dimanche, un jour férié ou de nuit', champ('dimanche', 'Heures le dimanche habituel (+60 %)'), champ('dimanche100', 'Heures de dimanche exceptionnel (+100 %)'), champ('ferie', 'Heures un jour férié (+200 %)'), champ('nuit30', 'Heures de nuit 22 h-5 h (+30 %)'), champ('nuit10', 'Heures de nuit 21-22 h et 5-6 h (+10 %)')),
      option('optAst', 'J\'ai été d\'astreinte ce mois-ci', choix('astMagasin', 'Type de magasin', [['standard', 'Autre magasin'], ['dimanche', 'Ouvert le dimanche après-midi ou jusqu\'à minuit'], ['h24', 'Ouvert 24 h sur 24']], 'standard'), champ('astSemaines', 'Semaines d\'astreinte'), champ('astHeures', 'Heures d\'intervention, trajet compris')),
      option('optCp', 'J\'ai pris des congés payés ce mois-ci', champDate('cpDebut', 'Premier jour des congés'), champDate('cpFin', 'Dernier jour des congés'), champ('cpJoursTrav', 'Jours de travail prévus pendant les congés (si vos jours varient)'), champ('cpFerie', 'Jours fériés fermés par le magasin pendant les congés'), champ('cpJours', 'Jours de congés pointés (si vous les connaissez : remplace le calcul par dates)', { aide: 'Les jours « ABS C.P. » de la fiche.' }), champ('cpRef', 'Total brut de la période de référence (€)', { aide: 'Somme de vos bruts du 1er juin au 31 mai précédents. Le dixième est divisé par 300 par jour.' }), champ('cpInd', 'ou indemnité par jour de la fiche (€)', { aide: 'Plus simple : le taux de la ligne « IND C.P. ACQUIS » de votre fiche. Remplace le calcul ci-dessus.' })),
      option('optPrime', 'Ma paie de décembre contient le 13ᵉ mois', champ('brutCumulNov', 'Total du salaire brut de janvier à novembre (€)', { aide: 'Le cumul de votre fiche de novembre.' }), champ('acompteExcMontant', 'Acompte exceptionnel déjà reçu, en net (€)', { aide: 'Laissez vide si aucun.' }), champ('acompte75Montant', 'Acompte de début décembre déjà reçu, en net (€)', { aide: 'Laissez vide si pas encore reçu. Vide : l\'estimation à 75 % du brut n\'est proposée que par les questions pas à pas.' })),
      option('optAutres', 'J\'ai d\'autres éléments de salaire (congés payés, primes…)', champ('autresBrut', 'Montant en € (+ ou −)', { signe: true, aide: 'Congés payés : écart entre l\'indemnité et l\'absence retirée.' }))),
    h('div', { class: 'carte' }, h('h3', {}, '3. Avantages et retenues'),
      h('div', { class: 'champs' },
        champOuvres, champ('joursAbsence', 'Autres jours d\'absence dans le mois (hors congés payés)', { aide: 'Congés, maladie, formation : réduisent la tenue (6 € au prorata des jours ouvrés). Vide = mois complet.' }),
        champ('tickets', 'Nombre de titres-restaurant', { aide: 'Un titre par jour où votre horaire couvre 12 h-13 h 30 ou 18 h 30-20 h.' }), region,
        champ('km', 'Distance domicile-travail (km)', { aide: 'Pour l\'indemnité de transport. Vide = pas d\'indemnité.' }),
        champ('joursTransport', 'Jours travaillés sur place (transport)', { aide: 'Nombre de jours du mois ouvrant droit à l\'indemnité de transport.' }),
        champ('autresRetenues', 'Autres retenues sur le net (€)', { aide: 'Acompte, opposition, etc.' }))),
    h('div', { class: 'carte' }, h('h3', {}, '4. Impôt'),
      h('label', { class: 'champ champ-case' }, pasBox, h('span', {}, 'Prélèvement à la source (impôt retenu sur la paie)')), pasTaux)),
    h('details', { class: 'textes' }, h('summary', {}, `Taux utilisés (contrôlés le ${dateFr(T.controle.date)})`),
      h('p', { class: 'note' }, T.controle.resume), h('p', { class: 'note' }, `Plafond mensuel de la Sécurité sociale : ${eur(T.plafond_mensuel_securite_sociale)}. Prochain contrôle : ${T.controle.prochain}.`),
      h('table', { class: 'simu-table' }, h('tbody', {}, lignesTaux))));
  majSemaines();
  calculer();
  if (!init) lancerQuestions(); else if (init.lancerApres) lancerQuestions(false, true); else setTimeout(() => zoneResultat.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

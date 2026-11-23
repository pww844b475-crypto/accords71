// Écran « Simulateur de fiche de paie ». Rien n'est enregistré ni envoyé : tout se calcule dans le navigateur.
import { simulerPaie } from './moteur/paie.js';
import { entretienTenue, fraisTransport } from './moteur/calculs.js';

const eur = x => (x < 0 ? '−' : '') + Math.abs(x).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
const virg = x => String(x).replace('.', ',');
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.').replace('−', '-')); return Number.isFinite(n) ? n : 0; };
const dateFr = iso => iso.split('-').reverse().join('/');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Jours ouvrés d'un mois = du lundi au vendredi (les jours fériés ne sont pas retirés : le champ reste modifiable)
export function joursOuvres(annee, mois) {
  let n = 0;
  for (let j = 1, fin = new Date(annee, mois, 0).getDate(); j <= fin; j++) { const w = new Date(annee, mois - 1, j).getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export async function ouvrirSimulateur({ vue, h, remplir, retour }) {
  let T;
  try { T = await fetch('data/taux-paie.json').then(r => r.json()); }
  catch { remplir(vue, h('p', { class: 'erreur' }, 'Taux indisponibles hors connexion : ouvrez une fois le simulateur avec du réseau.')); return; }

  const valeurs = {};
  const champ = (id, label, { defaut = '', aide, placeholder, signe = false } = {}) => {
    valeurs[id] = defaut;
    const input = h('input', { type: 'text', inputmode: signe ? 'text' : 'decimal', autocomplete: 'off', value: defaut, placeholder: placeholder || '0', 'aria-label': label });
    input.addEventListener('input', () => { valeurs[id] = input.value; calculer(); });
    return h('label', { class: 'champ' }, h('span', { class: 'champ-label' }, label), input, aide ? h('small', { class: 'aide' }, aide) : null);
  };
  const choix = (id, label, options, defaut) => {
    valeurs[id] = defaut;
    const sel = h('select', { 'aria-label': label }, options.map(([v, t]) => h('option', { value: v, selected: v === defaut }, t)));
    sel.addEventListener('change', () => { valeurs[id] = sel.value; calculer(); });
    return h('label', { class: 'champ' }, h('span', { class: 'champ-label' }, label), sel);
  };
  // Case à cocher qui révèle des champs
  const option = (id, label, ...contenu) => {
    valeurs[id] = false;
    const zone = h('div', { class: 'champs option-zone' }, contenu); zone.hidden = true;
    const c = h('input', { type: 'checkbox', 'aria-label': label });
    c.addEventListener('change', () => { valeurs[id] = c.checked; zone.hidden = !c.checked; calculer(); });
    return h('div', { class: 'option' }, h('label', { class: 'champ champ-case' }, c, h('span', {}, label)), zone);
  };

  const auj = new Date();
  const moisDefaut = `${auj.getFullYear()}-${String(auj.getMonth() + 1).padStart(2, '0')}`;
  valeurs.mois = moisDefaut;
  const champMois = h('input', { type: 'month', value: moisDefaut, 'aria-label': 'Mois de la fiche' });
  const champOuvres = champ('joursOuvres', 'Jours ouvrés du mois (modifiable)', { aide: 'Lundi au vendredi. Calculé automatiquement selon le mois.' });
  const majOuvres = () => {
    const [a, m] = champMois.value.split('-').map(Number);
    if (a && m) { const j = joursOuvres(a, m); valeurs.joursOuvres = String(j); champOuvres.querySelector('input').value = String(j); }
  };
  champMois.addEventListener('input', () => { valeurs.mois = champMois.value; majOuvres(); calculer(); });
  majOuvres();

  const zoneResultat = h('div', { class: 'carte reponse-finale simu-res', 'aria-live': 'polite' });
  const zoneDetail = h('div');
  const secteur = choix('secteur', 'Secteur (pause payée)', [['5', 'Bureaux, rayons, autres : 5 % du travail effectif'], ['6.67', 'Caisses, drive, îlots de vente : 6,67 %'], ['0', 'Sans pause comptée (0 %)'], ['autre', 'Autre pourcentage…']], '5');
  const autrePct = champ('autrePct', 'Pourcentage de pause (%)', { placeholder: 'ex. 5,5' });
  autrePct.hidden = true;
  secteur.querySelector('select').addEventListener('change', e => { autrePct.hidden = e.target.value !== 'autre'; });
  const region = choix('region', 'Titres-restaurant : magasin', [['autre', 'Hors Île-de-France (3,70 € retenus par titre)'], ['idf', 'Île-de-France (4 € retenus par titre)']], 'autre');
  const pasTaux = champ('pasTaux', 'Votre taux de prélèvement (%)', { placeholder: 'ex. 1,5', aide: 'Indiqué sur votre fiche de paie et sur impots.gouv.fr.' });
  pasTaux.hidden = true;
  const pasBox = h('input', { type: 'checkbox', 'aria-label': 'Prélèvement à la source' });
  valeurs.pasActif = false;
  pasBox.addEventListener('change', () => { valeurs.pasActif = pasBox.checked; pasTaux.hidden = !pasBox.checked; calculer(); });

  function calculer() {
    const pct = valeurs.secteur === 'autre' ? num(valeurs.autrePct) : num(valeurs.secteur);
    const ouvres = Math.max(0, Math.round(num(valeurs.joursOuvres)));
    const abs = Math.max(0, Math.round(num(valeurs.joursAbsence)));
    const trav = Math.max(0, ouvres - abs);
    const tenue = ouvres > 0 ? (entretienTenue({ joursTravailles: trav, joursOuvres: ouvres }).lignes[0]?.brut || 0) : 0;
    const km = num(valeurs.km);
    const transport = km > 0 ? (fraisTransport({ km, jours: Math.round(num(valeurs.joursTransport)) }).lignes[1]?.brut || 0) : 0;
    const hd = !!valeurs.optDeleg, hs = !!valeurs.optHs, hc = !!valeurs.optHc, sp = !!valeurs.optSpec;
    const e = {
      salaireBase: num(valeurs.salaireBase), heuresSemaine: num(valeurs.heuresSemaine), pausePct: pct,
      hcBase: hd ? num(valeurs.hd) : 0,
      hs25: hs ? num(valeurs.hs25) : 0, hs50: hs ? num(valeurs.hs50) : 0,
      hc10: hc ? num(valeurs.hc10) : 0, hc25: hc ? num(valeurs.hc25) : 0,
      dimanche: sp ? num(valeurs.dimanche) : 0, ferie: sp ? num(valeurs.ferie) : 0, nuit30: sp ? num(valeurs.nuit30) : 0, nuit10: sp ? num(valeurs.nuit10) : 0,
      cpJours: valeurs.optCp ? num(valeurs.cpJours) : 0, cpRefBrute: valeurs.optCp ? num(valeurs.cpRef) : 0, cpIndemniteJour: valeurs.optCp ? num(valeurs.cpInd) : 0,
      hsExoAuto: true, autresBrut: valeurs.optAutres ? num(valeurs.autresBrut) : 0,
      tenue, transport, tickets: Math.floor(num(valeurs.tickets)), partSalarieTicket: valeurs.region === 'idf' ? 4 : 3.7,
      autresRetenues: num(valeurs.autresRetenues), pas: { actif: !!valeurs.pasActif, taux: num(valeurs.pasTaux) },
    };
    if (!(e.salaireBase > 0) || !(e.heuresSemaine > 0)) {
      remplir(zoneResultat, h('p', { class: 'note' }, 'Renseignez le salaire de base et les heures par semaine pour voir le résultat.')); remplir(zoneDetail); return;
    }
    const r = simulerPaie(e, T);
    const ligne = (t, v, fort) => h('div', { class: 'simu-ligne' + (fort ? ' fort' : '') }, h('span', {}, t), h('strong', {}, v));
    const [a, m] = (valeurs.mois || '').split('-').map(Number);
    const periode = a && m ? `${MOIS[m - 1]} ${a}` : '';
    remplir(zoneResultat,
      h('h3', {}, `Votre fiche estimée${periode ? ' · ' + periode : ''}`),
      h('div', { class: 'simu-resume' },
        h('span', { class: 'tag' + (hd ? ' ok' : '') }, hd ? `Heures de délégation : OUI (${virg(e.hcBase)} h)` : 'Heures de délégation : non'),
        h('span', { class: 'tag' + (hs ? ' ok' : '') }, hs ? `Heures supplémentaires : OUI (${virg(e.hs25 + e.hs50)} h)` : 'Heures supplémentaires : non'),
        hc ? h('span', { class: 'tag ok' }, `Heures complémentaires : OUI (${virg(e.hc10 + e.hc25)} h)`) : null),
      ligne('Salaire brut', eur(r.brut), true),
      ligne('Cotisations salariales', eur(-r.totalCotisations)),
      ligne('Net social', eur(r.netSocial)),
      r.indemnitesNonSoumises ? ligne('+ Indemnités non soumises (tenue, transport)', eur(r.indemnitesNonSoumises)) : null,
      r.ticketsPartSalarie ? ligne('− Titres-restaurant (votre part)', eur(-r.ticketsPartSalarie)) : null,
      r.autresRetenues ? ligne('− Autres retenues', eur(-r.autresRetenues)) : null,
      ligne('Net à payer avant impôt', eur(r.netAvantImpot), true),
      valeurs.pasActif ? ligne(`− Prélèvement à la source (${virg(num(valeurs.pasTaux))} % de ${eur(r.baseImposable)})`, eur(-r.pas)) : null,
      ligne(valeurs.pasActif ? 'Net à payer après impôt' : 'Net à payer (sans prélèvement à la source)', eur(r.netAPayer), true),
      r.cp ? h('p', { class: r.cp.referenceConnue ? 'note' : 'erreur' }, r.cp.referenceConnue
        ? `Congés payés : ${virg(r.cp.jours)} jour(s) à ${eur(r.cp.parJour)} par jour (${r.cp.regle === 'dixieme' ? 'règle du dixième de la période de référence, plus favorable que le maintien' : r.cp.regle === 'maintien' ? 'maintien du salaire, plus favorable que le dixième' : 'indemnité par jour saisie'}) contre ${eur(r.cp.maintienJour)} retirés par jour : solde ${eur(r.cp.solde)}.`
        : 'Congés payés : sans votre rémunération de référence (1er juin au 31 mai) ni l\'indemnité par jour de votre fiche, le calcul retient le maintien du salaire et donne un net trop bas si le dixième est plus favorable.') : null,
      h('p', { class: 'note' }, `Taux horaire déduit de votre salaire de base : ${virg(r.details.tauxHoraire.toFixed(3))} €. Indemnité de tenue calculée : ${eur(tenue)} (${trav} jours sur ${ouvres} ouvrés).`),
      h('p', { class: 'note' }, 'Estimation à quelques centimes près : la paie arrondit ligne par ligne. Elle ne remplace pas votre fiche de paie.'));
    remplir(zoneDetail,
      h('details', { class: 'textes' }, h('summary', {}, 'Voir le détail des lignes de salaire'),
        h('table', { class: 'simu-table' }, h('tbody', {}, r.lignes.map(l => h('tr', {}, h('td', {}, l.libelle), h('td', { class: 'd' }, l.base != null ? virg(l.base) : ''), h('td', { class: 'd' }, eur(l.montant))))))),
      h('details', { class: 'textes' }, h('summary', {}, 'Voir le détail des cotisations'),
        h('table', { class: 'simu-table' }, h('tbody', {}, r.cotisations.map(c => h('tr', {}, h('td', {}, c.libelle), h('td', { class: 'd' }, c.taux != null ? virg(c.taux) + ' %' : 'forfait'), h('td', { class: 'd' }, eur(-c.montant))))))));
  }

  const lignesTaux = T.taux.map(x => h('tr', {}, h('td', {}, x.libelle), h('td', { class: 'd' }, x.taux != null ? virg(x.taux) + ' %' : eur(x.montant)),
    h('td', { class: 'd' }, x.statut === 'verifie' ? '✓ vérifié' : 'à contrôler')));
  const perime = new Date().getFullYear() > T.annee;

  remplir(vue,
    h('button', { class: 'sec', type: 'button', onclick: retour }, '← Retour'),
    h('h2', { class: 'accueil-titre' }, '💶 Estimation de ma fiche de paie'),
    h('p', { class: 'accueil-sous' }, 'Rien n\'est enregistré : tout se calcule sur votre téléphone.'),
    perime ? h('p', { class: 'erreur' }, `Attention : les taux sont ceux de ${T.annee}. Ils ont peut-être changé : vérifiez-les avant de vous fier au résultat.`) : null,
    h('div', { class: 'carte' }, h('h3', {}, '1. Votre fiche'),
      h('div', { class: 'champs' },
        h('label', { class: 'champ' }, h('span', { class: 'champ-label' }, 'Mois de la fiche'), champMois),
        champ('salaireBase', 'Salaire de base du mois (€)', { placeholder: 'ex. 1927,77', aide: 'La ligne « salaire de base » de l\'en-tête de la fiche (pauses comprises).' }),
        champ('heuresSemaine', 'Heures de présence par semaine', { placeholder: 'ex. 36', aide: 'Horaire du contrat (« horaire TPR » sur la fiche).' }), secteur, autrePct)),
    h('div', { class: 'carte' }, h('h3', {}, '2. Ce qui change ce mois-ci'), h('p', { class: 'note' }, 'Cochez ce qui vous concerne. Heures en temps de présence, comme sur la fiche.'),
      option('optDeleg', 'J\'ai des heures de délégation hors temps de travail', champ('hd', 'Nombre d\'heures de délégation', { aide: 'Les « HD » du planning. Payées au taux de base, pause comprise.' })),
      option('optHs', 'J\'ai des heures supplémentaires (temps plein)', champ('hs25', 'Heures supplémentaires à 25 %'), champ('hs50', 'Heures supplémentaires à 50 %')),
      option('optHc', 'J\'ai des heures complémentaires (temps partiel)', champ('hc10', 'Heures complémentaires à 10 %'), champ('hc25', 'Heures complémentaires à 25 %')),
      option('optSpec', 'J\'ai travaillé un dimanche, un jour férié ou de nuit', champ('dimanche', 'Heures le dimanche (+60 %)'), champ('ferie', 'Heures un jour férié (+200 %)'), champ('nuit30', 'Heures de nuit 22 h-5 h (+30 %)'), champ('nuit10', 'Heures de nuit 21-22 h et 5-6 h (+10 %)')),
      option('optCp', 'J\'ai pris des congés payés ce mois-ci', champ('cpJours', 'Jours de congés pris (jours pointés)', { aide: 'Les jours « ABS C.P. » de la fiche.' }), champ('cpRef', 'Total brut de la période de référence (€)', { aide: 'Somme de vos bruts du 1er juin au 31 mai précédents. Le dixième est divisé par 300 par jour.' }), champ('cpInd', 'ou indemnité par jour de la fiche (€)', { aide: 'Plus simple : le taux de la ligne « IND C.P. ACQUIS » de votre fiche. Remplace le calcul ci-dessus.' })),
      option('optAutres', 'J\'ai d\'autres éléments de salaire (congés payés, primes…)', champ('autresBrut', 'Montant en € (+ ou −)', { signe: true, aide: 'Congés payés : écart entre l\'indemnité et l\'absence retirée.' }))),
    h('div', { class: 'carte' }, h('h3', {}, '3. Avantages et retenues'),
      h('div', { class: 'champs' },
        champOuvres, champ('joursAbsence', 'Jours d\'absence dans le mois', { aide: 'Congés, maladie, formation : réduisent la tenue (6 € au prorata des jours ouvrés). Vide = mois complet.' }),
        champ('tickets', 'Nombre de titres-restaurant', { aide: 'Un titre par jour où votre horaire couvre 12 h-13 h 30 ou 18 h 30-20 h.' }), region,
        champ('km', 'Distance domicile-travail (km)', { aide: 'Pour l\'indemnité de transport. Vide = pas d\'indemnité.' }),
        champ('joursTransport', 'Jours travaillés sur place (transport)', { aide: 'Nombre de jours du mois ouvrant droit à l\'indemnité de transport.' }),
        champ('autresRetenues', 'Autres retenues sur le net (€)', { aide: 'Acompte, opposition, etc.' }))),
    h('div', { class: 'carte' }, h('h3', {}, '4. Impôt'),
      h('label', { class: 'champ champ-case' }, pasBox, h('span', {}, 'Prélèvement à la source (impôt retenu sur la paie)')), pasTaux),
    zoneResultat, zoneDetail,
    h('details', { class: 'textes' }, h('summary', {}, `Taux utilisés (contrôlés le ${dateFr(T.controle.date)})`),
      h('p', { class: 'note' }, T.controle.resume), h('p', { class: 'note' }, `Plafond mensuel de la Sécurité sociale : ${eur(T.plafond_mensuel_securite_sociale)}. Prochain contrôle : ${T.controle.prochain}.`),
      h('table', { class: 'simu-table' }, h('tbody', {}, lignesTaux))));
  calculer();
}

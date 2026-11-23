// Écran « Simulateur de fiche de paie ». Rien n'est enregistré ni envoyé : tout se calcule dans le navigateur.
import { simulerPaie } from './moteur/paie.js';

const eur = x => (x < 0 ? '−' : '') + Math.abs(x).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
const num = v => { const n = parseFloat(String(v).replace(',', '.').replace('−', '-')); return Number.isFinite(n) ? n : 0; };
const dateFr = iso => iso.split('-').reverse().join('/');

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
  const case_ = (id, label, defaut) => {
    valeurs[id] = defaut;
    const c = h('input', { type: 'checkbox' }); c.checked = defaut;
    c.addEventListener('change', () => { valeurs[id] = c.checked; calculer(); });
    return h('label', { class: 'champ champ-case' }, c, h('span', {}, label));
  };

  const zoneResultat = h('div', { class: 'carte reponse-finale simu-res', 'aria-live': 'polite' });
  const zoneDetail = h('div');
  const secteur = choix('secteur', 'Secteur (pause payée)', [['5', 'Bureaux, rayons, autres : 5 % du travail effectif'], ['6.67', 'Caisses, drive, îlots de vente : 6,67 %'], ['0', 'Sans pause comptée (0 %)'], ['autre', 'Autre pourcentage…']], '5');
  const autrePct = champ('autrePct', 'Pourcentage de pause (%)', { placeholder: 'ex. 5,5' });
  autrePct.hidden = true;
  secteur.querySelector('select').addEventListener('change', e => { autrePct.hidden = e.target.value !== 'autre'; });
  const region = choix('region', 'Titres-restaurant : magasin', [['autre', 'Hors Île-de-France (3,70 € retenus par titre)'], ['idf', 'Île-de-France (4 € retenus par titre)']], 'autre');
  const pasCase = case_('pasActif', 'Prélèvement à la source (impôt retenu sur la paie)', false);
  const pasTaux = champ('pasTaux', 'Votre taux de prélèvement (%)', { placeholder: 'ex. 1,5', aide: 'Indiqué sur votre fiche de paie et sur impots.gouv.fr. Laissez décoché pour voir le net sans impôt.' });

  function calculer() {
    const pct = valeurs.secteur === 'autre' ? num(valeurs.autrePct) : num(valeurs.secteur);
    const e = {
      tauxHoraire: num(valeurs.tauxHoraire), heuresSemaine: num(valeurs.heuresSemaine), pausePct: pct,
      dimanche: num(valeurs.dimanche), ferie: num(valeurs.ferie), nuit30: num(valeurs.nuit30), nuit10: num(valeurs.nuit10),
      hcBase: num(valeurs.hcBase), hc10: num(valeurs.hc10), hc25: num(valeurs.hc25), hs25: num(valeurs.hs25),
      hsExoAuto: !!valeurs.hsExo, autresBrut: num(valeurs.autresBrut),
      tenue: num(valeurs.tenue), transport: num(valeurs.transport),
      tickets: Math.floor(num(valeurs.tickets)), partSalarieTicket: valeurs.region === 'idf' ? 4 : 3.7,
      autresRetenues: num(valeurs.autresRetenues), pas: { actif: !!valeurs.pasActif, taux: num(valeurs.pasTaux) },
    };
    if (!(e.tauxHoraire > 0) || !(e.heuresSemaine > 0)) {
      remplir(zoneResultat, h('p', { class: 'note' }, 'Renseignez le taux horaire et les heures par semaine pour voir le résultat.')); remplir(zoneDetail); return;
    }
    const r = simulerPaie(e, T);
    const ligne = (t, v, fort) => h('div', { class: 'simu-ligne' + (fort ? ' fort' : '') }, h('span', {}, t), h('strong', {}, v));
    remplir(zoneResultat,
      h('h3', {}, 'Votre fiche estimée'),
      ligne('Salaire brut', eur(r.brut), true),
      ligne('Cotisations salariales', eur(-r.totalCotisations)),
      ligne('Net social', eur(r.netSocial)),
      r.indemnitesNonSoumises ? ligne('+ Indemnités non soumises (tenue, transport)', eur(r.indemnitesNonSoumises)) : null,
      r.ticketsPartSalarie ? ligne('− Titres-restaurant (votre part)', eur(-r.ticketsPartSalarie)) : null,
      r.autresRetenues ? ligne('− Autres retenues', eur(-r.autresRetenues)) : null,
      ligne('Net à payer avant impôt', eur(r.netAvantImpot), true),
      valeurs.pasActif ? ligne(`− Prélèvement à la source (${String(num(valeurs.pasTaux)).replace('.', ',')} % de ${eur(r.baseImposable)})`, eur(-r.pas)) : null,
      ligne(valeurs.pasActif ? 'Net à payer après impôt' : 'Net à payer (sans prélèvement à la source)', eur(r.netAPayer), true),
      h('p', { class: 'note' }, 'Estimation à quelques centimes près : la paie arrondit ligne par ligne. Elle ne remplace pas votre fiche de paie.'));
    remplir(zoneDetail,
      h('details', { class: 'textes' }, h('summary', {}, 'Voir le détail des lignes de salaire'),
        h('table', { class: 'simu-table' }, h('tbody', {}, r.lignes.map(l => h('tr', {}, h('td', {}, l.libelle), h('td', { class: 'd' }, l.base != null ? String(l.base).replace('.', ',') : ''), h('td', { class: 'd' }, eur(l.montant))))))),
      h('details', { class: 'textes' }, h('summary', {}, 'Voir le détail des cotisations'),
        h('table', { class: 'simu-table' }, h('tbody', {}, r.cotisations.map(c => h('tr', {}, h('td', {}, c.libelle), h('td', { class: 'd' }, c.taux != null ? String(c.taux).replace('.', ',') + ' %' : 'forfait'), h('td', { class: 'd' }, eur(-c.montant))))))));
  }

  const lignesTaux = T.taux.map(x => h('tr', {}, h('td', {}, x.libelle), h('td', { class: 'd' }, x.taux != null ? String(x.taux).replace('.', ',') + ' %' : eur(x.montant)),
    h('td', { class: 'd' }, x.statut === 'verifie' ? '✓ vérifié' : 'à contrôler')));
  const anneeCourante = new Date().getFullYear();
  const perime = anneeCourante > T.annee;

  remplir(vue,
    h('button', { class: 'sec', type: 'button', onclick: retour }, '← Retour'),
    h('h2', { class: 'accueil-titre' }, '💶 Simulateur de fiche de paie'),
    h('p', { class: 'accueil-sous' }, 'Rien n\'est enregistré : tout se calcule sur votre téléphone.'),
    perime ? h('p', { class: 'erreur' }, `Attention : les taux sont ceux de ${T.annee}. Ils ont peut-être changé : vérifiez-les avant de vous fier au résultat.`) : null,
    h('div', { class: 'carte' }, h('h3', {}, '1. Votre contrat'),
      h('div', { class: 'champs' },
        champ('tauxHoraire', 'Taux horaire de base (€)', { placeholder: 'ex. 12,31', aide: 'Le taux « sans pauses » de votre fiche (ligne « salaire travail effectif »).' }),
        champ('heuresSemaine', 'Heures de présence par semaine', { placeholder: 'ex. 36', aide: 'Horaire du contrat (TPR sur la fiche).' }), secteur, autrePct)),
    h('div', { class: 'carte' }, h('h3', {}, '2. Heures particulières du mois'), h('p', { class: 'note' }, 'En heures de présence. Laissez vide si aucune.'),
      h('div', { class: 'champs' },
        champ('dimanche', 'Dimanche (+60 %)'), champ('ferie', 'Jour férié travaillé (+200 %)'),
        champ('nuit30', 'Nuit 22 h-5 h (+30 %)'), champ('nuit10', 'Nuit 21-22 h et 5-6 h (+10 %)'),
        champ('hcBase', 'Heures au-delà du contrat, payées à 100 %'), champ('hc10', 'Heures complémentaires à 10 %'),
        champ('hc25', 'Heures complémentaires à 25 %'), champ('hs25', 'Heures supplémentaires à 25 %'),
        champ('autresBrut', 'Autres éléments de salaire (€, + ou −)', { signe: true, aide: 'Congés payés (écart indemnité − absence), primes, etc. Le signe − est accepté.' })),
      case_('hsExo', 'Exonération sur les heures complémentaires et supplémentaires', true)),
    h('div', { class: 'carte' }, h('h3', {}, '3. Avantages et retenues'),
      h('div', { class: 'champs' },
        champ('tenue', 'Indemnité d\'entretien de la tenue (€)', { aide: '6 € par mois, au prorata des jours travaillés.' }),
        champ('transport', 'Indemnité de transport (€)', { aide: 'Jours travaillés × barème de la distance.' }),
        champ('tickets', 'Nombre de titres-restaurant'), region,
        champ('autresRetenues', 'Autres retenues sur le net (€)', { aide: 'Acompte, opposition, etc.' }))),
    h('div', { class: 'carte' }, h('h3', {}, '4. Impôt'), h('div', { class: 'champs' }, pasCase, pasTaux)),
    zoneResultat, zoneDetail,
    h('details', { class: 'textes' }, h('summary', {}, `Taux utilisés (contrôlés le ${dateFr(T.controle.date)})`),
      h('p', { class: 'note' }, T.controle.resume), h('p', { class: 'note' }, `Plafond mensuel de la Sécurité sociale : ${eur(T.plafond_mensuel_securite_sociale)}. Prochain contrôle : ${T.controle.prochain}.`),
      h('table', { class: 'simu-table' }, h('tbody', {}, lignesTaux))));
  calculer();
}

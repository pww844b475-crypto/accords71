import { netDePrime } from './paie.js';
// Calculs des fiches. Fonctions pures : aucune donnée n'est stockée ni envoyée.
// Chaque barème vient d'un texte du dossier sources/ (références dans fiches/fiches.json).
export const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const L = (niveau, label, valeur, extra = {}) => ({ niveau, label, valeur, ...extra });

// ---- 1. Congés payés : décompte des jours à pointer (accord de substitution art. 4.1.2, p.42)
export function congesPointage({ joursHebdo, joursAbsence = 0, semaines = 0, joursFeriesChomes = 0 }) {
  if (!(joursHebdo >= 1 && joursHebdo <= 6) || !(joursAbsence >= 0) || !(semaines >= 0)) return { lignes: [], erreur: 'Renseigner les jours de travail par semaine (1 à 6), les semaines entières et les jours isolés.' };
  const total = joursAbsence + semaines * joursHebdo;   // jours normalement travaillés pendant l'absence
  const aPointer = joursHebdo >= 5 ? (total / joursHebdo) * 6 : (6 * total) / joursHebdo;
  const base = Math.floor(aPointer + 1e-9);
  const feries = Math.max(0, Math.floor(joursFeriesChomes));
  const v = Math.max(0, base - feries);
  const note = feries > 0 ? `${base} jours moins ${feries} jour(s) férié(s) chômé(s) dans l'entreprise, qui ne sont pas décomptés (fiche officielle du Code du travail numérique). Un férié habituellement travaillé dans l'entreprise reste décompté.` : undefined;
  let info;
  if (joursAbsence >= joursHebdo && joursHebdo < 6) info = `Attention : ${joursAbsence} jours isolés = ${joursAbsence} jours que le salarié aurait travaillés, soit ${r2(joursAbsence / joursHebdo)} semaine(s) de travail. Pour une semaine entière, mettre 1 dans « Semaines entières » et 0 dans « Jours isolés ».`;
  return { lignes: [L('accord', 'Jours de congés à pointer', `${v} jour(s)`, { brut: v, note })], info };
}

// ---- 2. Préavis (convention, annexe I art. 5.1 p.114 ; annexe II art. 5.1 p.123 ; annexe III art. 5.1 p.128)
export function preavis({ statut, motif, ancienneteMois }) {
  const grave = motif === 'faute';
  let v, note = '';
  if (grave) return { lignes: [L('convention', 'Préavis', 'Non prévu par ces articles (faute grave ou lourde)', { brut: 0 })] };
  if (statut === 'employe') {
    if (motif === 'licenciement' && ancienneteMois >= 24) v = 2; else v = 1;
    note = motif === 'licenciement' ? '2 mois si au moins 2 ans d\'ancienneté, sinon 1 mois' : '1 mois de date à date';
  } else if (statut === 'maitrise') { v = 2; note = '« ne peut être inférieure à 2 mois » (durée minimale)'; }
  else { v = 3; note = '3 mois'; }
  return { lignes: [L('convention', 'Préavis', `${v} mois`, { brut: v, note })] };
}

// ---- 3. Indemnité de licenciement : accord de substitution (art. 3.4) et convention (annexe I art. 7), côte à côte. Employés/ouvriers seulement.
export function indemniteLicenciement(p) {
  const { statut, ancienneteMois, age = 0, enfants = 0, motif, salaireMensuel = 0, primeAnnuelle = 0, indemnitesFonction = 0, brut12 = 0, brut3 = 0 } = p;
  const lignes = [];
  const grave = motif === 'faute';
  const ans = ancienneteMois / 12;
  // Accord de substitution (art. 3.4)
  const salRefAccord = r2(salaireMensuel + primeAnnuelle / 12 + indemnitesFonction);
  let mois;
  if (grave || ancienneteMois < 24) mois = 0;
  else if (ancienneteMois < 36) mois = 0.5;
  else if (statut === 'employe') mois = Math.min(6, 0.75 + 0.25 * (Math.floor(ans) - 3));
  else if (ans >= 20) mois = statut === 'cadre' ? 12 : 9;
  else mois = (statut === 'cadre' ? 6 : 3) + 0.25 * (Math.floor(ans) - 3);
  const base = r2(mois * salRefAccord);
  const majPct = (age >= 45 ? 20 : 0) + 10 * enfants;
  lignes.push(L('accord', 'Salaire de référence mensuel (accord)', `${salRefAccord} €`));
  lignes.push(L('accord', 'Indemnité avant majorations', `${r2(mois)} mois = ${base} €`, { brut: base, mois }));
  lignes.push(L('accord', 'Majorations possibles (45 ans : +20 % ; enfants : +10 % chacun)', `+${majPct} %`, { note: 'Base de la majoration non précisée dans le texte : ici appliquée à l\'indemnité.' }));
  lignes.push(L('accord', 'Indemnité avec majorations', `${r2(base * (1 + majPct / 100))} €`, { brut: r2(base * (1 + majPct / 100)), cmp: { g: 'indemnite', v: r2(base * (1 + majPct / 100)), s: 'plus' } }));
  // Convention (annexes I et II : employés et maîtrise ; annexe III : cadres)
  let moisCC = 0;
  if (!grave && ancienneteMois >= 8) {
    if (statut !== 'cadre') moisCC = Math.min(ancienneteMois, 120) * (0.25 / 12) + Math.max(ancienneteMois - 120, 0) * (1 / 3 / 12);
    else if (ancienneteMois <= 60) moisCC = ancienneteMois * (0.25 / 12);
    else {
      const t1 = Math.min(ancienneteMois, 120), t2 = Math.min(Math.max(ancienneteMois - 120, 0), 120), t3 = Math.max(ancienneteMois - 240, 0), t4 = Math.max(ancienneteMois - 480, 0);
      moisCC = Math.min(12, (t1 * 0.3 + t2 * 0.4 + t3 * 0.5) / 12) + t4 / 12 / 3;
    }
  }
  const salCC = Math.max(brut12 / 12, brut3 / 3);
  if (salCC > 0) {
    const b = r2(moisCC * salCC);
    lignes.push(L('convention', 'Salaire « plein tarif » (convention, art. 6)', `${r2(salCC)} €`));
    lignes.push(L('convention', 'Indemnité de licenciement (convention, art. 7.1)', `${r2(moisCC)} mois = ${b} €`, { brut: b, mois: r2(moisCC), cmp: { g: 'indemnite', v: b, s: 'plus' } }));
    if (motif === 'economique' && age > 50) lignes.push(L('convention', 'Majoration de 20 % (art. 7.2) si aucune exclusion ne s\'applique', `${r2(b * 1.2)} €`, { brut: r2(b * 1.2), note: 'Exclusions (reclassement, chômage jusqu\'à la retraite à taux plein, etc.) non vérifiées par le calcul.' }));
  } else lignes.push(L('convention', 'Indemnité (convention, art. 7.1)', `${r2(moisCC)} mois de salaire plein tarif`, { mois: r2(moisCC), note: 'Renseigner les rémunérations des 12 et des 3 derniers mois pour obtenir un montant.' }));
  return { lignes };
}

// ---- 4. Prime annuelle (accord de substitution art. 3.2, p.24-25) — employés
export function primeAnnuelle({ dateEmbauche, annee, brutAnnee = 0, moisPayes = 12, brutRestant = 0, joursMaladie = 0, sommeForfaitaires = 0, acompteDemande = false, montantAcompte = 0, tauxPas = 0 }, ctx = {}) {
  if (!dateEmbauche || !annee) return { lignes: [], erreur: 'Renseigner la date d\'embauche et l\'année.' };
  const [y, m, d] = dateEmbauche.split('-').map(Number);
  const jmax = new Date(Date.UTC(y, m + 6, 0)).getUTCDate(); // dernier jour du mois cible (évite le débordement 31 nov.)
  const fin6 = new Date(Date.UTC(y, m - 1 + 6, Math.min(d, jmax))); // date des 6 mois d'ancienneté
  const limite = new Date(Date.UTC(annee, 10, 30)); // 30 novembre
  const eligible = fin6 <= limite;
  const lignes = [L('accord', 'Droit à la prime (6 mois d\'ancienneté à fin novembre)', eligible ? 'Oui' : 'Non', { brut: eligible })];
  if (!eligible) return { lignes };
  // « À date » : si toutes les fiches de l'année ne sont pas encore reçues, on estime le brut de l'année (moyenne des mois payés pour les mois restants, ou le brut prévu)
  const n = Math.min(12, Math.max(0, Math.round(moisPayes))) || 12, aDate = n < 12;
  const moyenne = n > 0 ? brutAnnee / n : 0;
  const brutEstime = aDate ? r2(brutAnnee + (brutRestant > 0 ? brutRestant : moyenne * (12 - n))) : brutAnnee;
  if (aDate) lignes.push(L('accord', `Brut estimé de l'année (${n} mois payés, ${12 - n === 1 ? 'le mois restant estimé' : `les ${12 - n} mois restants estimés`})`, `${brutEstime} €`, { brut: brutEstime, note: brutRestant > 0 ? 'Le brut des mois restants est celui que vous avez indiqué.' : 'Les mois restants sont estimés à la moyenne de vos mois déjà payés : les primes et heures en plus du mois de décembre ne sont pas prévues.' }));
  let montant = r2(brutEstime / 12);
  lignes.push(L('accord', aDate ? 'Prime annuelle estimée : 1/12 du brut estimé de l\'année' : 'Montant : 1/12 de la rémunération brute de l\'assiette', `${montant} €`, { brut: montant }));
  if (joursMaladie <= 30 && sommeForfaitaires > 0) {
    const alt = r2(sommeForfaitaires / 12);
    lignes.push(L('accord', 'Mode de calcul alternatif (maladie ≤ 30 jours) : 1/12 des salaires forfaitaires mensuels', `${alt} €`, { brut: alt, note: 'Applicable « lorsque le mode de calcul lui est plus favorable, sur une période de maladie inférieure ou égale à 30 jours »' }));
    montant = Math.max(montant, alt);
  }
  const acompte = acompteDemande && montantAcompte > 0 ? r2(montantAcompte) : 0;
  const avant = acompte ? ', en brut, avant déduction de l\'acompte déjà reçu' : ', en brut';
  lignes.push(L('accord', 'Acompte début décembre (75 %)' + avant, `${r2(montant * 0.75)} €`, { brut: r2(montant * 0.75) }));
  lignes.push(L('accord', 'Solde avec la paie de décembre (25 %)' + avant, `${r2(montant * 0.25)} €`, { brut: r2(montant * 0.25) }));
  const T = ctx && ctx.taux;
  if (!T) {                                  // sans les taux de cotisation : on ne convertit pas en net
    if (acompte) lignes.push(L('accord', 'Reste à percevoir en décembre (prime brute moins acompte, sans conversion en net)', `${r2(montant - acompte)} €`, { brut: r2(montant - acompte), note: 'Les taux de cotisation ne sont pas chargés : ce reste mélange brut et acompte.' }));
    return { lignes };
  }
  const f = x => `${x.toFixed(2).replace('.', ',')} €`;
  if (aDate) {
    const acquise = r2(brutAnnee / 12), netAcquise = netDePrime({ prime: acquise, brutMensuel: moyenne, tauxPas }, T);
    lignes.push(L('accord', 'Prime acquise à ce jour (1/12 du brut déjà payé), en brut', f(acquise), { brut: acquise, note: 'Base d\'un acompte demandé aujourd\'hui, « au prorata des droits déjà acquis ». L\'accord ne dit pas si l\'acompte est limité à ces droits en totalité : à confirmer auprès de la paie.' }));
    lignes.push(L('accord', 'Prime acquise à ce jour, en net estimé', f(tauxPas > 0 ? netAcquise.netApresImpot : netAcquise.netAvantImpot), { brut: tauxPas > 0 ? netAcquise.netApresImpot : netAcquise.netAvantImpot }));
  }
  const net = netDePrime({ prime: montant, brutMensuel: moyenne, tauxPas }, T);
  const netPrime = tauxPas > 0 ? net.netApresImpot : net.netAvantImpot;
  lignes.push(L('accord', `Prime annuelle en net estimé (${tauxPas > 0 ? 'après' : 'avant'} prélèvement à la source)`, f(netPrime), { brut: netPrime, note: 'Estimation : le net exact dépend de la paie de décembre (cotisations, plafond de la Sécurité sociale).' }));
  const brut75 = r2(montant * 0.75);
  const note75 = 'L\'acompte de 75 % est calculé sur le BRUT de la prime et versé sans cotisations ; la fiche de décembre prélève les cotisations sur toute la prime et déduit les acomptes. Le solde net est donc faible (relevé sur une fiche de décembre 2025 : acomptes égaux à 75 % du brut).';
  if (acompte) {
    const debut = Math.max(0, r2(brut75 - acompte)), deduits = Math.max(brut75, acompte), reste = r2(netPrime - deduits);
    lignes.push(L('accord', 'Acompte déjà reçu sur demande (net, entre le 1er juin et le 30 novembre)', f(acompte), { brut: acompte }));
    lignes.push(L('accord', 'Versé début décembre (75 % du brut de la prime moins l\'acompte déjà reçu)', f(debut), { fort: true, brut: debut, note: note75 }));
    lignes.push(L('accord', 'Reste à percevoir avec la fiche de décembre (net)', f(reste), { fort: true, brut: reste, note: acompte > brut75 ? 'L\'acompte dépasse 75 % du brut de la prime : à vérifier.' : 'Net de la prime moins les acomptes déjà versés (acompte exceptionnel + acompte de début décembre).' }));
  } else {
    const reste = r2(netPrime - brut75);
    lignes.push(L('accord', 'Versé début décembre (75 % du brut de la prime)', f(brut75), { fort: true, brut: brut75, note: note75 }));
    lignes.push(L('accord', 'Reste à percevoir avec la fiche de décembre (net)', f(reste), { fort: true, brut: reste, note: 'Net de la prime moins l\'acompte de début décembre.' }));
  }
  return { lignes };
}

// ---- 5. Intéressement 2026 : grilles de l'avenant (copie pour signature, NON SIGNÉE)
const palier = (x, grille) => { for (const [seuil, mt] of grille) if (x >= seuil - 1e-9) return mt; return 0; };
export const GRILLES_2026 = {
  ca: [[103, 100], [102, 80], [101, 60], [100, 40], [99, 20], [98, 10]],
  mdc: [[35, 100], [34, 90], [33, 80], [32, 70], [31, 60], [30, 50], [29, 40], [28, 30], [27, 20], [26, 10]],
  demarque: [[0.40, 150], [0.35, 125], [0.30, 100], [0.25, 80], [0.20, 60], [0.15, 50], [0.10, 40], [0.05, 30], [0.00, 20]],
  nps: [[51, 150], [48, 100], [45, 75], [42, 50], [39, 25], [36, 0]],
};
export function interessement2026({ caX = 0, mdcX = 0, demarqueEcart = 0, nps = 0, presenceMois = 12, ratioTempsPartiel = 1 }) {
  const c1a = palier(caX, GRILLES_2026.ca), c1b = palier(mdcX, GRILLES_2026.mdc);
  const c1 = Math.max(c1a, c1b), c2 = palier(demarqueEcart, GRILLES_2026.demarque), c3 = palier(nps, GRILLES_2026.nps);
  const total = c1 + c2 + c3;
  const prorata = r2(total * (presenceMois / 12) * ratioTempsPartiel);
  return { lignes: [
    L('accord', 'Critère 1 (meilleur des deux indicateurs)', `${c1} € (CA : ${c1a} € ; MDC : ${c1b} €)`, { brut: c1 }),
    L('accord', 'Critère 2 : démarque', `${c2} €`, { brut: c2 }),
    L('accord', 'Critère 3 : NPS', `${c3} €`, { brut: c3 }),
    L('accord', 'Total des grilles 2026 (avant seuil, prorata et plafond)', `${total} €`, { brut: total }),
    L('accord', 'Estimation au prorata de la présence (art. 7 de l\'accord)', `${prorata} €`, { brut: prorata, note: 'Estimation : l\'accord répartit selon la durée de présence ; la formule exacte de répartition est à vérifier dans le texte.' }),
  ] };
}

// ---- 6. Abondement PEE / PERCOL (règlement PEE art. 5, p.4-5 ; grille commune)
export const TRANCHES_ABONDEMENT = [[50, 2.2], [100, 1.8], [150, 1.5], [200, 1.25], [300, 1.0], [1000, 0.168], [1150, 0.168]];
export const PLAFOND_ABONDEMENT = 580.30;
export function abondement({ versements }) {
  if (!(versements >= 0)) return { lignes: [], erreur: 'Renseigner le total des versements (PEE + PERCOL).' };
  const v = Math.min(versements, 1150);
  let ab = 0, bas = 0;
  for (const [haut, taux] of TRANCHES_ABONDEMENT) { if (v > bas) ab += (Math.min(v, haut) - bas) * taux; bas = haut; }
  ab = Math.min(r2(ab), PLAFOND_ABONDEMENT, r2(3 * versements));
  return { lignes: [
    L('accord', 'Versements pris en compte (limite 1 150 €)', `${r2(v)} €`),
    L('accord', 'Abondement de l\'entreprise (tranche par tranche)', `${r2(ab)} €`, { brut: r2(ab), note: 'Sous réserve du plafond légal en vigueur (note * du règlement : valeur à compléter).' }),
  ] };
}

// ---- 7. Majorations de nuit (accord art. 5.6 p.55-56 ; convention art. 5.11.4 p.36)
export function majorationNuit({ h2122 = 0, h225 = 0, h56 = 0, tauxHoraire = 0, forfaitJours = false }) {
  if (forfaitJours) return { lignes: [L('accord', 'Majoration', 'Non applicable aux cadres au forfait annuel en jours (intégrée dans le forfait)', { brut: 0 })] };
  const acc = r2(tauxHoraire * (0.10 * h2122 + 0.30 * h225 + 0.10 * h56));
  const cc = r2(tauxHoraire * (0.05 * h2122 + 0.20 * h225));
  return { lignes: [
    L('accord', 'Majoration de nuit (21-22 h : 10 % ; 22-5 h : 30 % ; 5-6 h : 10 %)', `${acc} €`, { brut: acc, cmp: { g: 'nuit', v: acc, s: 'plus' } }),
    L('convention', 'Majoration de nuit (21-22 h : 5 % ; 22-5 h : 20 %)', `${cc} €`, { brut: cc, cmp: { g: 'nuit', v: cc, s: 'plus' }, note: 'La convention ne mentionne pas de majoration pour 5-6 h dans cet article.' }),
  ] };
}

// ---- 8. Arrêt maladie : carence et durée du complément (accord art. 3.11 ; convention annexe I art. 3)
export function arretMaladie({ statut, ancienneteAns = 0, hospitalisation = false, plus23j = false, plus2mois = false, accidentTravail = false }) {
  const lignes = [];
  const carenceAccord = (hospitalisation || accidentTravail || plus23j) ? 0 : 2;
  lignes.push(L('accord', 'Délai de carence', carenceAccord === 0 ? 'Aucun' : '2 jours', { brut: carenceAccord, cmp: { g: 'carence', v: carenceAccord, s: 'moins' } }));
  let duree;
  if (statut === 'cadre') duree = ancienneteAns >= 1 ? 540 : null;
  else duree = ancienneteAns < 1 ? null : ancienneteAns < 10 ? 180 : ancienneteAns < 25 ? 360 : 540;
  lignes.push(L('accord', 'Durée du complément de salaire', duree ? `${duree} jours calendaires` : (accidentTravail ? 'Droit sans condition d\'ancienneté pour AT/trajet ; durée sous 1 an : Information à compléter' : 'Pas de complément avant 1 an d\'ancienneté (maladie)'), { brut: duree }));
  if (statut === 'employe') {
    const carenceCC = (hospitalisation || accidentTravail || plus2mois) ? 0 : 7;
    lignes.push(L('convention', 'Délai de carence (début du complément au 8e jour)', carenceCC === 0 ? 'Aucun' : '7 jours calendaires', { brut: carenceCC, cmp: { g: 'carence', v: carenceCC, s: 'moins' } }));
    let bar;
    const a = ancienneteAns;
    if (a < 1) bar = 'Pas de complément avant 1 an de présence';
    else if (a < 5) bar = '100 % pendant 30 jours, puis 90 % pendant 15 jours';
    else if (a < 10) bar = '100 % pendant 35 jours, puis 90 % pendant 40 jours';
    else if (a < 15) bar = '100 % pendant 90 jours';
    else if (a < 20) bar = '100 % pendant 90 jours, puis 60 % pendant 30 jours';
    else bar = '100 % pendant 120 jours, puis 65 % pendant 60 jours';
    lignes.push(L('convention', 'Barème du complément (employés/ouvriers)', bar, { note: 'Bornes exactes (ex. 5 ans pile) : vérifier dans le texte.' }));
  } else lignes.push(L('convention', 'Convention (maîtrise et cadres)', 'Information à compléter : barème non codé dans cette version'));
  return { lignes };
}

// ---- 9. Événements familiaux (accord art. 4.1 p.44 ; convention art. 7.5.1 p.50-51)
export const EVENEMENTS = {
  naissance: { label: 'Naissance ou adoption d\'un enfant', accord: '3 jours ouvrés', cc: '3 jours ouvrés' },
  mariage_salarie: { label: 'Mariage ou PACS du salarié', accord: '1 semaine', cc: '4 jours ouvrés (sans condition) ; 1 semaine après 1 an d\'ancienneté (art. 7.5.1 b)' },
  mariage_enfant: { label: 'Mariage ou PACS d\'un enfant / descendant', accord: '2 jours ouvrés', cc: 'Mariage d\'un enfant : 1 jour ouvré ; descendants (après 1 an d\'ancienneté) : 2 jours ouvrés' },
  mariage_parent: { label: 'Mariage ou PACS du père ou de la mère', accord: '1 jour ouvré', cc: 'Information à compléter (non trouvé dans l\'article 7.5.1)' },
  deces_conjoint: { label: 'Décès du conjoint, concubin, partenaire de PACS, enfant', accord: '5 jours ouvrés (enfant à charge)', cc: '5 jours ouvrés (conjoint, partenaire de PACS ou enfant)' },
  deces_parent: { label: 'Décès d\'un frère, d\'une sœur, d\'un parent, d\'un beau-parent…', accord: '4 jours ouvrés', cc: '3 jours ouvrés (père, mère, frère, sœur, beau-fils, belle-fille, beau-parent)' },
  deces_grandparent: { label: 'Décès d\'un grand-parent, petit-enfant, beau-frère, belle-sœur', accord: '1 jour ouvré', cc: '1 jour ouvré' },
  bapteme: { label: 'Baptême ou communion d\'un enfant', accord: '1 jour ouvré', cc: '1 jour ouvré (après 1 an d\'ancienneté)' },
};
export function evenementFamilial({ evenement, distance300 = false }) {
  const e = EVENEMENTS[evenement]; if (!e) return { lignes: [], erreur: 'Choisir un événement.' };
  const l = [L('accord', e.label, e.accord), L('convention', e.label, e.cc)];
  if (distance300 && evenement.startsWith('deces')) l.push(L('accord', 'Déplacement à plus de 300 km (aller)', '+1 jour supplémentaire'), L('convention', 'Obsèques à plus de 500 km', '1 jour sans solde en plus (art. 7.5.5)'));
  return { lignes: l };
}

// ---- 10. Remise sur achats (accord art. 3.2 p.28-29 ; NAO 2026 partie 2 art. 1-2 p.9)
export function remiseAchats({ achats = 0, ancienneteMois = 0 }) {
  if (ancienneteMois < 3) return { lignes: [L('accord', 'Droit à la remise', 'Non : au moins 3 mois d\'ancienneté requis', { brut: 0 })] };
  const a = r2(Math.min(achats, 11000) * 0.10), n = r2(Math.min(achats, 13000) * 0.12);
  return { lignes: [
    L('accord', 'Remise de 10 % (plafond d\'achats 11 000 €/an)', `${a} €`, { brut: a }),
    L('nao', 'Remise de 12 % du 1er avril 2026 au 31 mars 2027 (plafond d\'achats 13 000 € pour 2026)', `${n} €`, { brut: n, note: 'Les deux périodes se chevauchent sur l\'année civile 2026 : calcul indicatif sur la base d\'achats saisie.' }),
  ] };
}

// ---- 11. Journée de solidarité (accord de substitution art. 5.9, p.59 ; horaire de référence art. 5.1.2, p.64)
export function journeeSolidarite({ statut = 'employe', horaireSalarie = 0, horaireConv = '35', arriveeEnCours = false }) {
  if (statut === 'encadrement') return { lignes: [L('accord', 'Journée de solidarité (encadrement)', '1 unité sur le quota annuel de jours de RTT', { brut: 1 })] };
  const conv = Number(horaireConv);
  if (!(horaireSalarie > 0) || !(conv > 0)) return { lignes: [], erreur: 'Renseigner l\'horaire hebdomadaire du salarié.' };
  const minutes = Math.round((7 * 60 * horaireSalarie) / conv);
  const hm = `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
  const lignes = [L('accord', 'Heures de solidarité à ajouter sur l\'année', `${hm} (formule : 7 h × ${horaireSalarie} ÷ ${conv})`, { brut: minutes })];
  if (arriveeEnCours) lignes.unshift(L('pratique', 'Salarié arrivé en cours d\'année', 'Pas de journée de solidarité selon la pratique RH', { brut: 0, note: 'Pratique à confirmer : non écrite dans les textes du dossier (l\'accord cite la présence au 1er juin pour les CDD de plus de 4 mois).' }));
  return { lignes };
}

// ---- 12. Prime annuelle d'un salarié en arrêt (accord art. 3.2 p.24-25 ; art. 3.11.2 p.38 ; convention art. 3.6.2 p.14)
const jour = d => new Date(Date.UTC(...d.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x))));
const iso = dt => dt.toISOString().slice(0, 10);
export function primeEtArret({ statut = 'employe', ancienneteAns = 0, accidentTravail = false, dateDebut, annee }) {
  if (!dateDebut || !annee) return { lignes: [], erreur: 'Renseigner la date de début de l\'arrêt et l\'année de la prime.' };
  const debut = jour(dateDebut), l = [];
  const duree = statut === 'cadre' ? (ancienneteAns >= 1 ? 540 : 0) : ancienneteAns < 1 ? 0 : ancienneteAns < 10 ? 180 : ancienneteAns < 25 ? 360 : 540;
  const finCompl = duree ? new Date(debut.getTime() + (duree - 1) * 86400000) : null;
  const j1 = Date.UTC(annee, 0, 1), d31 = Date.UTC(annee, 11, 31);
  l.push(L('accord', 'Fin approximative du complément de l\'employeur (jours calendaires, carence non déduite)', finCompl ? iso(finCompl) : 'Pas de complément (ancienneté insuffisante)', { brut: finCompl ? iso(finCompl) : null }));
  const jusque = finCompl ? finCompl.getTime() : -Infinity;
  if (jusque < j1) l.push(L('accord', `Complément de l'employeur versé en ${annee}`, 'Aucun : la base de calcul de la prime est nulle', { brut: 0, note: 'Les indemnités de la Sécurité sociale et de la prévoyance ne comptent pas dans la base (art. 3.2).' }));
  else { const jours = Math.min(jusque, d31) - j1; l.push(L('accord', `Complément de l'employeur versé en ${annee}`, `Environ ${Math.floor(jours / 86400000) + 1} jours : prime proportionnelle à ces sommes`, { brut: Math.floor(jours / 86400000) + 1 })); }
  if (accidentTravail) l.push(L('accord', 'Accident du travail / maladie professionnelle', 'Compte dans la base « dans la limite ininterrompue d\'un an » (jusqu\'au ' + iso(new Date(Date.UTC(debut.getUTCFullYear() + 1, debut.getUTCMonth(), debut.getUTCDate() - 1))) + ')', { brut: 'at' }));
  const unAn = Date.UTC(debut.getUTCFullYear() + 1, debut.getUTCMonth(), debut.getUTCDate());
  const versement = Date.UTC(annee, 11, 1);
  l.push(L('convention', 'Contrat suspendu depuis moins de 1 an au moment du versement (début décembre)', unAn > versement ? 'Oui : condition remplie' : 'Non : condition non remplie (art. 3.6.2)', { brut: unAn > versement }));
  return { lignes: l };
}

// ---- 13. Retraite progressive (accord art. 3.13, p.38-39)
export function retraiteProgressive({ age = 0, moisAvantAgeLegal = 999, trimestres = 0, horaire = 0 }) {
  const ok = (b, t) => L('accord', t, b ? 'Oui' : 'Non', { brut: b });
  const lignes = [ok(age >= 60, 'Avoir 60 ans'), ok(moisAvantAgeLegal < 24, 'Être à moins de 2 ans avant l\'âge minimum légal'), ok(trimestres >= 150, 'Totaliser 150 trimestres validés (tous régimes)')];
  const tout = lignes.every(l => l.brut);
  lignes.push(L('accord', 'Conditions d\'âge et de trimestres', tout ? 'Réunies (reste la demande écrite 4 mois avant et la validation RH/manager)' : 'Non réunies', { brut: tout }));
  if (horaire > 0) lignes.push(L('accord', 'Horaire pendant la retraite progressive (50 % ou 60 % d\'un temps complet)', `${r2(horaire * 0.5)} h (50 %) ou ${r2(horaire * 0.6)} h (60 %) par semaine`, { note: 'Pourcentage d\'un temps complet : exemple de l\'accord = 36 h → 18 h ou 21,6 h.' }));
  return { lignes };
}

// ---- 14. Enfant malade / hospitalisé (accord art. 4.2.1 p.45 ; convention art. 7.6.9 p.53-54)
export function enfantMalade({ situation = 'hospitalise', ageEnfant = 0, nbEnfantsMoins16 = 1 }) {
  const l = [];
  const hosp = situation === 'hospitalise';
  if (hosp) l.push(L('accord', 'Enfant hospitalisé ou en convalescence après hospitalisation', ageEnfant < 16 ? '6 jours ouvrables rémunérés par année civile, sur justificatifs' : 'Non prévu pour un enfant de 16 ans ou plus', { brut: ageEnfant < 16 ? 6 : 0 }));
  else {
    const max = (nbEnfantsMoins16 >= 3 || ageEnfant < 1) ? 5 : 3;
    l.push(L('accord', 'Enfant malade (non hospitalisé)', `Absence avec récupération, autant de fois que nécessaire, ${max} jours consécutifs maximum`, { brut: max, note: 'Récupération en accord avec l\'encadrement ; elle ne peut pas être compensée par la suppression du temps de pause.' }));
  }
  if (ageEnfant < 12) l.push(L('convention', 'Enfant de moins de 12 ans (hospitalisé ou à soigner)', '5 jours ouvrés payés par année civile, quel que soit le nombre d\'enfants', { brut: 5 }));
  else if (ageEnfant < 16) l.push(L('convention', 'Enfant de 12 à moins de 16 ans (malade ou convalescence après hospitalisation)', '5 jours ouvrés maximum, non rémunérés ; possibilité de les récupérer', { brut: 5 }));
  else l.push(L('convention', 'Enfant de 16 ans ou plus', 'Non prévu par ces articles', { brut: 0 }));
  return { lignes: l };
}

// ---- 15. Délai de protection en cas de maladie (accord art. 3.12 p.38 ; convention art. 7.3.1 p.49-50)
export function delaiProtection({ statut = 'employe', ancienneteAns = 0, accidentTrajet = false }) {
  const l = [];
  if (statut !== 'employe') l.push(L('accord', 'Agents de maîtrise et cadres (maladie ou accident de trajet)', '2 ans', { brut: '2 ans' }));
  else if (accidentTrajet) l.push(L('accord', 'Employé, accident de trajet', '2 ans', { brut: '2 ans' }));
  else if (ancienneteAns < 0.5) l.push(L('accord', 'Employé, maladie', 'Pas de délai prévu (moins de 6 mois d\'ancienneté)', { brut: null }));
  else if (ancienneteAns < 1) l.push(L('accord', 'Employé, maladie (6 mois à 1 an)', '4 mois', { brut: '4 mois' }));
  else { const j = ancienneteAns < 10 ? 180 : ancienneteAns < 25 ? 360 : 540; l.push(L('accord', 'Employé, maladie (plus de 1 an)', `durée du complément (${j} jours) + 1 mois`, { brut: j })); }
  if (ancienneteAns < 0.5) l.push(L('convention', 'Maladie ou accident non professionnel', 'Pas de délai prévu (6 mois de présence effective requis)', { brut: null }));
  else { const maj = ancienneteAns >= 15 ? 5 : ancienneteAns >= 12 ? 4 : ancienneteAns >= 8 ? 3 : ancienneteAns >= 4 ? 2 : 0; l.push(L('convention', 'Maladie ou accident non professionnel (accident de trajet compris)', `4 mois, majoré de ${maj} mois = ${4 + maj} mois`, { brut: 4 + maj, note: 'Majoration lue comme un palier (2, 3, 4 ou 5 mois), pas comme un cumul.' })); }
  return { lignes: l };
}

// ---- 16. Capital décès (livret CGT p.30, tableau lu sur l'image ; contrat APGIS non fourni)
export function capitalDeces({ situation = 'seul', nbEnfants = 0, salaireReference = 0 }) {
  let pct;
  if (nbEnfants >= 1) pct = 185 + 35 * Math.min(Math.max(nbEnfants - 1, 0), 2) + 50 * Math.max(nbEnfants - 3, 0);
  else pct = situation === 'couple' ? 150 : 100;
  const l = [L('accord', 'Capital décès, toutes causes (% du salaire de référence, tranches 1 et 2)', `${pct} %`, { brut: pct })];
  if (salaireReference > 0) {
    const cap = r2(salaireReference * pct / 100);
    l.push(L('accord', 'Capital décès', `${cap} €`, { brut: cap }), L('accord', 'Capital supplémentaire si décès par accident (+ 50 % du capital)', `${r2(cap / 2)} €`, { brut: r2(cap / 2) }));
  }
  return { lignes: l };
}

// ---- 17. Absence pour déménagement (accord art. 4.2.3 p.46)
export const MOTIFS_DEMENAGEMENT = { handicap: 12, divorce: 12, garde: 12, deces: 12, ascendant: 12, naissance: 6, mariage: 6 };
export function demenagement({ motif = 'handicap', moisEcart = 0 }) {
  const g = MOTIFS_DEMENAGEMENT[motif];
  const ok = g === 12 ? (moisEcart >= 0 && moisEcart <= 12) : (moisEcart >= -6 && moisEcart <= 6);
  return { lignes: [L('accord', 'Absence rémunérée de 1 jour ouvré pour déménagement', ok ? 'Oui, si les justificatifs sont fournis' : 'Non : en dehors du délai', { brut: ok, note: g === 12 ? 'Délai : dans les 12 mois suivant l\'événement.' : 'Délai : dans les 6 mois précédant ou suivant l\'événement.' })] };
}

// ---- 18. Congés payés acquis (Code du travail L3141-3, L3141-5, L3141-5-1, L3141-7)
export function congesAcquis({ moisTravail = 0, moisMaladieNonPro = 0 }) {
  const a = 2.5 * moisTravail, b = Math.min(2 * moisMaladieNonPro, 24);
  const total = Math.min(Math.ceil(a + b - 1e-9), 30);
  return { lignes: [L('code', 'Jours ouvrables de congés acquis sur la période de référence', `${total} jours ouvrables (${r2(total / 6)} semaines de 6 jours)`, { brut: total, note: 'Calcul légal : 2,5 jours ouvrables par mois de travail effectif (et assimilé) ; 2 jours par mois d\'arrêt maladie non professionnel, dans la limite de 24 jours ; arrondi à l\'entier supérieur ; 30 jours maximum.' })] };
}

// ---- 19. Jours de fractionnement (accord art. 4.1.4 p.43 ; Code du travail L3141-23)
export function fractionnement({ joursHorsPeriode = 0 }) {
  const j = joursHorsPeriode >= 6 ? 2 : joursHorsPeriode >= 3 ? 1 : 0;
  return { lignes: [L('accord', 'Jours supplémentaires de fractionnement', j === 0 ? 'Aucun' : `${j} jour(s) ouvrable(s)`, { brut: j, note: 'La 5e semaine de congés payés est exclue du calcul (accord).' })] };
}

// ---- 20. Congé supplémentaire d'ancienneté (accord art. 4.2 p.43 ; convention art. 7.1.2 p.49)
export function congeAnciennete({ ancienneteAns = 0 }) {
  const acc = ancienneteAns >= 40 ? 5 : ancienneteAns >= 30 ? 4 : ancienneteAns >= 20 ? 3 : ancienneteAns >= 15 ? 2 : ancienneteAns >= 10 ? 1 : 0;
  const cc = ancienneteAns >= 20 ? 3 : ancienneteAns >= 15 ? 2 : ancienneteAns >= 10 ? 1 : 0;
  return { lignes: [L('accord', 'Congé supplémentaire d\'ancienneté (ancienneté acquise au 1er juin)', acc ? `${acc} jour(s)` : 'Aucun', { brut: acc, cmp: { g: 'anc', v: acc, s: 'plus' } }), L('convention', 'Congé supplémentaire d\'ancienneté', cc ? `${cc} jour(s)` : 'Aucun', { brut: cc, cmp: { g: 'anc', v: cc, s: 'plus' }, note: 'La convention s\'arrête à 3 jours (20 ans) ; l\'accord va jusqu\'à 5 jours (40 ans).' })] };
}

// ---- 21. Indemnité de congés payés (Code du travail L3141-24)
export function indemniteConges({ remunerationReference = 0, maintienSalaire = 0 }) {
  const dixieme = r2(remunerationReference / 10), m = r2(maintienSalaire), v = Math.max(dixieme, m);
  return { lignes: [L('code', 'Règle du dixième (1/10 de la rémunération brute de la période de référence)', `${dixieme} €`, { brut: dixieme }), L('code', 'Règle du maintien de salaire (ce qu\'aurait perçu le salarié en travaillant)', `${m} €`, { brut: m }), L('code', 'Indemnité due (la plus élevée des deux)', `${v} €`, { brut: v })] };
}

// ---- 22. Grossesse : réduction d'horaire (accord art. 4.3 p.48 ; convention art. 7.6.4 d)
export function grossesse({ moisGrossesse = 0 }) {
  const l = [];
  l.push(L('accord', 'Réduction d\'horaire par journée travaillée, sans perte de rémunération', moisGrossesse >= 4 ? '30 minutes (ou 2 fois 15 minutes), en prise de travail retardée ou en fin anticipée au choix de la salariée' : 'Pas avant le 1er jour du 4e mois', { brut: moisGrossesse >= 4 ? 30 : 0 }));
  l.push(L('accord', 'Plage horaire de travail (certificat, à sa demande)', moisGrossesse >= 5 ? 'Pas avant 7 h 30, pas après 19 h, jusqu\'à la première année de l\'enfant' : 'Pas avant le 5e mois', { brut: moisGrossesse >= 5 }));
  l.push(L('convention', 'Entrée 1/4 d\'heure plus tard ou sortie 1/4 d\'heure plus tôt', moisGrossesse > 4 ? 'Oui (à l\'expiration du 4e mois)' : 'Pas avant l\'expiration du 4e mois', { brut: moisGrossesse > 4 }));
  return { lignes: l };
}

// ---- 23. Durée du congé de maternité et maintien de salaire (L1225-17 à 19 ; accord titre 6 p.99 ; convention art. 7.6.6 a)
export function maternite({ rang = 1, multiples = 'non', ancienneteAns = 0 }) {
  let avant, apres;
  if (multiples === 'jumeaux') { avant = 12; apres = 22; } else if (multiples === 'triples') { avant = 24; apres = 22; }
  else if (rang >= 3) { avant = 8; apres = 18; } else { avant = 6; apres = 10; }
  const l = [L('code', 'Congé de maternité légal', `${avant + apres} semaines (${avant} avant et ${apres} après l'accouchement)`, { brut: avant + apres })];
  if (rang >= 3 && multiples === 'non') l.push(L('accord', 'Maintien du salaire (3e enfant)', 'Pendant la totalité des 26 semaines', { brut: 26, cmp: { g: 'mat', v: 26, s: 'plus' } }));
  let cc = ancienneteAns >= 3 ? 16 : ancienneteAns >= 2 ? 10 : ancienneteAns >= 1 ? 6 : 0;
  if (cc && multiples !== 'non') cc += 2;
  l.push(L('convention', 'Complément de salaire de l\'employeur (maintien du net)', cc ? `${cc} semaines` : 'Aucun (moins de 1 an de présence à la déclaration de grossesse)', { brut: cc, cmp: { g: 'mat', v: cc, s: 'plus' }, note: 'Après 1 an : 6 semaines ; 2 ans : 10 semaines ; 3 ans : 16 semaines ; plus 2 semaines en cas de naissances multiples. Ancienneté appréciée à la déclaration de grossesse.' }));
  return { lignes: l };
}

// ---- 24. Congé de paternité (L1225-35 ; accord titre 6 p.99)
export function paternite({ multiples = 'non' }) {
  const m = multiples !== 'non', total = m ? 32 : 25;
  return { lignes: [L('code', 'Congé de paternité et d\'accueil de l\'enfant', `${total} jours calendaires (4 jours consécutifs après le congé de naissance, puis ${m ? 28 : 21} jours)`, { brut: total }), L('accord', 'Maintien du salaire', `${total} jours`, { brut: total })] };
}

// ---- 25. Congé parental et ancienneté (accord titre 6 p.100 ; L1225-54 ; convention art. 7.6.7)
export function congeParentalAnciennete({ moisCongeParental = 0 }) {
  const m = moisCongeParental;
  const accord = m < 12 ? m : m <= 24 ? 12 : m / 2;
  const l = [L('accord', 'Mois pris en compte dans l\'ancienneté', `${r2(accord)} mois`, { brut: accord, note: m === 24 ? 'Exactement 24 mois : le texte ne tranche pas entre « 12 mois » et « la moitié », qui donnent ici le même résultat (12 mois).' : undefined })];
  l.push(L('code', 'Congé parental à temps plein (légal, convention)', `${r2(m / 2)} mois (la moitié)`, { brut: r2(m / 2), note: 'Code du travail L1225-54 et convention art. 7.6.7 : prise en compte pour moitié.' }));
  return { lignes: l };
}

// ---- 26. Allocation de départ à la retraite (accord art. 3.5 p.26-27 ; convention annexes I à III art. 8.2)
export function allocationRetraite({ statut = 'employe', ancienneteAns = 0, salaireReference = 0, plafondSecu = 0 }) {
  const a = ancienneteAns, l = [];
  let m;
  if (statut === 'employe') m = a > 20 ? 5 : a > 16 ? 4 : a > 13 ? 3 : a > 10 ? 2.5 : 0;
  else if (a >= 10) m = Math.min(2.5 + 0.2 * Math.floor(a - 10), statut === 'cadre' ? 6 : 5); else m = 0;
  const sr = statut === 'employe' && plafondSecu > 0 ? Math.min(salaireReference, plafondSecu) : salaireReference;
  l.push(L('accord', 'Allocation de départ à la retraite', m ? `${r2(m)} mois de salaire de référence` : 'Aucune (moins de 10 ans d\'ancienneté ou seuil non atteint)', { brut: r2(m), cmp: { g: 'alloc', v: r2(m), s: 'plus' }, note: statut === 'employe' ? 'Salaire de référence limité au plafond de la Sécurité sociale.' : 'Au-delà de 64 ans au départ, les années de présence ne font plus augmenter l\'allocation.' }));
  if (m && sr > 0) l.push(L('accord', 'Montant', `${r2(m * sr)} €`, { brut: r2(m * sr) }));
  let cc = 0;
  if (statut === 'cadre') cc = a >= 5 ? Math.min(6, Math.min(a, 10) * 2 / 20 + Math.max(Math.min(a, 20) - 10, 0) * 3 / 20 + Math.max(a - 20, 0) * 5 / 20) : 0;
  else cc = a >= 10 ? Math.min(4, 10 * 2 / 20 + (a - 10) * 3 / 20) : 0;
  l.push(L('convention', 'Allocation de départ en retraite (salaire « plein tarif »)', cc ? `${r2(cc)} mois` : 'Aucune (ancienneté minimale non atteinte)', { brut: r2(cc), cmp: { g: 'alloc', v: r2(cc), s: 'plus' }, note: statut === 'cadre' ? 'Cadres : au moins 5 ans de présence, maximum 6 mois.' : 'Employés et maîtrise : au moins 10 ans d\'ancienneté, maximum 4 mois.' }));
  return { lignes: l };
}

// ---- 27. Période d'essai (convention annexes I à III art. 2 ; L1221-19, L1221-21, L1221-25)
export function periodeEssai({ statut = 'employe', joursPresence = 0 }) {
  const dur = statut === 'employe' ? '2 mois' : statut === 'maitrise' ? '3 mois, renouvelable une fois d\'un commun accord dans la limite de 2 mois' : '4 mois (jusqu\'à 6 mois par accord), renouvelable une fois dans la limite de 8 mois, accord écrit signé';
  const j = joursPresence;
  const emp = j < 8 ? '24 heures' : j <= 30 ? '48 heures' : (statut === 'employe' || j <= 90) ? '2 semaines' : '1 mois';
  const emp_loi = j < 8 ? '24 heures' : j <= 30 ? '48 heures' : j <= 90 ? '2 semaines' : '1 mois';
  return { lignes: [
    L('convention', 'Durée de la période d\'essai', dur),
    L('convention', 'Délai de prévenance si l\'employeur met fin à l\'essai', emp, { brut: emp, note: statut === 'employe' ? 'Annexe I : 3 paliers (24 h, 48 h, 2 semaines après 1 mois). Le palier « 1 mois après 3 mois » est dans la loi.' : undefined }),
    L('convention', 'Délai de prévenance si le salarié met fin à l\'essai', j < 8 ? '24 heures' : '48 heures', { brut: j < 8 ? 24 : 48 }),
    L('code', 'Délai de prévenance de l\'employeur selon la loi (L1221-25)', emp_loi, { brut: emp_loi }),
  ] };
}

// ---- 28. Heures supplémentaires (accord art. 5.2.1 p.65 ; Code du travail L3121-27, L3121-36)
export function heuresSup({ heuresEffectives = 0, heuresPresence = 0, tauxHoraire = 0 }) {
  const hs = Math.max(0, heuresEffectives - 35), h25 = Math.min(hs, 8), h50 = Math.max(hs - 8, 0);
  const l = [L('accord', 'Lecture « 35 h de travail effectif » : heures supplémentaires', `${r2(hs)} h dont ${r2(h25)} h à 25 % et ${r2(h50)} h à 50 %`, { brut: r2(hs) })];
  if (tauxHoraire > 0 && hs > 0) { const maj = r2(tauxHoraire * (h25 * 0.25 + h50 * 0.5)); l.push(L('accord', 'Majoration correspondante', `${maj} €`, { brut: maj }), L('accord', 'Total pour ces heures (taux de base + majoration)', `${r2(tauxHoraire * hs + maj)} €`, { brut: r2(tauxHoraire * hs + maj) })); }
  const hp = Math.max(0, heuresPresence - 36);
  l.push(L('accord', 'Lecture « 36 h de temps de présence » : heures supplémentaires', `${r2(hp)} h`, { brut: r2(hp), note: 'L\'accord cite les deux seuils (36 h de présence et 35 h de travail effectif) : écart à vérifier, non tranché. Les majorations (25 % puis 50 %) sont écrites pour le seuil de 35 h de travail effectif.' }));
  l.push(L('code', 'Selon la loi : heures au-delà de 35 h (25 % les 8 premières, 50 % ensuite)', `${r2(hs)} h dont ${r2(h25)} h à 25 % et ${r2(h50)} h à 50 %`, { brut: r2(hs) }));
  return { lignes: l };
}

// ---- 29. Annualisation, temps complet (accord art. 5.1.4 à 5.1.5 p.67-68)
export function annualisation({ presenceSemaine = 0 }) {
  const p = presenceSemaine, ecart = r2(p - 36);
  const pos = p > 39 ? 'Au-dessus de la limite haute de 39 h : les heures au-delà sont des heures supplémentaires' : p < 33 ? 'En dessous de la limite basse de 33 h' : 'Dans la plage de 33 h à 39 h';
  return { lignes: [
    L('accord', 'Écart avec la moyenne de 36 h de présence (compteur de modulation)', `${ecart > 0 ? '+' : ''}${ecart} h`, { brut: ecart, note: 'Les heures entre 36 h et 39 h ne sont ni supplémentaires ni majorées : elles se compensent sur l\'année.' }),
    L('accord', 'Position dans la plage de l\'annualisation', pos),
    L('accord', 'Heures supplémentaires cette semaine (au-delà de 39 h)', `${r2(Math.max(0, p - 39))} h`, { brut: r2(Math.max(0, p - 39)) }),
  ] };
}

// ---- 30. Heures complémentaires à temps partiel (accord art. 5.1.5 p.81-82 ; Code du travail L3123-9, L3123-21)
export function heuresComplementaires({ horaireContrat = 0, heuresCompl = 0 }) {
  const tiers = r2(horaireContrat / 3), dixieme = r2(horaireContrat / 10), total = r2(horaireContrat + heuresCompl);
  const maj = r2(Math.max(0, heuresCompl - dixieme)), sans = r2(Math.min(heuresCompl, dixieme));
  return { lignes: [
    L('accord', 'Limite : un tiers de la durée du contrat', `${tiers} h par semaine`, { brut: tiers, note: heuresCompl > tiers ? 'Limite dépassée.' : undefined }),
    L('accord', 'Heures complémentaires sans majoration (jusqu\'à 1/10 du contrat)', `${sans} h`, { brut: sans }),
    L('accord', 'Heures complémentaires majorées de 25 % (au-delà de 1/10)', `${maj} h`, { brut: maj }),
    L('accord', 'Durée totale de la semaine', `${total} h`, { brut: total, note: 'Elle ne doit pas atteindre la durée légale (35 h) ou conventionnelle (36 h de présence selon l\'accord) : ' + (total >= 35 ? 'seuil atteint ou dépassé.' : 'seuil respecté.') }),
  ] };
}

// ---- 31. Modulation du temps partiel (accord art. 5.2 p.82)
export function modulationTempsPartiel({ horaire = 0 }) {
  if (horaire < 26) return { lignes: [L('accord', 'Modulation des horaires', 'Pas de modulation prévue pour un contrat inférieur à 26 h', { brut: null })] };
  const tab = { 26: [30, 22], 28: [32, 24], 30: [34, 26] };
  const [haut, bas] = tab[horaire] || [horaire + 4, horaire - 4];
  return { lignes: [L('accord', 'Limite haute de la semaine', `${haut} h`, { brut: haut }), L('accord', 'Limite basse de la semaine', `${bas} h`, { brut: bas, note: tab[horaire] ? undefined : 'Le tableau de l\'accord ne donne que 26 h, 28 h et 30 h ; la règle générale est de plus ou moins 4 h.' })] };
}

// ---- 32. Participation : base de répartition et plafonds (accord de participation signé, art. 4 p.5)
export function participationRepartition({ salaireAnnuel = 0, plafondSecu = 0, moisPresence = 12 }) {
  if (!(plafondSecu > 0)) return { lignes: [], erreur: 'Renseigner le plafond annuel de la Sécurité sociale (48 060 € en 2026, source Urssaf ; vérifier la valeur de l\'année concernée).' };
  const k = Math.min(Math.max(moisPresence, 0), 12) / 12;
  const plafondSalaire = r2(3 * plafondSecu * k), plafondDroits = r2(0.75 * plafondSecu * k);
  const base = r2(Math.min(salaireAnnuel, plafondSalaire));
  return { lignes: [
    L('accord', 'Salaire pris en compte pour la répartition', `${base} €`, { brut: base, note: salaireAnnuel > plafondSalaire ? 'Salaire plafonné à 3 fois le plafond annuel de la Sécurité sociale (au prorata de la présence).' : 'Dans la limite de 3 fois le plafond annuel de la Sécurité sociale (au prorata de la présence).' }),
    L('accord', 'Plafond individuel des droits à participation (75 % du plafond annuel)', `${plafondDroits} €`, { brut: plafondDroits, note: 'Le montant réel dépend de la réserve de participation de l\'entreprise et du total des salaires : il ne peut pas être calculé ici.' }),
  ] };
}

// ---- 33. Travailleur de nuit (accord art. 5.6 p.55 ; convention art. 5.11.2 p.35 ; L3122-5)
export function travailleurDeNuit({ joursParSemaine = 0, heuresNuit = 0, nuits = 0 }) {
  const regle1 = joursParSemaine >= 2;
  const acc = regle1 || heuresNuit >= 270 || nuits >= 36, cc = regle1 || heuresNuit >= 300;
  return { lignes: [
    L('accord', 'Travailleur de nuit selon l\'accord', acc ? 'Oui' : 'Non', { brut: acc, note: 'Au moins 2 fois par semaine 3 h entre 21 h et 6 h, ou au moins 270 heures ou 36 nuits du 1er juin au 31 mai.' }),
    L('convention', 'Travailleur de nuit selon la convention', cc ? 'Oui' : 'Non', { brut: cc, note: 'Au moins 2 fois par semaine 3 h de nuit, ou au moins 300 heures de travail effectif sur 12 mois. Ces dispositions de la convention s\'appliquent en l\'absence d\'accord d\'entreprise.' }),
  ] };
}

// ---- 34. Repos compensateur du travail de nuit (accord art. 5.6 p.56 ; convention art. 5.11.3 p.35-36)
export function reposNuit({ statut = 'employe', heuresNuit = 0, nuits = 0 }) {
  const l = [];
  if (statut === 'cadre') {
    const j = nuits >= 171 ? 3 : nuits >= 120 ? 2 : nuits >= 36 ? 1 : 0;
    l.push(L('accord', 'Cadre au forfait jours : repos compensateur payé', j ? `${j} jour(s) de repos compensateur` : 'Aucun (moins de 36 nuits)', { brut: j }));
    return { lignes: l };
  }
  const h = heuresNuit >= 1300 ? 21 : heuresNuit >= 900 ? 14 : heuresNuit >= 270 ? 7 : 0;
  l.push(L('accord', 'Repos compensateur payé (heures de nuit du 1er juin au 31 mai)', h ? `${h} heures de repos compensateur` : 'Aucun (moins de 270 heures)', { brut: h }));
  const j = heuresNuit >= 900 ? 2 : heuresNuit >= 300 ? 1 : heuresNuit > 0 ? 1 : 0;
  l.push(L('convention', 'Repos compensateur du travailleur de nuit', j ? `${j} jour(s) ouvré(s)` : 'Aucun', { brut: j, note: heuresNuit > 0 && heuresNuit < 300 ? '1 jour proratisé si le salarié fait au moins 3 h de nuit 2 fois par semaine. Ces dispositions s\'appliquent en l\'absence d\'accord d\'entreprise.' : 'Ces dispositions s\'appliquent en l\'absence d\'accord d\'entreprise.' }));
  return { lignes: l };
}

// ---- 35. Majoration du travail du dimanche (accord art. 5.7 p.57 ; convention art. 5.13.2 et 5.13.3 p.38)
export function dimanche({ type = 'habituel', heures = 0, tauxHoraire = 0, grandeSurface = true }) {
  const l = [];
  const euros = p => tauxHoraire > 0 ? ` = ${r2(heures * tauxHoraire * p / 100)} €` : '';
  if (type === 'exceptionnel') {
    l.push(L('accord', 'Dimanche exceptionnel : majoration', `+100 %${euros(100)}`, { brut: 100, cmp: { g: 'dim', v: 100, s: 'plus' }, note: 'Cette majoration remplace la majoration légale des heures supplémentaires. Le repos hebdomadaire est décalé, non supprimé, dans la quinzaine.' }));
    l.push(L('convention', 'Dimanche occasionnel : majoration', `+100 %${euros(100)}`, { brut: 100, cmp: { g: 'dim', v: 100, s: 'plus' }, note: 'Repos décalé dans la quinzaine ; volontariat pour certaines dérogations.' }));
  } else {
    l.push(L('accord', 'Dimanche habituel (employés, ouvertures habituelles) : majoration', `+60 %${euros(60)}`, { brut: 60, cmp: { g: 'dim', v: 60, s: 'plus' }, note: 'Cette majoration remplace la majoration légale des heures supplémentaires.' }));
    const p = grandeSurface ? 30 : 20;
    l.push(L('convention', grandeSurface ? 'Dimanche habituel, commerce de plus de 400 m² : majoration d\'au moins' : 'Dimanche habituel, commerce de 400 m² ou moins, sans 1,5 jour de repos consécutif : majoration de', `+${p} %${euros(p)}`, { brut: p, cmp: { g: 'dim', v: p, s: 'plus' }, note: grandeSurface ? 'Jusqu\'à 13 h, sans condition de repos consécutif.' : undefined }));
  }
  return { lignes: l };
}

// ---- 36. Jour férié travaillé (accord art. 5.8 p.58 ; convention art. 5.14 p.38-39 ; L3133-6 pour le 1er mai)
export function ferieTravaille({ heures = 0, tauxHoraire = 0, premierMai = false }) {
  const e = k => tauxHoraire > 0 ? r2(heures * tauxHoraire * k) : null;
  const l = [L('accord', 'Jour férié travaillé : indemnité en plus du maintien du salaire mensuel (heures effectuées + majoration de 100 %)', tauxHoraire > 0 ? `${e(2)} € (soit 2 fois le taux de base)` : '2 fois le taux de base', { brut: e(2) ?? 2, cmp: { g: 'ferie', v: 2, s: 'plus' }, note: 'Montant de l\'indemnité : heures effectuées réellement, plus une majoration égale à 100 % du taux normal.' })];
  l.push(L('convention', 'Jour férié travaillé : au choix du salarié, paiement au taux horaire des heures effectuées en plus du salaire mensuel, ou repos payé d\'égale durée', tauxHoraire > 0 ? `${e(1)} € ou ${r2(heures)} h de repos payé` : '1 fois le taux de base ou repos payé', { brut: e(1) ?? 1, cmp: { g: 'ferie', v: 1, s: 'plus' }, note: 'Repos à prendre dans les 15 jours avant ou après le jour férié travaillé.' }));
  if (premierMai) l.push(L('code', '1er mai travaillé (loi)', tauxHoraire > 0 ? `${e(1)} € en plus du salaire correspondant au travail accompli` : 'Indemnité égale au salaire du travail accompli', { brut: e(1) ?? 1, note: 'Le 1er mai est férié et chômé ; ceux qui y sont occupés ont droit en plus du salaire à une indemnité égale à ce salaire (L3133-6).' }));
  return { lignes: l };
}

// ---- 41. Pauses et temps de travail effectif (accord art. 5.3 p.52-53 ; Code du travail L3121-16)
export function pauses({ heuresPresence = 36, poste = 'rayon', habillage = false }) {
  const mn = { rayon: 3, caisse: 4, industriel: 6, surgelation: 12 }[poste] || 3;
  const pr = Math.max(0, heuresPresence);
  const fmt = h => { const t = Math.round(h * 60); return `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, '0')} min`; };
  const pauseH = pr * mn / 60, effectif = pr - pauseH;
  const l = [L('accord', `Pause payée (${mn} min par heure de présence)`, fmt(pauseH), { brut: pauseH, note: 'Le temps de pause est calculé sur 3 minutes par heure pour le temps de présence ; les durées plus longues (caisse 4, industriel 6, surgélation 12) ne changent pas le temps de présence.' }),
    L('accord', 'Temps de travail effectif', fmt(effectif), { brut: effectif, note: `Pour ${fmt(pr)} de présence.` })];
  if (habillage) l.push(L('accord', `Pause totale avec habillage (${mn + 1} min par heure de présence)`, fmt(pauseH + pr / 60), { brut: pauseH + pr / 60, note: `${mn} min de pause + 1 min d'habillage par heure de présence.` }));
  if (habillage) l.push(L('accord', 'Contrepartie habillage / déshabillage (1 min par heure de présence)', fmt(pr / 60), { brut: pr / 60, note: 'Pause supplémentaire, sans augmenter le temps de présence, si la tenue est obligatoire et que l\'habillage se fait sur place.' }));
  l.push(L('code', 'Pause minimale légale', pr >= 6 ? '20 minutes consécutives' : 'Aucune si moins de 6 h de travail quotidien', { note: 'Dès que le temps de travail quotidien atteint 6 heures (L3121-16). S\'applique à la journée, pas à la semaine.' }));
  return { lignes: l };
}

// ---- 42. Prime de fermeture EC4 (accord art. 5.2 p.51)
export function primeFermeture({ fermetures = 0 }) {
  const n = Math.max(0, Math.floor(fermetures)), paliers = Math.floor(n / 5);
  return { lignes: [L('accord', 'Prime de fermeture du mois', `${paliers * 35} € bruts`, { brut: paliers * 35, note: `${n} fermeture(s) : ${paliers} palier(s) de 5. Lecture du texte (« prime de 35 € bruts, acquise par palier de 5 fermetures ») : 35 € par palier de 5 - Pratique à confirmer avec la paie.` })] };
}

// ---- 43. Titres restaurant (accord art. 3.1.2 p.28)
export function ticketsRestaurant({ tickets = 0, region = 'autre' }) {
  const n = Math.max(0, Math.floor(tickets)), idf = region === 'idf';
  const face = idf ? 8 : 7.4, emp = idf ? 4 : 3.7;
  return { lignes: [
    L('accord', `Valeur d'un titre (${idf ? 'Île-de-France' : 'hors Île-de-France'})`, `${fr2(face)} € dont ${fr2(emp)} € à la charge de l'employeur`, { brut: face }),
    L('accord', `Votre part sur ${n} titre(s)`, `${fr2(r2(n * (face - emp)))} € retenus sur la paie`, { brut: r2(n * (face - emp)) }),
    L('accord', `Part de l'employeur sur ${n} titre(s)`, `${fr2(r2(n * emp))} €`, { brut: r2(n * emp) }),
    L('accord', 'Valeur totale des titres reçus', `${fr2(r2(n * face))} €`, { brut: r2(n * face) }),
  ] };
}
const fr2 = x => x.toFixed(2).replace('.', ',');

// ---- 44. Indemnité d'entretien de la tenue (accord art. 3.3.3 p.33) : 6 euros par mois, au prorata des jours travaillés
export function entretienTenue({ joursTravailles = 0, joursOuvres = 22 }) {
  if (!(joursOuvres > 0)) return { lignes: [], erreur: 'Indiquer le nombre de jours ouvrés du mois.' };
  const j = Math.min(Math.max(0, joursTravailles), joursOuvres), v = r2(6 * j / joursOuvres);
  return { lignes: [L('accord', 'Indemnité d\'entretien de la tenue', `${fr2(v)} €`, { brut: v, note: `6 € × ${j} jours travaillés ÷ ${joursOuvres} jours ouvrés. Non soumise à cotisations sur la fiche constatée ; non prise en compte pour les congés payés ni les primes non mensuelles.` })] };
}

// ---- 45. Participation aux frais de transport personnels (accord art. 3.10 p.35-36)
export function fraisTransport({ km = 0, jours = 0 }) {
  if (!(km > 0)) return { lignes: [], erreur: 'Indiquer la distance domicile-travail en km.' };
  const bar = km > 15 ? 0.8 : km > 10 ? 0.68 : km > 5 ? 0.56 : 0.44;
  const limite = [5, 10, 15].includes(km);
  const j = Math.max(0, jours);
  return { lignes: [L('accord', `Indemnité journalière (${km} km)`, `${fr2(bar)} € par jour travaillé`, { brut: bar, note: limite ? 'Le texte écrit « supérieur à » et « inférieur à » : pour exactement ' + km + ' km, la tranche n\'est pas précisée ; le barème le plus bas est affiché, à vérifier.' : 'Barème : plus de 15 km 0,80 € ; 10 à 15 km 0,68 € ; 5 à 10 km 0,56 € ; moins de 5 km 0,44 €.' }),
    L('accord', `Total du mois (${j} jour(s) travaillé(s) ou de formation)`, `${fr2(r2(bar * j))} €`, { brut: r2(bar * j), note: 'Sur demande, pour les salariés de plus de 3 mois d\'ancienneté sans transport en commun possible, hors exclusions de l\'art. 3.10.' })] };
}

// ---- 46. Prime d'astreinte (accord art. 5.1.7 p.63 ; NAO 2026 partie 1 art. 5 p.7)
export function primeAstreinte({ magasin = 'standard', semaines = 1 }) {
  const n = Math.max(0, semaines), acc = { standard: 132.35, dimanche: 154.75, h24: 176.10 }[magasin] ?? 132.35;
  const l = [L('accord', 'Prime d\'astreinte (accord de substitution)', `${acc.toFixed(2).replace('.', ',')} € bruts par semaine`, { brut: acc }),
    L('accord', `Total pour ${n} semaine(s)`, `${(Math.round(acc * n * 100) / 100).toFixed(2).replace('.', ',')} € bruts`, { brut: Math.round(acc * n * 100) / 100 })];
  if (magasin === 'dimanche') l.push(L('nao', 'Prime revalorisée par la NAO 2026', `160,00 € bruts par semaine, soit ${(Math.round(160 * n * 100) / 100).toFixed(2).replace('.', ',')} € pour ${n} semaine(s)`, { brut: 160, note: 'Date d\'application de la revalorisation non précisée dans l\'article : à vérifier sur la fiche de paie.' }));
  return { lignes: l };
}

// ---- 47. Intervention pendant une astreinte (accord art. 5.1.6.2 p.63)
export function interventionAstreinte({ statut = 'employe', heures = 0 }) {
  const h = Math.max(0, heures), f = x => String(Math.round(x * 100) / 100).replace('.', ',');
  if (statut === 'employe') return { lignes: [L('accord', 'Temps rémunéré (trajet + intervention)', `${f(h)} h payées comme du travail`, { brut: h, note: 'Toute intervention physique ouvre aussi droit au remboursement des frais de déplacement.' })] };
  const primes = Math.floor(h / 4 + 1e-9), reste = Math.round((h - primes * 4) * 100) / 100;
  return { lignes: [L('accord', 'Primes forfaitaires (un demi taux journalier par tranche de 4 h)', `${primes} prime(s)`, { brut: primes }),
    L('accord', 'Durée reportée (moins de 4 h)', `${f(reste)} h reportées, notées sur le document de contrôle`, { brut: reste })] };
}

// ---- 48. Alimentation annuelle du CET (accord art. 5.3 p.84-85)
export function alimentationCET({ statut = 'employe', cp5e = 0, anciennete = 0, fractionnement = 0, rtt = 0, age = 0, solde = 0 }) {
  const c5 = Math.min(Math.max(0, cp5e), 6), rt = statut === 'employe' ? 0 : Math.min(Math.max(0, rtt), 10);
  const eligible = c5 + Math.max(0, anciennete) + Math.max(0, fractionnement) + rt;
  const annuel = Math.min(12, eligible);
  const sans = age >= 50, reste = sans ? null : Math.max(0, 40 - Math.max(0, solde));
  const possible = sans ? annuel : Math.min(annuel, reste);
  const l = [L('accord', 'Jours que vous pouvez verser cette année (maximum 12 jours ouvrables)', `${possible} jour(s) ouvrable(s)`, { brut: possible, note: `Jours éligibles : ${eligible} (5e semaine ${c5} sur 6 maximum${statut === 'employe' ? '' : `, RTT ${rt} sur 10 maximum`}).` }),
    L('accord', 'Plafond du compte', sans ? 'Supprimé à partir de 50 ans' : `40 jours ouvrables, reste ${reste} jour(s)`, { brut: sans ? null : reste })];
  if (statut === 'employe' && rtt > 0) l.push(L('accord', 'RTT', 'Les RTT ne sont prévus que pour la maîtrise et les cadres', { brut: 0 }));
  return { lignes: l };
}

// ---- 49. Heures de délégation d'un titulaire du CSE d'établissement (accord titre 7 art. 1 p.133 ; Code du travail R2314-1)
const DELEG_ACCORD = [[1, 49, 15], [50, 74, 23], [75, 99, 24], [100, 199, 26], [200, 1499, 27], [1500, 1749, 31]];
const DELEG_LEGAL = [[11, 49, 10], [50, 74, 18], [75, 99, 19], [100, 199, 21], [200, 499, 22], [500, 1499, 24], [1500, 1749, 26]];
export function heuresDelegation({ effectif = 0 }) {
  const n = Math.floor(effectif), cherche = t => (t.find(([a, b]) => n >= a && n <= b) || [])[2];
  const acc = cherche(DELEG_ACCORD), leg = cherche(DELEG_LEGAL);
  if (!(n >= 1) || acc == null) return { lignes: [], erreur: n > 1749 ? 'Au-delà de 1 749 salariés, le tableau de l\'accord ne donne pas de valeur : information à compléter.' : 'Indiquer l\'effectif de l\'établissement.' };
  const l = [L('accord', 'Heures de délégation par mois et par titulaire (accord)', `${acc} heures`, { brut: acc })];
  l.push(leg != null ? L('code', 'Tableau légal du Code du travail (R2314-1)', `${leg} heures`, { brut: leg, note: acc > leg ? `L'accord donne ${acc - leg} heure(s) de plus par mois.` : undefined }) : L('code', 'Tableau légal', 'Pas de CSE obligatoire en dessous de 11 salariés', { brut: null }));
  return { lignes: l };
}

// ---- 50. Temps compté pour une réunion nationale (accord droit syndical titre 1 art. 3.4 p.9)
export function tempsReunionNationale({ type = 'csec', heures = 0 }) {
  const forfait = type === 'negociation' ? 4 : 7, h = Math.max(0, heures);
  const compte = Math.max(forfait, h);
  return { lignes: [L('accord', `Temps compté pour la journée (${type === 'negociation' ? 'négociation' : 'CSE central ou commission'})`, `${compte} heures`, { brut: compte, note: h > forfait ? `La réunion a dépassé le forfait de ${forfait} h : le temps réel est rémunéré comme du travail effectif.` : `Forfait de ${forfait} heures pour la journée, quels que soient le nombre de réunions, les pauses et la base du contrat.` })] };
}

// ---- 51. Crédit d'heures spécifique de l'organisation syndicale (accord droit syndical titre 3 art. 1.2 p.15-16)
export function creditHeuresOS({ organisation = 'CGT', heuresPrises = 0 }) {
  const c = { CGT: 90, CFDT: 80, FO: 63, UNSA: 49, SNEC: 21 }[organisation] ?? 0, reste = c - Math.max(0, heuresPrises);
  return { lignes: [L('accord', `Crédit d'heures annuel de l'organisation (${organisation})`, `${c} heures par an`, { brut: c }),
    L('accord', 'Heures restantes cette année', `${reste} heures`, { brut: reste, note: reste < 0 ? 'Le crédit ne peut pas être dépassé.' : 'Les heures passées aux réunions de négociation à l\'initiative de la direction ne sont pas imputées sur ce crédit.' })] };
}

// ---- 52. Classification, grilles de salaires 2026 (accord de substitution art. 2.1 ; NAO 2026 partie 1 et 3). Valeurs relevées sur les images des pages.
export const GRILLE_EMPLOYES = {   // taux horaire de base (sans pauses), identique pour les pauses à 5 % et à 6,67 %
  mars:    { '1B': 12.104, '2A': 12.020, '2B': 12.239, '2C': 12.239, '3A': 12.020, '3B': 12.343, '3C': 12.716, '4A': 12.701, '4B': 13.881, '4C': 14.169 },
  juillet: { '1B': 12.165, '2A': 12.020, '2B': 12.300, '2C': 12.300, '3A': 12.020, '3B': 12.405, '3C': 12.779, '4A': 12.701, '4B': 13.951, '4C': 14.240 },
};
export const SMMG_36H = {          // « SMMG » de la NAO (36 h, pause à 6,67 %) : sert à contrôler la transcription des taux
  mars:    { '1B': 1895.54, '2A': 1882.36, '2B': 1916.67, '2C': 1916.67, '3A': 1882.36, '3B': 1932.92, '3C': 1991.30, '4A': 1989.00, '4B': 2173.92, '4C': 2218.97 },
  juillet: { '1B': 1905.01, '2A': 1882.36, '2B': 1926.25, '2C': 1926.25, '3A': 1882.36, '3B': 1942.62, '3C': 2001.26, '4A': 1989.00, '4B': 2184.73, '4C': 2230.06 },
};
export const MINIMA_ENCADREMENT = {  // forfaits mensuels bruts (maîtrise : 43 h 25 par semaine ; cadres : 216 ou 211 jours par an)
  mars: { '5': 2525, '5+': 2566, '6': 2627, '6+': 2679, '7': 3228, '7+': 3280, '8': 4150, '8+': 4309 },
  mai:  { '5': 2531, '5+': 2572, '6': 2633, '6+': 2685, '7': 3235, '7+': 3287, '8': 4159, '8+': 4318 },
};
const eur2 = x => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',') + ' €';

export function periodeAccueil({ niveau = 1, promotion = false }) {
  const n = Math.min(4, Math.max(1, Math.round(niveau))), max = { 1: 3, 2: 6, 3: 12, 4: 18 }[n];
  const promo = promotion && n >= 3 ? { 3: 6, 4: 9 }[n] : null;
  const l = [L('accord', `Période d'accueil maximale, niveau ${n}`, `${max} mois`, { brut: max, note: 'Période d\'essai éventuelle comprise. C\'est une durée maximale : elle peut être réduite selon la situation, sans automatisme.' })];
  if (promotion) l.push(promo ? L('accord', 'En cas de promotion interne', `${promo} mois`, { brut: promo }) : L('accord', 'En cas de promotion interne', 'Pas de durée réduite écrite pour ce niveau', { brut: null, note: 'L\'accord ne fixe une durée réduite que pour les niveaux 3 et 4 (6 et 9 mois).' }));
  return { lignes: l };
}

export function augmentationPromotion({ salaire = 0, type = 'niveau' }) {
  const taux = type === 'statut' ? 3 : 2.5, mini = r2(salaire * taux / 100);
  const l = [L('accord', `Augmentation minimale (changement de ${type === 'statut' ? 'statut' : 'niveau'})`, `au moins ${String(taux).replace('.', ',')} %`, { brut: taux })];
  if (salaire > 0) l.push(L('accord', 'Soit au minimum', `${eur2(mini)} de plus par mois, pour un salaire de base de ${eur2(salaire)} : ${eur2(r2(salaire + mini))} au moins`, { brut: mini, note: 'Le salaire doit aussi atteindre le minimum de la grille du nouveau niveau.' }));
  return { lignes: l };
}

export function echelonC({ niveau = 3, anciennete = 0, validation = false, transmission = false, cqp = false, salaire = 0 }) {
  const n34 = niveau === 3 || niveau === 4, validee = validation || (n34 && cqp);
  const c = [['Ancienneté d\'au moins 8 ans dans le niveau', anciennete >= 8], ['Compétence validée (entretien managérial et RH)' + (n34 ? ', ou CQP, titre équivalent (VAE) ou fonction de tuteur' : ''), validee], ['Capacité à transmettre ses savoirs (accompagnement de nouveaux embauchés, référent formation)', transmission]];
  const ok = c.every(x => x[1]);
  const l = c.map(([t, v]) => L('accord', t, v ? 'Oui' : 'Non', { brut: v }));
  l.push(L('accord', 'Accès à l\'échelon C', ok ? 'Oui, les trois conditions sont réunies' : 'Pas encore', { brut: ok, note: n34 && cqp && !transmission ? 'Pour les niveaux 3 et 4, l\'accord dit que la validation peut résulter d\'un CQP ou de la fonction de tuteur ; il ne dit pas clairement si cela remplace aussi la condition de transmission : à vérifier.' : undefined }));
  if (ok && salaire > 0) l.push(L('accord', 'Revalorisation d\'au moins 2 %', `au moins ${eur2(r2(salaire * 0.02))} de plus par mois`, { brut: r2(salaire * 0.02), note: 'Même si le salaire est déjà égal ou supérieur au minimum du nouvel échelon ; distincte des augmentations générales.' }));
  return { lignes: l };
}

export function echelon20ans({ echelon = '3B', dateEntree = '' }) {
  if (!dateEntree) return { lignes: [], erreur: 'Renseigner la date d\'entrée dans le Groupe Carrefour.' };
  const [y, m, d] = dateEntree.split('-').map(Number);
  const anniv = new Date(Date.UTC(y + 20, m - 1, d)), passage = new Date(Date.UTC(y + 20, m, 1));          // le mois suivant la date anniversaire
  const debut = new Date(Date.UTC(2026, 6, 1)), effectif = passage < debut ? debut : passage;
  const f = dt => `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
  const cible = echelon === '4B' ? '4C' : '3C';
  const l = [L('nao', `Vos 20 ans d'ancienneté dans le Groupe`, f(anniv), { brut: anniv.getTime() }),
    L('nao', `Passage automatique à l'échelon ${cible}`, `le mois suivant, soit le ${f(effectif)}`, { brut: effectif.getTime(), note: passage < debut ? 'Le dispositif s\'applique à partir du 1er juillet 2026. Le texte ne dit pas ce qui se passe pour ceux qui avaient déjà 20 ans avant cette date : à vérifier auprès de la direction.' : undefined }),
    L('nao', 'Revalorisation de 2 % de l\'échelon C', 'Non cumulée avec ce passage automatique', { brut: 0 })];
  return { lignes: l };
}

export function salaireMinimumEmploye({ echelon = '3B', grille = 'juillet', heures = 36 }) {
  const t = GRILLE_EMPLOYES[grille]?.[echelon];
  if (!t) return { lignes: [], erreur: 'Choisir un niveau et un échelon.' };
  const mensuel = r2(t * heures * 4.35);
  const l = [L('nao', `Taux horaire minimum (sans pauses), ${echelon}, grille de ${grille === 'mars' ? 'mars' : 'juillet'} 2026`, `${String(t.toFixed(3)).replace('.', ',')} €`, { brut: t }),
    L('nao', `Salaire de base mensuel minimum pour ${String(heures).replace('.', ',')} h par semaine`, eur2(mensuel), { brut: mensuel, note: 'Calcul : taux horaire × heures de présence par semaine × 4,35, comme sur les fiches de paie (pauses comprises). Les premiers mois d\'un niveau (A) correspondent à la période d\'accueil.' })];
  if (heures === 36 && SMMG_36H[grille]?.[echelon]) l.push(L('nao', 'Pour 36 h : minimum garanti de la grille (« SMMG »)', eur2(SMMG_36H[grille][echelon]), { brut: SMMG_36H[grille][echelon] }));
  return { lignes: l };
}

export function minimumEncadrement({ echelon = '5', grille = 'mai' }) {
  const v = MINIMA_ENCADREMENT[grille]?.[echelon];
  if (!v) return { lignes: [], erreur: 'Choisir un niveau.' };
  const maitrise = echelon.startsWith('5') || echelon.startsWith('6');
  return { lignes: [L('nao', `Minimum mensuel brut, niveau ${echelon.replace('+', '')}${echelon.endsWith('+') ? ' (après 3 ans dans le niveau)' : ''}, grille ${grille === 'mars' ? 'de mars (rétroactive au 1er janvier 2026)' : 'de mai 2026'}`, `${v.toLocaleString('fr-FR')} €`, { brut: v, note: maitrise ? 'Forfait pour 43 h 25 par semaine.' : 'Forfait pour 216 jours ou 211 jours par an.' })] };
}

export function augmentationGarantie04({ echelon = '3B', grille = 'mars', salaire = 0, heures = 36 }) {
  const t = GRILLE_EMPLOYES[grille]?.[echelon];
  if (['1A', '2A', '3A'].includes(echelon) || !t) return { lignes: [L('nao', 'Garantie de 0,4 %', 'Pas pour les niveaux 1A, 2A et 3A', { brut: 0 })] };
  if (!(salaire > 0)) return { lignes: [], erreur: 'Renseigner le salaire de base mensuel brut avant l\'augmentation.' };
  const minimum = r2(t * heures * 4.35), grilleHausse = Math.max(0, r2(minimum - salaire)), garantie = r2(salaire * 0.004), retenue = Math.max(grilleHausse, garantie);
  return { lignes: [
    L('nao', `Minimum de la grille (${grille === 'mars' ? 'mars' : 'juillet'} 2026, ${echelon}, ${String(heures).replace('.', ',')} h)`, eur2(minimum), { brut: minimum }),
    L('nao', 'Augmentation due à la grille (rattrapage du minimum)', eur2(grilleHausse), { brut: grilleHausse }),
    L('nao', 'Garantie de 0,4 % du salaire de base', eur2(garantie), { brut: garantie, note: 'La garantie inclut l\'augmentation de la grille : on ne cumule pas les deux, on retient la plus élevée.' }),
    L('nao', 'Augmentation retenue', `${eur2(retenue)} : nouveau salaire de base ${eur2(r2(salaire + retenue))}`, { fort: true, brut: retenue }),
  ] };
}

export function augmentationGarantie1pct({ salaire = 0 }) {
  const a = r2(salaire * 0.008), b = r2(salaire * 0.002);
  return { lignes: [
    L('nao', 'Mars 2026 (rétroactif au 1er janvier) : 0,8 %', salaire > 0 ? `+ ${eur2(a)} par mois` : '0,8 % du salaire de base', { brut: a }),
    L('nao', 'Mai 2026 : 0,2 %', salaire > 0 ? `+ ${eur2(b)} par mois` : '0,2 % du salaire de base', { brut: b }),
    L('nao', 'Total garanti : 1 %', salaire > 0 ? `${eur2(r2(a + b))} par mois, soit un salaire de base de ${eur2(r2(salaire + a + b))} environ` : '1 %', { brut: r2(a + b), note: 'Non cumulable avec l\'augmentation due à la revalorisation des minima (art. 1-3 de la NAO). Les deux pourcentages sont additionnés ici.' }),
  ] };
}

export function bonusRemplacement({ cibleAbsent = 0, cibleRemplacant = 0, salaireAnnuel = 0, mois = 0 }) {
  const pct = Math.max(0, cibleAbsent - cibleRemplacant), bonus = r2(salaireAnnuel * pct / 100 * Math.max(0, mois) / 12);
  const l = [L('accord', 'Pourcentage de bonus cible du remplacement', `${String(pct).replace('.', ',')} % (${cibleAbsent} % de l'absent moins ${cibleRemplacant} % du remplaçant)`, { brut: pct })];
  if (salaireAnnuel > 0 && mois > 0) l.push(L('accord', `Bonus exceptionnel pour ${mois} mois, si les objectifs sont atteints à 100 %`, eur2(bonus), { fort: true, brut: bonus, note: mois <= 2 ? 'Le bonus n\'est dû que pour un remplacement de plus de 2 mois consécutifs.' : 'Montant cible : le bonus réel dépend des résultats par rapport aux objectifs, et est proratisé selon la période.' }));
  return { lignes: l };
}

// ---- 53. Intéressement : grilles 2025 et grilles de repli (accord du 30 juin 2025, art. 5.5 p.8-11 et art. 5.6 p.12-13). Valeurs relevées sur les images des pages.
export const GRILLES_2025 = { ...GRILLES_2026, demarque: [[0.40, 150], [0.35, 125], [0.30, 100], [0.25, 80], [0.20, 60], [0.15, 50], [0.10, 40], [0.05, 30], [-0.05, 20], [-0.15, 10]] };
export const GRILLES_REPLI = {
  ca: [[110, 100], [109, 90], [108, 80], [107, 70], [106, 60], [105, 50], [104, 40], [103, 35], [102, 30], [101, 25], [100, 20]],
  mdc: [[40, 100], [39, 90], [38, 80], [37, 70], [36, 60], [35, 50], [34, 40], [33, 30]],
  demarque: [[0.60, 150], [0.50, 100], [0.40, 80], [0.30, 60], [0.20, 50], [0.15, 40], [0.10, 30], [0.05, 20], [0, 10]],
  nps: [[61, 150], [58, 100], [55, 75], [52, 50], [49, 25], [45, 0]],
};
export function interessementAccord({ grille = '2025', caX = 0, mdcX = 0, demarqueEcart = 0, nps = 0, presenceMois = 12, ratioTempsPartiel = 1 }) {
  const G = grille === 'repli' ? GRILLES_REPLI : GRILLES_2025;
  const c1a = palier(caX, G.ca), c1b = palier(mdcX, G.mdc), c1 = Math.max(c1a, c1b), c2 = palier(demarqueEcart, G.demarque), c3 = palier(nps, G.nps);
  const total = c1 + c2 + c3, prorata = r2(total * (presenceMois / 12) * ratioTempsPartiel);
  return { lignes: [
    L('accord', 'Critère 1 (meilleur des deux indicateurs)', `${c1} € (CA : ${c1a} € ; MDC : ${c1b} €)`, { brut: c1 }),
    L('accord', 'Critère 2 : démarque', `${c2} €`, { brut: c2 }),
    L('accord', 'Critère 3 : NPS', `${c3} €`, { brut: c3 }),
    L('accord', `Total des grilles (${grille === 'repli' ? 'grilles de repli' : 'grilles 2025'}), avant seuil, prorata et plafond`, `${total} € sur 400 € au maximum`, { brut: total }),
    L('accord', 'Estimation au prorata de la présence et du temps de travail', eur2(prorata), { brut: prorata, fort: true, note: 'Estimation : seul le total des grilles est proratisé. Le seuil de déclenchement (0,2 % de résultat opérationnel) et le plafond légal ne sont pas vérifiés ici.' }),
  ] };
}

const fdate = d => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const lireDate = s => { const [y, m, d] = String(s).split('-').map(Number); return y ? new Date(Date.UTC(y, m - 1, d)) : null; };

export function blocageEpargne({ dateVersement = '' }) {
  const d = lireDate(dateVersement);
  if (!d) return { lignes: [], erreur: 'Renseigner la date de versement.' };
  const fin = new Date(Date.UTC(d.getUTCFullYear() + 5, 5, 1));
  return { lignes: [
    L('accord', 'Départ du délai de 5 ans', `1er juin ${d.getUTCFullYear()} (1er jour du 6e mois de l'année d'acquisition)`, { brut: Date.UTC(d.getUTCFullYear(), 5, 1) }),
    L('accord', 'Argent disponible à partir du', fdate(fin), { fort: true, brut: fin.getTime(), note: 'Sauf cas de déblocage anticipé prévus par le règlement (mariage, naissance, rupture du contrat, résidence principale…). Pour l\'intéressement ou la participation, c\'est l\'année où les sommes sont placées.' }),
  ] };
}

export function delaiChoixEpargne({ dateNotification = '' }) {
  const d = lireDate(dateNotification);
  if (!d) return { lignes: [], erreur: 'Renseigner la date de la notification.' };
  const info = new Date(d.getTime() + 4 * 864e5), limite = new Date(info.getTime() + 15 * 864e5);
  return { lignes: [
    L('accord', 'Vous êtes présumé informé le', `${fdate(info)} (4 jours calendaires après la notification)`, { brut: info.getTime() }),
    L('accord', 'Dernier jour pour choisir (versement ou placement)', fdate(limite), { fort: true, brut: limite.getTime(), note: 'Sans choix avant cette date, la somme est placée par défaut : voir la fiche « Je ne fais aucun choix ».' }),
  ] };
}

export function datePaiementInteressement({ cloture = '' }) {
  const d = lireDate(cloture);
  if (!d) return { lignes: [], erreur: 'Renseigner la date de clôture de l\'exercice.' };
  const limite = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 6, 0));
  return { lignes: [L('accord', 'Date limite de versement', fdate(limite), { fort: true, brut: limite.getTime(), note: 'Dernier jour du 5e mois suivant la clôture. Au-delà : intérêts de retard à la charge de l\'entreprise.' })] };
}

export function plafondVersementVolontaire({ remuneration = 0 }) {
  if (!(remuneration > 0)) return { lignes: [], erreur: 'Renseigner la rémunération annuelle brute.' };
  return { lignes: [L('accord', 'Maximum de vos versements volontaires par an (tous plans)', eur2(r2(remuneration / 4)), { fort: true, brut: r2(remuneration / 4), note: 'Un quart de la rémunération annuelle brute. L\'intéressement et la participation placés ne comptent pas dans ce plafond.' })] };
}

// ---- 54. Budgets 2026 par magasin (avenant intéressement 2026, annexe 2, p.6 : copie pour signature, non signée)
export const BUDGETS_2026 = {
  'Albi': [-2.32, 29225.3], 'Amilly': [-2.41, 16857.9], 'Avignon - Cap Sud': [-2.75, 20073.6], 'La Ricamarie': [-3.58, 32006.6], 'Laloubère': [-2.45, 22829.3],
  'Lanester': [-2.70, 26860.8], 'Lons-le-Saunier': [-3.74, 25446.5], 'St Martin des Champs': [-2.38, 24504.7], 'Vals-près-le-Puy': [-2.81, 36510.5], 'Villefranche-sur-Saône': [-2.06, 61573.2],
};
export function budgetMagasin2026({ magasin = 'Albi' }) {
  const b = BUDGETS_2026[magasin];
  if (!b) return { lignes: [], erreur: 'Choisir un magasin.' };
  const fk = x => x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return { lignes: [
    L('accord', `Budget 2026 du taux de démarque totale, ${magasin}`, `${String(b[0]).replace('.', ',')} %`, { brut: b[0] }),
    L('accord', 'Budget 2026 du chiffre d\'affaires HT hors essence, drive inclus', `${fk(b[1])} k€`, { brut: b[1], note: 'Objectif de CA : le budget « majoré de 3 % » (avenant, art. 1) : ' + fk(b[1] * 1.03) + ' k€. Attention : la grille parle de « réalisé ÷ budget » avec 103 % pour le maximum : si la majoration de 3 % compte deux fois, c\'est à vérifier auprès de la direction.' }),
  ] };
}

export const CALCULS = { budgetMagasin2026, interessementAccord, blocageEpargne, delaiChoixEpargne, datePaiementInteressement, plafondVersementVolontaire, periodeAccueil, augmentationPromotion, echelonC, echelon20ans, salaireMinimumEmploye, minimumEncadrement, augmentationGarantie04, augmentationGarantie1pct, bonusRemplacement, heuresDelegation, tempsReunionNationale, creditHeuresOS, primeAstreinte, interventionAstreinte, alimentationCET, ticketsRestaurant, entretienTenue, fraisTransport, pauses, primeFermeture, travailleurDeNuit, reposNuit, dimanche, ferieTravaille, participationRepartition, heuresSup, annualisation, heuresComplementaires, modulationTempsPartiel, allocationRetraite, periodeEssai, congesAcquis, fractionnement, congeAnciennete, indemniteConges, grossesse, maternite, paternite, congeParentalAnciennete, delaiProtection, capitalDeces, demenagement, enfantMalade, retraiteProgressive, primeEtArret, journeeSolidarite, congesPointage, preavis, indemniteLicenciement, primeAnnuelle, interessement2026, abondement, majorationNuit, arretMaladie, evenementFamilial, remiseAchats };

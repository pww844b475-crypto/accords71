// Simulation de fiche de paie. Fonctions pures, aucune donnée enregistrée ni envoyée.
// Les taux viennent de data/taux-paie.json (avec date de contrôle et statut de chaque taux).
// Méthode relevée et recalculée au centime sur deux fiches de paie 2026 : voir tests/paie.test.js.
export const r2 = x => Math.round((x + Number.EPSILON) * 100 + 1e-9) / 100;
const r3 = x => Math.round((x + Number.EPSILON) * 1000 + 1e-9) / 1000;
const SEMAINES_PAR_MOIS = 4.35;   // relevé sur les fiches de paie : 36 h × 4,35 = 156,60 h par mois

export const tauxParId = t => Object.fromEntries(t.taux.map(x => [x.id, x]));
export const majParId = t => Object.fromEntries(t.majorations.map(x => [x.id, x.taux / 100]));


/**
 * Répartition automatique des heures en plus du contrat, semaine par semaine (heures de présence).
 * Règle relevée sur une fiche de paie à 24 h : au-delà du contrat jusqu'à 35 h = heures complémentaires
 * (le premier dixième du contrat à 10 %, le reste à 25 %) ; au-delà de 35 h = heures supplémentaires
 * (25 % les 8 premières, 50 % ensuite). Contrat de 35 h ou plus : tout est supplémentaire.
 */
export function repartirHeures(heuresSemaine, semaines) {
  const C = heuresSemaine || 0, plafondHC = Math.max(0, 35 - C);
  const t = { total: 0, hc10: 0, hc25: 0, hs25: 0, hs50: 0 };
  for (const x of semaines || []) {
    const e = Math.max(0, +x || 0); if (!e) continue;
    t.total += e;
    const hc = Math.min(e, plafondHC), hs = e - hc;
    const h10 = Math.min(hc, C / 10);
    t.hc10 += h10; t.hc25 += hc - h10;
    t.hs25 += Math.min(hs, 8); t.hs50 += Math.max(0, hs - 8);
  }
  for (const k of Object.keys(t)) t[k] = r2(t[k]);
  return t;
}

/**
 * entrees : {
 *  tauxHoraire (€ de base, sans pauses), heuresSemaine (temps de présence du contrat), pausePct (5 ou 6.667, en % du travail effectif),
 *  dimanche, ferie, nuit30, nuit10 (heures de PRÉSENCE), hcBase, hc10, hc25, hs25 (heures de PRÉSENCE au-delà du contrat),
 *  autresBrut (€, + ou −, ex. congés payés), hsExoAuto (true : exonération calculée sur HC/HS ; sinon montant en hsExoMontant),
 *  tenue (€), transport (€), tickets (nombre), valeurTicket, partSalarieTicket, autresRetenues (€),
 *  pas: { actif, taux }
 * }
 */
export function simulerPaie(e, T) {
  const tx = tauxParId(T), mj = majParId(T);
  const plafond = T.plafond_mensuel_securite_sociale;
  const pct = (e.pausePct || 0) / 100;
  const eff = h => r2((h || 0) / (1 + pct));            // heures de présence -> heures de travail effectif
  const lignes = [];
  const add = (code, libelle, base, taux, montant, extra = {}) => { lignes.push({ code, libelle, base, taux, montant: r2(montant), ...extra }); return r2(montant); };

  // Salaire de base : heures effectives du mois × taux avec pauses (arrondi à 3 décimales comme sur la fiche)
  const presenceMois = r2((e.heuresSemaine || 0) * SEMAINES_PAR_MOIS);
  const hEff = eff(presenceMois);
  // Taux horaire : donné, ou déduit du salaire de base mensuel de la fiche (salaire de base ÷ heures effectives ÷ (1 + pause))
  const th = e.tauxHoraire > 0 ? e.tauxHoraire : (e.salaireBase > 0 && hEff > 0 ? r3(e.salaireBase / hEff / (1 + pct)) : 0);
  const tauxAvecPauses = r3(th * (1 + pct));
  const travail = add('travail', 'Salaire du travail effectif', hEff, th, hEff * th);
  const hPause = r2(hEff * pct);                         // heures de pause arrondies comme sur la fiche
  const pauseBase = r2(hPause * th);
  const salaireBase = r2(travail + pauseBase);
  if (pct > 0) add('pause', 'Forfait pause', hPause, th, pauseBase);

  let brutHcHs = 0;
  const ligneMaj = (code, libelle, hPresence, coef, estHcHs) => {
    const h = eff(hPresence); if (!(h > 0)) return;
    const p = r2(h * pct), tm = r3(th * coef);   // taux majoré arrondi à 3 décimales comme sur la fiche
    let m = add(code, libelle, h, tm, h * tm);
    if (pct > 0) m += add(code + '_pause', libelle + ' : pause', p, tm, p * tm);
    if (estHcHs) brutHcHs += m;
  };
  ligneMaj('dim', 'Majoration dimanche', e.dimanche, mj.dimanche, false);
  ligneMaj('ferie', 'Majoration jour férié', e.ferie, mj.ferie, false);
  ligneMaj('nuit30', 'Majoration nuit 22 h-5 h', e.nuit30, mj.nuit_22_5, false);
  ligneMaj('nuit10', 'Majoration nuit 21 h-22 h / 5 h-6 h', e.nuit10, mj.nuit_21_22, false);
  // Heures en plus du contrat réparties semaine par semaine (entrée e.semainesEnPlus) : remplacent la saisie manuelle
  if (Array.isArray(e.semainesEnPlus)) { const rep = repartirHeures(e.heuresSemaine, e.semainesEnPlus); e = { ...e, hcBase: rep.total, hc10: rep.hc10, hc25: rep.hc25, hs25: rep.hs25, hs50: rep.hs50 }; }
  // Heures au-delà du contrat : base à 100 % puis majorations
  const hcb = eff(e.hcBase);
  if (hcb > 0) { let m = add('hcbase', 'Heures au-delà du contrat (100 %)', hcb, th, hcb * th); if (pct > 0) m += add('hcbase_pause', 'Heures au-delà du contrat : pause', r2(hcb * pct), th, r2(hcb * pct) * th); brutHcHs += m; }
  ligneMaj('hc10', 'Majoration heures complémentaires 10 %', e.hc10, mj.hc_10, true);
  ligneMaj('hc25', 'Majoration heures complémentaires 25 %', e.hc25, mj.hc_25, true);
  ligneMaj('hs25', 'Majoration heures supplémentaires 25 %', e.hs25, mj.hs_25, true);
  ligneMaj('hs50', 'Majoration heures supplémentaires 50 %', e.hs50, mj.hs_50, true);
  // Congés payés pris : retenue de l'absence (salaire de base ÷ 26 par jour) puis indemnité = la plus favorable des deux règles
  // (maintien du salaire, ou 1/10 de la rémunération brute de la période de référence du 1er juin au 31 mai, soit référence ÷ 300 par jour)
  let cp = null;
  if (e.cpJours > 0) {
    const base = e.salaireBase > 0 ? e.salaireBase : salaireBase;
    const maintien = r3(base / 26);
    const dixieme = e.cpRefBrute > 0 ? r3(e.cpRefBrute / 300) : 0;
    const parJour = e.cpIndemniteJour > 0 ? e.cpIndemniteJour : Math.max(maintien, dixieme);
    const regle = e.cpIndemniteJour > 0 ? 'saisie' : dixieme > maintien ? 'dixieme' : 'maintien';
    const ret = add('cp_abs', 'Absence congés payés', e.cpJours, maintien, -e.cpJours * maintien);
    const ind = add('cp_ind', 'Indemnité de congés payés', e.cpJours, parJour, e.cpJours * parJour);
    cp = { jours: e.cpJours, maintienJour: maintien, dixiemeJour: dixieme, parJour, regle, retenue: -ret, indemnite: ind, solde: r2(ind + ret), referenceConnue: !!(e.cpRefBrute > 0 || e.cpIndemniteJour > 0) };
  }
  if (e.autresBrut) add('autres', 'Autres éléments de salaire (congés, primes…)', null, null, e.autresBrut);

  const brut = r2(lignes.reduce((s, l) => s + l.montant, 0));

  // Exonération des heures supplémentaires / complémentaires
  const hsExo = e.hsExoMontant != null && e.hsExoMontant !== '' ? r2(+e.hsExoMontant) : (e.hsExoAuto ? r2(brutHcHs) : 0);
  const redHs = r2(hsExo * tx.reduction_hs.taux / 100);

  // Cotisations salariales
  const cot = [];
  const c = (code, libelle, base, taux, montant) => { cot.push({ code, libelle, base: r2(base), taux, montant: r2(montant) }); return r2(montant); };
  const prevSal = c('prev', 'Prévoyance incapacité invalidité décès', brut, tx.prevoyance_sal.taux, brut * tx.prevoyance_sal.taux / 100);
  const santeSal = c('sante', 'Complémentaire santé obligatoire (forfait)', 0, null, tx.sante_forfait_sal.montant);
  const baseT1 = Math.min(brut, plafond);
  const vp = c('vp', 'Sécurité sociale plafonnée', baseT1, tx.vieillesse_plaf.taux, baseT1 * tx.vieillesse_plaf.taux / 100);
  const vd = c('vd', 'Sécurité sociale déplafonnée', brut, tx.vieillesse_deplaf.taux, brut * tx.vieillesse_deplaf.taux / 100);
  const rc = c('rc', 'Retraite complémentaire tranche 1', baseT1, tx.retraite_compl_t1.taux, baseT1 * tx.retraite_compl_t1.taux / 100)
    + c('ceg', 'CEG tranche 1 (affichée avec la retraite complémentaire)', baseT1, tx.ceg_t1.taux, baseT1 * tx.ceg_t1.taux / 100);
  const ab = tx.abattement_csg.taux / 100;
  const prevEmp = r2(brut * tx.prevoyance_emp.taux / 100), santeEmp = tx.sante_forfait_emp.montant;
  const baseCsg = r2(ab * (brut - hsExo) + prevEmp + santeEmp);
  const csgD = c('csgd', "CSG déductible de l'impôt", baseCsg, tx.csg_deductible.taux, baseCsg * tx.csg_deductible.taux / 100);
  const csgN = c('csgn', 'CSG/CRDS non déductibles', baseCsg, tx.csg_crds_non_deductible.taux, baseCsg * tx.csg_crds_non_deductible.taux / 100);
  let csgHs = 0;
  if (hsExo > 0) csgHs = c('csghs', 'CSG/CRDS sur revenus non imposables (heures exonérées)', ab * hsExo, tx.csg_crds_hs.taux, ab * hsExo * tx.csg_crds_hs.taux / 100);
  const reduc = redHs > 0 ? c('redhs', 'Exonération de cotisations (heures supplémentaires/complémentaires)', hsExo, -tx.reduction_hs.taux, -redHs) : 0;
  const totalCot = r2(prevSal + santeSal + vp + vd + rc + csgD + csgN + csgHs + reduc);

  const netSocial = r2(brut - totalCot);
  const indemnites = r2((e.tenue || 0) + (e.transport || 0));
  const part = e.partSalarieTicket != null ? e.partSalarieTicket : 0;
  const ticketsSal = r2((e.tickets || 0) * part);
  const autresRet = r2(e.autresRetenues || 0);
  const netAvantImpot = r2(netSocial + indemnites - ticketsSal - autresRet);

  // Prélèvement à la source (facultatif) : base = brut + part employeur santé − cotisations déductibles − heures exonérées
  const deductibles = r2(prevSal + santeSal + vp + vd + rc + csgD);
  const baseImposable = r2(Math.max(0, brut + santeEmp - deductibles - hsExo));
  const pas = e.pas && e.pas.actif ? r2(baseImposable * (e.pas.taux || 0) / 100) : 0;
  const netAPayer = r2(netAvantImpot - pas);

  return {
    lignes, brut, cotisations: cot, totalCotisations: totalCot, netSocial, indemnitesNonSoumises: indemnites,
    ticketsPartSalarie: ticketsSal, autresRetenues: autresRet, netAvantImpot, baseImposable, pas, netAPayer,
    cp,
    details: { hEff, tauxHoraire: th, tauxAvecPauses, salaireBase, hsExo, baseCsg, plafond },
  };
}

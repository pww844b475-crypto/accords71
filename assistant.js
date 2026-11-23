// Assistant convivial : pose les questions une par une dans une fenêtre, avec retour en arrière,
// écran de départ et récapitulatif modifiable. Rien n'est enregistré ni envoyé.
const EMOJIS = [
  [/salaire|brut|rémunération|prime|montant|€/i, '💶'], [/ancienneté|date|mois|année|jour/i, '📅'], [/âge/i, '🎂'], [/enfant|naissance|famille|grossesse/i, '👶'],
  [/heure|horaire|semaine|durée/i, '⏱️'], [/statut|poste|employé|cadre/i, '🧑‍💼'], [/magasin|drive|surface/i, '🏬'], [/accident|maladie|arrêt|hospital/i, '🩺'],
  [/retraite|trimestre/i, '🌅'], [/nuit/i, '🌙'], [/dimanche|férié/i, '📆'], [/km|distance|trajet|transport/i, '🚗'],
];
export const emojiPour = texte => (EMOJIS.find(([r]) => r.test(texte || '')) || [, '💬'])[1];

export function lancerAssistant({ h, remplir, titre = 'Quelques questions', emoji = '✨', intro, etapes, valeurs = {}, onFini, onAnnule, commencerAuRecap = false }) {
  const v = { ...valeurs };
  const txt = x => (typeof x === 'function' ? x(v) : x);
  const visible = e => !e.si || e.si(v);
  const visibles = () => etapes.filter(visible);
  const fond = h('div', { class: 'as-fond', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre });
  let pile = [], depuisRecap = false, fini = false;

  const fermer = () => { fond.remove(); document.removeEventListener('keydown', touche); document.body.classList.remove('modal-ouvert'); };
  const touche = e => { if (e.key === 'Escape') { fermer(); if (!fini) onAnnule?.(); } };
  document.addEventListener('keydown', touche);

  const suivantApres = i => { for (let j = i + 1; j < etapes.length; j++) if (visible(etapes[j])) return j; return -1; };
  const premier = () => suivantApres(-1);
  const enregistrer = (e, val) => { v[e.id] = val; };
  const avancer = i => {
    if (depuisRecap) { depuisRecap = false; recap(); return; }
    const j = suivantApres(i);
    if (j === -1) recap(); else { pile.push(i); question(j); }
  };
  const reculer = i => {
    if (depuisRecap) { depuisRecap = false; recap(); return; }
    if (pile.length) question(pile.pop()); else if (intro) ecranIntro(); else { fermer(); onAnnule?.(); }
  };
  const lire = (e, ctl) => {
    if (e.type === 'nombre') return parseFloat(String(ctl.value).replace(',', '.').replace('−', '-')) || 0;
    return ctl.value;
  };
  const libelleReponse = (e, val) => {
    if (e.type === 'choix') return (e.options.find(o => o[0] === val) || [, String(val ?? '')])[1];
    if (e.type === 'ouinon') return val ? 'Oui' : 'Non';
    if (e.type === 'mois') { const [a, m] = String(val || '').split('-'); return a && m ? `${m}/${a}` : 'non renseigné'; }
    if (e.type === 'date') return val ? String(val).split('-').reverse().join('/') : 'non renseignée';
    return String(val ?? 0).replace('.', ',') + (e.unite ? ' ' + e.unite : '');
  };

  function cadre(...contenu) { remplir(fond, h('div', { class: 'as-carte' }, ...contenu)); }
  function entete(i) {
    const vis = visibles(), n = Math.max(1, vis.indexOf(etapes[i]) + 1);
    return [h('div', { class: 'as-haut' }, h('span', { class: 'as-compteur' }, `Question ${n} sur ${vis.length}`), h('button', { type: 'button', class: 'as-x', 'aria-label': 'Fermer', onclick: () => { fermer(); onAnnule?.(); } }, '✕')),
      h('div', { class: 'as-barre' }, h('div', { style: `width:${Math.round(n / vis.length * 100)}%` }))];
  }
  const bas = (retourFn, aSauter) => h('div', { class: 'as-bas' }, h('button', { type: 'button', class: 'as-sec', onclick: retourFn }, '← Retour'), aSauter || h('span'));

  function ecranIntro() {
    cadre(h('div', { class: 'as-grand-emoji' }, emoji), h('h3', { class: 'as-titre' }, titre), h('p', { class: 'as-texte' }, txt(intro)),
      h('button', { type: 'button', class: 'as-prim', onclick: () => { pile = []; const j = premier(); if (j === -1) recap(); else question(j); } }, 'C\'est parti !'),
      h('button', { type: 'button', class: 'as-sec as-large', onclick: () => { fermer(); onAnnule?.(); } }, 'Plus tard'));
  }

  function question(i) {
    const e = etapes[i]; let zone, ctl;
    const continuer = () => { enregistrer(e, lire(e, ctl)); avancer(i); };
    if (e.type === 'choix') zone = h('div', { class: 'as-choix' }, txt(e.options).map(([val, lab, em]) => h('button', { type: 'button', class: 'as-btn' + (v[e.id] === val ? ' choisi' : ''), onclick: () => { enregistrer(e, val); avancer(i); } }, em ? h('span', { class: 'as-btn-emoji' }, em) : null, h('span', {}, lab))));
    else if (e.type === 'ouinon') zone = h('div', { class: 'as-choix as-deux' }, h('button', { type: 'button', class: 'as-btn' + (v[e.id] === true ? ' choisi' : ''), onclick: () => { enregistrer(e, true); avancer(i); } }, h('span', { class: 'as-btn-emoji' }, '👍'), h('span', {}, 'Oui')),
      h('button', { type: 'button', class: 'as-btn' + (v[e.id] === false || v[e.id] == null ? ' choisi' : ''), onclick: () => { enregistrer(e, false); avancer(i); } }, h('span', { class: 'as-btn-emoji' }, '👎'), h('span', {}, 'Non')));
    else {
      const type = e.type === 'mois' ? 'month' : e.type === 'date' ? 'date' : 'text';
      const init = e.type === 'nombre' ? (v[e.id] ? String(v[e.id]).replace('.', ',') : '') : (v[e.id] ?? '');
      ctl = h('input', { type, inputmode: e.type === 'nombre' ? (e.signe ? 'text' : 'decimal') : null, autocomplete: 'off', placeholder: e.placeholder || (e.type === 'nombre' ? '0' : ''), value: init, 'aria-label': txt(e.question) });
      ctl.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); continuer(); } });
      zone = h('div', {}, h('div', { class: 'as-saisie' }, ctl, e.unite ? h('span', { class: 'as-unite' }, e.unite) : null),
        h('button', { type: 'button', class: 'as-prim', onclick: continuer }, 'Continuer →'));
    }
    const sauter = e.optionnel ? h('button', { type: 'button', class: 'as-sec', onclick: () => { enregistrer(e, e.type === 'nombre' ? 0 : ''); avancer(i); } }, 'Je ne sais pas') : null;
    cadre(...entete(i), h('div', { class: 'as-emoji' }, e.emoji || '💬'), h('h3', { class: 'as-q' }, txt(e.question)), txt(e.aide) ? h('p', { class: 'as-aide' }, txt(e.aide)) : null, zone, bas(() => reculer(i), sauter));
    if (ctl) setTimeout(() => { ctl.focus(); try { ctl.select(); } catch { /* sans effet */ } }, 80);
  }

  function recap() {
    const vis = visibles();
    cadre(h('div', { class: 'as-grand-emoji' }, '✅'), h('h3', { class: 'as-titre' }, 'C\'est tout bon ?'), h('p', { class: 'as-texte' }, 'Touchez une réponse pour la corriger.'),
      h('ul', { class: 'as-recap' }, vis.map(e => h('li', {}, h('button', { type: 'button', onclick: () => { depuisRecap = true; question(etapes.indexOf(e)); } }, h('span', { class: 'as-recap-q' }, txt(e.court || e.question).replace(/\s*\?$/, '')), h('strong', {}, libelleReponse(e, v[e.id])))))),
      h('button', { type: 'button', class: 'as-prim', onclick: () => { fini = true; fermer(); onFini(v); } }, 'Voir ma réponse ✨'),
      h('div', { class: 'as-bas' }, h('button', { type: 'button', class: 'as-sec', onclick: () => { const d = vis[vis.length - 1]; depuisRecap = false; pile = vis.slice(0, -1).map(x => etapes.indexOf(x)); question(etapes.indexOf(d)); } }, '← Retour')));
  }

  document.body.classList.add('modal-ouvert'); document.body.append(fond);
  if (commencerAuRecap) recap(); else if (intro) ecranIntro(); else { const j = premier(); if (j === -1) recap(); else question(j); }
}

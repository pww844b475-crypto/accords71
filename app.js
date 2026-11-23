import { EMPREINTE_MDP, VERSION } from './config.js';
import { CALCULS } from './moteur/calculs.js';
import { chercherFiches, chercherTexte, veutLaPaie } from './moteur/recherche.js';
import { ouvrirSimulateur } from './simulateur.js';
import { lancerAssistant, emojiPour } from './assistant.js';

const $ = s => document.querySelector(s);
const vue = $('#vue');
let FICHES = [], SYN = {}, CORPUS = null, DOCS_TITRES = {}, CATS = [], FREQ = [];
let precedent = () => accueil(); // page à laquelle « Retour » ramène
const catDe = f => CATS.find(c => c.id === f.categorie) || { nom: '', icone: '📄', couleur: '#777' };
const NIVEAU = { accord: 'Accord', convention: 'Convention', nao: 'NAO 2026', code: 'Code du travail', pratique: 'Pratique RH' };

function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat()) if (e != null) el.append(e.nodeType ? e : document.createTextNode(e));
  return el;
}
const fr = s => String(s).replace(/(\d)\.(\d)/g, '$1,$2'); // décimales à la française
const remplir = (el, ...xs) => el.replaceChildren(...xs.flat(Infinity).filter(x => x != null));
const tags = (liste = []) => h('div', {}, liste.map(t => h('span', { class: 'tag' + (t.startsWith('✓') ? ' ok' : '') }, t)));

// ---- Accès (mot de passe côté navigateur : pas une vraie sécurité) ----
async function empreinte(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
$('#formPorte').addEventListener('submit', async e => {
  e.preventDefault();
  if (await empreinte($('#mdp').value) === EMPREINTE_MDP) {
    $('#porte').hidden = true; $('#appli').hidden = false; $('#mdp').value = ''; accueil();
  } else $('#erreurMdp').hidden = false;
});

// ---- Écrans ----
function onglets(actif) {
  const nav = $('#onglets');
  nav.replaceChildren(...[{ id: 'accueil', nom: 'Accueil', icone: '🏠' }, { id: 'simu', nom: 'Estimation de ma fiche de paie', icone: '💶', couleur: '#0f8b6b' }, ...CATS].map(c => h('button', {
    type: 'button', class: 'onglet' + (c.id === actif ? ' actif' : ''), style: c.couleur ? `--c:${c.couleur}` : '',
    onclick: () => { $('#q').value = ''; c.id === 'accueil' ? accueil() : c.id === 'simu' ? pageSimulateur() : vueCategorie(c.id); window.scrollTo(0, 0); }
  }, `${c.icone} ${c.nom}`)));
  const el = nav.querySelector('.actif'); if (el) el.scrollIntoView({ inline: 'center', block: 'nearest' });
}
const carteFiche = f => { const c = catDe(f); return h('button', { class: 'fiche-btn', type: 'button', style: `--c:${c.couleur}`, onclick: () => ouvrirFiche(f) },
  h('span', { class: 'fb-icone' }, c.icone), h('span', { class: 'fb-texte' }, f.question), h('span', { class: 'fb-fleche' }, '›')); };

function pageSimulateur() {
  $('#q').value = ''; precedent = accueil; onglets('simu');
  ouvrirSimulateur({ vue, h, remplir, retour: () => { accueil(); window.scrollTo(0, 0); } });
}

function accueil() {
  $('#q').value = ''; precedent = accueil; onglets('accueil');
  const freq = FREQ.map(id => FICHES.find(f => f.id === id)).filter(Boolean);
  remplir(vue,
    h('h2', { class: 'accueil-titre' }, 'Que voulez-vous savoir ?'),
    h('p', { class: 'accueil-sous' }, 'Tapez votre question en haut, ou choisissez un sujet.'),
    h('button', { class: 'simu-banniere', type: 'button', onclick: () => { pageSimulateur(); window.scrollTo(0, 0); } }, h('span', { class: 'tuile-icone' }, '💶'), h('span', {}, h('strong', {}, 'Estimation de ma fiche de paie'), h('small', {}, 'Touchez ici, entrez vos données : brut, net, avec ou sans prélèvement à la source'))),
    h('div', { class: 'tuiles' }, CATS.map(c => h('button', { class: 'tuile', type: 'button', style: `--c:${c.couleur}`, onclick: () => { vueCategorie(c.id); window.scrollTo(0, 0); } },
      h('span', { class: 'tuile-icone' }, c.icone), h('span', { class: 'tuile-nom' }, c.nom), h('span', { class: 'tuile-desc' }, c.description),
      h('span', { class: 'tuile-nb' }, `${FICHES.filter(f => f.categorie === c.id).length} réponses`)))),
    h('h3', { class: 'section' }, '⭐ Questions fréquentes'),
    h('div', { class: 'liste' }, freq.map(carteFiche)),
    h('p', { class: 'version' }, `Version ${VERSION}`));
}

function vueCategorie(id) {
  const c = CATS.find(x => x.id === id); precedent = () => vueCategorie(id); onglets(id);
  remplir(vue,
    h('div', { class: 'cat-entete', style: `--c:${c.couleur}` }, h('span', { class: 'cat-icone' }, c.icone), h('div', {}, h('h2', {}, c.nom), h('p', {}, c.description))),
    h('div', { class: 'liste' }, FICHES.filter(f => f.categorie === id).map(carteFiche)));
}

function recherche(q) {
  if (veutLaPaie(q)) { pageSimulateur(); return; }
  const r = chercherFiches(q, FICHES, SYN);
  const liste = fs => { precedent = () => { $('#q').value = q; recherche(q); }; onglets(null); return h('div', { class: 'liste' }, fs.map(carteFiche)); };
  if (r.mode === 'direct') { precedent = accueil; ouvrirFiche(r.fiches[0]); }
  else if (r.mode === 'theme') remplir(vue, h('h2', {}, 'Qu\'est-ce que vous cherchez ?'), liste(r.fiches));
  else if (r.mode === 'fiches') remplir(vue, h('h2', {}, 'Réponses possibles'), liste(r.fiches));
  else { precedent = accueil; rechercheTexte(q); }
}

async function rechercheTexte(q) {
  remplir(vue, h('p', {}, 'Recherche dans les textes…'));
  try { if (!CORPUS) CORPUS = await (await fetch('data/corpus.json')).json(); }
  catch { remplir(vue, h('p', { class: 'erreur' }, 'Textes indisponibles hors ligne pour le moment.')); return; }
  const res = chercherTexte(q, CORPUS);
  remplir(vue, 
    h('h2', {}, 'Pas de fiche prévue pour cette question'),
    res.length ? h('p', {}, 'Passages trouvés (texte exact, aucune réponse rédigée) :') : h('p', {}, 'Aucun passage ne contient exactement ces mots.'),
    ...res.map(r => h('div', { class: 'carte' }, h('b', {}, `${r.titre}, p.${r.page}`), r.scan ? tags(['Vérifier le chiffre sur l\'image']) : null, h('div', { class: 'cite' }, r.extrait))));
}

// ---- Assistant : pose les questions une par une dans une fenêtre, puis affiche le résultat ----
const valeursParDefaut = f => Object.fromEntries((f.champs || []).map(c => [c.id, c.type === 'select' ? c.options[0][0] : c.type === 'checkbox' ? !!c.defaut : c.type === 'date' ? '' : (c.defaut ?? 0)]));
const texteReponse = (c, v) => c.type === 'select' ? (c.options.find(o => o[0] === v) || [, v])[1] : c.type === 'checkbox' ? (v ? 'Oui' : 'Non') : c.type === 'date' ? (v ? v.split('-').reverse().join('/') : 'non renseignée') : fr(v);

function assistant(f, valeurs, fini, auRecap = false) {
  const champs = (f.champs || []).filter(c => !(c.type === 'select' && c.options.length < 2));
  if (!champs.length) { fini(valeurs); return; }
  const etapes = champs.map(c => ({ id: c.id, type: c.type === 'select' ? 'choix' : c.type === 'checkbox' ? 'ouinon' : c.type === 'date' ? 'date' : 'nombre', options: c.options, question: c.question || c.label, aide: c.aide, emoji: emojiPour(c.label), unite: c.unite, si: c.si ? (v => v[c.si[0]] === c.si[1]) : undefined }));
  lancerAssistant({ h, remplir, titre: f.question, emoji: catDe(f).icone, etapes, valeurs, commencerAuRecap: auRecap,
    intro: champs.length > 1 ? `Je vous pose ${champs.length} petites questions, puis je calcule la réponse pour votre cas. Vous pourrez revenir en arrière si vous vous trompez.` : null,
    onFini: fini, onAnnule: () => fini(valeurs) });
}

function ouvrirFiche(f, reprise) {
  let valeurs = reprise || valeursParDefaut(f);
  const resume = h('div', { class: 'carte vos-reponses' });
  const majResume = () => remplir(resume, h('h3', {}, 'Vos réponses'),
    h('ul', {}, (f.champs || []).map(c => h('li', {}, h('span', {}, (c.question || c.label).replace(/\s*\?$/, '') + ' : '), h('strong', {}, texteReponse(c, valeurs[c.id]))))),
    h('button', { type: 'button', class: 'sec', onclick: () => assistant(f, valeurs, nv => { valeurs = nv; majResume(); calculer(); resultat.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, true) }, '✏️ Modifier mes réponses'));
  const resultat = h('div', { class: 'carte reponse-finale' });
  function calculer() {
    if (!f.calcul) return;
    const r = CALCULS[f.calcul](valeurs);
    const lignes = r.lignes || [];
    // comparaison accord / convention : l'étoile marque le résultat le plus favorable quand les deux sont comparables
    const groupes = {};
    for (const l of lignes) if (l.cmp) (groupes[l.cmp.g] ||= {})[l.niveau === 'convention' ? 'cc' : 'acc'] = l;
    for (const g of Object.values(groupes)) if (g.acc && g.cc && g.acc.cmp.v !== g.cc.cmp.v) {
      const meilleurAccord = g.acc.cmp.s === 'moins' ? g.acc.cmp.v < g.cc.cmp.v : g.acc.cmp.v > g.cc.cmp.v;
      (meilleurAccord ? g.acc : g.cc).favorable = true;
    }
    const legende = lignes.some(l => l.niveau === 'convention') && lignes.some(l => l.niveau !== 'convention');
    remplir(resultat,
      h('div', { class: 'rf-titre' }, 'Réponse pour ce salarié'),
      legende ? h('div', { class: 'legende' }, h('span', { class: 'pastille p-accord' }, 'Accord d\'entreprise'), h('span', { class: 'pastille p-convention' }, 'Convention collective'), h('span', { class: 'pastille p-etoile' }, '★ plus favorable')) : null,
      r.erreur ? h('p', { class: 'note' }, r.erreur) : null,
      r.info ? h('p', { class: 'alerte' }, r.info) : null,
      ...lignes.map(l => h('div', { class: 'rf-ligne n-' + l.niveau + (l.favorable ? ' favorable' : '') },
        h('div', { class: 'rf-label' }, h('span', { class: 'badge b-' + l.niveau }, NIVEAU[l.niveau] || l.niveau), l.favorable ? h('span', { class: 'etoile' }, '★ Plus favorable') : null, l.label),
        h('div', { class: 'rf-valeur' }, fr(l.valeur)),
        l.note ? h('div', { class: 'note' }, l.note) : null)));
  }
  const niveaux = h('div', { class: 'niveaux' }, f.niveaux.map(n => h('div', { class: 'carte' },
    h('h3', {}, n.titre),
    h('ul', {}, n.regles.map(r => h('li', {}, r))),
    n.sources.map(s => h('div', { class: 'cite' },
      h('b', {}, `${DOCS_TITRES[s.doc]?.titre || s.doc} — ${s.article}${s.doc === 'ct' ? '' : ', p.' + s.page}`),
      h('em', {}, `« ${s.extrait} »`),
      s.note_ocr ? h('div', { class: 'note' }, s.note_ocr) : null,
      DOCS_TITRES[s.doc]?.scan ? tags([n.verifie_image || s.verifie_image ? '✓ Chiffre vérifié sur l\'image' : 'Vérifier le chiffre sur l\'image']) : null)))));
  const notes = f.notes?.length ? h('div', { class: 'carte' }, h('h3', {}, 'À savoir'), h('ul', {}, f.notes.map(n => h('li', {}, n)))) : null;
  const textes = h('details', { class: 'textes' }, h('summary', {}, 'Voir les textes, les sources et les détails'), niveaux, notes);
  remplir(vue,
    h('button', { class: 'sec', type: 'button', onclick: () => { precedent(); window.scrollTo(0, 0); } }, '← Retour'),
    h('button', { class: 'puce-cat', type: 'button', style: `--c:${catDe(f).couleur}`, onclick: () => { vueCategorie(f.categorie); window.scrollTo(0, 0); } }, `${catDe(f).icone} ${catDe(f).nom}`),
    h('h2', { style: 'margin-top:8px' }, f.question),
    tags(f.etiquettes),
    h('div', { class: 'carte ' + (f.calcul ? 'enbref' : 'reponse-finale') },
      h('div', { class: f.calcul ? 'eb-titre' : 'rf-titre' }, f.calcul ? 'En bref' : 'La réponse'), h('p', { class: f.calcul ? '' : 'rf-texte' }, f.reponse)),
    f.calcul ? resume : null,
    f.calcul ? resultat : null,
    textes);
  onglets(f.categorie); majResume(); calculer(); window.scrollTo(0, 0);
  if (f.calcul && f.champs?.length && !reprise) assistant(f, valeurs, nv => { valeurs = nv; majResume(); calculer(); resultat.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

$('#formRecherche').addEventListener('submit', e => { e.preventDefault(); const q = $('#q').value.trim(); q ? recherche(q) : accueil(); window.scrollTo(0, 0); });
$('#titre').addEventListener('click', accueil);

// ---- Démarrage ----
(async () => {
  const [f, s] = await Promise.all([fetch('fiches/fiches.json').then(r => r.json()), fetch('fiches/synonymes.json').then(r => r.json())]);
  FICHES = f.fiches; SYN = s; CATS = f.categories || []; FREQ = f.frequentes || [];
  DOCS_TITRES = {
    subst: { titre: 'Accord de substitution', scan: true }, nao: { titre: 'NAO 2026', scan: true },
    cc: { titre: 'Convention collective IDCC 2216 (28 août 2025)', scan: false },
    avenant: { titre: 'Avenant intéressement 2026 (non signé)', scan: false }, interess: { titre: 'Accord d\'intéressement 2025', scan: true },
    pee: { titre: 'Règlement PEE', scan: true }, particip: { titre: 'Accord de participation (signé le 24/11/2025)', scan: true }, percol: { titre: 'Règlement PERCOL', scan: true }, livret: { titre: 'Livret CGT', scan: false }, syndical: { titre: 'Accord droit syndical et CSE central (1er juin 2025)', scan: true }, ct: { titre: 'Code du travail (code.travail.gouv.fr, version du 10/08/2016)', scan: false },
  };
  const ouvrirAppli = () => { $('#entree').hidden = true; $('#appli').hidden = false; accueil(); if (location.hash === '#paie') pageSimulateur(); };
  if (EMPREINTE_MDP) $('#porte').hidden = false;
  else if (location.hash === '#paie') ouvrirAppli();      // lien direct vers l'estimation de la fiche de paie : pas de page d'entrée
  else { $('#entree').hidden = false; $('#btnEntree').addEventListener('click', () => { ouvrirAppli(); window.scrollTo(0, 0); }); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

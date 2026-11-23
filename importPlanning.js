// Importer ses plannings (un PDF par semaine) : lecture sur le téléphone, rien n'est envoyé ni enregistré.
import { lirePlanning, controlerPersonne, resumerMois, SENS_CODES } from './moteur/planning.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const virg = x => String(x).replace('.', ',');
const hm = min => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
const dateFr = iso => iso.split('-').reverse().join('/');
const ajoute = (iso, n) => { const [a, m, j] = iso.split('-').map(Number); const d = new Date(a, m - 1, j + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

let pdfjsPromesse = null;
function chargerPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  pdfjsPromesse ||= new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = 'vendor/pdfjs/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { pdfjsPromesse = null; ko(new Error('Lecteur de PDF indisponible : ouvrez une fois cet écran avec du réseau.')); };
    document.head.append(s);
  });
  return pdfjsPromesse;
}
async function lireFichierPdf(fichier) {
  const lib = await chargerPdfjs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
    pages.push(lirePlanning(tc.items.map(it => ({ str: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width }))));
  }
  return pages;
}

/** Transforme le résumé du mois en réponses pour l'estimation de paie. */
export function versValeurs(resume, annee, mois, semainesDuMois) {
  const v = { mois: `${annee}-${String(mois).padStart(2, '0')}`, heuresSemaine: resume.heuresSemaine, memesJours: false, joursMois: resume.joursPresence, joursAbsence: 0, joursEnPlus: 0, tickets: resume.tickets };
  const sem = semainesDuMois(annee, mois);
  let total = 0;
  sem.forEach((s, i) => {
    const iso = `${s.debut.getFullYear()}-${String(s.debut.getMonth() + 1).padStart(2, '0')}-${String(s.debut.getDate()).padStart(2, '0')}`;
    const idx = resume.semaines.findIndex(x => x.debut === iso && x.rattacheeAuMois);
    const rang = resume.semaines.filter(x => x.rattacheeAuMois).findIndex(x => x.debut === iso);
    const h = idx >= 0 && rang >= 0 ? resume.heuresEnPlus[rang] || 0 : 0;
    v['sem' + i] = h || ''; total += h;
  });
  v.optPlus = total > 0; v.precis = total > 0; v.hPlus = total > 0 ? Math.round(total * 100) / 100 : 0;
  v.dimanche100 = Math.round(resume.dimanche100 / 60 * 100) / 100;
  v.nuit30 = Math.round(resume.nuit30 / 60 * 100) / 100; v.nuit10 = Math.round(resume.nuit10 / 60 * 100) / 100;
  v.optSpec = v.dimanche100 > 0 || v.nuit30 > 0 || v.nuit10 > 0;
  v.importe = ['mois', 'heuresSemaine', 'joursSemaine', 'memesJours', 'joursHab', 'joursMois', 'joursAbsence', 'joursEnPlus', 'optPlus', 'hPlus', 'precis', 'sem0', 'sem1', 'sem2', 'sem3', 'sem4', 'sem5', 'dimanche100', 'nuit30', 'nuit10', 'tickets'];
  return v;
}

export function ouvrirImport({ h, remplir, semainesDuMois, onFini }) {
  const fond = h('div', { class: 'as-fond', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Importer mes plannings' });
  const fermer = () => { fond.remove(); document.removeEventListener('keydown', touche); document.body.classList.remove('modal-ouvert'); };
  const touche = e => { if (e.key === 'Escape') fermer(); };
  document.addEventListener('keydown', touche);
  document.body.classList.add('modal-ouvert'); document.body.append(fond);
  const cadre = (...c) => remplir(fond, h('div', { class: 'as-carte' }, ...c));
  const etat = { semaines: [], erreurs: [], nom: null, mois: null };
  const haut = (titre, retour) => h('div', { class: 'as-haut' }, h('span', { class: 'as-compteur' }, titre), h('button', { type: 'button', class: 'as-x', 'aria-label': 'Fermer', onclick: fermer }, '✕'));

  function ecranFichiers(message) {
    const input = h('input', { type: 'file', accept: '.pdf,application/pdf', multiple: true, hidden: true, 'aria-label': 'Choisir les plannings en PDF' });
    input.addEventListener('change', async () => { if (input.files.length) await lire([...input.files]); });
    cadre(haut('Importer mes plannings'), h('div', { class: 'as-grand-emoji' }, '📄'), h('h3', { class: 'as-titre' }, 'Vos horaires du mois'),
      h('p', { class: 'as-texte' }, 'Choisissez vos plannings en PDF : un fichier par semaine, tous ceux du mois. Ils sont lus sur votre téléphone : rien n\'est envoyé ni enregistré.'),
      message ? h('p', { class: 'erreur' }, message) : null,
      input, h('button', { type: 'button', class: 'as-prim', onclick: () => input.click() }, 'Choisir les fichiers PDF'),
      h('button', { type: 'button', class: 'as-sec as-large', onclick: fermer }, 'Annuler'));
  }

  async function lire(fichiers) {
    cadre(haut('Lecture en cours'), h('div', { class: 'as-grand-emoji' }, '⏳'), h('p', { class: 'as-texte' }, `Lecture de ${fichiers.length} fichier(s)…`));
    etat.semaines = []; etat.erreurs = [];
    for (const f of fichiers) {
      try {
        const pages = await lireFichierPdf(f);
        const lues = pages.filter(p => p.debut && p.personnes.length);
        if (!lues.length) { etat.erreurs.push(`« ${f.name} » : aucun planning reconnu (le fichier doit être le PDF imprimé par le logiciel d'horaires, pas une photo).`); continue; }
        etat.semaines.push({ fichier: f.name, debut: lues[0].debut, pages: lues });
      } catch (e) { etat.erreurs.push(`« ${f.name} » : lecture impossible (${e.message}).`); }
    }
    if (!etat.semaines.length) { ecranFichiers(etat.erreurs.join(' ')); return; }
    ecranNom();
  }

  function ecranNom(filtre = '') {
    const noms = [...new Set(etat.semaines.flatMap(s => s.pages.flatMap(p => p.personnes.map(x => x.nom))))].sort((a, b) => a.localeCompare(b, 'fr'));
    const q = filtre.trim().toLowerCase();
    const liste = noms.filter(n => !q || n.toLowerCase().includes(q));
    const zone = h('div', { class: 'as-choix' }, liste.slice(0, 40).map(n => h('button', { type: 'button', class: 'as-btn', onclick: () => { etat.nom = n; ecranMois(); } }, h('span', {}, n))));
    const champ = h('input', { type: 'text', placeholder: 'Tapez votre nom', value: filtre, 'aria-label': 'Chercher mon nom', autocomplete: 'off' });
    champ.addEventListener('input', () => { const pos = champ.selectionStart; ecranNom(champ.value); const n = fond.querySelector('input[type=text]'); n.focus(); n.setSelectionRange(pos, pos); });
    cadre(haut(`${etat.semaines.length} semaine(s) lues`), h('h3', { class: 'as-q' }, 'Quelle ligne est la vôtre ?'),
      h('p', { class: 'as-aide' }, `${noms.length} personnes dans ces plannings. Votre nom n'est affiché que sur cet écran, il n'est pas gardé.`),
      champ, liste.length > 40 ? h('p', { class: 'as-aide' }, `${liste.length - 40} autres : tapez pour chercher.`) : null, zone,
      etat.erreurs.length ? h('p', { class: 'erreur' }, etat.erreurs.join(' ')) : null,
      h('div', { class: 'as-bas' }, h('button', { type: 'button', class: 'as-sec', onclick: () => ecranFichiers() }, '← Retour'), h('span')));
  }

  const personneDe = (sem, nom) => { for (const p of sem.pages) { const x = p.personnes.find(y => y.nom === nom); if (x) return x; } return null; };

  function moisProposes() {
    const compte = {};
    for (const s of etat.semaines) { const d = ajoute(s.debut, 6); const k = d.slice(0, 7); compte[k] = (compte[k] || 0) + 1; }
    return Object.entries(compte).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function ecranMois() {
    const ms = moisProposes();
    if (ms.length === 1) { etat.mois = ms[0][0]; ecranRecap(); return; }
    cadre(haut('Votre ligne'), h('h3', { class: 'as-q' }, 'Pour quel mois voulez-vous estimer la paie ?'),
      h('p', { class: 'as-aide' }, 'Une semaine compte pour le mois où elle se termine (son dimanche).'),
      h('div', { class: 'as-choix' }, ms.map(([k, n]) => { const [a, m] = k.split('-').map(Number); return h('button', { type: 'button', class: 'as-btn', onclick: () => { etat.mois = k; ecranRecap(); } }, h('span', {}, `${MOIS[m - 1]} ${a} (${n} semaine(s))`)); })),
      h('div', { class: 'as-bas' }, h('button', { type: 'button', class: 'as-sec', onclick: () => ecranNom() }, '← Retour'), h('span')));
  }

  function ecranRecap() {
    const [a, m] = etat.mois.split('-').map(Number);
    const trouvees = etat.semaines.map(s => ({ debut: s.debut, personne: personneDe(s, etat.nom) }));
    const manquantes = etat.semaines.filter(s => !personneDe(s, etat.nom)).map(s => dateFr(s.debut));
    const semaines = trouvees.filter(s => s.personne).sort((x, y) => x.debut.localeCompare(y.debut));
    const r = resumerMois(semaines, a, m);
    const attendues = semainesDuMois(a, m).map(s => `${s.debut.getFullYear()}-${String(s.debut.getMonth() + 1).padStart(2, '0')}-${String(s.debut.getDate()).padStart(2, '0')}`);
    const absentes = attendues.filter(d => !semaines.some(s => s.debut === d));
    const incoherences = semaines.flatMap(s => controlerPersonne(s.personne).map(p => `Semaine du ${dateFr(s.debut)} : ${p}`));
    const inconnus = [...new Set([...r.codesInconnus, ...etat.semaines.flatMap(s => s.pages.flatMap(p => p.inconnus))])];
    const alertes = [];
    if (absentes.length) alertes.push(`Il manque le planning de la semaine du ${absentes.map(d => `${dateFr(d)} au ${dateFr(ajoute(d, 6))}`).join(', ')} : les heures de cette semaine ne seront pas comptées.`);
    if (manquantes.length) alertes.push(`Votre ligne est introuvable dans le planning du ${manquantes.join(', ')}.`);
    alertes.push(...incoherences);
    if (inconnus.length) alertes.push(`Codes non reconnus à vérifier : ${inconnus.join(', ')}.`);
    if (r.absences.MALA) alertes.push(`${r.absences.MALA} jour(s) en MALA (compris comme maladie) : l'estimation de paie ne calcule pas encore la maladie, ajoutez-la à la main.`);
    const ligne = (t, v) => h('li', {}, h('button', { type: 'button', disabled: true, style: 'cursor:default' }, h('span', { class: 'as-recap-q' }, t), h('strong', {}, v)));
    const extra = r.heuresEnPlus.reduce((x, y) => x + y, 0);
    cadre(haut(`${MOIS[m - 1]} ${a}`), h('div', { class: 'as-grand-emoji' }, alertes.length ? '⚠️' : '✅'), h('h3', { class: 'as-titre' }, 'Voici ce que j\'ai lu'),
      alertes.length ? h('div', { class: 'carte alerte' }, alertes.map(t => h('p', { class: 'note' }, t))) : h('p', { class: 'as-texte' }, 'Les horaires sont cohérents : le total de chaque jour et de chaque semaine tombe juste.'),
      h('ul', { class: 'as-recap' },
        ligne('Heures du contrat par semaine', `${virg(r.heuresSemaine)} h`),
        ligne('Semaines comptées pour ce mois', `${r.semaines.filter(s => s.rattacheeAuMois).length}`),
        ligne('Jours de présence dans le mois', `${r.joursPresence}`),
        ligne('Heures en plus du contrat', `${virg(Math.round(extra * 100) / 100)} h`),
        ligne('Dimanche majoré à 100 %', r.dimanche100 ? hm(r.dimanche100) : 'aucun'),
        ligne('Heures de délégation dans les horaires', r.delegationMin ? hm(r.delegationMin) : 'aucune'),
        ligne('Titres-restaurant (journée couvrant 12 h-13 h 30 ou 18 h 30-20 h)', `${r.tickets}`),
        ligne('Fermetures (fin après 19 h 30)', `${r.fermetures}`),
        ligne('Heures de nuit', (r.nuit10 + r.nuit30) ? hm(r.nuit10 + r.nuit30) : 'aucune'),
        ligne('Jours de repos / non travaillés', `${r.joursRepos} / ${r.joursNonTravailles}`)),
      h('p', { class: 'as-aide' }, 'Le salaire, les congés payés, l\'astreinte, les retenues et l\'impôt ne figurent pas dans un planning : je vous les demande ensuite.'),
      h('button', { type: 'button', class: 'as-prim', onclick: () => { const v = versValeurs(r, a, m, semainesDuMois); fermer(); onFini(v); } }, 'Utiliser ces informations ✨'),
      h('div', { class: 'as-bas' }, h('button', { type: 'button', class: 'as-sec', onclick: () => ecranNom() }, '← Retour'), h('span')));
  }

  ecranFichiers();
}

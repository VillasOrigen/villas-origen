// Fonction Vercel : lit les prix de Villa Origen dans la feuille Google partagée avec le site Villas Riviera
// (onglet « Villa Origen » et onglet « Réglages ») et renvoie la grille. Appel : /api/tarifs.
// Alexias change ses prix dans la feuille ; le site les reprend en quelques minutes (cache CDN de 5 min).
// Feuille illisible ou mal remplie : erreur 502, et les pages gardent leur copie de secours intégrée.
//
// La feuille doit rester partagée en lecture (« Tous les utilisateurs qui ont le lien »). On y écrit les prix
// Airbnb : le site retire lui-même le rabais en direct. Ne pas renommer l'onglet ni les libellés des réglages.

const FEUILLE = '1DD7726pPUrkl82fJ8s30aM1ID5vO3mAJ8Pk6tAlIR38'; // feuille « Tarifs Villas Riviera » (Drive d'Alexias)
const ONGLET = 'Villa Origen';
const DIRECT = 'Rabais en direct par rapport à Airbnb';
const LIBELLES = {
  semaine: 'Villa Origen : Rabais à la semaine (7 nuits et plus)',
  mois: 'Villa Origen : Rabais au mois (28 nuits et plus)',
  derniere_minute_14: "Villa Origen : Rabais de dernière minute (8 à 14 jours avant l'arrivée)",
  derniere_minute_7: "Villa Origen : Rabais de dernière minute (1 à 7 jours avant l'arrivée)",
};

async function lireOnglet(nom) {
  const url = `https://docs.google.com/spreadsheets/d/${FEUILLE}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(nom)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'VillasOrigen/1.0' } });
  if (!r.ok) throw new Error(`onglet ${nom} : ${r.status}`);
  const texte = await r.text();
  const json = JSON.parse(texte.slice(texte.indexOf('(') + 1, texte.lastIndexOf(')')));
  if (json.status !== 'ok') throw new Error(`onglet ${nom} : ${json.status}`);
  return (json.table.rows || [])
    .map((ligne) => (ligne.c || []).map((c) => (c ? c.v : null)))
    .filter((l) => l.some((v) => v !== null && v !== ''));
}

// « Date(2027,4,1) » (mois commençant à 0), ou texte « 2027-05-01 » / « 01/05/2027 » → « 2027-05-01 »
function dateIso(v) {
  if (typeof v === 'string') {
    let m = v.match(/^Date\((\d+),(\d+),(\d+)/);
    if (m) return `${m[1]}-${String(+m[2] + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  throw new Error(`date illisible : ${v}`);
}
function nombre(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').replace(/[^0-9.]/g, ''));
  if (!isFinite(n)) throw new Error(`nombre illisible : ${v}`);
  return n;
}
const taux = (v) => { const n = nombre(v); return n > 1 ? n / 100 : n; }; // « 10 % » ou 0,1
const vide = (v) => v === null || v === undefined || String(v).trim() === '';

function normaliser(lignes, reglages) {
  // [période, du, au (dernière nuit), prix Airbnb par nuit] ; une ligne incomplète ou sans prix est ignorée
  const periodes = lignes.filter((l) => [1, 2, 3].every((i) => !vide(l[i])))
    .map(([, du, au, prix]) => ({ du: dateIso(du), au: dateIso(au), prix: nombre(prix) }));
  if (!periodes.length) throw new Error('aucune période de prix');
  for (const p of periodes) {
    if (p.prix <= 0) throw new Error(`prix nul du ${p.du}`);
    if (p.au < p.du) throw new Error(`période inversée du ${p.du}`);
  }
  const r = {};
  for (const [nom, valeur] of reglages) if (nom) r[String(nom).trim()] = valeur;
  if (vide(r[DIRECT])) throw new Error('rabais en direct manquant');
  const R = { direct: taux(r[DIRECT]) };
  for (const [cle, libelle] of Object.entries(LIBELLES)) R[cle] = vide(r[libelle]) ? 0 : taux(r[libelle]);
  return { periodes, reglages: R, source: 'feuille' };
}

module.exports = async (req, res) => {
  try {
    const data = normaliser(await lireOnglet(ONGLET), await lireOnglet('Réglages'));
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ erreur: 'tarifs illisibles', detail: String(e.message || e) });
  }
};

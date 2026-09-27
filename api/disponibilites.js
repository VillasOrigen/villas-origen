// Relais calendrier Airbnb → dates occupées (sans exposer le lien secret).
// Le lien iCal complet vit dans la variable d'environnement AIRBNB_ICAL_URL (réglages Vercel).

// Airbnb n'accepte les réservations que 12 mois à l'avance et son iCal s'arrête là :
// au-delà, on bloque tout pour que le calendrier du site ne paraisse pas libre.
const MOIS_OUVERTS = 12;

// Dates bloquées d'office, en plus d'Airbnb : [première nuit, jour du départ].
const BLOCAGES = [
  // Fêtes en famille : du 15 décembre au 15 janvier
  ["2026-12-15", "2027-01-15"],
  ["2027-12-15", "2028-01-15"],
  ["2028-12-15", "2029-01-15"],
  ["2029-12-15", "2030-01-15"],
];

function jour(s) {
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
}

function ajouterNuits(nights, debut, fin) {
  const d = new Date(debut);
  let guard = 0;
  while (d < fin && guard++ < 750) {
    nights.add(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

module.exports = async (req, res) => {
  const url = process.env.AIRBNB_ICAL_URL;
  if (!url) {
    res.status(500).json({ error: "AIRBNB_ICAL_URL manquante" });
    return;
  }
  try {
    const r = await fetch(url, { headers: { "User-Agent": "VillasOrigen-Calendar/1.0" } });
    if (!r.ok) throw new Error("ical " + r.status);
    const text = await r.text();
    const nights = new Set();
    // Chaque réservation est lue séparément (DTSTART et DTEND peuvent venir dans n'importe quel ordre).
    for (const ev of text.split("BEGIN:VEVENT").slice(1)) {
      const s = /DTSTART;VALUE=DATE:(\d{8})/.exec(ev), e = /DTEND;VALUE=DATE:(\d{8})/.exec(ev);
      if (s && e) ajouterNuits(nights, jour(s[1]), jour(e[1]));
    }
    for (const [a, b] of BLOCAGES) ajouterNuits(nights, jour(a.replace(/-/g, "")), jour(b.replace(/-/g, "")));
    // Au-delà de la fenêtre de réservation Airbnb : tout est bloqué (8 mois de plus, assez pour le calendrier du site).
    const auj = new Date();
    const limite = new Date(Date.UTC(auj.getUTCFullYear(), auj.getUTCMonth() + MOIS_OUVERTS, auj.getUTCDate()));
    const finBlocage = new Date(limite);
    finBlocage.setUTCMonth(finBlocage.getUTCMonth() + 8);
    ajouterNuits(nights, limite, finBlocage);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ nights: [...nights].sort() });
  } catch (e) {
    res.status(502).json({ error: "sync" });
  }
};

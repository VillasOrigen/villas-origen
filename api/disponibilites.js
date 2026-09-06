// Relais calendrier Airbnb → dates occupées (sans exposer le lien secret).
// Le lien iCal complet vit dans la variable d'environnement AIRBNB_ICAL_URL (réglages Vercel).
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
    const nights = [];
    const re = /BEGIN:VEVENT[\s\S]*?DTSTART;VALUE=DATE:(\d{8})[\s\S]*?DTEND;VALUE=DATE:(\d{8})[\s\S]*?END:VEVENT/g;
    let m;
    while ((m = re.exec(text))) {
      const s = m[1], e = m[2];
      let d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
      const end = new Date(Date.UTC(+e.slice(0, 4), +e.slice(4, 6) - 1, +e.slice(6, 8)));
      let guard = 0;
      while (d < end && guard++ < 750) {
        nights.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ nights });
  } catch (e) {
    res.status(502).json({ error: "sync" });
  }
};

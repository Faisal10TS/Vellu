export default async function handler(req, res) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
  const baseUrl = "https://vellu.cc";
  const today = new Date().toISOString().split("T")[0];

  let profiles = [];

  try {
    // public_salons (de publieke view), niet profiles: die tabel is voor de
    // anon-sleutel onleesbaar, dus de sitemap had nul salonpagina's (AP-02).
    // Alleen salons die in de zoeker mogen staan, met een lopend abonnement,
    // en nooit de demo-salon. (public/sitemap.xml is weg: dat statische
    // bestand ging vóór deze functie en had geen enkele salon.)
    const url = `${SUPABASE_URL}/rest/v1/public_salons?select=slug&directory_visible=eq.true&subscription_status=in.(active,trialing)`;
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    };

    let response = await fetch(`${url}&is_demo=eq.false`, { headers });
    // Uitrolvangnet: zolang de migratie die is_demo aan de view toevoegt nog
    // niet live is, geeft dat filter een 400. Dan zonder: liever de demo-salon
    // even in de sitemap dan helemaal geen salons.
    if (response.status === 400) response = await fetch(url, { headers });

    if (response.ok) {
      const data = await response.json();
      profiles = data.filter((p) => p.slug);
    }
  } catch (e) {
    console.error("Sitemap error:", e.message);
  }

  const staticPages = [
    { url: "/", priority: "1.0", changefreq: "weekly" },
    { url: "/owner", priority: "0.6", changefreq: "monthly" },
    { url: "/privacy", priority: "0.3", changefreq: "yearly" },
    { url: "/terms", priority: "0.3", changefreq: "yearly" },
    { url: "/contact", priority: "0.4", changefreq: "yearly" },
    { url: "/dpa", priority: "0.2", changefreq: "yearly" },
  ];

  const salonPages = profiles.map((p) => ({
    url: `/${p.slug}`,
    priority: "0.8",
    changefreq: "weekly",
    lastmod: today,
  }));

  const allPages = [...staticPages, ...salonPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${page.lastmod || today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.status(200).send(xml);
}

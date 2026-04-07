export default async function handler(req, res) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
  const baseUrl = "https://vellu.cc";
  const today = new Date().toISOString().split("T")[0];

  let profiles = [];

  try {
    const url = `${SUPABASE_URL}/rest/v1/profiles?select=slug`;

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
    });

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

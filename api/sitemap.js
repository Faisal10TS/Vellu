export default async function handler(req, res) {
  const SUPABASE_URL = "https://pqvovkwqkapmpibktpwb.supabase.co";
  const SUPABASE_KEY = "sb_publishable_9a56u0YAwjJFjeQ6AGpJeg_qrzPnl0k";
  const baseUrl = "https://vellu.cc";
  const today = new Date().toISOString().split("T")[0];

  let profiles = [];
  let debugInfo = "";

  try {
    const url = `${SUPABASE_URL}/rest/v1/profiles?select=slug`;
    debugInfo += `Fetching: ${url}\n`;

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    debugInfo += `Status: ${response.status}\n`;

    if (response.ok) {
      const data = await response.json();
      debugInfo += `Rows: ${data.length}\n`;
      profiles = data.filter((p) => p.slug);
    } else {
      const errorText = await response.text();
      debugInfo += `Error: ${errorText}\n`;
    }
  } catch (e) {
    debugInfo += `Exception: ${e.message}\n`;
  }

  // Log for Vercel function logs
  console.log("Sitemap debug:", debugInfo);

  // If ?debug=1, show debug info instead of XML
  if (req.query?.debug === "1") {
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(debugInfo + "\nProfiles found: " + profiles.map((p) => p.slug).join(", "));
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

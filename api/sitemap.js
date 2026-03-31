import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "https://pqvovkwqkapmpibktpwb.supabase.co",
  process.env.SUPABASE_ANON_KEY || "sb_publishable_9a56u0YAwjJFjeQ6AGpJeg_qrzPnl0k"
);

export default async function handler(req, res) {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("slug, updated_at")
    .not("slug", "is", null);

  const baseUrl = "https://vellu.cc";
  const today = new Date().toISOString().split("T")[0];

  const staticPages = [
    { url: "/", priority: "1.0", changefreq: "weekly" },
    { url: "/owner", priority: "0.6", changefreq: "monthly" },
    { url: "/privacy", priority: "0.3", changefreq: "yearly" },
    { url: "/terms", priority: "0.3", changefreq: "yearly" },
  ];

  const salonPages = (profiles || []).map((p) => ({
    url: `/${p.slug}`,
    priority: "0.8",
    changefreq: "weekly",
    lastmod: p.updated_at
      ? new Date(p.updated_at).toISOString().split("T")[0]
      : today,
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

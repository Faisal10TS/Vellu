// Capture fresh hero-phone screenshots of the Bloom Studio demo salon.
// Drives installed Chrome via puppeteer-core at iPhone geometry (390x797 CSS @3x;
// the missing 47px is the status bar strip composited later by compose.mjs).
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const KEY = process.env.SB_KEY;
if (!KEY) { console.error("SB_KEY missing"); process.exit(1); }

const SB_URL = "https://pqvovkwqkapmpibktpwb.supabase.co";
const SALON_ID = "74029064-56c2-44d1-93c2-b814db4059cf";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "raw");
mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- 1. one-time magic link for the demo owner -------------------------------
async function magicLink() {
  const res = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: "demo@bloomstudio.example", options: { redirect_to: "https://vellu.cc" } }),
  });
  if (!res.ok) throw new Error(`generate_link ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const link = j.action_link || j.properties?.action_link;
  if (!link) throw new Error("no action_link in response");
  return link;
}

// --- 2. status bar HTML (rendered by Chrome so the font is guaranteed) ------
const sbHTML = ink => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent}
  .bar{width:390px;height:47px;display:flex;align-items:flex-end;justify-content:space-between;
       font-family:'Segoe UI',system-ui,sans-serif;color:${ink};padding-bottom:6px;box-sizing:border-box}
  .time{width:128px;text-align:center;font-size:16px;font-weight:600;letter-spacing:.2px}
  .icons{display:flex;align-items:center;gap:7px;margin-right:26px;margin-bottom:2px}
</style><div class="bar">
  <div class="time">9:41</div>
  <div class="icons">
    <svg width="18" height="12" viewBox="0 0 18 12"><g fill="${ink}"><rect x="0" y="7.5" width="3" height="4.5" rx="1"/><rect x="4.7" y="5" width="3" height="7" rx="1"/><rect x="9.4" y="2.5" width="3" height="9.5" rx="1"/><rect x="14.1" y="0" width="3" height="12" rx="1"/></g></svg>
    <svg width="17" height="12" viewBox="0 0 17 12"><g fill="none" stroke="${ink}" stroke-width="1.7" stroke-linecap="round"><path d="M1.5 4.2a10.5 10.5 0 0 1 14 0"/><path d="M4.1 6.9a6.7 6.7 0 0 1 8.8 0"/></g><circle cx="8.5" cy="10" r="1.6" fill="${ink}"/></svg>
    <svg width="26" height="12" viewBox="0 0 26 12"><rect x="0.6" y="0.6" width="21.5" height="10.8" rx="3" fill="none" stroke="${ink}" stroke-opacity=".45" stroke-width="1.1"/><rect x="2.3" y="2.3" width="18" height="7.4" rx="1.8" fill="${ink}"/><path d="M23.6 3.8v4.4a2.4 2.4 0 0 0 0-4.4z" fill="${ink}" fill-opacity=".45"/></svg>
  </div>
</div>`;

// --- 3. drive the app --------------------------------------------------------
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--hide-scrollbars", "--force-color-profile=srgb", "--lang=en-US",
         `--user-data-dir=${join(OUT, "..", "profile")}`],
});
try {
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1");
  await page.setViewport({ width: 390, height: 797, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(sid => {
    try {
      localStorage.setItem("vellu_lang", "en");
      localStorage.setItem("vellu-theme", "light");
      localStorage.setItem("vellu_cookies_accepted", "true");
      localStorage.setItem("vellu_install_dismissed", "true");
      localStorage.setItem(`vellu_tour_v1_${sid}`, "1");
    } catch {}
  }, SALON_ID);

  const shot = async n => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(OUT, `shot-${n}.jpg`), type: "jpeg", quality: 92 });
    console.log(`shot-${n} done`);
  };

  console.log("logging in via magic link...");
  await page.goto(await magicLink(), { waitUntil: "load", timeout: 90000 });
  // supabase-js consumes the #access_token hash on the landing page and
  // persists the session; the owner app itself lives at /owner.
  await sleep(4000);
  await page.goto("https://vellu.cc/owner", { waitUntil: "load", timeout: 90000 });
  try {
    await page.waitForSelector('[data-tour="nav-dashboard"]', { timeout: 60000 });
  } catch (e) {
    const url = page.url();
    const text = await page.evaluate(() => (document.body.innerText || "").slice(0, 600)).catch(() => "<no body>");
    await page.screenshot({ path: join(OUT, "debug-fail.png"), type: "png" }).catch(() => {});
    console.error(`DEBUG url=${url}\nDEBUG body=${text}`);
    throw e;
  }
  await sleep(3200);
  await shot(1); // dashboard

  const tabs = [["agenda", 2, 1600], ["klanten", 3, 1600], ["analytics", 4, 2400], ["facturen", 5, 1600]];
  for (const [key, n, wait] of tabs) {
    await page.click(`[data-tour="nav-${key}"]`);
    await sleep(wait);
    await shot(n);
  }

  console.log("public booking page...");
  await page.goto("https://vellu.cc/bloomstudio", { waitUntil: "load", timeout: 90000 });
  await sleep(3500);
  await page.evaluate(() => window.scrollTo(0, 0));
  // hide the floating BOOK pill for the services shot — it lands exactly on an
  // inline BOOK button there and reads as a glitch; every service card has its
  // own BOOK button. Shot 7 keeps the pill (it floats over clear footer space).
  const hidden = await page.evaluate(() => {
    const el = [...document.querySelectorAll("button,a,div")].find(e => {
      const r = e.getBoundingClientRect();
      return getComputedStyle(e).position === "fixed" && /^book/i.test((e.textContent || "").trim()) &&
             r.height > 0 && r.height < 130 && r.top > innerHeight * 0.6;
    });
    if (el) { el.dataset.prevDisplay = el.style.display; el.style.display = "none"; return true; }
    return false;
  });
  console.log(`sticky pill hidden: ${hidden}`);
  await sleep(400);
  await shot(6); // services
  await page.evaluate(() => {
    const el = document.querySelector("[data-prev-display]");
    if (el) el.style.display = el.dataset.prevDisplay || "";
  });

  // scroll to the contact/map section
  await page.evaluate(() => {
    const heads = [...document.querySelectorAll("h1,h2,h3,h4,div,span")].filter(el =>
      /^(contact|location|find us|contacto)$/i.test((el.textContent || "").trim()) && el.getBoundingClientRect().height < 90);
    const target = heads[heads.length - 1];
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo(0, document.body.scrollHeight);
  });
  await sleep(2800); // map tiles
  await shot(7);

  // status bar strips (transparent PNG, dark + light ink)
  await page.setViewport({ width: 390, height: 47, deviceScaleFactor: 3 });
  for (const [name, ink] of [["sb-dark", "#241c12"], ["sb-light", "#f7f3ec"]]) {
    await page.setContent(sbHTML(ink));
    await sleep(250);
    await page.screenshot({ path: join(OUT, `${name}.png`), type: "png", omitBackground: true });
  }
  console.log("status bars done");
} finally {
  await browser.close();
}
console.log("capture complete");

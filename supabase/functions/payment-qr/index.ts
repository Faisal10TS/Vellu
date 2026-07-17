// payment-qr — renders a SEPA (EPC069-12) payment QR code as PNG.
//
// Embedded as an <img> in the invoice email's pay block: Dutch banking apps
// (ING, Rabobank, ABN AMRO, bunq, …) scan it and pre-fill a transfer with the
// salon's IBAN, the exact amount and the invoice reference. Email clients
// can't run JS and Gmail strips data: URIs, so the QR must be a hosted image —
// hence this endpoint. All rendered data comes from the query string (nothing
// is looked up), so there's nothing to leak; deployed verify_jwt=false because
// email clients fetch images without any auth header.
//
// GET /payment-qr?iban=NL00BANK0123456789&name=Salon%20X&amount=48.00&ref=INV-0012

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import QRCode from "npm:qrcode@1.5.3";

// Light per-IP rate limit — it's a public image endpoint.
const RATE = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string) {
  const now = Date.now();
  const e = RATE.get(ip);
  if (!e || e.resetAt < now) { RATE.set(ip, { count: 1, resetAt: now + 60000 }); return true; }
  if (e.count >= 120) return false;
  e.count++;
  return true;
}

serve(async (req) => {
  if (req.method !== "GET") return new Response("method_not_allowed", { status: 405 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(ip)) return new Response("rate_limited", { status: 429 });

  const url = new URL(req.url);
  const iban = (url.searchParams.get("iban") || "").replace(/\s+/g, "").toUpperCase();
  const name = (url.searchParams.get("name") || "").slice(0, 70);
  const amountRaw = parseFloat(url.searchParams.get("amount") || "");
  const ref = (url.searchParams.get("ref") || "").slice(0, 140);

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(iban)) return new Response("invalid_iban", { status: 400 });
  if (!name) return new Response("missing_name", { status: 400 });
  if (!Number.isFinite(amountRaw) || amountRaw <= 0 || amountRaw > 99999) return new Response("invalid_amount", { status: 400 });

  // EPC069-12 "quick response code" payload, version 002 (BIC optional
  // within SEPA). Line 11 is the unstructured remittance (the invoice ref).
  const payload = [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    name,
    iban,
    `EUR${amountRaw.toFixed(2)}`,
    "",
    "",
    ref,
  ].join("\n");

  try {
    // toDataURL uses the pure-JS PNG encoder in a non-browser environment —
    // no canvas needed. M error-correction is the EPC-recommended level.
    const dataUrl: string = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 260,
      color: { dark: "#1a1714", light: "#ffffff" },
    });
    const b64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/png",
        // Same params always render the same QR — let email clients cache it.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("payment-qr render failed:", e);
    return new Response("render_failed", { status: 500 });
  }
});

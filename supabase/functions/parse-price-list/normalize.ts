// supabase/functions/parse-price-list/normalize.ts
//
// Het antwoord van Claude (JSON volgens SCHEMA) controleren en opschonen
// voordat het naar de salon gaat: lege of dubbele regels eruit, prijzen en
// tijden binnen redelijke grenzen, categorieën met dezelfde naam samengevoegd.
// Los van index.ts zodat het met node te testen is (normalize.test.mjs).

export const MAX_SERVICES = 200;

// JSON-schema voor output_config.format (structured outputs): elk object met
// additionalProperties false en alle velden verplicht; "geen waarde" = null.
const nullable = (t: Record<string, unknown>) => ({ anyOf: [t, { type: "null" }] });
export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readable", "language", "currency", "note", "categories"],
  properties: {
    readable: { type: "boolean" },
    language: nullable({ type: "string" }),
    currency: nullable({ type: "string" }),
    note: nullable({ type: "string" }),
    categories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "name_nl", "name_en", "name_es", "services"],
        properties: {
          name: { type: "string" },
          name_nl: { type: "string" },
          name_en: { type: "string" },
          name_es: { type: "string" },
          services: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "name_nl", "name_en", "name_es", "description", "price", "price_from", "duration_minutes", "duration_estimated"],
              properties: {
                name: { type: "string" },
                name_nl: { type: "string" },
                name_en: { type: "string" },
                name_es: { type: "string" },
                description: nullable({ type: "string" }),
                price: nullable({ type: "number" }),
                price_from: { type: "boolean" },
                duration_minutes: nullable({ type: "integer" }),
                duration_estimated: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type ParsedService = {
  name: string; name_nl: string; name_en: string; name_es: string;
  description: string | null; price: number | null; price_from: boolean;
  duration: number; duration_estimated: boolean;
};
export type ParsedCategory = { name: string; name_nl: string; name_en: string; name_es: string; services: ParsedService[] };
export type Parsed = {
  readable: boolean; language: string | null; currency: string | null; note: string | null;
  categories: ParsedCategory[]; count: number; truncated: boolean;
};

const str = (v: unknown, max: number): string => {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max);
};

// "45", "45,50", "1.250,00", "$ 45.00" → getal; anders null.
export function toPrice(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === "number" && Number.isFinite(v)) n = v;
  else if (typeof v === "string") {
    let s = v.replace(/[^\d.,-]/g, "");
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    const p = parseFloat(s);
    n = Number.isFinite(p) ? p : null;
  }
  if (n === null || n < 0 || n > 100000) return null;
  return Math.round(n * 100) / 100;
}

// Minuten, afgerond op 5, tussen 5 en 600. Onbekend → null.
export function toDuration(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(600, Math.max(5, Math.round(n / 5) * 5));
}

export function normalize(raw: unknown): Parsed {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lang = str(r.language, 8).toLowerCase();
  const cur = str(r.currency, 8).toUpperCase();
  const out: Parsed = {
    readable: r.readable !== false,
    language: /^[a-z]{2,3}$/.test(lang) ? lang : null,
    currency: /^[A-Z]{3}$/.test(cur) ? cur : null,
    note: str(r.note, 400) || null,
    categories: [],
    count: 0,
    truncated: false,
  };
  const byName = new Map<string, ParsedCategory>();
  const seen = new Set<string>();
  const cats = Array.isArray(r.categories) ? r.categories : [];
  for (const c of cats) {
    const cr = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const cname = str(cr.name, 80) || str(cr.name_nl, 80) || str(cr.name_en, 80);
    const key = cname.toLowerCase();
    let cat = byName.get(key);
    if (!cat) {
      cat = {
        name: cname,
        name_nl: str(cr.name_nl, 80) || cname,
        name_en: str(cr.name_en, 80) || cname,
        name_es: str(cr.name_es, 80) || cname,
        services: [],
      };
    }
    const svcs = Array.isArray(cr.services) ? cr.services : [];
    for (const s of svcs) {
      const sr = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const name = str(sr.name, 120) || str(sr.name_nl, 120) || str(sr.name_en, 120);
      if (!name) continue;
      const price = toPrice(sr.price);
      // Zelfde naam én prijs in dezelfde categorie = dubbel gelezen (bv. twee
      // foto's die elkaar overlappen).
      const dupKey = `${key}|${name.toLowerCase()}|${price ?? ""}`;
      if (seen.has(dupKey)) continue;
      if (out.count >= MAX_SERVICES) { out.truncated = true; break; }
      seen.add(dupKey);
      const dur = toDuration(sr.duration_minutes);
      cat.services.push({
        name,
        name_nl: str(sr.name_nl, 120) || name,
        name_en: str(sr.name_en, 120) || name,
        name_es: str(sr.name_es, 120) || name,
        description: str(sr.description, 600) || null,
        price,
        price_from: sr.price_from === true,
        duration: dur ?? 60,
        duration_estimated: dur === null || sr.duration_estimated === true,
      });
      out.count++;
    }
    if (cat.services.length && !byName.has(key)) { byName.set(key, cat); out.categories.push(cat); }
    if (out.truncated) break;
  }
  if (out.count === 0) out.readable = false;
  return out;
}

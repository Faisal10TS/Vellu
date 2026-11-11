// src/afsprakenImport.js
//
// Afspraken importeren (11-11-2026, Faisal: "so can we do that u can also
// import upcoming appointments"). Salons stapten niet over omdat hun agenda
// weken vooruit in Fresha/Setmore/Salonized stond: alles overtikken of twee
// systemen naast elkaar. Nu: de export van het oude systeem (CSV, Excel .xlsx,
// of de HTML/XML-"xls" die sommige systemen maken) erin, de salon controleert
// kolommen, diensten en medewerkers, en de toekomstige afspraken staan in één
// keer in de agenda.
//
// Alles gebeurt in de browser: het bestand met klantgegevens gaat nergens heen
// (geen AI, geen opslag), alleen de afspraken zelf komen in de database.
//
// Deze module is puur (geen React, geen Supabase), zodat de node-test hem
// rechtstreeks kan draaien: bestand → tabel → kolommen → afspraken → koppelen.

const DAY_MS = 86400000;
const pad2 = (n) => String(n).padStart(2, "0");

export class ImportError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// ── 1. Bestand → tabel (rijen met cellen als tekst) ─────────────────────────

export async function readTableFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return readTableBytes(bytes, file.name || "");
}

export async function readTableBytes(bytes, name = "") {
  const lower = String(name).toLowerCase();
  const b = (i) => bytes[i];
  if (bytes.length >= 4 && b(0) === 0x50 && b(1) === 0x4b && b(2) === 3 && b(3) === 4) return readXlsx(bytes);
  // Oud binair Excel (.xls, BIFF): niet te lezen zonder zware bibliotheek.
  if (bytes.length >= 4 && b(0) === 0xd0 && b(1) === 0xcf && b(2) === 0x11 && b(3) === 0xe0) throw new ImportError("xls_binary");
  if ((bytes.length >= 4 && b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) || lower.endsWith(".pdf")) throw new ImportError("pdf");
  if (lower.endsWith(".numbers")) throw new ImportError("numbers");
  const text = decodeText(bytes);
  const head = text.slice(0, 4000).replace(/^\uFEFF/, "").trimStart();
  if (head.startsWith("<")) {
    if (/urn:schemas-microsoft-com:office:spreadsheet|<(ss:)?Workbook\b/i.test(text.slice(0, 20000))) return readSpreadsheetMl(text);
    if (/<table\b/i.test(text)) return readHtmlTable(text);
  }
  return parseDelimited(text);
}

// UTF-16 (Excel "Unicode-tekst"), UTF-8, anders Windows-1252 (Nederlandse
// Excel bewaart CSV zo; zie de klanten-import).
function decodeText(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}

// CSV/TSV met aanhalingstekens. Scheidingsteken: wat in de eerste regels het
// vaakst voorkomt (tab, puntkomma of komma) — een titelregel bovenaan
// ("Appointments") telt dan niet mee als enige regel.
export function parseDelimited(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 12).join("\n");
  const count = (ch) => sample.split(ch).length - 1;
  const counts = [["\t", count("\t")], [";", count(";")], [",", count(",")]];
  counts.sort((a, b) => b[1] - a[1]);
  const delim = counts[0][1] > 0 ? counts[0][0] : ",";
  const rows = [];
  let cur = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"' && field.trim() === "") { inQ = true; field = ""; }
    else if (ch === delim) { cur.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = "";
      if (cur.some((x) => x.trim() !== "")) rows.push(cur);
      cur = [];
    } else field += ch;
  }
  if (field !== "" || cur.length) { cur.push(field); if (cur.some((x) => x.trim() !== "")) rows.push(cur); }
  return rows.map((r) => r.map((x) => x.trim()));
}

const decodeXml = (s) => String(s)
  .replace(/_x([0-9a-fA-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const stripTags = (s) => decodeXml(String(s).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const attr = (attrs, name) => { const m = new RegExp(`(?:^|\\s)(?:[\\w]+:)?${name}="([^"]*)"`).exec(attrs || ""); return m ? m[1] : null; };

// Minimale zip-lezer voor .xlsx: centrale map → bestand → inflate met de
// DecompressionStream van de browser (geen bibliotheek nodig).
async function openZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ImportError("xlsx_broken");
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  const td = new TextDecoder();
  for (let n = 0; n < total && p + 46 <= bytes.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const fname = td.decode(bytes.subarray(p + 46, p + 46 + nameLen)).replace(/^\//, "").toLowerCase();
    entries.set(fname, { method, csize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const read = async (fname) => {
    const e = entries.get(String(fname).replace(/^\//, "").toLowerCase());
    if (!e) return null;
    if (dv.getUint32(e.local, true) !== 0x04034b50) throw new ImportError("xlsx_broken");
    const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
    const data = bytes.subarray(start, start + e.csize);
    if (e.method === 0) return td.decode(data);
    if (e.method !== 8) throw new ImportError("xlsx_broken");
    if (typeof DecompressionStream === "undefined") throw new ImportError("xlsx_unsupported");
    try {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return td.decode(await new Response(stream).arrayBuffer());
    } catch { throw new ImportError("xlsx_unsupported"); }
  };
  return { read, names: [...entries.keys()] };
}

// Ingebouwde Excel-getalnotaties die een datum of tijd zijn.
const DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateFormatCode = (code) => {
  const bare = String(code || "").replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(bare) && !/^general$/i.test(bare.trim());
};

// Excel-serienummer → "jjjj-mm-dd", "uu:mm" of "jjjj-mm-dd uu:mm".
export function serialToText(v, date1904 = false) {
  let n = Number(v);
  if (!Number.isFinite(n) || n < 0) return String(v);
  if (date1904) n += 1462;
  const totalMin = Math.round(n * 1440);
  const days = Math.floor(totalMin / 1440), mins = totalMin - days * 1440;
  const hm = `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
  if (days === 0) return hm;
  const ymd = new Date(Date.UTC(1899, 11, 30) + days * DAY_MS).toISOString().slice(0, 10);
  return mins === 0 ? ymd : `${ymd} ${hm}`;
}

async function readXlsx(bytes) {
  const zip = await openZip(bytes);
  const wb = (await zip.read("xl/workbook.xml")) || "";
  const date1904 = /date1904="(1|true)"/i.test(wb);
  // Eerste werkblad: workbook.xml → r:id → workbook.xml.rels → pad.
  let sheetPath = null;
  const firstSheet = /<(?:\w+:)?sheet\b([^>]*)>/.exec(wb);
  const rid = firstSheet ? attr(firstSheet[1], "id") : null;
  const rels = (await zip.read("xl/_rels/workbook.xml.rels")) || "";
  if (rid) {
    for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)>/g)) {
      if (attr(m[1], "Id") === rid) {
        const target = attr(m[1], "Target") || "";
        sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
        break;
      }
    }
  }
  let sheet = sheetPath ? await zip.read(sheetPath) : null;
  if (!sheet) {
    const first = zip.names.filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0];
    sheet = first ? await zip.read(first) : null;
  }
  if (!sheet) throw new ImportError("xlsx_broken");
  const shared = [];
  const sst = await zip.read("xl/sharedStrings.xml");
  if (sst) {
    for (const m of sst.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) {
      // Rich text: alle <t>-stukken achter elkaar; fonetische hulp (rPh) niet.
      const body = m[1].replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
      shared.push([...body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((t) => decodeXml(t[1])).join(""));
    }
  }
  const dateStyle = [];
  const styles = await zip.read("xl/styles.xml");
  if (styles) {
    const custom = new Map();
    for (const m of styles.matchAll(/<(?:\w+:)?numFmt\b([^>]*)\/?>/g)) custom.set(Number(attr(m[1], "numFmtId")), decodeXml(attr(m[1], "formatCode") || ""));
    const xfs = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(styles);
    if (xfs) for (const m of xfs[1].matchAll(/<(?:\w+:)?xf\b([^>]*?)\/?>/g)) {
      const id = Number(attr(m[1], "numFmtId") || 0);
      dateStyle.push(DATE_FMT_IDS.has(id) || (custom.has(id) && isDateFormatCode(custom.get(id))));
    }
  }
  const colIndex = (ref) => {
    const letters = /^[A-Z]+/i.exec(ref || "");
    if (!letters) return -1;
    let n = 0;
    for (const ch of letters[0].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  const rows = [];
  for (const rm of sheet.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const row = [];
    let next = 0;
    for (const cm of rm[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const a = cm[1] || "", inner = cm[2] || "";
      const at = colIndex(attr(a, "r"));
      const idx = at >= 0 ? at : next;
      next = idx + 1;
      const t = attr(a, "t") || "n";
      const vm = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
      const raw = vm ? decodeXml(vm[1]) : "";
      let val = "";
      if (t === "s") val = shared[Number(raw)] ?? "";
      else if (t === "inlineStr") val = [...inner.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((x) => decodeXml(x[1])).join("");
      else if (t === "b") val = raw === "1" ? "TRUE" : raw ? "FALSE" : "";
      else if (t === "n" && raw !== "" && dateStyle[Number(attr(a, "s") || 0)]) val = serialToText(raw, date1904);
      else val = raw;
      while (row.length < idx) row.push("");
      row[idx] = String(val).trim();
    }
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}

// Excel 2003 XML ("SpreadsheetML"), wat sommige systemen als .xls exporteren.
function readSpreadsheetMl(text) {
  const rows = [];
  for (const rm of text.matchAll(/<(?:ss:)?Row\b[^>]*>([\s\S]*?)<\/(?:ss:)?Row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<(?:ss:)?Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:ss:)?Cell>)/g)) {
      const at = Number(attr(cm[1], "Index") || 0);
      if (at > 0) while (row.length < at - 1) row.push("");
      const dm = /<(?:ss:)?Data\b([^>]*)>([\s\S]*?)<\/(?:ss:)?Data>/.exec(cm[2] || "");
      let v = dm ? stripTags(dm[2]) : "";
      // DateTime: alleen-datum (00:00) wordt een datum, alleen-tijd (Excel
      // zet daar 1899-12-31 voor) een tijd — anders stond elke afspraak zonder
      // tijdkolom om middernacht.
      const dt = dm && /DateTime/i.test(attr(dm[1], "Type") || "") ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(v) : null;
      if (dt) v = dt[1] === "1899-12-31" ? dt[2] : dt[2] === "00:00" ? dt[1] : `${dt[1]} ${dt[2]}`;
      row.push(v);
    }
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}

// HTML-tabel met de extensie .xls (veel webapps exporteren zo).
function readHtmlTable(text) {
  const rows = [];
  for (const rm of text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
      row.push(stripTags(cm[3]));
      const span = Number(attr(cm[2], "colspan") || 1);
      for (let k = 1; k < span && k < 50; k++) row.push("");
    }
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}

// ── 2. Kopregel en kolommen ────────────────────────────────────────────────

export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9@]+/g, " ").trim();
const hasPhrase = (n, p) => ` ${n} `.includes(` ${p} `);

// Velden in de volgorde van het kolommenblok in het scherm.
export const FIELDS = ["date", "time", "end", "duration", "client", "first", "last", "phone", "email", "service", "staff", "price", "notes", "status"];

const SYN = {
  date: ["date", "datum", "fecha", "appointment date", "scheduled date", "start date", "afspraakdatum", "afspraak datum", "day", "dag", "dia", "date time", "datetime", "date and time", "datum en tijd", "datum tijd", "fecha y hora", "scheduled", "scheduled on", "booking date", "boekingsdatum", "starts at", "start date time", "visit date", "bezoekdatum"],
  time: ["time", "tijd", "hora", "start time", "starttijd", "begintijd", "begin", "start", "from", "van", "inicio", "hora de inicio", "hora inicio", "appointment time", "scheduled time", "aanvang", "tijdstip"],
  end: ["end time", "eindtijd", "end", "einde", "eind", "tot", "until", "ends", "ends at", "finish", "fin", "hora fin", "hora de fin", "hora final"],
  duration: ["duration", "duur", "duracion", "length", "lengte", "minutes", "minuten", "minutos", "mins", "min", "tijdsduur", "duration min", "duration minutes", "duration mins", "duur min", "duur minuten", "duur in minuten"],
  client: ["client", "customer", "klant", "cliente", "client name", "customer name", "klantnaam", "naam klant", "nombre del cliente", "nombre cliente", "name", "naam", "nombre", "full name", "volledige naam", "guest", "gast", "patient"],
  first: ["first name", "voornaam", "given name", "client first name", "customer first name", "nombre de pila"],
  last: ["last name", "achternaam", "surname", "family name", "apellido", "apellidos", "client last name", "customer last name"],
  phone: ["phone", "telephone", "telefoon", "telefoonnummer", "tel", "mobile", "mobiel", "mobiel nummer", "gsm", "cell", "cellphone", "celular", "telefono", "phone number", "mobile number", "mobile phone", "client phone", "customer phone", "client mobile", "whatsapp", "movil"],
  email: ["email", "e mail", "mail", "correo", "correo electronico", "email address", "e mail address", "e mailadres", "emailadres", "client email", "customer email"],
  service: ["service", "services", "dienst", "diensten", "behandeling", "behandelingen", "treatment", "treatments", "servicio", "servicios", "tratamiento", "tratamientos", "service name", "appointment type", "type afspraak", "item", "items", "omschrijving", "description", "descripcion"],
  staff: ["staff", "staff member", "team member", "team", "employee", "medewerker", "medewerkers", "medewerker naam", "stylist", "specialist", "provider", "resource", "empleado", "empleada", "profesional", "professional", "barber", "kapper", "therapist", "behandelaar", "assigned to", "with", "met", "employee name", "staff name"],
  price: ["price", "prijs", "precio", "amount", "bedrag", "total", "totaal", "cost", "kosten", "value", "waarde", "importe", "service price", "total price", "totaalprijs", "tarief", "rate"],
  notes: ["notes", "note", "notities", "notitie", "opmerking", "opmerkingen", "comment", "comments", "notas", "nota", "remarks", "memo", "internal notes", "booking notes", "appointment notes", "observaciones", "comentarios"],
  status: ["status", "estado", "state", "booking status", "appointment status"],
};
// Kolommen die op een veld lijken maar het niet zijn ("Created date" is
// wanneer er geboekt werd, niet de afspraak; "Paid" is geen prijs).
const NEG = {
  date: ["created", "creation", "aangemaakt", "geboekt op", "booked on", "birth", "geboorte", "nacimiento", "last visit", "laatste bezoek", "paid", "betaald", "cancel", "annul", "modified", "updated", "gewijzigd", "sale", "verkoop", "invoice", "factuur", "creado", "creacion", "pago", "type", "end", "eind"],
  time: ["created", "aangemaakt", "duration", "duur", "updated", "end", "eind", "creado"],
  end: ["date", "datum", "fecha"],
  price: ["paid", "betaald", "tip", "fooi", "deposit", "aanbetaling", "discount", "korting", "tax", "btw", "vat", "iva", "pagado", "descuento", "propina", "count", "aantal"],
  client: ["phone", "telefoon", "email", "mail", "tel", "mobile", "first", "last", "voornaam", "achternaam", "id", "number", "nummer", "since", "notes", "note", "address", "adres", "birth", "service", "staff", "team", "employee"],
  service: ["price", "prijs", "duration", "duur", "category", "categorie", "id", "notes", "staff", "count", "aantal"],
  staff: ["id", "email", "phone", "mail"],
  notes: ["client notes"],
};
const negHit = (n, x) => (x.length <= 4 ? hasPhrase(n, x) : n.includes(x));

function scoreHeader(h, field) {
  const n = norm(h);
  if (!n) return 0;
  if ((NEG[field] || []).some((x) => negHit(n, x))) return 0;
  for (const s of SYN[field]) if (n === s) return 100 + s.length;
  let best = 0;
  for (const s of SYN[field]) if (hasPhrase(n, s)) best = Math.max(best, 50 + s.length);
  return best;
}

// Per veld de beste kolom; een kolom hoort bij hooguit één veld.
export function detectColumns(header) {
  const cand = [];
  (header || []).forEach((h, i) => FIELDS.forEach((f) => { const s = scoreHeader(h, f); if (s) cand.push({ i, f, s }); }));
  cand.sort((a, b) => b.s - a.s || a.i - b.i);
  const map = Object.fromEntries(FIELDS.map((f) => [f, -1]));
  const used = new Set();
  for (const c of cand) {
    if (map[c.f] !== -1 || used.has(c.i)) continue;
    map[c.f] = c.i; used.add(c.i);
  }
  return map;
}

// Exports beginnen soms met een titel en filters ("Appointments",
// "Period: ..."); de kopregel is de eerste regel waarin minstens twee cellen
// als veld herkend worden.
export function findHeaderRow(rows) {
  let best = 0, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const hits = (rows[i] || []).filter((h) => FIELDS.some((f) => scoreHeader(h, f) > 0)).length;
    if (hits > bestScore) { best = i; bestScore = hits; }
  }
  return bestScore >= 2 ? best : 0;
}

// ── 3. Waarden lezen ────────────────────────────────────────────────────────

const MONTHS = {
  jan: 1, january: 1, januari: 1, enero: 1, ene: 1,
  feb: 2, february: 2, februari: 2, febrero: 2,
  mar: 3, march: 3, maart: 3, mrt: 3, marzo: 3, maa: 3,
  apr: 4, april: 4, abril: 4, abr: 4,
  may: 5, mei: 5, mayo: 5,
  jun: 6, june: 6, juni: 6, junio: 6,
  jul: 7, july: 7, juli: 7, julio: 7,
  aug: 8, august: 8, augustus: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9, set: 9, setiembre: 9,
  oct: 10, october: 10, oktober: 10, okt: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
};

const validYmd = (y, m, d) => {
  const Y = Number(y), M = Number(m), D = Number(d);
  if (!(Y >= 2000 && Y <= 2100 && M >= 1 && M <= 12 && D >= 1 && D <= 31)) return null;
  const dt = new Date(Date.UTC(Y, M - 1, D));
  if (dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D) return null;
  return `${Y}-${pad2(M)}-${pad2(D)}`;
};
const fullYear = (y) => { const n = Number(y); return String(y).length <= 2 ? 2000 + n : n; };
const cutOut = (s, start, len) => `${s.slice(0, start)} ${s.slice(start + len)}`;

// Is de volgorde van "03/04/2026" in dit bestand dag-maand of maand-dag?
// "dmy"/"mdy" als een waarde het verraadt (13 of hoger), anders null.
export function detectDateOrder(values) {
  let dmy = false, mdy = false;
  for (const v of values) {
    const s = String(v ?? "");
    if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) continue;
    const m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/.exec(s);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  return null;
}
// Komen er in dit bestand datums als 03/04/2026 voor (cijfers, geen jaar
// vooraan)? Dan moet de volgorde kloppen; het scherm laat hem kiezen.
// Geen lookbehind ((?<!…)) in deze module: oudere iPhones (iOS < 16.4) kunnen
// die niet lezen en dan laadt het hele dashboard niet.
export const hasNumericDates = (values) => values.some((v) => /(^|\D)\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?!\d)/.test(String(v ?? "")) && !/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(String(v ?? "")));

// Datum uit een cel: { ymd, rest } (rest = de cel zonder de datum, voor de
// tijd in "12-11-2026 14:00") of null.
export function parseDateIn(raw, order = "dmy", todayYmd = null) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) return parseDateIn(serialToText(n), order, todayYmd);
  }
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(s);
  if (m) { const ymd = validYmd(m[1], m[2], m[3]); if (ymd) return { ymd, rest: cutOut(s, m.index, m[0].length) }; }
  m = /(^|\D)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(s);
  if (m) {
    const a = Number(m[2]), b = Number(m[3]);
    let d, mo;
    if (a > 12) { d = a; mo = b; } else if (b > 12) { d = b; mo = a; } else if (order === "mdy") { d = b; mo = a; } else { d = a; mo = b; }
    const ymd = validYmd(fullYear(m[4]), mo, d);
    if (ymd) return { ymd, rest: cutOut(s, m.index + m[1].length, m[0].length - m[1].length) };
  }
  // Maand in letters: "12 nov 2026", "Nov 12, 2026", "wo 12 november",
  // "mar 12 nov" (mar = dinsdag in het Spaans: de laatste maandnaam telt).
  const toks = [...s.matchAll(/[A-Za-zÀ-ÿ]+\.?|\d+/g)].map((t) => ({ t: t[0], i: t.index, n: norm(t[0]) }));
  let mi = -1;
  toks.forEach((t, k) => { if (MONTHS[t.n] && !/^\d/.test(t.t)) mi = k; });
  if (mi === -1) return null;
  const month = MONTHS[toks[mi].n];
  const near = [toks[mi - 1], toks[mi + 1], toks[mi - 2], toks[mi + 2]].filter(Boolean);
  const dayTok = near.find((t) => /^\d{1,2}$/.test(t.t) && Number(t.t) >= 1 && Number(t.t) <= 31 && !/^:/.test(s.slice(t.i + t.t.length, t.i + t.t.length + 1)));
  if (!dayTok) return null;
  const yearTok = toks.find((t) => /^\d{4}$/.test(t.t) && Number(t.t) >= 2000 && Number(t.t) <= 2100);
  let year;
  if (yearTok) year = Number(yearTok.t);
  else {
    // Geen jaar: dit jaar, of volgend jaar als de datum al ruim voorbij is.
    const today = todayYmd || new Date().toISOString().slice(0, 10);
    year = Number(today.slice(0, 4));
    const tryYmd = validYmd(year, month, Number(dayTok.t));
    if (tryYmd && tryYmd < addDays(today, -31)) year += 1;
  }
  const ymd = validYmd(year, month, Number(dayTok.t));
  if (!ymd) return null;
  let rest = s;
  for (const t of [yearTok, dayTok, toks[mi]].filter(Boolean).sort((x, y) => y.i - x.i)) rest = cutOut(rest, t.i, t.t.length);
  return { ymd, rest };
}

export const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

// Tijd: "14:00", "14.00", "14u30", "2:30 PM", "2pm", Excel-fractie "0.5833".
export function parseTimeIn(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^0?\.\d+$/.test(s)) {
    const mins = Math.round(Number(s) * 1440);
    if (mins >= 0 && mins < 1440) return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
  }
  let m = /(^|[^\d:.])(\d{1,2})(?:[:.hu](\d{2}))?(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?![a-z])/i.exec(s);
  if (m) {
    let h = Number(m[2]); const mi = Number(m[3] || 0);
    if (h >= 1 && h <= 12 && mi <= 59) {
      const pm = /^p/i.test(m[4]);
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
      return `${pad2(h)}:${pad2(mi)}`;
    }
  }
  m = /(^|[^\d:.])(\d{1,2})[:.hu](\d{2})(?!\d)/i.exec(s);
  if (m && Number(m[2]) < 24 && Number(m[3]) < 60) return `${pad2(Number(m[2]))}:${m[3]}`;
  m = /^(\d{1,2})\s*(?:u|h|uur)$/i.exec(s);
  if (m && Number(m[1]) < 24) return `${pad2(Number(m[1]))}:00`;
  return null;
}

// Duur in minuten: "60", "60 min", "1h", "1h 30m", "1:30", "1 uur 30 min",
// "1,5 uur". Buiten 5–720 minuten = niet bruikbaar (null).
export function parseDuration(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  const ok = (n) => (Number.isFinite(n) && n >= 5 && n <= 720 ? Math.round(n) : null);
  let m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (m) return ok(Number(m[1]) * 60 + Number(m[2]));
  m = /^(\d{1,2})\s*[hu]\s*(\d{1,2})\s*(?:m|min|mins)?$/.exec(s);
  if (m) return ok(Number(m[1]) * 60 + Number(m[2]));
  let total = 0, hit = false;
  const h = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours|uur|u|hora|horas)(?![a-z])/.exec(s);
  if (h) { total += parseFloat(h[1]) * 60; hit = true; }
  const mm = /(\d+)\s*(?:m|min|mins|minute|minutes|minuten|minuto|minutos|mn)(?![a-z])/.exec(s);
  if (mm) { total += Number(mm[1]); hit = true; }
  if (h && !mm) { const tail = /(?:h|hr|hrs|hour|hours|uur|u|hora|horas)\s*(\d{1,2})\s*$/.exec(s); if (tail) total += Number(tail[1]); }
  if (!hit && /^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    total = n > 0 && n < 1 ? n * 1440 : n; // Excel-fractie van een dag
    hit = true;
  }
  return hit ? ok(total) : null;
}

// Bedrag: "€ 45,00", "45.00", "XCG 1.234,50", "$1,234.50". Negatief = null.
export function parsePrice(raw) {
  if (raw == null || raw === "") return null;
  let s = String(raw).replace(/\s/g, "");
  if (/^-|\(-?\d/.test(s.replace(/[^\d.,()-]/g, ""))) return null;
  s = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc > -1) {
    const after = s.length - lc - 1;
    s = (s.split(",").length - 1 === 1 && after !== 3) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (ld > -1) {
    const after = s.length - ld - 1;
    if (s.split(".").length - 1 > 1 || (after === 3 && ld <= 3 && ld > 0)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
}

const CANCELLED = ["cancel", "annul", "cancelad", "no show", "noshow", "niet verschenen", "niet gekomen", "deleted", "verwijderd", "declined", "rejected", "afgewezen", "rechazad", "eliminad", "not shown", "did not show", "expired", "verlopen"];
export const isCancelledStatus = (v) => { const n = norm(v); return !!n && CANCELLED.some((x) => n.includes(x)); };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanText = (v) => String(v ?? "").replace(/^'+/, "").replace(/\s+/g, " ").trim();
export const clientKeyOf = (a) => (a.email || "").toLowerCase() || (a.phone || "").replace(/\D/g, "").slice(-9) || norm(a.client);

// ── 4. Tabel → afspraken ───────────────────────────────────────────────────
//
// Eén regel per behandeling in de export: regels van dezelfde klant op
// dezelfde dag die op elkaar aansluiten (of op hetzelfde moment beginnen, bij
// dezelfde medewerker) worden één afspraak met meerdere behandelingen.

export function buildAppointments(rows, map, { order = "dmy", todayYmd, nowHm = "00:00" } = {}) {
  const today = todayYmd || new Date().toISOString().slice(0, 10);
  const skipped = { past: 0, cancelled: 0, unreadable: 0, noClient: 0, duplicate: 0 };
  const cell = (r, f) => (map[f] >= 0 ? cleanText(r[map[f]]) : "");
  const items = [];
  const seen = new Set();
  rows.forEach((r, k) => {
    if (!r || !r.some((x) => String(x ?? "").trim())) return;
    const dRaw = cell(r, "date"), tRaw = cell(r, "time");
    const dp = parseDateIn(dRaw, order, today) || parseDateIn(tRaw, order, today);
    const tSrc = map.time >= 0 ? (parseDateIn(tRaw, order, today)?.rest ?? tRaw) : "";
    const time = parseTimeIn(tSrc) || parseTimeIn(parseDateIn(dRaw, order, today)?.rest ?? "");
    if (!dp || !time) { skipped.unreadable++; return; }
    if (isCancelledStatus(cell(r, "status"))) { skipped.cancelled++; return; }
    if (dp.ymd < today || (dp.ymd === today && time < nowHm)) { skipped.past++; return; }
    let duration = parseDuration(cell(r, "duration"));
    if (duration == null && map.end >= 0) {
      const endRaw = cell(r, "end");
      const end = parseTimeIn(parseDateIn(endRaw, order, today)?.rest ?? endRaw);
      if (end) {
        const diff = (Number(end.slice(0, 2)) * 60 + Number(end.slice(3))) - (Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));
        if (diff >= 5 && diff <= 720) duration = diff;
      }
    }
    let client = cell(r, "client");
    if (!client) client = [cell(r, "first"), cell(r, "last")].filter(Boolean).join(" ");
    const phone = cell(r, "phone");
    const emailRaw = cell(r, "email").toLowerCase();
    const email = EMAIL_RE.test(emailRaw) ? emailRaw : "";
    if (!client && !phone && !email) { skipped.noClient++; return; }
    if (!client) client = phone || email;
    const item = {
      line: k, date: dp.ymd, time, duration, client, phone, email,
      service: cell(r, "service"), staff: cell(r, "staff"), price: parsePrice(cell(r, "price")), notes: cell(r, "notes"),
    };
    const sig = [item.date, item.time, clientKeyOf(item), norm(item.service), norm(item.staff)].join("|");
    if (seen.has(sig)) { skipped.duplicate++; return; }
    seen.add(sig);
    items.push(item);
  });
  items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.line - b.line);
  const toMin = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const open = new Map(); // dag|klant → laatste afspraak
  const appts = [];
  for (const it of items) {
    const key = `${it.date}|${clientKeyOf(it)}`;
    const last = open.get(key);
    const part = { service: it.service, staff: it.staff, duration: it.duration, price: it.price, time: it.time };
    if (last) {
      const lp = last.parts[last.parts.length - 1];
      const sameStaff = !it.staff || !lp.staff || norm(it.staff) === norm(lp.staff);
      const adjoins = lp.duration != null && toMin(lp.time) + lp.duration === toMin(it.time);
      const sameStart = lp.time === it.time && sameStaff;
      if ((adjoins && sameStaff) || sameStart) {
        last.parts.push(part);
        if (!last.phone && it.phone) last.phone = it.phone;
        if (!last.email && it.email) last.email = it.email;
        if (it.notes && !last.notes.includes(it.notes)) last.notes = [last.notes, it.notes].filter(Boolean).join(" · ");
        continue;
      }
    }
    const appt = { key: `r${it.line}`, date: it.date, time: it.time, client: it.client, phone: it.phone, email: it.email, notes: it.notes, parts: [part] };
    appts.push(appt);
    open.set(key, appt);
  }
  return { appts, skipped };
}

// ── 5. Koppelen aan diensten en medewerkers ────────────────────────────────

const bigrams = (s) => { const t = ` ${s} `; const out = []; for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2)); return out; };
export function similarity(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return 0.85;
  const A = bigrams(x), B = bigrams(y);
  const pool = new Map();
  for (const g of B) pool.set(g, (pool.get(g) || 0) + 1);
  let hit = 0;
  for (const g of A) { const c = pool.get(g) || 0; if (c > 0) { hit++; pool.set(g, c - 1); } }
  return (2 * hit) / (A.length + B.length);
}

export const serviceNamesOf = (s) => [s.name_nl, s.name_en, s.name_es, s.name].filter(Boolean);

// Beste dienst voor een naam uit de export, of "" als niets genoeg lijkt.
export function suggestService(text, services) {
  if (!norm(text)) return "";
  let best = "", score = 0;
  for (const s of services || []) {
    for (const nm of serviceNamesOf(s)) {
      const sc = similarity(text, nm);
      if (sc > score) { score = sc; best = s.id; }
    }
  }
  return score >= 0.6 ? best : "";
}

// Medewerker: volledige naam, anders de voornaam ("Lady" ↔ "Lady Martis").
export function suggestStaff(text, staff) {
  const n = norm(text);
  if (!n) return "";
  const list = staff || [];
  const exact = list.find((s) => norm(s.name) === n);
  if (exact) return exact.id;
  const first = n.split(" ")[0];
  const byFirst = list.filter((s) => norm(s.name).split(" ")[0] === first);
  if (byFirst.length === 1) return byFirst[0].id;
  let best = "", score = 0;
  for (const s of list) { const sc = similarity(n, s.name); if (sc > score) { score = sc; best = s.id; } }
  return score >= 0.75 ? best : "";
}

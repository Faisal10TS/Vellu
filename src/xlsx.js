// src/xlsx.js
//
// Kleine .xlsx-schrijver zonder bibliotheek (22-09-2026, voor de Excel-versie
// van de rapporten). Een .xlsx is een zip met een handvol XML-bestanden; dit
// bestand maakt precies dat en niets meer: werkbladen met tekst, getallen,
// datums, formules (met vooraf berekende waarde), een paar vaste opmaakstijlen,
// kolombreedtes, een bevroren kopregel en een filter. Geen sharedStrings (tekst
// staat inline), geen compressie (Excel, Numbers, Google Sheets en LibreOffice
// lezen "stored" zips), geen afbeeldingen.
//
// Waarom geen SheetJS/ExcelJS: die zijn honderden KB's, de npm-versie van
// SheetJS is verouderd met bekende kwetsbaarheden en de officiële versie moet
// van hun eigen CDN komen — een deploy die afhangt van een derde partij. Wat
// hier nodig is past in een bestand dat je in vijf minuten leest.
//
// API:
//   buildXlsx({ sheets, currencySymbol }) → Uint8Array
//     sheet = { name, cols: [breedte in tekens, ...], rows: [rij, ...],
//               freeze: true  (kopregel bevriezen),
//               filter: aantalRijen  (filter over A1..laatsteKolom<aantalRijen>),
//               // Afdrukken (30-09-2026, Esther/TTNB maakte van de Excel zelf
//               // een PDF en kreeg de kolommen over losse pagina's verdeeld):
//               landscape: true|false (standaard: liggend als de kolommen samen
//                          breder zijn dan ~95 tekens), altijd passend op één
//                          paginabreedte (fitToWidth), zo veel pagina's hoog als nodig,
//               printTitleRow: rijnummer (1-based) dat op elke pagina bovenaan
//                          terugkomt (de kopregel van de tabel),
//               header: tekst linksboven op elke pagina,
//               footer: tekst in de voet; &P = paginanummer, &N = totaal }
//     rij   = [cel, ...]; cel = tekst | getal | null |
//             { v, s }            waarde met stijl (s = naam hieronder)
//             { f, v, s }         formule met vooraf berekende waarde
//             { d: "YYYY-MM-DD" } datum (als echte Excel-datum)
//   saveXlsx(filename, bytes)  → download in de browser
//
// Stijlen: text, bold, title, header, money, moneyTotal, int, intTotal, date,
// muted, textTotal, num, wrap (tekst die over meerdere regels loopt; de rij
// krijgt dan een passende hoogte, want Excel past die bij het openen van een
// bestand van buitenaf niet zelf aan).

const enc = new TextEncoder();
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const esc = (v) => String(v)
  // XML 1.0 verbiedt stuurtekens; die vliegen eruit in plaats van het bestand te breken
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const XF = { text: 0, bold: 1, title: 2, header: 3, money: 4, moneyTotal: 5, int: 6, intTotal: 7, date: 8, muted: 9, textTotal: 10, num: 11, wrap: 12 };

// Kolomletter: 0 → A, 25 → Z, 26 → AA.
export const colLetter = (i) => { let n = i + 1, out = ""; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; };

// Excel-datum = dagen sinds 30-12-1899 (het 1900-stelsel, inclusief de fout
// van 1900 als schrikkeljaar — daarom 30 december en niet 31).
const dateSerial = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
};

// Werkbladnaam: max 31 tekens, zonder [ ] : * ? / \ en niet leeg.
const sheetName = (name, i) => {
  const n = String(name || "").replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return n || `Sheet${i + 1}`;
};

function cellXml(ref, cell) {
  if (cell === null || cell === undefined || cell === "") return "";
  if (typeof cell === "number") return Number.isFinite(cell) ? `<c r="${ref}"><v>${cell}</v></c>` : "";
  if (typeof cell === "string") return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`;
  if (typeof cell === "boolean") return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
  const style = cell.s ? (XF[cell.s] ?? 0) : 0;
  const sAttr = style ? ` s="${style}"` : "";
  if (cell.d !== undefined) {
    const serial = dateSerial(cell.d);
    // Onherkenbare datum: dan maar als tekst, nooit een leeg vak
    return serial === null ? cellXml(ref, { v: String(cell.d), s: cell.s }) : `<c r="${ref}" s="${cell.s ? XF[cell.s] ?? XF.date : XF.date}"><v>${serial}</v></c>`;
  }
  if (cell.f) {
    const cached = typeof cell.v === "number" && Number.isFinite(cell.v) ? `<v>${cell.v}</v>` : "";
    return `<c r="${ref}"${sAttr}><f>${esc(cell.f)}</f>${cached}</c>`;
  }
  const v = cell.v;
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${sAttr}><v>${v}</v></c>` : "";
  if (typeof v === "boolean") return `<c r="${ref}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(sheet, index) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const maxCols = Math.max(1, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)), (sheet.cols || []).length);
  const lastCol = colLetter(maxCols - 1);
  const dim = `A1:${lastCol}${Math.max(1, rows.length)}`;
  let cols = "";
  if (Array.isArray(sheet.cols) && sheet.cols.length) {
    cols = "<cols>" + sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(2, Number(w) || 10)}" customWidth="1"/>`).join("") + "</cols>";
  }
  // Rijhoogte voor cellen met stijl "wrap": geschat aantal regels × 15 pt.
  // Een kolombreedte van w tekens biedt ruwweg w-1 tekens per regel.
  const widthOf = (ci) => Math.max(2, Number((sheet.cols || [])[ci]) || 10);
  const linesOf = (cell, ci) => {
    if (!cell || typeof cell !== "object" || cell.s !== "wrap") return 1;
    const txt = String(cell.v ?? "");
    const perLine = Math.max(4, widthOf(ci) - 1);
    return Math.max(1, ...txt.split(/\r?\n/).map((l) => Math.ceil(l.length / perLine)));
  };
  let data = "";
  rows.forEach((row, ri) => {
    if (!Array.isArray(row) || row.length === 0) return;
    const cells = row.map((cell, ci) => cellXml(`${colLetter(ci)}${ri + 1}`, cell)).join("");
    if (!cells) return;
    const lines = Math.max(1, ...row.map((cell, ci) => linesOf(cell, ci)));
    const ht = lines > 1 ? ` ht="${Math.min(409, lines * 15 + 2)}" customHeight="1"` : "";
    data += `<row r="${ri + 1}"${ht}>${cells}</row>`;
  });
  const pane = sheet.freeze
    ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>`
    : "";
  const filterRef = sheet.filter ? `A1:${lastCol}${Math.max(1, Math.min(rows.length, Number(sheet.filter) || rows.length))}` : "";
  // Afdrukstand: liggend zodra de kolommen samen breder zijn dan een staande
  // A4 (~95 tekens), en altijd op één paginabreedte geschaald — anders zet
  // Excel de rechterkolommen op aparte pagina's ("eerst omlaag, dan opzij").
  const totalWidth = (sheet.cols || []).reduce((n, w) => n + (Number(w) || 10), 0);
  const landscape = sheet.landscape ?? totalWidth > 95;
  const hf = (t) => esc(String(t || "").replace(/&(?![LCRPNDTFA])/g, "&&"));
  const headerFooter = (sheet.header || sheet.footer)
    ? `<headerFooter>${sheet.header ? `<oddHeader>&amp;L${hf(sheet.header)}</oddHeader>` : ""}${sheet.footer ? `<oddFooter>&amp;R${hf(sheet.footer)}</oddFooter>` : ""}</headerFooter>`
    : "";
  return XML_HEAD +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="${dim}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${index === 0 ? ' tabSelected="1"' : ""}>${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    cols +
    `<sheetData>${data}</sheetData>` +
    (filterRef ? `<autoFilter ref="${filterRef}"/>` : "") +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="${landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>` +
    headerFooter +
    `</worksheet>`;
}

function stylesXml(currencySymbol) {
  // Valuta als letterlijke tekst in de notatie; Excel zet de duizend- en
  // decimaalscheiders zelf naar de taal van de gebruiker (€ 1.234,56 in NL).
  const money = esc(`"${String(currencySymbol || "€").replace(/"/g, "")}"#,##0.00`);
  return XML_HEAD +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="${money}"/></numFmts>` +
    `<fonts count="4">` +
      `<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>` +
      `<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>` +
      `<font><b/><sz val="15"/><name val="Calibri"/><family val="2"/></font>` +
      `<font><sz val="9"/><color rgb="FF7A7A7A"/><name val="Calibri"/><family val="2"/></font>` +
    `</fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5F3EF"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="3">` +
      `<border><left/><right/><top/><bottom/><diagonal/></border>` +
      `<border><left/><right/><top/><bottom style="thin"><color rgb="FFD9D3C7"/></bottom><diagonal/></border>` +
      `<border><left/><right/><top style="thin"><color rgb="FF8A7356"/></top><bottom/><diagonal/></border>` +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="13">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +                                                        // 0 text
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +                                          // 1 bold
      `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +                                          // 2 title
      `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +            // 3 header
      `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +                                // 4 money
      `<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>` +  // 5 moneyTotal
      `<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +                                  // 6 int
      `<xf numFmtId="1" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>` +    // 7 intTotal
      `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +                                 // 8 date
      `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +                                          // 9 muted
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>` +                          // 10 textTotal
      `<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +                                  // 11 num
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf>` + // 12 wrap (onderaan uitgelijnd, net als de rest van de rij)
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;
}

// ── zip (stored) ─────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (bytes) => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function zipStore(entries) {
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.bytes;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true); cd.setUint16(14, dosDate, true); cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, name.length, true);
    cd.setUint16(30, 0, true); cd.setUint16(32, 0, true); cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true);
  eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true); eocd.setUint16(20, 0, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...parts, ...central, new Uint8Array(eocd.buffer)]) { out.set(part, p); p += part.length; }
  return out;
}

// ── werkboek ─────────────────────────────────────────────────────────────
export function buildXlsx({ sheets, currencySymbol = "€", creator = "Vellu" }) {
  const list = (Array.isArray(sheets) ? sheets : []).filter(Boolean);
  if (!list.length) throw new Error("xlsx: geen werkbladen");
  const names = list.map((sh, i) => sheetName(sh.name, i));
  // Dubbele namen mag Excel niet: nummer ze.
  names.forEach((n, i) => { let k = 2; while (names.slice(0, i).includes(names[i])) names[i] = `${n.slice(0, 28)} ${k++}`; });

  const contentTypes = XML_HEAD +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;
  const rootRels = XML_HEAD +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`;
  // Filters horen een verborgen naam _FilterDatabase per blad te hebben; een
  // kopregel die op elke afgedrukte pagina terugkomt heet _xlnm.Print_Titles.
  const defined = list.map((sh, i) => {
    const q = `'${esc(names[i].replace(/'/g, "''"))}'`;
    let out = "";
    if (sh.filter) {
      const rows = Array.isArray(sh.rows) ? sh.rows : [];
      const maxCols = Math.max(1, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)), (sh.cols || []).length);
      const last = Math.max(1, Math.min(rows.length, Number(sh.filter) || rows.length));
      out += `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${q}!$A$1:$${colLetter(maxCols - 1)}$${last}</definedName>`;
    }
    const pt = parseInt(sh.printTitleRow);
    if (pt > 0) out += `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${q}!$${pt}:$${pt}</definedName>`;
    return out;
  }).join("");
  const workbook = XML_HEAD +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000"/></bookViews>` +
    `<sheets>${list.map((_, i) => `<sheet name="${esc(names[i])}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
    (defined ? `<definedNames>${defined}</definedNames>` : "") +
    `</workbook>`;
  const wbRels = XML_HEAD +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const core = XML_HEAD +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:creator>${esc(creator)}</dc:creator><cp:lastModifiedBy>${esc(creator)}</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
    `</cp:coreProperties>`;
  const app = XML_HEAD +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>${esc(creator)}</Application></Properties>`;

  const entries = [
    { name: "[Content_Types].xml", bytes: enc.encode(contentTypes) },
    { name: "_rels/.rels", bytes: enc.encode(rootRels) },
    { name: "xl/workbook.xml", bytes: enc.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", bytes: enc.encode(wbRels) },
    { name: "xl/styles.xml", bytes: enc.encode(stylesXml(currencySymbol)) },
    ...list.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, bytes: enc.encode(sheetXml(sh, i)) })),
    { name: "docProps/core.xml", bytes: enc.encode(core) },
    { name: "docProps/app.xml", bytes: enc.encode(app) },
  ];
  return zipStore(entries);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Download in de browser via een tijdelijke blob-URL (zelfde route als een
// CSV-export). Op iOS Safari opent dit de deel-/bewaardialoog.
export function saveXlsx(filename, bytes) {
  const blob = new Blob([bytes], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

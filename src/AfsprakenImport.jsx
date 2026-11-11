// src/AfsprakenImport.jsx
//
// Afspraken importeren (11-11-2026). Venster in drie stappen:
//   1. kiezen   — uitleg + bestand kiezen (CSV, Excel .xlsx, HTML/XML-"xls")
//   2. controleren — kolommen, datumvolgorde, diensten en medewerkers koppelen,
//                  lijst met wat erin komt en wat wordt overgeslagen
//   3. klaar    — aantal + "ongedaan maken" (verwijdert precies de rijen die
//                  deze import aanmaakte)
// Het lezen zit in afsprakenImport.js (puur, getest met node). Klanten krijgen
// GEEN bevestiging: hun afspraak stond al in het oude systeem. De gewone
// herinnering vóór de afspraak wel, tenzij de salon dat uitzet.

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { NavIcon, salonNow, fmt, fmtAmt } from "./shared.jsx";
import {
  readTableFile, ImportError, findHeaderRow, detectColumns, detectDateOrder, hasNumericDates,
  buildAppointments, suggestService, suggestStaff, norm, parseDateIn,
} from "./afsprakenImport.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const toMin = (hm) => Number(String(hm).slice(0, 2)) * 60 + Number(String(hm).slice(3, 5));
const MAX_FILE = 10 * 1024 * 1024;
const CHUNK = 100;

export default function AfsprakenImport({ supabase, ownerId, lang = "nl", c, accent, cur = "€", countryCode, services = [], staff = [], existing = [], apptLang = "nl", toast, onClose, onImported, onUndone }) {
  const L = (nl, en, es) => (lang === "es" ? (es || en) : lang === "en" ? en : nl);
  const [phase, setPhase] = useState("pick"); // pick | review | saving | done
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [map, setMap] = useState(null);
  const [order, setOrder] = useState("dmy");
  const [orderAsk, setOrderAsk] = useState(false);
  const [svcPick, setSvcPick] = useState({});   // norm(tekst) → dienst-id of "" (zo laten)
  const [staffPick, setStaffPick] = useState({}); // norm(tekst) → medewerker-id of ""
  const [staffAll, setStaffAll] = useState("");  // geen medewerkerkolom: voor alle afspraken
  const [remind, setRemind] = useState(true);
  const [colsOpen, setColsOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);   // { rows, manualIds, failed }
  const [undone, setUndone] = useState(false);

  const now = salonNow(countryCode);
  const todayYmd = fmt(now);
  const nowHm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const activeStaff = useMemo(() => (staff || []).filter((s) => s && s.active !== false), [staff]);
  const svcName = (s) => (apptLang === "nl" ? s.name_nl : apptLang === "es" ? (s.name_es || s.name_en) : s.name_en) || s.name_nl || s.name_en || s.name || "";
  const svcNameOwner = (s) => (lang === "nl" ? s.name_nl : lang === "es" ? (s.name_es || s.name_en) : s.name_en) || s.name_nl || s.name_en || s.name || "";
  const sortedServices = useMemo(() => [...(services || [])].sort((a, b) => svcNameOwner(a).localeCompare(svcNameOwner(b))), [services, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && phase !== "saving" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, busy, onClose]);

  const errText = (code) => ({
    xls_binary: L("Dit is een oud Excel-bestand (.xls). Open het in Excel, kies Opslaan als → Excel-werkmap (.xlsx) of CSV, en kies dat bestand hier.", "This is an old Excel file (.xls). Open it in Excel, choose Save As → Excel Workbook (.xlsx) or CSV, and pick that file here.", "Es un archivo antiguo de Excel (.xls). Ábrelo en Excel, elige Guardar como → Libro de Excel (.xlsx) o CSV y selecciona ese archivo aquí."),
    pdf: L("Een PDF kunnen we niet inlezen. Exporteer de afspraken als Excel of CSV.", "We can't read a PDF. Export the appointments as Excel or CSV.", "No podemos leer un PDF. Exporta las citas como Excel o CSV."),
    numbers: L("Exporteer het bestand in Numbers als Excel of CSV.", "Export the file from Numbers as Excel or CSV.", "Exporta el archivo desde Numbers como Excel o CSV."),
    xlsx_unsupported: L("Deze browser kan dit Excel-bestand niet openen. Bewaar het als CSV, of probeer het in een nieuwere browser.", "This browser can't open this Excel file. Save it as CSV, or try a newer browser.", "Este navegador no puede abrir este archivo de Excel. Guárdalo como CSV o prueba con un navegador más reciente."),
    xlsx_broken: L("Dit Excel-bestand kunnen we niet lezen. Bewaar het opnieuw als .xlsx of CSV.", "We can't read this Excel file. Save it again as .xlsx or CSV.", "No podemos leer este archivo de Excel. Guárdalo de nuevo como .xlsx o CSV."),
    too_big: L("Dit bestand is te groot (max. 10 MB). Exporteer alleen de komende afspraken.", "This file is too large (max 10 MB). Export only the upcoming appointments.", "Este archivo es demasiado grande (máx. 10 MB). Exporta solo las próximas citas."),
    empty: L("We vonden geen tabel in dit bestand. Kies de export met de lijst van afspraken.", "We couldn't find a table in this file. Pick the export with the list of appointments.", "No encontramos una tabla en este archivo. Elige la exportación con la lista de citas."),
  }[code] || L("Dit bestand kon niet gelezen worden.", "This file could not be read.", "No se pudo leer este archivo."));

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    if (file.size > MAX_FILE) { setErr(errText("too_big")); return; }
    setBusy(true);
    try {
      const table = await readTableFile(file);
      if (!table.length) throw new ImportError("empty");
      const h = findHeaderRow(table);
      const m = detectColumns(table[h] || []);
      const dateVals = table.slice(h + 1).flatMap((r) => [r[m.date], r[m.time]]).filter(Boolean);
      const known = detectDateOrder(dateVals);
      setRows(table); setHeaderIdx(h); setMap(m);
      setOrder(known || "dmy");
      setOrderAsk(!known && hasNumericDates(dateVals));
      setSvcPick({}); setStaffPick({}); setStaffAll("");
      setFileName(file.name);
      const required = m.date >= 0 && (m.client >= 0 || m.first >= 0 || m.phone >= 0);
      setColsOpen(!required);
      setPhase("review");
    } catch (ex) {
      console.error("afspraken-import lezen:", ex);
      setErr(errText(ex instanceof ImportError ? ex.code : ""));
    } finally { setBusy(false); }
  };

  const header = rows[headerIdx] || [];
  const dataRows = useMemo(() => rows.slice(headerIdx + 1), [rows, headerIdx]);
  const built = useMemo(() => (map ? buildAppointments(dataRows, map, { order, todayYmd, nowHm }) : { appts: [], skipped: {} }), [dataRows, map, order, todayYmd, nowHm]);

  // Wat er al in Vellu staat (zelfde dag, tijd en klant) gaat er niet nog eens
  // in — ook niet bij een tweede poging na een onderbroken import.
  const existingLive = useMemo(() => (existing || []).filter((a) => a && !a.is_sale && a.status !== "cancelled" && a.date >= todayYmd), [existing, todayYmd]);
  const { list, alreadyIn } = useMemo(() => {
    const keys = new Set();
    for (const a of existingLive) {
      const t = String(a.time || "").slice(0, 5);
      if (a.client_email) keys.add(`${a.date}|${t}|${String(a.client_email).toLowerCase()}`);
      keys.add(`${a.date}|${t}|${norm(a.client_name)}`);
    }
    const out = []; let dup = 0;
    for (const a of built.appts) {
      if ((a.email && keys.has(`${a.date}|${a.time}|${a.email}`)) || keys.has(`${a.date}|${a.time}|${norm(a.client)}`)) { dup++; continue; }
      out.push(a);
    }
    return { list: out, alreadyIn: dup };
  }, [built, existingLive]);

  // Unieke behandelingen en medewerkers uit het bestand, met voorstel.
  const svcTexts = useMemo(() => {
    const m = new Map();
    for (const a of list) for (const p of a.parts) { const k = norm(p.service); if (!k) continue; const e = m.get(k) || { key: k, text: p.service, n: 0, suggest: suggestService(p.service, services) }; e.n++; m.set(k, e); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [list, services]);
  const staffTexts = useMemo(() => {
    const m = new Map();
    for (const a of list) for (const p of a.parts) { const k = norm(p.staff); if (!k) continue; const e = m.get(k) || { key: k, text: p.staff, n: 0, suggest: suggestStaff(p.staff, activeStaff) }; e.n++; m.set(k, e); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [list, activeStaff]);
  const svcFor = (text) => { const k = norm(text); if (!k) return ""; return k in svcPick ? svcPick[k] : (svcTexts.find((x) => x.key === k)?.suggest || ""); };
  const staffFor = (text) => {
    if (!activeStaff.length) return "";
    const k = norm(text);
    if (!k) return staffAll;
    return k in staffPick ? staffPick[k] : (staffTexts.find((x) => x.key === k)?.suggest || "");
  };

  // Afspraak → onderdelen met dienst, medewerker, duur en prijs.
  const resolve = (a) => {
    const parts = a.parts.map((p) => {
      const svc = (services || []).find((s) => s.id === svcFor(p.service)) || null;
      const st = activeStaff.find((s) => s.id === staffFor(p.staff)) || null;
      const duration = p.duration ?? (Number(svc?.duration) || 60);
      const price = p.price ?? (svc ? Number(svc.price) || 0 : 0);
      const label = svc ? svcName(svc) : (p.service || L("Afspraak", "Appointment", "Cita"));
      return { svc, st, duration, price, label, rawService: p.service };
    });
    return { ...a, rparts: parts, total: parts.reduce((s, p) => s + p.duration, 0), price: round2(parts.reduce((s, p) => s + p.price, 0)) };
  };
  const resolved = useMemo(() => list.map(resolve), [list, svcPick, staffPick, staffAll, svcTexts, staffTexts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Overlap met een afspraak die al in Vellu staat (zelfde medewerker, of
  // zonder medewerkers). Alleen een waarschuwing: het oude systeem was leidend.
  const overlaps = useMemo(() => {
    const set = new Set();
    for (const a of resolved) {
      const s = toMin(a.time), e = s + a.total;
      const ids = a.rparts.map((p) => p.st?.id).filter(Boolean);
      const hit = existingLive.some((x) => {
        if (x.date !== a.date) return false;
        const xs = toMin(x.time), xe = xs + (Number(x.service_duration) || 60);
        if (!(s < xe && xs < e)) return false;
        if (!activeStaff.length) return true;
        const xids = [x.staff_id, ...Object.values(x.staff_assignments || {})].filter(Boolean);
        return ids.length === 0 || xids.length === 0 || ids.some((i) => xids.includes(i));
      });
      if (hit) set.add(a.key);
    }
    return set;
  }, [resolved, existingLive, activeStaff]);

  const dayLabel = (ymd, withYear = false) => {
    const d = new Date(`${ymd}T12:00:00`);
    return d.toLocaleDateString(lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB", { weekday: "short", day: "numeric", month: "short", ...(withYear || ymd.slice(0, 4) !== todayYmd.slice(0, 4) ? { year: "numeric" } : {}) });
  };

  const doImport = async () => {
    if (!resolved.length) return;
    setPhase("saving"); setProgress(0); setErr("");
    const insertedRows = [];
    const manualIds = [];
    let failed = false;
    try {
      // 1. Klanten met e-mail: dezelfde RPC als "+ Afspraak" (vult alleen lege
      //    velden aan, overschrijft nooit wat een andere salon invulde).
      const clientIdByEmail = new Map();
      const emails = [...new Set(resolved.map((a) => a.email).filter(Boolean))];
      for (let i = 0; i < emails.length; i += 5) {
        await Promise.all(emails.slice(i, i + 5).map(async (email) => {
          const a = resolved.find((x) => x.email === email);
          const parts = a.client.split(" ");
          const { data } = await supabase.rpc("get_or_create_client", { p_email: email, p_first: parts[0] || a.client, p_last: parts.slice(1).join(" ") || "", p_phone: a.phone || null, p_allergies: null, p_birthday: null });
          if (data) clientIdByEmail.set(email, data);
        }));
      }
      // 2. Klanten zonder e-mail als handmatige klant, anders staan ze niet in
      //    de klantenlijst (die groepeert op e-mail) — zelfde regel als "+ Afspraak".
      const noEmail = resolved.filter((a) => !a.email);
      if (noEmail.length) {
        const { data: mc } = await supabase.from("manual_clients").select("name, phone").eq("owner_id", ownerId).limit(5000);
        const digits = (p) => String(p || "").replace(/\D/g, "").slice(-9);
        const known = new Set([
          ...(mc || []).map((m) => `${norm(m.name)}|${digits(m.phone)}`),
          ...(existing || []).filter((x) => !x.client_email).map((x) => `${norm(x.client_name)}|${digits(x.client_phone)}`),
        ]);
        const add = [];
        for (const a of noEmail) {
          const k = `${norm(a.client)}|${digits(a.phone)}`;
          if (known.has(k)) continue;
          known.add(k);
          add.push({ owner_id: ownerId, name: a.client.slice(0, 200), phone: a.phone || null });
        }
        for (let i = 0; i < add.length; i += 200) {
          const { data, error } = await supabase.from("manual_clients").insert(add.slice(i, i + 200)).select("id");
          if (error) throw error;
          for (const r of data || []) manualIds.push(r.id);
        }
      }
      // 3. De afspraken zelf, in stukken van 100.
      const rowsToInsert = resolved.map((a) => {
        const allMatched = a.rparts.every((p) => p.svc);
        let offset = 0;
        const breakdown = allMatched ? a.rparts.map((p) => { const e = { service_id: p.svc.id, staff_id: p.st?.id || null, duration: p.duration, offset_min: offset, label: p.label, price: round2(p.price) }; offset += p.duration; return e; }) : [];
        const staffNames = [...new Set(a.rparts.map((p) => p.st?.name).filter(Boolean))];
        const first = a.rparts.find((p) => p.st)?.st || null;
        return {
          owner_id: ownerId,
          service_id: a.rparts.find((p) => p.svc)?.svc.id || null,
          client_id: a.email ? (clientIdByEmail.get(a.email) || null) : null,
          service_name: a.rparts.map((p) => p.label).join(" · ").slice(0, 500),
          service_price: a.price,
          service_duration: a.total,
          date: a.date, time: a.time,
          client_name: a.client.slice(0, 200), client_email: a.email || "", client_phone: a.phone || null,
          client_allergies: a.notes ? a.notes.slice(0, 500) : null,
          payment_method: "on-arrival", status: "confirmed", invoice_sent: false,
          lang: apptLang,
          // Zonder e-mailadres geen herinnering (zelfde regel als "+ Afspraak").
          ...((!remind || !a.email) ? { reminder_sent: true } : {}),
          staff_id: first?.id || null,
          staff_name: staffNames.length ? staffNames.join(", ") : null,
          staff_assignments: Object.fromEntries(a.rparts.filter((p) => p.svc && p.st).map((p) => [p.svc.id, p.st.id])),
          service_breakdown: breakdown,
        };
      });
      for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
        const { data, error } = await supabase.from("appointments").insert(rowsToInsert.slice(i, i + CHUNK)).select("*");
        if (error) { console.error("afspraken-import opslaan:", error); failed = true; break; }
        insertedRows.push(...(data || []));
        setProgress(insertedRows.length);
      }
    } catch (ex) {
      console.error("afspraken-import:", ex);
      failed = true;
    }
    if (insertedRows.length) onImported?.(insertedRows);
    setResult({ rows: insertedRows, manualIds, failed, total: resolved.length });
    setPhase("done");
  };

  const undo = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const ids = result.rows.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from("appointments").delete().eq("owner_id", ownerId).in("id", ids.slice(i, i + 200));
        if (error) throw error;
      }
      for (let i = 0; i < result.manualIds.length; i += 200) {
        await supabase.from("manual_clients").delete().eq("owner_id", ownerId).in("id", result.manualIds.slice(i, i + 200));
      }
      onUndone?.(ids);
      setUndone(true);
      toast?.show(L(`Import ongedaan gemaakt: ${ids.length} afspraken verwijderd`, `Import undone: ${ids.length} appointments removed`, `Importación deshecha: ${ids.length} citas eliminadas`));
    } catch (ex) {
      console.error("afspraken-import ongedaan maken:", ex);
      toast?.show(L("Ongedaan maken is niet gelukt. Probeer het opnieuw.", "Undo didn't work. Please try again.", "No se pudo deshacer. Inténtalo de nuevo."), "error");
    } finally { setBusy(false); }
  };

  // ── weergave ──
  const FIELD_LABEL = {
    date: L("Datum", "Date", "Fecha"), time: L("Tijd", "Time", "Hora"), end: L("Eindtijd", "End time", "Hora de fin"), duration: L("Duur", "Duration", "Duración"),
    client: L("Klant (naam)", "Client (name)", "Cliente (nombre)"), first: L("Voornaam", "First name", "Nombre"), last: L("Achternaam", "Last name", "Apellido"),
    phone: L("Telefoon", "Phone", "Teléfono"), email: L("E-mail", "Email", "Correo"), service: L("Behandeling", "Treatment", "Tratamiento"),
    staff: L("Medewerker", "Team member", "Empleado"), price: L("Prijs", "Price", "Precio"), notes: L("Notities", "Notes", "Notas"), status: L("Status", "Status", "Estado"),
  };
  const sample = (i) => { const r = dataRows.find((x) => String(x[i] ?? "").trim()); return r ? String(r[i]).slice(0, 28) : ""; };
  const sk = built.skipped || {};
  const skipParts = [
    sk.past ? L(`${sk.past} al voorbij`, `${sk.past} already past`, `${sk.past} ya pasadas`) : null,
    sk.cancelled ? L(`${sk.cancelled} geannuleerd of no-show`, `${sk.cancelled} cancelled or no-show`, `${sk.cancelled} canceladas o no-show`) : null,
    (sk.duplicate || 0) + alreadyIn ? L(`${(sk.duplicate || 0) + alreadyIn} dubbel of al in Vellu`, `${(sk.duplicate || 0) + alreadyIn} duplicate or already in Vellu`, `${(sk.duplicate || 0) + alreadyIn} duplicadas o ya en Vellu`) : null,
    sk.unreadable ? L(`${sk.unreadable} zonder leesbare datum of tijd`, `${sk.unreadable} without a readable date or time`, `${sk.unreadable} sin fecha u hora legible`) : null,
    sk.noClient ? L(`${sk.noClient} zonder klant`, `${sk.noClient} without a client`, `${sk.noClient} sin cliente`) : null,
  ].filter(Boolean);
  const ambiguousExample = useMemo(() => {
    if (!orderAsk || !map) return null;
    for (const r of dataRows) {
      const v = String(r[map.date] ?? r[map.time] ?? "");
      const m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(v);
      if (m && Number(m[1]) !== Number(m[2])) return m[0];
    }
    return null;
  }, [orderAsk, map, dataRows]);
  const exampleAs = (o) => { const p = ambiguousExample ? parseDateIn(ambiguousExample, o, todayYmd) : null; return p ? dayLabel(p.ymd, true) : ""; };

  const sectionTitle = { fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, margin: "18px 0 8px" };
  const selectStyle = { width: "100%", minWidth: 0, padding: "8px 10px", fontSize: 12, height: "auto" };
  const firstDate = resolved[0]?.date, lastDate = resolved[resolved.length - 1]?.date;
  const PREVIEW = 100;

  const body = (
    <div data-appt-import style={{ position: "fixed", inset: 0, background: c.overlay, backdropFilter: "blur(8px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Jost', sans-serif", color: c.text }}
      onClick={() => { if (phase !== "saving" && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={L("Afspraken importeren", "Import appointments", "Importar citas")}
        style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 16, maxWidth: 640, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", color: c.text, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 22px 8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 400, lineHeight: 1.15 }}>
              {phase === "review" ? L("Controleer de import", "Check the import", "Revisa la importación") : L("Afspraken importeren", "Import appointments", "Importar citas")}
            </div>
            {phase !== "saving" && (
              <button type="button" aria-label={L("Sluiten", "Close", "Cerrar")} onClick={onClose} disabled={busy}
                style={{ background: "none", border: "none", padding: 6, cursor: "pointer", color: c.textSub, display: "inline-flex", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13" /></svg>
              </button>
            )}
          </div>

          {phase === "pick" && (
            <div data-appt-import-pick>
              <p style={{ fontSize: 13, color: c.textSub, lineHeight: 1.6, margin: "6px 0 16px" }}>
                {L("Stap je over van een ander boekingssysteem? Zet je komende afspraken in één keer in je Vellu-agenda.", "Switching from another booking system? Put your upcoming appointments into your Vellu calendar in one go.", "¿Te cambias desde otro sistema de reservas? Pon tus próximas citas en tu agenda de Vellu de una vez.")}
              </p>
              {[
                L("Exporteer in je huidige systeem de lijst met afspraken vanaf vandaag, als Excel of CSV. Je vindt die meestal onder Rapporten, Verkoop of Exporteren.", "In your current system, export the list of appointments from today onwards, as Excel or CSV. It's usually under Reports, Sales or Export.", "En tu sistema actual, exporta la lista de citas desde hoy, en Excel o CSV. Suele estar en Informes, Ventas o Exportar."),
                L("Kies het bestand hieronder. Je ziet eerst alles terug; er wordt pas iets opgeslagen als je op Importeren drukt.", "Pick the file below. You'll see everything first; nothing is saved until you press Import.", "Elige el archivo abajo. Primero lo verás todo; no se guarda nada hasta que pulses Importar."),
                L("Je klanten krijgen geen bevestiging, want hun afspraak stond al. De gewone herinnering vóór de afspraak krijgen ze wel (dat kun je uitzetten).", "Your clients don't get a confirmation, because their appointment already existed. They do get the usual reminder before the appointment (you can turn that off).", "Tus clientes no reciben confirmación, porque su cita ya existía. Sí reciben el recordatorio habitual antes de la cita (puedes desactivarlo)."),
              ].map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, fontSize: 13, lineHeight: 1.55 }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: `${accent}1a`, color: accent, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{i + 1}</span>
                  <span>{t}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: c.textMuted, lineHeight: 1.5, margin: "4px 0 14px" }}>
                {L("Het bestand wordt in je browser gelezen en nergens bewaard. Lukt het niet? Vraag het ons via de chat of Contact, dan helpen we je.", "The file is read in your browser and isn't stored anywhere. Stuck? Ask us in the chat or via Contact and we'll help.", "El archivo se lee en tu navegador y no se guarda en ningún sitio. ¿Atascado? Pregúntanos en el chat o por Contacto y te ayudamos.")}
              </div>
              {err && <div data-appt-import-error role="alert" style={{ fontSize: 12, color: c.danger, background: `${c.danger}12`, border: `1px solid ${c.danger}40`, borderRadius: 8, padding: "10px 12px", marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}
            </div>
          )}

          {phase === "review" && map && (
            <div data-appt-import-review>
              <div style={{ fontSize: 12, color: c.textSub, margin: "4px 0 2px", wordBreak: "break-word" }}>{fileName}</div>
              <div data-appt-import-summary style={{ fontSize: 14, margin: "10px 0 4px", lineHeight: 1.5 }}>
                {resolved.length > 0
                  ? (resolved.length === 1
                    ? L(`1 afspraak op ${dayLabel(firstDate)}`, `1 appointment on ${dayLabel(firstDate)}`, `1 cita el ${dayLabel(firstDate)}`)
                    : L(`${resolved.length} afspraken van ${dayLabel(firstDate)} tot en met ${dayLabel(lastDate)}`, `${resolved.length} appointments from ${dayLabel(firstDate)} to ${dayLabel(lastDate)}`, `${resolved.length} citas del ${dayLabel(firstDate)} al ${dayLabel(lastDate)}`))
                  : L("Geen komende afspraken gevonden.", "No upcoming appointments found.", "No se encontraron próximas citas.")}
              </div>
              {skipParts.length > 0 && (
                <div data-appt-import-skipped style={{ fontSize: 11, color: c.textMuted, lineHeight: 1.5 }}>
                  {L("Overgeslagen: ", "Skipped: ", "Omitidas: ")}{skipParts.join(" · ")}
                </div>
              )}
              {resolved.length === 0 && (sk.unreadable || 0) > 0 && (
                <div style={{ fontSize: 12, color: c.warning, marginTop: 8, lineHeight: 1.5 }}>
                  {L("Controleer hieronder welke kolom de datum, de tijd en de klant is.", "Check below which column is the date, the time and the client.", "Comprueba abajo qué columna es la fecha, la hora y el cliente.")}
                </div>
              )}

              {orderAsk && ambiguousExample && (
                <div data-appt-import-order style={{ marginTop: 14, padding: 12, border: `1px solid ${c.border}`, borderRadius: 10, background: c.bgCard }}>
                  <div style={{ fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>
                    {L(`Hoe lees je een datum als "${ambiguousExample}" in dit bestand?`, `How should a date like "${ambiguousExample}" in this file be read?`, `¿Cómo se lee una fecha como "${ambiguousExample}" en este archivo?`)}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["dmy", "mdy"].map((o) => (
                      <button key={o} type="button" data-order={o} onClick={() => setOrder(o)} className="btn-ghost"
                        style={{ width: "auto", padding: "8px 12px", fontSize: 12, borderColor: order === o ? accent : c.border, color: order === o ? accent : c.text, background: order === o ? `${accent}12` : "transparent" }}>
                        {exampleAs(o)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Kolommen: dicht als alles gevonden is, open als er iets mist. */}
              <button type="button" data-appt-import-cols-toggle onClick={() => setColsOpen((o) => !o)} aria-expanded={colsOpen}
                style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", width: "100%", justifyContent: "space-between" }}>
                <span>{L("Kolommen uit het bestand", "Columns from the file", "Columnas del archivo")}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: colsOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {colsOpen && (
                <div data-appt-import-cols style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 8 }}>
                  {["date", "time", "client", "first", "last", "phone", "email", "service", "staff", "duration", "end", "price", "notes", "status"].map((f) => (
                    <label key={f} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: c.textSub, minWidth: 0 }}>
                      <span>{FIELD_LABEL[f]}</span>
                      <select className="input-field" data-col={f} value={map[f]} style={selectStyle}
                        onChange={(e) => { const v = Number(e.target.value); setMap((m) => { const n = { ...m }; for (const k of Object.keys(n)) if (n[k] === v && v >= 0) n[k] = -1; n[f] = v; return n; }); }}>
                        <option value={-1}>{L("— niet gebruiken —", "— don't use —", "— no usar —")}</option>
                        {header.map((h, i) => <option key={i} value={i}>{`${h || L(`Kolom ${i + 1}`, `Column ${i + 1}`, `Columna ${i + 1}`)}${sample(i) ? ` · ${sample(i)}` : ""}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}

              {svcTexts.length > 0 && (
                <div data-appt-import-services>
                  <div style={sectionTitle}>{L("Behandelingen", "Treatments", "Tratamientos")}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, lineHeight: 1.5, marginBottom: 8 }}>
                    {L("Koppel elke behandeling aan je eigen dienst. Niet gekoppeld: de naam uit je oude systeem blijft staan, met de duur en prijs uit het bestand.", "Link each treatment to one of your services. Not linked: the name from your old system stays, with the duration and price from the file.", "Vincula cada tratamiento a uno de tus servicios. Sin vincular: se mantiene el nombre de tu sistema anterior, con la duración y el precio del archivo.")}
                  </div>
                  {svcTexts.map((s) => (
                    <div key={s.key} data-svc-row style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8, alignItems: "center", padding: "6px 0", borderTop: `1px solid ${c.border}` }}>
                      <div style={{ fontSize: 12, minWidth: 0, overflowWrap: "anywhere" }}>{s.text} <span style={{ color: c.textMuted }}>({s.n}×)</span></div>
                      <select className="input-field" value={svcFor(s.text)} style={selectStyle} onChange={(e) => setSvcPick((p) => ({ ...p, [s.key]: e.target.value }))}>
                        <option value="">{L("Niet koppelen", "Don't link", "No vincular")}</option>
                        {sortedServices.map((sv) => <option key={sv.id} value={sv.id}>{svcNameOwner(sv)}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {activeStaff.length > 0 && (staffTexts.length > 0 ? (
                <div data-appt-import-staff>
                  <div style={sectionTitle}>{L("Medewerkers", "Team members", "Empleados")}</div>
                  {staffTexts.map((s) => (
                    <div key={s.key} data-staff-row style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8, alignItems: "center", padding: "6px 0", borderTop: `1px solid ${c.border}` }}>
                      <div style={{ fontSize: 12, minWidth: 0, overflowWrap: "anywhere" }}>{s.text} <span style={{ color: c.textMuted }}>({s.n}×)</span></div>
                      <select className="input-field" value={staffFor(s.text)} style={selectStyle} onChange={(e) => setStaffPick((p) => ({ ...p, [s.key]: e.target.value }))}>
                        <option value="">{L("Niemand in het bijzonder", "No one specific", "Nadie en concreto")}</option>
                        {activeStaff.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              ) : resolved.length > 0 && (
                <div data-appt-import-staff-all>
                  <div style={sectionTitle}>{L("Medewerker", "Team member", "Empleado")}</div>
                  <select className="input-field" value={staffAll} style={selectStyle} onChange={(e) => setStaffAll(e.target.value)}>
                    <option value="">{L("Niemand in het bijzonder", "No one specific", "Nadie en concreto")}</option>
                    {activeStaff.map((t) => <option key={t.id} value={t.id}>{L(`Alles bij ${t.name}`, `All with ${t.name}`, `Todo con ${t.name}`)}</option>)}
                  </select>
                </div>
              ))}

              {resolved.length > 0 && (
                <>
                  <label data-appt-import-remind style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18, fontSize: 12, lineHeight: 1.5, cursor: "pointer" }}>
                    <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} style={{ marginTop: 2, accentColor: accent }} />
                    <span>{L("Stuur klanten met een e-mailadres de gewone herinnering vóór hun afspraak", "Send clients with an email address the usual reminder before their appointment", "Enviar a los clientes con correo el recordatorio habitual antes de su cita")}</span>
                  </label>

                  <div style={sectionTitle}>{L("Dit komt in je agenda", "This goes into your calendar", "Esto entra en tu agenda")}</div>
                  <div data-appt-import-list style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
                    {resolved.slice(0, PREVIEW).map((a, i) => (
                      <div key={a.key} data-appt-row style={{ padding: "9px 12px", borderTop: i ? `1px solid ${c.border}` : "none", fontSize: 12, lineHeight: 1.45 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600 }}>{dayLabel(a.date)} · {a.time} <span style={{ fontWeight: 400, color: c.textMuted }}>· {a.total} min</span></span>
                          <span style={{ color: c.textSub, fontVariantNumeric: "tabular-nums" }}>{fmtAmt(cur, a.price)}</span>
                        </div>
                        <div style={{ color: c.textSub, overflowWrap: "anywhere" }}>
                          {a.client}{" — "}{a.rparts.map((p) => p.label).join(" + ")}
                          {[...new Set(a.rparts.map((p) => p.st?.name).filter(Boolean))].length > 0 && <span style={{ color: c.textMuted }}>{" · "}{[...new Set(a.rparts.map((p) => p.st?.name).filter(Boolean))].join(", ")}</span>}
                        </div>
                        {overlaps.has(a.key) && (
                          <div data-appt-overlap style={{ marginTop: 3, fontSize: 10.5, color: c.warning }}>
                            {L("Overlapt met een afspraak die al in Vellu staat", "Overlaps an appointment already in Vellu", "Se solapa con una cita que ya está en Vellu")}
                          </div>
                        )}
                      </div>
                    ))}
                    {resolved.length > PREVIEW && (
                      <div style={{ padding: "8px 12px", fontSize: 11, color: c.textMuted, textAlign: "center", borderTop: `1px solid ${c.border}` }}>
                        {L(`…en nog ${resolved.length - PREVIEW}`, `…and ${resolved.length - PREVIEW} more`, `…y ${resolved.length - PREVIEW} más`)}
                      </div>
                    )}
                  </div>
                  {overlaps.size > 0 && (
                    <div style={{ fontSize: 11, color: c.textMuted, marginTop: 8, lineHeight: 1.5 }}>
                      {L(`${overlaps.size} ${overlaps.size === 1 ? "afspraak overlapt" : "afspraken overlappen"} met wat al in Vellu staat. Ze komen er gewoon in; kijk ze daarna even na in de agenda.`, `${overlaps.size} ${overlaps.size === 1 ? "appointment overlaps" : "appointments overlap"} with what's already in Vellu. They're imported anyway; check them in the calendar afterwards.`, `${overlaps.size} ${overlaps.size === 1 ? "cita se solapa" : "citas se solapan"} con lo que ya está en Vellu. Se importan igualmente; revísalas luego en la agenda.`)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {phase === "saving" && (
            <div data-appt-import-saving style={{ padding: "26px 0 18px", textAlign: "center" }}>
              <div style={{ width: 30, height: 30, border: `2px solid ${c.border}`, borderTopColor: accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
              <div style={{ fontSize: 13 }}>{L(`Bezig met importeren… ${progress} van ${resolved.length}`, `Importing… ${progress} of ${resolved.length}`, `Importando… ${progress} de ${resolved.length}`)}</div>
            </div>
          )}

          {phase === "done" && result && (
            <div data-appt-import-done style={{ padding: "10px 0 6px" }}>
              {undone ? (
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>{L("De import is ongedaan gemaakt. Er staat niets meer van in je agenda.", "The import has been undone. Nothing from it is left in your calendar.", "La importación se ha deshecho. Ya no queda nada de ella en tu agenda.")}</div>
              ) : (
                <>
                  <div data-appt-import-count style={{ fontSize: 15, lineHeight: 1.6 }}>
                    {result.rows.length === 1
                      ? L("1 afspraak staat nu in je agenda.", "1 appointment is now in your calendar.", "1 cita está ahora en tu agenda.")
                      : L(`${result.rows.length} afspraken staan nu in je agenda.`, `${result.rows.length} appointments are now in your calendar.`, `${result.rows.length} citas están ahora en tu agenda.`)}
                  </div>
                  {result.failed && (
                    <div role="alert" style={{ fontSize: 12, color: c.danger, marginTop: 8, lineHeight: 1.5 }}>
                      {L(`Daarna ging er iets mis: ${result.total - result.rows.length} afspraken zijn niet opgeslagen. Kies hetzelfde bestand nog eens; wat er al staat, wordt overgeslagen.`, `Then something went wrong: ${result.total - result.rows.length} appointments were not saved. Pick the same file again; what's already there is skipped.`, `Después algo falló: ${result.total - result.rows.length} citas no se guardaron. Elige el mismo archivo otra vez; lo que ya está se omite.`)}
                    </div>
                  )}
                  {result.rows.length > 0 && (
                    <div style={{ fontSize: 12, color: c.textSub, marginTop: 10, lineHeight: 1.5 }}>
                      {L("Klopt er iets niet (bijvoorbeeld verkeerde datums)? Maak de import ongedaan en probeer het opnieuw.", "Something not right (wrong dates, for example)? Undo the import and try again.", "¿Algo no cuadra (por ejemplo, fechas equivocadas)? Deshaz la importación y vuelve a intentarlo.")}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Knoppen onderaan, buiten het scrollgebied. Smal scherm: onder
            elkaar en even breed (naast elkaar paste het niet en kromp de
            tweede knop tot een streepje). */}
        <style>{`.vl-imp-actions{display:flex;gap:8px}.vl-imp-actions>*{flex:1 1 auto}.vl-imp-actions>.btn-ghost{flex:0 0 auto;padding:12px 18px!important}@media (max-width:520px){.vl-imp-actions{flex-direction:column}.vl-imp-actions>*{width:100%!important;flex:0 0 auto}}`}</style>
        <div className="vl-imp-actions" style={{ padding: "12px 22px 18px", borderTop: `1px solid ${c.border}` }}>
          {phase === "pick" && (
            <label className="btn-primary" data-appt-import-pick-btn style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
              <NavIcon name="upload" size={14} color="currentColor" />
              {busy ? L("Bestand lezen…", "Reading file…", "Leyendo archivo…") : L("Kies bestand", "Choose file", "Elegir archivo")}
              <input type="file" accept=".csv,.xlsx,.xls,.txt,.tsv,.xml,.htm,.html,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={onPick} disabled={busy} style={{ display: "none" }} />
            </label>
          )}
          {phase === "review" && (
            <>
              <button type="button" className="btn-primary" data-appt-import-go disabled={!resolved.length} onClick={doImport}>
                {resolved.length === 1 ? L("Importeer 1 afspraak", "Import 1 appointment", "Importar 1 cita") : L(`Importeer ${resolved.length} afspraken`, `Import ${resolved.length} appointments`, `Importar ${resolved.length} citas`)}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setPhase("pick"); setRows([]); setMap(null); }} style={{ width: "auto" }}>
                {L("Ander bestand", "Other file", "Otro archivo")}
              </button>
            </>
          )}
          {phase === "done" && (
            <>
              <button type="button" className="btn-primary" onClick={onClose} disabled={busy}>{L("Klaar", "Done", "Listo")}</button>
              {!undone && result?.rows.length > 0 && (
                <button type="button" className="btn-ghost" data-appt-import-undo onClick={undo} disabled={busy} style={{ width: "auto", color: c.danger, borderColor: `${c.danger}55` }}>
                  {busy ? "…" : L("Import ongedaan maken", "Undo import", "Deshacer importación")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
  return createPortal(body, document.body);
}

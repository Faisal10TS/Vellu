// src/Kasboek.jsx
//
// Kasboek van de kassalade (Faisal 22-09-2026, na "kassa in / kassa uit" bij
// contant afrekenen): per dag een beginsaldo, de contante verkopen (komen
// vanzelf uit de kassa en de afspraken die contant zijn afgerekend), handmatige
// stortingen en opnames met een reden, en aan het eind van de dag een telling.
//
//   verwacht in kas = beginsaldo + contant verkocht + kas in − kas uit
//   kasverschil      = geteld − verwacht (op het moment van tellen bevroren)
//
// Rendert onder het dagoverzicht van de Kassa en volgt dezelfde dagkeuze. De
// regels staan in cash_movements (RLS: eigenaar). De contante verkopen worden
// door de aanroeper meegegeven (cashRows) zodat dezelfde dagbron wordt gebruikt
// als de verkooplijst, ook voor dagen buiten het 90-dagen-venster.

import { useState, useEffect } from "react";
import { NavIcon } from "./shared.jsx";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export default function Kasboek({ supabase, ownerId, day, isToday, dayLabel, cashRows = [], lang = "nl", c, accent, cur = "€", toast, showConfirm, staffName = "" }) {
  const T = (nl, en, es) => (lang === "es" ? (es || en) : lang === "en" ? en : nl);
  const money = (n) => `${cur}${round2(n).toFixed(2)}`;
  const KIND = {
    open: T("Beginsaldo", "Opening float", "Saldo inicial"),
    in: T("Kas in", "Cash in", "Entrada de caja"),
    out: T("Kas uit", "Cash out", "Salida de caja"),
    count: T("Telling", "Count", "Recuento"),
  };

  const [rows, setRows] = useState(null);      // null = nog aan het laden
  const [mode, setMode] = useState(null);      // "open" | "in" | "out" | "count" | null
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastCountBefore, setLastCountBefore] = useState(null); // laatste telling vóór deze dag → suggestie beginsaldo

  useEffect(() => {
    if (!ownerId || !day) return;
    let alive = true;
    setRows(null); setMode(null); setAmount(""); setReason("");
    supabase.from("cash_movements").select("*").eq("owner_id", ownerId).eq("date", day).order("created_at")
      .then(({ data }) => { if (alive) setRows(data || []); });
    supabase.from("cash_movements").select("amount, date").eq("owner_id", ownerId).eq("kind", "count").lt("date", day)
      .order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => { if (alive) setLastCountBefore(data && data[0] ? data[0] : null); });
    return () => { alive = false; };
  }, [supabase, ownerId, day]);

  const list = rows || [];
  const opening = [...list].reverse().find((r) => r.kind === "open") || null;
  const sumIn = list.filter((r) => r.kind === "in").reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const sumOut = list.filter((r) => r.kind === "out").reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const cashSales = cashRows.reduce((s, a) => s + (parseFloat(a.service_price) || 0), 0);
  const expected = round2((opening ? parseFloat(opening.amount) || 0 : 0) + cashSales + sumIn - sumOut);
  const lastCount = [...list].reverse().find((r) => r.kind === "count") || null;
  // Verschil van de laatste telling: tegen het bedrag dat TOEN verwacht werd
  // (bevroren in de rij), niet tegen het huidige — anders verschuift een
  // afgesloten dag zodra er nog iets aan wordt veranderd.
  const countDiff = lastCount ? round2((parseFloat(lastCount.amount) || 0) - (parseFloat(lastCount.expected ?? expected) || 0)) : null;

  const openForm = (kind) => {
    setMode(kind); setReason("");
    // Beginsaldo: de laatste telling van een eerdere dag is meestal precies
    // wat er vanochtend in de la lag.
    setAmount(kind === "open" && lastCountBefore ? String(round2(lastCountBefore.amount).toFixed(2)) : "");
  };
  const typed = round2(parseFloat(amount) || 0);
  const liveDiff = mode === "count" && amount.trim() !== "" ? round2(typed - expected) : null;

  const save = async () => {
    if (busy || !mode) return;
    if (amount.trim() === "" || !(typed >= 0) || (mode !== "count" && mode !== "open" && typed <= 0)) {
      toast.show(T("Vul een bedrag in", "Enter an amount", "Introduce un importe"), "error");
      return;
    }
    setBusy(true);
    const row = { owner_id: ownerId, date: day, kind: mode, amount: typed, reason: reason.trim() || null, expected: mode === "count" ? expected : null, staff_name: staffName || null };
    const { data, error } = await supabase.from("cash_movements").insert(row).select().single();
    setBusy(false);
    if (error || !data) { toast.show(T("Opslaan mislukt — probeer opnieuw", "Save failed — try again", "Error al guardar — inténtalo de nuevo"), "error"); return; }
    setRows((r) => [...(r || []), data]);
    if (mode === "count") {
      const d = round2(typed - expected);
      toast.show(d === 0
        ? T("Kas klopt precies", "Cash drawer balances exactly", "La caja cuadra exactamente")
        : d > 0
        ? T(`Kas geteld: ${money(d)} te veel`, `Counted: ${money(d)} over`, `Recuento: ${money(d)} de más`)
        : T(`Kas geteld: ${money(-d)} te weinig`, `Counted: ${money(-d)} short`, `Recuento: faltan ${money(-d)}`), d === 0 ? "success" : undefined);
    }
    setMode(null); setAmount(""); setReason("");
  };

  const remove = async (r) => {
    if (!(await showConfirm(T("Deze regel uit het kasboek verwijderen?", "Remove this line from the cash book?", "¿Eliminar esta línea del libro de caja?")))) return;
    const { error } = await supabase.from("cash_movements").delete().eq("id", r.id);
    if (error) { toast.show(T("Verwijderen mislukt", "Could not remove", "No se pudo eliminar"), "error"); return; }
    setRows((rs) => (rs || []).filter((x) => x.id !== r.id));
  };

  const tile = (label, value, extra) => (
    <div style={{ padding: "8px 10px", borderRadius: 10, background: c.inputBg, border: `1px solid ${c.border}`, minWidth: 0 }}>
      <div style={{ fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: c.text, marginTop: 2, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</div>
      {extra && <div style={{ fontSize: 9, color: c.textMuted, marginTop: 1 }}>{extra}</div>}
    </div>
  );
  const btnStyle = (active) => ({ flex: "1 0 auto", padding: "7px 8px", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", borderRadius: 8, cursor: "pointer", fontFamily: "'Jost',sans-serif", border: `1px solid ${active ? accent : c.inputBorder}`, background: active ? `${accent}14` : "transparent", color: active ? accent : c.textSub, whiteSpace: "nowrap" });
  const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString(lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-GB", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  return (
    <div data-kasboek style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
      <div style={{ textAlign: "center", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel, marginBottom: 8 }}>
        {T("Kasboek", "Cash book", "Libro de caja")}{isToday ? "" : ` · ${dayLabel}`}
      </div>

      {/* Kerncijfers van de dag */}
      <div data-kasboek-tiles style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 6 }}>
        {tile(KIND.open, opening ? money(opening.amount) : "—")}
        {tile(T("Contant verkocht", "Cash sales", "Ventas en efectivo"), money(cashSales), cashRows.length ? `${cashRows.length} ${cashRows.length === 1 ? T("betaling", "payment", "pago") : T("betalingen", "payments", "pagos")}` : null)}
        {tile(KIND.in, sumIn > 0 ? `+${money(sumIn)}` : money(0))}
        {tile(KIND.out, sumOut > 0 ? `−${money(sumOut)}` : money(0))}
      </div>
      <div data-kasboek-expected-row style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 2px 0" }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: c.textLabel }}>{T("Verwacht in kas", "Expected in drawer", "Esperado en caja")}</span>
        <span data-kasboek-expected style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: accent, fontVariantNumeric: "tabular-nums" }}>{money(expected)}</span>
      </div>
      {lastCount && (
        <div data-kasboek-count style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 2px 0", fontSize: 11 }}>
          <span style={{ color: c.textSub }}>{T("Geteld", "Counted", "Contado")} {money(lastCount.amount)} · {fmtTime(lastCount.created_at)}</span>
          <span data-kasboek-diff style={{ fontWeight: 600, color: countDiff === 0 ? c.success : countDiff > 0 ? c.warning : c.danger, fontVariantNumeric: "tabular-nums" }}>
            {countDiff === 0 ? T("Kas klopt", "Balances", "Cuadra") : countDiff > 0 ? `+${money(countDiff)} ${T("te veel", "over", "de más")}` : `−${money(-countDiff)} ${T("te weinig", "short", "de menos")}`}
          </span>
        </div>
      )}

      {/* Acties */}
      <div data-kasboek-actions style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {!opening && <button type="button" data-kasboek-btn="open" onClick={() => openForm("open")} style={btnStyle(mode === "open")}>{KIND.open}</button>}
        <button type="button" data-kasboek-btn="in" onClick={() => openForm("in")} style={btnStyle(mode === "in")}>+ {KIND.in}</button>
        <button type="button" data-kasboek-btn="out" onClick={() => openForm("out")} style={btnStyle(mode === "out")}>− {KIND.out}</button>
        <button type="button" data-kasboek-btn="count" onClick={() => openForm("count")} style={btnStyle(mode === "count")}>{lastCount ? T("Opnieuw tellen", "Count again", "Contar de nuevo") : T("Kas tellen", "Count drawer", "Contar caja")}</button>
      </div>

      {/* Invoer */}
      {mode && (
        <div data-kasboek-form style={{ marginTop: 8, padding: "10px 12px", borderRadius: 12, background: c.inputBg, border: `1px solid ${c.inputBorder}` }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.textLabel, marginBottom: 6 }}>
            {mode === "open" ? T("Beginsaldo: wat lag er vanochtend in de la?", "Opening float: what was in the drawer this morning?", "Saldo inicial: ¿qué había en la caja esta mañana?")
              : mode === "in" ? T("Kas in: wat gaat er in de la?", "Cash in: what goes into the drawer?", "Entrada: ¿qué entra en la caja?")
              : mode === "out" ? T("Kas uit: wat gaat eruit?", "Cash out: what comes out?", "Salida: ¿qué sale de la caja?")
              : T("Telling: wat zit er nu echt in de la?", "Count: what is actually in the drawer now?", "Recuento: ¿qué hay realmente en la caja?")}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input data-kasboek-amount className="input-field" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`${cur} 0.00`}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
              style={{ width: 110, fontSize: 13, padding: "7px 10px", borderRadius: 10, textAlign: "right", flex: "0 0 auto" }} />
            {(mode === "in" || mode === "out") && (
              <input data-kasboek-reason className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
                placeholder={mode === "in" ? T("Reden, bijv. wisselgeld gehaald", "Reason, e.g. change from the bank", "Motivo, p. ej. cambio del banco") : T("Reden, bijv. bloemen, naar de bank", "Reason, e.g. flowers, to the bank", "Motivo, p. ej. flores, al banco")}
                style={{ flex: "1 1 160px", minWidth: 0, fontSize: 12, padding: "7px 10px", borderRadius: 10 }} />
            )}
            {mode === "count" && (
              <input data-kasboek-reason className="input-field" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={T("Opmerking (optioneel)", "Note (optional)", "Nota (opcional)")}
                style={{ flex: "1 1 140px", minWidth: 0, fontSize: 12, padding: "7px 10px", borderRadius: 10 }} />
            )}
          </div>
          {mode === "open" && lastCountBefore && (
            <div style={{ fontSize: 9.5, color: c.textMuted, marginTop: 6 }}>
              {T(`Voorgesteld: de laatste telling (${money(lastCountBefore.amount)}, ${lastCountBefore.date}).`, `Suggested: the last count (${money(lastCountBefore.amount)}, ${lastCountBefore.date}).`, `Sugerido: el último recuento (${money(lastCountBefore.amount)}, ${lastCountBefore.date}).`)}
            </div>
          )}
          {mode === "count" && (
            <div data-kasboek-live style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, fontSize: 11 }}>
              <span style={{ color: c.textSub }}>{T("Verwacht", "Expected", "Esperado")} {money(expected)}</span>
              {liveDiff !== null && (
                <span data-kasboek-live-diff style={{ fontWeight: 600, color: liveDiff === 0 ? c.success : liveDiff > 0 ? c.warning : c.danger, fontVariantNumeric: "tabular-nums" }}>
                  {liveDiff === 0 ? T("Klopt precies", "Balances exactly", "Cuadra exactamente") : liveDiff > 0 ? `+${money(liveDiff)} ${T("te veel", "over", "de más")}` : `−${money(-liveDiff)} ${T("te weinig", "short", "de menos")}`}
                </span>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" data-kasboek-save className="btn-primary" disabled={busy} onClick={save} style={{ flex: 1, padding: "9px 12px", fontSize: 11, opacity: busy ? 0.6 : 1 }}>
              {busy ? "…" : T("Opslaan", "Save", "Guardar")}
            </button>
            <button type="button" data-kasboek-cancel className="btn-ghost" onClick={() => { setMode(null); setAmount(""); setReason(""); }} style={{ padding: "9px 14px", fontSize: 10 }}>
              {T("Annuleer", "Cancel", "Cancelar")}
            </button>
          </div>
        </div>
      )}

      {/* Regels van de dag */}
      {rows === null ? (
        <div style={{ fontSize: 10, color: c.textMuted, marginTop: 8 }}>…</div>
      ) : list.length > 0 && (
        <div data-kasboek-rows style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {list.map((r) => {
            const amt = parseFloat(r.amount) || 0;
            const sign = r.kind === "out" ? "−" : r.kind === "in" ? "+" : "";
            const kleur = r.kind === "out" ? c.danger : r.kind === "in" ? c.success : c.text;
            const diff = r.kind === "count" ? round2(amt - (parseFloat(r.expected) || 0)) : null;
            return (
              <div key={r.id} data-kasboek-row={r.kind} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, padding: "5px 2px", borderBottom: `1px solid ${c.border}` }}>
                <span style={{ color: c.textMuted, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTime(r.created_at)}</span>
                <span style={{ flex: 1, minWidth: 0, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {KIND[r.kind] || r.kind}{r.reason ? ` · ${r.reason}` : ""}
                  {r.kind === "count" && diff !== null && (
                    <span style={{ color: diff === 0 ? c.success : diff > 0 ? c.warning : c.danger }}> · {diff === 0 ? T("klopt", "balances", "cuadra") : diff > 0 ? `+${money(diff)}` : `−${money(-diff)}`}</span>
                  )}
                </span>
                <span style={{ color: kleur, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{sign}{money(amt)}</span>
                <button type="button" data-kasboek-delete aria-label={T("Verwijderen", "Remove", "Eliminar")} onClick={() => remove(r)} style={{ background: "none", border: "none", color: c.textMuted, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>{"×"}</button>
              </div>
            );
          })}
        </div>
      )}
      {rows !== null && !opening && list.length === 0 && (
        <div style={{ fontSize: 9.5, color: c.textMuted, marginTop: 8, lineHeight: 1.45 }}>
          {T("Zet aan het begin van de dag het beginsaldo, boek stortingen en opnames met een reden, en tel aan het eind de la. Contante verkopen tellen vanzelf mee.",
             "Set the opening float at the start of the day, log deposits and withdrawals with a reason, and count the drawer at the end. Cash sales are included automatically.",
             "Fija el saldo inicial al empezar el día, registra entradas y salidas con un motivo y cuenta la caja al final. Las ventas en efectivo se incluyen automáticamente.")}
        </div>
      )}
    </div>
  );
}

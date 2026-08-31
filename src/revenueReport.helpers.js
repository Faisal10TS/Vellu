// Lightweight period-preset helpers. Kept in a separate file from the heavy
// PDF generator so they can be eagerly imported without pulling jsPDF into
// the main bundle.

export function periodPreset(kind, lang = "nl") {
  const now = new Date();
  const monthName = (d) => d.toLocaleDateString(lang === "nl" ? "nl-NL" : lang === "es" ? "es-ES" : "en-US", { month: "long", year: "numeric" });
  // LOCAL date components — toISOString() converts to UTC first, which for a
  // local-midnight Date in a UTC-positive timezone (NL) lands on the PREVIOUS
  // day: "this month" would run Jun 30 → Jul 30 and silently drop the last
  // day of the month from every revenue report.
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (kind === "this_month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: ymd(from), to: ymd(to), label: monthName(from) };
  }
  if (kind === "last_month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(from), to: ymd(to), label: monthName(from) };
  }
  if (kind === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    const to = new Date(now.getFullYear(), q * 3 + 3, 0);
    return { from: ymd(from), to: ymd(to), label: `Q${q + 1} ${now.getFullYear()}` };
  }
  if (kind === "last_quarter") {
    // Q1 → Q4 van het jaar ervoor.
    const qIdx = Math.floor(now.getMonth() / 3) - 1;
    const jaar = now.getFullYear() + (qIdx < 0 ? -1 : 0);
    const q = (qIdx + 4) % 4;
    const from = new Date(jaar, q * 3, 1);
    const to = new Date(jaar, q * 3 + 3, 0);
    return { from: ymd(from), to: ymd(to), label: `Q${q + 1} ${jaar}` };
  }
  if (kind === "this_year") {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear(), 11, 31);
    return { from: ymd(from), to: ymd(to), label: String(now.getFullYear()) };
  }
  if (kind === "last_year") {
    const from = new Date(now.getFullYear() - 1, 0, 1);
    const to = new Date(now.getFullYear() - 1, 11, 31);
    return { from: ymd(from), to: ymd(to), label: String(now.getFullYear() - 1) };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: ymd(from), to: ymd(to), label: monthName(from) };
}

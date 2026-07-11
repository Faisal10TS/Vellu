// CSV export of the salon's unique clients.
//
// Runs entirely client-side: queries appointments for this owner, aggregates
// per-client stats in JS, and triggers a download via Blob + <a download>.
// No server round-trip, no new edge function.
//
// Columns chosen to be useful for:
//   • Marketing (first_name, last_name, email, phone)
//   • GDPR Art. 20 portability (all their data in one file)
//   • Accountant ledger (total_spent, visit counts)
//   • Backup / migration (full client list)

import { supabase } from "./supabase.js";

// RFC 4180: wrap in double quotes, escape embedded quotes by doubling.
function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows, columns) {
  const header = columns.map(c => csvCell(c.label)).join(",");
  const body = rows.map(r => columns.map(c => csvCell(typeof c.value === "function" ? c.value(r) : r[c.value])).join(",")).join("\r\n");
  // UTF-8 BOM so Excel opens with correct encoding for names with accents.
  return "\uFEFF" + header + "\r\n" + body;
}

export async function exportClientsCSV({ ownerId, salonName, lang = "nl" }) {
  if (!ownerId) throw new Error("ownerId required");

  // Pull every appointment for this owner, plus the client record joined in.
  // Why go through appointments: `clients` is a shared table across all salons
  // (email is globally unique). So the *authoritative* list of "clients of
  // this salon" is "people who have booked here at least once."
  const { data: appts, error } = await supabase
    .from("appointments")
    .select("id, date, time, service_name, service_price, staff_name, client_id, client_email, client_name, client_phone, status, clients(first_name, last_name, email, phone, allergies, created_at)")
    .eq("owner_id", ownerId);

  if (error) throw error;
  if (!appts || appts.length === 0) {
    return { count: 0, csv: null };
  }

  // Aggregate per email (clients.email is globally unique so email ==
  // canonical key). Falls back to appointment fields if the joined clients
  // row is missing (shouldn't happen but defends against partial data).
  const byEmail = new Map();
  for (const a of appts) {
    const email = (a.clients?.email || a.client_email || "").toLowerCase();
    if (!email) continue;
    let agg = byEmail.get(email);
    if (!agg) {
      agg = {
        first_name: a.clients?.first_name || (a.client_name || "").split(" ")[0] || "",
        last_name: a.clients?.last_name || (a.client_name || "").split(" ").slice(1).join(" ") || "",
        email,
        phone: a.clients?.phone || a.client_phone || "",
        allergies: a.clients?.allergies || "",
        first_visit: a.date,
        last_visit: a.date,
        total_appointments: 0,
        completed_count: 0,
        cancelled_count: 0,
        no_show_count: 0,
        total_spent: 0,
        services: {},
        staff: {},
      };
      byEmail.set(email, agg);
    }
    agg.total_appointments++;
    if (a.status === "completed") { agg.completed_count++; agg.total_spent += parseFloat(a.service_price || 0); }
    if (a.status === "cancelled") agg.cancelled_count++;
    if (a.status === "no_show") agg.no_show_count++;
    if (a.date < agg.first_visit) agg.first_visit = a.date;
    if (a.date > agg.last_visit) agg.last_visit = a.date;
    // Track service + staff popularity per client
    if (a.service_name) agg.services[a.service_name] = (agg.services[a.service_name] || 0) + 1;
    if (a.staff_name) agg.staff[a.staff_name] = (agg.staff[a.staff_name] || 0) + 1;
  }

  const rows = Array.from(byEmail.values()).map(r => ({
    ...r,
    favorite_service: Object.entries(r.services).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
    favorite_staff: Object.entries(r.staff).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
    total_spent: r.total_spent.toFixed(2),
  }));

  // Sort alphabetically by last name for predictable output.
  rows.sort((a, b) => (a.last_name || "").localeCompare(b.last_name || "") || (a.first_name || "").localeCompare(b.first_name || ""));

  const labels = lang === "nl" ? {
    first_name: "Voornaam", last_name: "Achternaam", email: "E-mail", phone: "Telefoon",
    allergies: "Allergieën", first_visit: "Eerste bezoek", last_visit: "Laatste bezoek",
    total_appointments: "Aantal afspraken", completed_count: "Afgerond",
    cancelled_count: "Geannuleerd", no_show_count: "No-shows",
    total_spent: "Totaal besteed (€)", favorite_service: "Favoriete behandeling",
    favorite_staff: "Favoriete medewerker",
  } : {
    first_name: "First name", last_name: "Last name", email: "Email", phone: "Phone",
    allergies: "Allergies", first_visit: "First visit", last_visit: "Last visit",
    total_appointments: "Appointments", completed_count: "Completed",
    cancelled_count: "Cancelled", no_show_count: "No-shows",
    total_spent: "Total spent (€)", favorite_service: "Favorite service",
    favorite_staff: "Favorite staff",
  };

  const columns = Object.keys(labels).map(key => ({ label: labels[key], value: key }));
  const csv = rowsToCsv(rows, columns);

  // Trigger download via Blob.
  const fnSalon = (salonName || "vellu").replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 40);
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const filename = `${fnSalon}-klanten-${today}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { count: rows.length, filename };
}

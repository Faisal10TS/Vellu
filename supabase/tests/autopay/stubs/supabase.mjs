// In-memory nep-Supabase voor de autopay-tests. Geen netwerk, geen productie:
// elke tabel is een array in globalThis.__fakeDb, zodat alle gebundelde functies
// (elk met een eigen kopie van deze module) dezelfde gegevens zien.
//
// Ondersteunt precies wat de functies gebruiken: select / insert / update met
// eq, neq, is, not(col,'is',null), in, or("a.is.null,a.lt.\"x\""), lt, lte, gt,
// gte, order, limit, maybeSingle, single; rpc; auth.getUser.

export function db() {
  if (!globalThis.__fakeDb) resetDb();
  return globalThis.__fakeDb;
}

export function resetDb() {
  globalThis.__fakeDb = {
    tables: { profiles: [], payment_events: [], payment_invoices: [], renewal_reminder_log: [], referral_redemptions: [], cron_health: [] },
    rpcCalls: [],
    seq: 1,
    user: { id: "00000000-0000-0000-0000-000000000001", email: "salon@example.test" },
  };
  return globalThis.__fakeDb;
}

const UNIQUE = {
  payment_events: (a, b) => a.mollie_payment_id != null && a.mollie_payment_id === b.mollie_payment_id && a.event_type === b.event_type,
  renewal_reminder_log: (a, b) => a.owner_id === b.owner_id && a.kind === b.kind && String(a.plan_expires_at) === String(b.plan_expires_at),
};

function cmpVal(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return NaN;
  const da = typeof a === "string" ? Date.parse(a) : NaN;
  const dbv = typeof b === "string" ? Date.parse(b) : NaN;
  if (!isNaN(da) && !isNaN(dbv) && /^\d{4}-\d{2}-\d{2}/.test(String(a)) && /^\d{4}-\d{2}-\d{2}/.test(String(b))) return da - dbv;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function parseOrPart(part) {
  // kolom.op.waarde  (waarde mag tussen dubbele aanhalingstekens staan)
  const m = /^([a-z_]+)\.([a-z]+)\.(.*)$/.exec(part.trim());
  if (!m) throw new Error("fake or(): kan niet lezen: " + part);
  let v = m[3];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (v === "null") v = null;
  return { col: m[1], op: m[2], val: v };
}

function splitOr(s) {
  const out = []; let cur = ""; let q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (ch === "," && !q) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function test(row, f) {
  const v = row[f.col];
  switch (f.op) {
    case "eq": return v === f.val;
    case "neq": return v !== f.val;
    case "is": return f.val === null ? (v === null || v === undefined) : v === f.val;
    case "notis": return f.val === null ? !(v === null || v === undefined) : v !== f.val;
    case "in": return f.val.includes(v);
    case "lt": return cmpVal(v, f.val) < 0;
    case "lte": return cmpVal(v, f.val) <= 0;
    case "gt": return cmpVal(v, f.val) > 0;
    case "gte": return cmpVal(v, f.val) >= 0;
    case "or": return f.parts.some((p) => test(row, p));
    default: throw new Error("fake filter onbekend: " + f.op);
  }
}

class Query {
  constructor(table) {
    this.table = table; this.op = "select"; this.filters = []; this.payload = null;
    this.wantRows = false; this.single = null; this.orderBy = null; this.lim = null;
  }
  select() { if (this.op === "select") this.wantRows = true; else this.wantRows = true; return this; }
  insert(p) { this.op = "insert"; this.payload = p; return this; }
  update(p) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.filters.push({ col: c, op: "eq", val: v }); return this; }
  neq(c, v) { this.filters.push({ col: c, op: "neq", val: v }); return this; }
  is(c, v) { this.filters.push({ col: c, op: "is", val: v }); return this; }
  not(c, op, v) { if (op !== "is") throw new Error("fake not() alleen 'is'"); this.filters.push({ col: c, op: "notis", val: v }); return this; }
  in(c, v) { this.filters.push({ col: c, op: "in", val: v }); return this; }
  lt(c, v) { this.filters.push({ col: c, op: "lt", val: v }); return this; }
  lte(c, v) { this.filters.push({ col: c, op: "lte", val: v }); return this; }
  gt(c, v) { this.filters.push({ col: c, op: "gt", val: v }); return this; }
  gte(c, v) { this.filters.push({ col: c, op: "gte", val: v }); return this; }
  or(s) { this.filters.push({ op: "or", parts: splitOr(s).map(parseOrPart) }); return this; }
  order(c, o) { this.orderBy = { col: c, asc: o?.ascending !== false }; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.single = "maybe"; return this; }
  single() { this.single = "one"; return this; }
  then(res, rej) { try { res(this.exec()); } catch (e) { rej ? rej(e) : res({ data: null, error: e }); } }

  exec() {
    const D = db();
    const rows = D.tables[this.table] || (D.tables[this.table] = []);
    const clone = (r) => JSON.parse(JSON.stringify(r));
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const made = [];
      for (const p of list) {
        const row = { id: p.id || `row-${D.seq++}`, created_at: p.created_at || new Date().toISOString(), ...clone(p) };
        const uq = UNIQUE[this.table];
        if (uq && rows.some((r) => uq(r, row))) {
          return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint ${this.table}_mollie_payment_event_type_uniq` } };
        }
        rows.push(row); made.push(row);
      }
      return this.finish(made.map(clone));
    }
    let hit = rows.filter((r) => this.filters.every((f) => test(r, f)));
    if (this.op === "update") {
      for (const r of hit) Object.assign(r, clone(this.payload));
      if (!this.wantRows) return { data: null, error: null };
      return this.finish(hit.map(clone));
    }
    if (this.op === "delete") {
      D.tables[this.table] = rows.filter((r) => !hit.includes(r));
      return { data: null, error: null };
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      hit = [...hit].sort((a, b) => (asc ? 1 : -1) * cmpVal(a[col], b[col]));
    }
    if (this.lim != null) hit = hit.slice(0, this.lim);
    return this.finish(hit.map(clone));
  }
  finish(list) {
    if (this.single === "maybe") return { data: list[0] || null, error: null };
    if (this.single === "one") return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { message: "not exactly one row" } };
    if (this.op === "insert" && !this.wantRows) return { data: null, error: null };
    return { data: list, error: null };
  }
}

export function createClient() {
  return {
    from: (t) => new Query(t),
    rpc: async (name, args) => {
      const D = db();
      D.rpcCalls.push({ name, args });
      if (name === "get_next_vellu_invoice_number") return { data: "VEL-TEST-" + String(D.rpcCalls.filter((c) => c.name === name).length).padStart(4, "0"), error: null };
      if (name === "grant_referral_credit") return { data: 0, error: null };
      if (name === "cron_secret_ok") return { data: false, error: null };
      return { data: null, error: null };
    },
    auth: {
      getUser: async (jwt) => {
        if (!jwt) return { data: { user: null }, error: { message: "no jwt" } };
        return { data: { user: db().user }, error: null };
      },
    },
  };
}

// Offline store (IndexedDB). Everything the app shows is read from here.
import Dexie from "dexie";

export const db = new Dexie("badeel-measure");

db.version(1).stores({
  measurements: "id, name, status, customer, updated_at, person_key",
  customers: "name, customer_name",
  sales_orders: "name, customer",
  meta: "key",
});

// v2: the phone keeps only assigned work. Customer and sales order lists are no longer stored.
db.version(2)
  .stores({
    // id = app_uuid for records made in the app, "srv:<name>" for records made in ERPNext
    measurements: "id, name, status, assignment, updated_at, person_key",
    assignments: "name",
    customers: null,
    sales_orders: null,
    meta: "key",
  })
  .upgrade((tx) => tx.table("meta").clear());

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  return db.meta.put({ key, value });
}

export async function clearAll() {
  await db.transaction("rw", db.measurements, db.assignments, db.meta, async () => {
    await db.measurements.clear();
    await db.assignments.clear();
    await db.meta.clear();
  });
}

/** Access revoked: remove everything except measurements that were never sent. */
export async function wipeSynced() {
  await db.transaction("rw", db.measurements, db.assignments, db.meta, async () => {
    await db.measurements.where("status").equals("synced").delete();
    await db.assignments.clear();
    await db.meta.clear();
  });
}

export function personKey(employee_code, person_name) {
  return String(employee_code || person_name || "").trim().toLowerCase();
}

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * People listed on an assignment -> their measurement on this phone (or the server's).
 * Returns Map(row -> { rec, done }). A record counts for a row when it was taken from that
 * row, otherwise when the staff ID (or, without one, the name) matches. Mirrors the server.
 */
export function matchListed(people, records) {
  const out = new Map();
  const used = new Set();
  const rows = new Set((people || []).map((p) => p.row));
  (people || []).forEach((p) => {
    const rec = (records || []).find((r) => r.assignment_person === p.row);
    if (rec) {
      out.set(p.row, { rec, done: true });
      used.add(rec.id);
    }
  });
  const free = (records || []).filter((r) => !used.has(r.id) && !(r.assignment_person && rows.has(r.assignment_person)));
  (people || []).forEach((p) => {
    if (out.has(p.row)) return;
    const code = norm(p.employee_code);
    const rec = free.find(
      (r) =>
        !used.has(r.id) &&
        (code
          ? norm(r.employee_code) === code || (!norm(r.employee_code) && norm(r.person_name) === norm(p.person_name))
          : norm(r.person_name) === norm(p.person_name))
    );
    if (rec) {
      used.add(rec.id);
      out.set(p.row, { rec, done: true });
    } else if (p.status === "Measured") out.set(p.row, { rec: null, done: true });
  });
  return out;
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Server record -> local record */
export function fromServer(rec, extra = {}) {
  return {
    id: rec.app_uuid || `srv:${rec.name}`,
    app_uuid: rec.app_uuid || null,
    name: rec.name,
    assignment: rec.assignment || "",
    assignment_person: rec.assignment_person || "",
    customer: rec.customer || "",
    customer_name: rec.customer_name || rec.party_name || rec.customer,
    party_name: rec.party_name || "",
    quotation: rec.quotation || "",
    person_name: rec.person_name,
    person_key: personKey(rec.employee_code, rec.person_name),
    employee_code: rec.employee_code || "",
    designation: rec.designation || "",
    gender: rec.gender || "",
    measurement_date: rec.measurement_date,
    sales_order: rec.sales_order || "",
    ref_no: rec.ref_no || "",
    unit: rec.unit || "Inch",
    remarks: rec.remarks || "",
    garments: rec.garments || [],
    values: rec.values || [],
    source: rec.source,
    measured_by: rec.measured_by,
    server_modified: rec.modified,
    status: "synced",
    error: null,
    editable: !!rec.app_uuid,
    updated_at: Date.now(),
    ...extra,
  };
}

/** Previous measurement of the same person on this phone (same assignment or same walk-in customer). */
export async function findPrevious(draft, key) {
  if (!key) return null;
  const rows = await db.measurements
    .where("person_key")
    .equals(key)
    .filter(
      (r) =>
        r.id !== draft.id &&
        (draft.assignment ? r.assignment === draft.assignment : !r.assignment && r.customer_name === draft.customer_name)
    )
    .toArray();
  rows.sort((a, b) => String(b.measurement_date).localeCompare(String(a.measurement_date)) || b.updated_at - a.updated_at);
  return rows[0] || null;
}

// Two-way sync: push records made on the phone, then pull assignments and their measurements.
// The server decides what the phone may hold (`keep`); anything else that is synced is deleted.
import { api, ApiError } from "./api.js";
import { db, fromServer, getMeta, setMeta, wipeSynced } from "./db.js";

const BATCH = 50;
let running = null;
let state = { busy: false, phase: "", error: "", lastSync: null, pending: 0 };
const listeners = new Set();

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function onSyncState(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export async function refreshPendingCount() {
  const pending = await db.measurements.where("status").anyOf("pending", "error").count();
  emit({ pending, lastSync: await getMeta("last_sync") });
  return pending;
}

/** Run a sync. Concurrent calls share the running one. */
export function syncAll({ full = false, deviceId } = {}) {
  if (running) return running;
  running = (async () => {
    emit({ busy: true, error: "", phase: "Sending" });
    const summary = { pushed: 0, conflicts: 0, failed: 0 };
    try {
      Object.assign(summary, await pushPending(deviceId));
      emit({ phase: "Updating assignments" });
      await pullMaster();
      emit({ phase: "Updating measurements" });
      await pullMeasurements(full);
      const now = new Date().toISOString();
      await setMeta("last_sync", now);
      emit({ busy: false, phase: "", lastSync: now });
    } catch (e) {
      emit({ busy: false, phase: "", error: e.message || String(e) });
      if (e instanceof ApiError && e.isAuth) {
        // access revoked or password changed: keep only work that was never sent
        await wipeSynced();
        throw e;
      }
      summary.error = e.message;
    } finally {
      await refreshPendingCount();
      running = null;
    }
    return summary;
  })();
  return running;
}

function toPayload(r) {
  return {
    app_uuid: r.id,
    assignment: r.assignment || null,
    assignment_person: r.assignment ? r.assignment_person || null : null,
    party_name: r.assignment ? undefined : r.customer_name,
    person_name: r.person_name,
    employee_code: r.employee_code || null,
    designation: r.designation || null,
    gender: r.gender || null,
    measurement_date: r.measurement_date,
    ref_no: r.ref_no || null,
    unit: r.unit,
    remarks: r.remarks || null,
    garments: r.garments,
    values: (r.values || []).filter((v) => v.garment && v.measurement_type),
    base_modified: r.server_modified || undefined,
  };
}

async function pushPending(deviceId) {
  const out = { pushed: 0, conflicts: 0, failed: 0 };
  const queue = await db.measurements.where("status").anyOf("pending", "error").toArray();
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    emit({ phase: `Sending ${Math.min(i + BATCH, queue.length)} of ${queue.length}` });
    const sentAt = new Map(batch.map((r) => [r.id, r.updated_at]));
    const res = await api.push(batch.map(toPayload), deviceId);
    for (const r of res.results || []) {
      const local = await db.measurements.get(r.app_uuid);
      if (!local) continue;
      const editedMeanwhile = local.updated_at !== sentAt.get(r.app_uuid);
      if (r.status === "ok" || r.status === "conflict") {
        if (editedMeanwhile) {
          await db.measurements.update(local.id, { name: r.name, server_modified: r.record?.modified });
        } else {
          await db.measurements.put(
            fromServer(r.record, { conflict: r.status === "conflict" ? new Date().toISOString() : null })
          );
        }
        if (r.status === "conflict") out.conflicts++;
        else out.pushed++;
      } else {
        await db.measurements.update(local.id, { status: "error", error: r.message || "Could not save" });
        out.failed++;
      }
    }
  }
  return out;
}

async function pullMaster() {
  const m = await api.masterData();
  await db.transaction("rw", db.assignments, db.meta, async () => {
    await db.assignments.clear();
    await db.assignments.bulkPut(m.assignments || []);
    await setMeta("garments", m.garments || []);
    await setMeta("measurement_types", m.measurement_types || []);
    await setMeta("units", m.units || []);
    await setMeta("settings", m.settings || {});
  });
}

async function pullMeasurements(full) {
  const since = full ? null : await getMeta("history_since");
  const page = await api.measurements(since);
  const keep = new Set(page.keep || []);
  await db.transaction("rw", db.measurements, async () => {
    for (const rec of page.records || []) {
      const id = rec.app_uuid || `srv:${rec.name}`;
      const local = await db.measurements.get(id);
      if (local && local.status !== "synced") continue; // local edits win until pushed
      await db.measurements.put(fromServer(rec));
    }
    // remove synced records the server no longer allows on this phone
    const synced = await db.measurements.where("status").equals("synced").toArray();
    const gone = synced.filter((r) => !r.name || !keep.has(r.name)).map((r) => r.id);
    if (gone.length) await db.measurements.bulkDelete(gone);
  });
  await setMeta("history_since", page.server_time);
}

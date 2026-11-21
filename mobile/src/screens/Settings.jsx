import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getMeta } from "../lib/db.js";
import { onSyncState } from "../lib/sync.js";
import { biometricStatus } from "../lib/account.js";
import { Field, Sheet, TopBar, timeAgo } from "../components/ui.jsx";

export function SettingsScreen({ account, online, onBack, onSync, onFullSync, onToggleBiometric, onLogout, version, config, garments, onPhoneUnit }) {
  const [sync, setSync] = useState({});
  const [bio, setBio] = useState(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => onSyncState(setSync), []);
  useEffect(() => {
    biometricStatus().then(setBio);
  }, []);
  const counts = useLiveQuery(async () => ({
    total: await db.measurements.count(),
    pending: await db.measurements.where("status").anyOf("pending", "error").count(),
    assignments: await db.assignments.count(),
    garments: (await getMeta("garments", [])).length,
  }), [], {});

  return (
    <div className="screen">
      <TopBar title="Settings" onBack={onBack} />
      <div className="scroll">
        <div className="section-label">Account</div>
        <div className="card">
          <div className="kv">
            {account.company ? (<><span className="k">Company</span><span className="v">{account.company}</span></>) : null}
            <span className="k">User</span><span className="v">{account.full_name || account.user}</span>
            <span className="k">Server</span><span className="v">{account.server.replace(/^https?:\/\//, "")}</span>
          </div>
        </div>

        <div className="section-label">Security</div>
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Fingerprint unlock</div>
              <div className="small">
                {bio && !bio.available ? bio.reason || "Not available on this phone" : "Open the app with your fingerprint"}
              </div>
            </div>
            <input
              type="checkbox"
              style={{ width: 24, height: 24 }}
              checked={!!account.biometric}
              disabled={busy || (bio && !bio.available)}
              onChange={async (e) => {
                setBusy(true);
                setErr("");
                try {
                  await onToggleBiometric(e.target.checked);
                } catch (e2) {
                  if (!/cancel/i.test(e2?.message || "")) setErr(e2?.message || "Could not change fingerprint unlock");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
          {err ? <div className="err-text">{err}</div> : null}
        </div>

        <div className="section-label">Measurement settings</div>
        <div className="card">
          <Field label="Default unit on this phone">
            <select className="select input" value={config.phone_unit || ""} onChange={(e) => onPhoneUnit(e.target.value)}>
              <option value="">Use ERPNext default ({config.settings?.default_unit || "Inch"})</option>
              {(config.units || []).map((u) => (
                <option key={u.name} value={u.name}>{u.name} ({u.symbol})</option>
              ))}
            </select>
          </Field>
          <div className="kv">
            <span className="k">Units available</span>
            <span className="v">{(config.units || []).map((u) => u.name).join(", ") || "–"}</span>
            <span className="k">Change unit while measuring</span>
            <span className="v">{config.settings?.allow_unit_change === 0 ? "No" : "Yes"}</span>
            <span className="k">Staff ID required</span>
            <span className="v">{config.settings?.require_staff_id ? "Yes" : "No"}</span>
            <span className="k">Walk-in measurements</span>
            <span className="v">{config.settings?.allow_walk_in === 0 ? "Not allowed" : "Allowed"}</span>
          </div>
          <div className="section-label" style={{ marginTop: 16 }}>Garment templates</div>
          {(garments || []).map((g) => (
            <div className="tpl" key={g.name}>
              <div>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div className="m">{(g.measurements || []).join(", ")}</div>
              </div>
              <span className="small">{g.default_unit || ""}</span>
            </div>
          ))}
          <p className="small" style={{ marginBottom: 0 }}>
            Units, templates and these rules are managed in ERPNext under Measurement Settings and are updated on sync.
          </p>
        </div>

        <div className="section-label">Data on this phone</div>
        <div className="card">
          <div className="kv">
            <span className="k">Measurements</span><span className="v">{counts.total ?? "–"}</span>
            <span className="k">Waiting to sync</span><span className="v">{counts.pending ?? "–"}</span>
            <span className="k">Open assignments</span><span className="v">{counts.assignments ?? "–"}</span>
            <span className="k">Garment templates</span><span className="v">{counts.garments ?? "–"}</span>
            <span className="k">Last sync</span><span className="v">{timeAgo(sync.lastSync)}</span>
          </div>
          {sync.error ? <div className="err-text" style={{ marginTop: 10 }}>{sync.error}</div> : null}
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn secondary" disabled={!online || sync.busy} onClick={onSync}>
              {sync.busy ? sync.phase || "Syncing…" : "Sync now"}
            </button>
            <button className="btn secondary" disabled={!online || sync.busy} onClick={onFullSync}>
              Reload all
            </button>
          </div>
          <p className="small" style={{ marginBottom: 0 }}>
            Only work assigned to you is kept on this phone. Closed assignments, and walk-ins a few days after
            they are sent, are removed automatically.
          </p>
        </div>

        <button className="btn danger" style={{ marginTop: 24 }} onClick={() => setConfirmOut(true)}>
          Sign out
        </button>
        <p className="small" style={{ textAlign: "center", marginTop: 16 }}>Measurement Entry {version}</p>
      </div>

      {confirmOut ? (
        <Sheet title="Sign out?" onClose={() => setConfirmOut(false)}>
          {counts.pending ? (
            <div className="banner err">
              {counts.pending} measurement(s) are not synced yet and will be lost. Sync first while online.
            </div>
          ) : (
            <p className="small">Data stored on this phone is removed. It stays in ERPNext.</p>
          )}
          <div className="btn-row">
            <button className="btn secondary" onClick={() => setConfirmOut(false)}>Cancel</button>
            <button className="btn danger" onClick={onLogout}>Sign out</button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

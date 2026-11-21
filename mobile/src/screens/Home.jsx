import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, matchListed } from "../lib/db.js";
import { onSyncState } from "../lib/sync.js";
import { Icon, Sheet, StatusPill, TopBar, fmtDate, timeAgo } from "../components/ui.jsx";

export function assignmentRef(a) {
  return a.sales_order || a.quotation || (a.based_on === "Customer" ? "Customer visit" : "");
}

export function garmentSummary(a) {
  return (a.garments || []).map((g) => (g.qty ? `${g.garment} ×${g.qty}` : g.garment)).join(", ");
}

function isOverdue(d) {
  if (!d) return false;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return new Date(d + "T00:00:00") < t;
}

export function HomeScreen({ account, online, config, onOpenAssignment, onNewFor, onNewWalkIn, onOpen, onSync, onSettings }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sync, setSync] = useState({});
  const [picking, setPicking] = useState(false);
  useEffect(() => onSyncState(setSync), []);

  const assignments = useLiveQuery(() => db.assignments.toArray(), [], []);
  const rows = useLiveQuery(() => db.measurements.orderBy("updated_at").reverse().toArray(), [], []);

  const counts = useMemo(() => {
    const c = {};
    (rows || []).forEach((r) => r.assignment && (c[r.assignment] = (c[r.assignment] || 0) + 1));
    return c;
  }, [rows]);

  const sortedAssignments = useMemo(
    () =>
      [...(assignments || [])].sort(
        (a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")) || a.name.localeCompare(b.name)
      ),
    [assignments]
  );

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    let r = rows || [];
    if (filter === "pending") r = r.filter((x) => x.status !== "synced");
    if (filter === "walkin") r = r.filter((x) => !x.assignment);
    if (term)
      r = r.filter((x) =>
        [x.person_name, x.customer_name, x.employee_code, x.name, x.ref_no]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      );
    return [...r]
      .sort(
        (a, b) =>
          (a.status === "synced") - (b.status === "synced") ||
          String(b.measurement_date).localeCompare(String(a.measurement_date)) ||
          b.updated_at - a.updated_at
      )
      .slice(0, 200);
  }, [rows, q, filter]);

  const pending = (rows || []).filter((x) => x.status !== "synced").length;
  const walkInAllowed = config.settings?.allow_walk_in !== 0;

  let syncText;
  if (sync.busy) syncText = sync.phase || "Syncing…";
  else if (!online) syncText = pending ? `Offline · ${pending} waiting to sync` : "Offline · saved on this phone";
  else if (sync.error) syncText = `Sync failed: ${sync.error}`;
  else if (pending) syncText = `${pending} waiting to sync`;
  else syncText = `All synced · ${timeAgo(sync.lastSync)}`;

  function onNew() {
    if (!sortedAssignments.length && walkInAllowed) return onNewWalkIn();
    setPicking(true);
  }

  return (
    <div className="screen">
      <TopBar
        title={account.company || "Measurements"}
        sub={`Measurement Entry · ${account.full_name || account.user}`}
        right={
          <>
            <button className="icon-btn" onClick={onSync} aria-label="Sync now" disabled={!online}>
              <Icon name="sync" className={sync.busy ? "spin" : ""} />
            </button>
            <button className="icon-btn" onClick={onSettings} aria-label="Settings">
              <Icon name="gear" />
            </button>
          </>
        }
      />
      <div className="scroll">
        <div className="syncbar">
          <span className={"dot" + (!online ? " off" : pending || sync.error ? " warn" : "")} />
          <span>{syncText}</span>
        </div>

        <div className="section-label">Assigned to you ({sortedAssignments.length})</div>
        {sortedAssignments.length === 0 ? (
          <div className="card small">
            No measurement work is assigned to you right now. The office assigns work in ERPNext, and it appears here
            after the next sync.
          </div>
        ) : (
          <div className="list">
            {sortedAssignments.map((a) => (
              <button key={a.name} className="row" onClick={() => onOpenAssignment(a.name)}>
                <div className="grow">
                  <div className="title">{a.party_name}</div>
                  <div className="meta">
                    {[assignmentRef(a), a.due_date ? `by ${fmtDate(a.due_date)}` : null].filter(Boolean).join(" · ")}
                  </div>
                  <div className="meta">{garmentSummary(a) || "Garments not set"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="pill synced" style={{ display: "inline-block" }}>
                    {(a.people || []).length ? `${counts[a.name] || 0} / ${a.people.length}` : `${counts[a.name] || 0} done`}
                  </div>
                  {isOverdue(a.due_date) ? <div className="pill error" style={{ display: "inline-block", marginTop: 6 }}>Overdue</div> : null}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="section-label">Measurements on this phone</div>
        <input className="input" placeholder="Search person, customer, staff ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips" style={{ margin: "10px 0" }}>
          {[
            ["all", "All"],
            ["pending", `Not synced${pending ? ` (${pending})` : ""}`],
            ["walkin", "Walk-in"],
          ].map(([k, l]) => (
            <button key={k} className={"chip" + (filter === k ? " on" : "")} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>{rows && rows.length ? "No measurements match." : "No measurements yet."}</div>
        ) : (
          <div className="list">
            {list.map((r) => (
              <button key={r.id} className="row" onClick={() => onOpen(r.id)}>
                <div className="grow">
                  <div className="title">
                    {r.person_name}
                    {r.employee_code ? <span className="small"> · {r.employee_code}</span> : null}
                  </div>
                  <div className="meta">
                    {r.customer_name}
                    {!r.assignment ? " · walk-in" : ""}
                  </div>
                  <div className="meta">
                    {(r.garments || []).join(", ")} · {fmtDate(r.measurement_date)}
                  </div>
                </div>
                <StatusPill rec={r} />
              </button>
            ))}
          </div>
        )}
      </div>
      {sortedAssignments.length || walkInAllowed ? (
        <button className="fab" onClick={onNew}>
          <Icon name="plus" /> New
        </button>
      ) : null}

      {picking ? (
        <Sheet title="Measure for" onClose={() => setPicking(false)}>
          <div className="list">
            {sortedAssignments.map((a) => (
              <button key={a.name} className="row" onClick={() => { setPicking(false); onNewFor(a); }}>
                <div className="grow">
                  <div className="title">{a.party_name}</div>
                  <div className="meta">{[assignmentRef(a), garmentSummary(a)].filter(Boolean).join(" · ")}</div>
                </div>
                <Icon name="chevron" width="20" height="20" />
              </button>
            ))}
            {walkInAllowed ? (
              <button className="row" onClick={() => { setPicking(false); onNewWalkIn(); }}>
                <Icon name="plus" width="20" height="20" />
                <div className="grow">
                  <div className="title">Walk-in customer</div>
                  <div className="meta">Not assigned. Type the customer name, the office links it later.</div>
                </div>
              </button>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

export function AssignmentScreen({ name, online, onBack, onMeasure, onOpen, onMarkDone }) {
  const a = useLiveQuery(() => db.assignments.get(name), [name]);
  const people = useLiveQuery(
    () => db.measurements.where("assignment").equals(name).toArray(),
    [name],
    []
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState("todo");
  const listed = a?.people || [];
  const matched = useMemo(() => matchListed(listed, people || []), [listed, people]);

  if (!a)
    return (
      <div className="screen">
        <TopBar title="Assignment" onBack={onBack} />
        <div className="scroll">
          <div className="card small">This assignment is no longer assigned to you. It was closed or moved in ERPNext.</div>
        </div>
      </div>
    );

  const sorted = [...(people || [])].sort((x, y) => x.person_name.localeCompare(y.person_name));
  const pending = sorted.filter((p) => p.status !== "synced").length;
  const onList = new Set([...matched.values()].map((m) => m.rec?.id).filter(Boolean));
  const others = listed.length ? sorted.filter((r) => !onList.has(r.id)) : sorted;
  const doneCount = listed.filter((p) => matched.get(p.row)?.done).length;
  const term = q.trim().toLowerCase();
  const shown = listed.filter((p) => {
    const done = !!matched.get(p.row)?.done;
    if (show === "todo" && done) return false;
    if (show === "done" && !done) return false;
    return !term || [p.person_name, p.employee_code, p.designation].some((v) => String(v || "").toLowerCase().includes(term));
  });

  const recRow = (r) => (
    <button key={r.id} className="row" onClick={() => onOpen(r.id)}>
      <div className="grow">
        <div className="title">
          {r.person_name}
          {r.employee_code ? <span className="small"> · {r.employee_code}</span> : null}
        </div>
        <div className="meta">{[r.designation, (r.garments || []).join(", ")].filter(Boolean).join(" · ")}</div>
      </div>
      <StatusPill rec={r} />
    </button>
  );

  return (
    <div className="screen">
      <TopBar title={a.party_name} sub={assignmentRef(a)} onBack={onBack} />
      <div className="scroll">
        <div className="card">
          <div className="kv">
            {a.sales_order ? (<><span className="k">Sales order</span><span className="v">{a.sales_order}</span></>) : null}
            {a.quotation ? (<><span className="k">Quotation</span><span className="v">{a.quotation}</span></>) : null}
            {a.due_date ? (<><span className="k">Measure by</span><span className="v">{fmtDate(a.due_date)}</span></>) : null}
            {a.contact_person ? (<><span className="k">Contact</span><span className="v">{a.contact_person}</span></>) : null}
            {a.contact_mobile ? (
              <>
                <span className="k">Mobile</span>
                <span className="v"><a href={`tel:${a.contact_mobile}`}>{a.contact_mobile}</a></span>
              </>
            ) : null}
          </div>
          {a.location ? (<><div className="small" style={{ marginTop: 10 }}>Location</div><div>{a.location}</div></>) : null}
          {a.notes ? (<><div className="small" style={{ marginTop: 10 }}>Instructions</div><div>{a.notes}</div></>) : null}
        </div>

        <div className="section-label">Garments</div>
        <div className="chips">
          {(a.garments || []).map((g) => (
            <span key={g.garment} className="chip">
              {g.garment}
              {g.qty ? <span className="count">×{g.qty}</span> : null}
            </span>
          ))}
        </div>

        {listed.length ? (
          <>
            <div className="section-label">
              People to measure ({doneCount} of {listed.length} done)
            </div>
            <div className="progress"><span style={{ width: `${Math.round((doneCount / listed.length) * 100)}%` }} /></div>
            {listed.length > 8 ? (
              <input className="input" placeholder="Search name, staff ID, designation" value={q} onChange={(e) => setQ(e.target.value)} />
            ) : null}
            <div className="chips" style={{ margin: "10px 0" }}>
              {[
                ["todo", `To measure (${listed.length - doneCount})`],
                ["done", `Done (${doneCount})`],
                ["all", "All"],
              ].map(([k, l]) => (
                <button key={k} className={"chip" + (show === k ? " on" : "")} onClick={() => setShow(k)}>
                  {l}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <div className="card small">
                {show === "todo" && !term ? "Everyone on the list is measured." : "Nobody matches."}
              </div>
            ) : (
              <div className="list">
                {shown.map((p) => {
                  const m = matched.get(p.row);
                  const garmentsText = (p.garments || []).length ? p.garments.join(", ") : "";
                  return (
                    <button
                      key={p.row}
                      className={"row person" + (m?.done ? " done" : "")}
                      onClick={() => (m?.rec ? onOpen(m.rec.id) : m?.done ? null : onMeasure(a, p))}
                    >
                      <span className={"tick" + (m?.done ? " on" : "")}>{m?.done ? <Icon name="check" width="16" height="16" /> : null}</span>
                      <div className="grow">
                        <div className="title">
                          {p.person_name}
                          {p.employee_code ? <span className="small"> · {p.employee_code}</span> : null}
                        </div>
                        <div className="meta">
                          {[p.designation, p.gender, garmentsText].filter(Boolean).join(" · ") || "\u00a0"}
                        </div>
                      </div>
                      {m?.rec ? <StatusPill rec={m.rec} /> : m?.done ? <span className="pill synced">Measured</span> : <Icon name="chevron" width="20" height="20" />}
                    </button>
                  );
                })}
              </div>
            )}
            {others.length ? (
              <>
                <div className="section-label">Others measured, not on the list ({others.length})</div>
                <div className="list">{others.map(recRow)}</div>
              </>
            ) : null}
          </>
        ) : (
          <>
            <div className="section-label">People measured ({sorted.length})</div>
            {sorted.length === 0 ? <div className="card small">Nobody measured yet.</div> : <div className="list">{sorted.map(recRow)}</div>}
          </>
        )}
        {err ? <div className="err-text" style={{ marginTop: 12 }}>{err}</div> : null}
      </div>
      <div className="bottom-bar">
        <button className="btn secondary" disabled={!online} onClick={() => setConfirm(true)}>
          Mark done
        </button>
        <button className="btn" onClick={() => onMeasure(a)}>
          <Icon name="plus" width="20" height="20" /> {listed.length ? "Add person" : "Measure a person"}
        </button>
      </div>
      {confirm ? (
        <Sheet title="Mark this assignment as done?" onClose={() => setConfirm(false)}>
          {pending ? (
            <div className="banner err">{pending} measurement(s) are not synced yet. They are sent first.</div>
          ) : null}
          <p className="small">The office is told it is complete, and it is removed from this phone.</p>
          <div className="btn-row">
            <button className="btn secondary" onClick={() => setConfirm(false)}>Not yet</button>
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr("");
                try {
                  await onMarkDone(a.name);
                } catch (e) {
                  setErr(e.message || "Could not update the assignment");
                  setConfirm(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Updating…" : "Mark done"}
            </button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

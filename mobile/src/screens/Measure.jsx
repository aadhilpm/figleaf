import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, findPrevious, matchListed, personKey } from "../lib/db.js";
import { api } from "../lib/api.js";
import { buildPrintHtml, printHtml } from "../lib/print.js";
import { Diagram, Field, Icon, Segmented, Sheet, StatusPill, TopBar, fmtDate } from "../components/ui.jsx";

export const symbolOf = (config, unit) => (config?.units || []).find((u) => u.name === unit)?.symbol || unit || "";


/** Rebuild value rows for the selected garments, keeping values already typed. */
export function buildValues(garmentNames, garmentsMeta, oldValues) {
  const old = new Map((oldValues || []).map((v) => [`${v.garment}::${v.measurement_type}`, v]));
  const out = [];
  garmentNames.forEach((g) => {
    const meta = garmentsMeta.find((x) => x.name === g);
    const ms = meta ? meta.measurements : (oldValues || []).filter((v) => v.garment === g).map((v) => v.measurement_type);
    ms.forEach((m) => {
      const o = old.get(`${g}::${m}`);
      out.push({ garment: g, measurement_type: m, value: o?.value || "", notes: o?.notes || "" });
    });
  });
  return out;
}

// ---------------------------------------------------------------- details

export function DetailsScreen({ draft, setDraft, garments, config, onBack, onNext, isNew }) {
  const [err, setErr] = useState("");
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // people already measured for this customer, for quick pick
  const people = useLiveQuery(
    async () => {
      if (!draft.assignment && !draft.customer_name) return [];
      const rows = await db.measurements
        .filter(
          (r) =>
            r.id !== draft.id &&
            (draft.assignment ? r.assignment === draft.assignment : !r.assignment && r.customer_name === draft.customer_name)
        )
        .toArray();
      const seen = new Map();
      rows
        .sort((a, b) => String(b.measurement_date).localeCompare(String(a.measurement_date)))
        .forEach((r) => {
          if (!seen.has(r.person_key)) seen.set(r.person_key, r);
        });
      return [...seen.values()];
    },
    [draft.assignment, draft.customer_name, draft.id],
    []
  );
  // people on the assignment's list who are not measured yet
  const listed = useLiveQuery(
    async () => {
      if (!draft.assignment) return [];
      const a = await db.assignments.get(draft.assignment);
      if (!a?.people?.length) return [];
      const recs = await db.measurements.where("assignment").equals(draft.assignment).filter((r) => r.id !== draft.id).toArray();
      const m = matchListed(a.people, recs);
      return a.people.filter((p) => !m.get(p.row)?.done);
    },
    [draft.assignment, draft.id],
    []
  );
  const [showPeople, setShowPeople] = useState(false);
  const matches = useMemo(() => {
    const t = draft.person_name.trim().toLowerCase();
    const hit = (p) => !t || p.person_name.toLowerCase().includes(t) || (p.employee_code || "").toLowerCase().includes(t);
    return [
      ...(listed || []).filter(hit).map((p) => ({ ...p, person_key: `list:${p.row}`, listed: true })),
      ...(people || []).filter(hit),
    ].slice(0, 8);
  }, [people, listed, draft.person_name]);

  function toggleGarment(g) {
    const has = draft.garments.includes(g);
    const next = has ? draft.garments.filter((x) => x !== g) : [...draft.garments, g];
    const patch = { garments: next, values: buildValues(next, garments, draft.values) };
    // first garment picked: use its template unit unless this phone has its own default
    if (!draft.garments.length && next.length && !config.phone_unit) {
      const tu = garments.find((x) => x.name === next[0])?.default_unit;
      if (tu && (config.units || []).some((u) => u.name === tu)) patch.unit = tu;
    }
    set(patch);
  }

  function next() {
    if (!draft.assignment && !draft.customer_name.trim()) return setErr("Enter the customer name");
    if (!draft.person_name.trim()) return setErr("Enter the person's name");
    if (config.settings?.require_staff_id && !draft.employee_code.trim()) return setErr("Enter the staff ID");
    if (!draft.garments.length) return setErr("Select at least one garment");
    setErr("");
    onNext();
  }

  return (
    <div className="screen">
      <TopBar title={isNew ? "New measurement" : "Details"} onBack={onBack} />
      <div className="scroll">
        {draft.assignment ? (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="small">Assignment {draft.assignment}</div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{draft.customer_name}</div>
            <div className="small">{[draft.sales_order, draft.quotation].filter(Boolean).join(" · ")}</div>
          </div>
        ) : (
          <Field label="Customer name (walk-in)" required>
            <input
              className="input"
              value={draft.customer_name}
              onChange={(e) => set({ customer_name: e.target.value })}
              autoCapitalize="words"
              autoFocus={isNew}
              placeholder="As the customer gives it"
            />
          </Field>
        )}

        <Field label="Order / Ref. No.">
          <input className="input" value={draft.ref_no} onChange={(e) => set({ ref_no: e.target.value })} />
        </Field>

        <div className="section-label">Person</div>
        <Field label="Person / staff name" required>
          <input
            className="input"
            value={draft.person_name}
            onChange={(e) => {
              set({ person_name: e.target.value, assignment_person: "" });
              setShowPeople(true);
            }}
            onFocus={() => setShowPeople(true)}
            onBlur={() => setTimeout(() => setShowPeople(false), 150)}
            autoCapitalize="words"
            autoComplete="off"
            autoFocus={isNew && !!draft.assignment}
          />
        </Field>
        {showPeople && matches.length ? (
          <div className="list" style={{ marginTop: -6, marginBottom: 14 }}>
            <div className="small" style={{ padding: "8px 16px 0" }}>
              {listed?.length ? "On the list, or measured before" : "Measured before for this customer"}
            </div>
            {matches.map((p) => (
              <button
                key={p.person_key}
                type="button"
                className="row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const patch = {
                    person_name: p.person_name,
                    employee_code: p.employee_code || "",
                    designation: p.designation || "",
                    gender: p.gender || draft.gender,
                    assignment_person: p.listed ? p.row : "",
                  };
                  const own = p.listed ? (p.garments || []).filter((g) => garments.some((x) => x.name === g)) : [];
                  if (own.length) Object.assign(patch, { garments: own, values: buildValues(own, garments, draft.values) });
                  set(patch);
                  setShowPeople(false);
                }}
              >
                <div className="grow">
                  <div className="title">
                    {p.person_name}
                    {p.employee_code ? <span className="small"> · {p.employee_code}</span> : null}
                  </div>
                  <div className="meta">
                    {p.listed
                      ? ["On the list", p.designation].filter(Boolean).join(" · ")
                      : [p.designation, (p.garments || []).join(", "), fmtDate(p.measurement_date)].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid2">
          <Field label="Staff ID" required={!!config.settings?.require_staff_id}>
            <input className="input" value={draft.employee_code} onChange={(e) => set({ employee_code: e.target.value })} autoCapitalize="characters" />
          </Field>
          <Field label="Designation">
            <input className="input" value={draft.designation} onChange={(e) => set({ designation: e.target.value })} autoCapitalize="words" />
          </Field>
        </div>
        <Field label="Gender">
          <Segmented value={draft.gender} options={[{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }]} onChange={(v) => set({ gender: draft.gender === v ? "" : v })} />
        </Field>
        <div className={config.settings?.allow_unit_change === 0 ? "" : "grid2"}>
          {config.settings?.allow_unit_change === 0 ? null : (
            <Field label="Unit">
              {(config.units || []).length > 3 ? (
                <select className="select input" value={draft.unit} onChange={(e) => set({ unit: e.target.value })}>
                  {config.units.map((u) => (
                    <option key={u.name} value={u.name}>{u.name} ({u.symbol})</option>
                  ))}
                </select>
              ) : (
                <Segmented
                  value={draft.unit}
                  options={(config.units?.length ? config.units : [{ name: "Inch", symbol: "in" }, { name: "CM", symbol: "cm" }]).map((u) => ({ value: u.name, label: u.name }))}
                  onChange={(v) => set({ unit: v })}
                />
              )}
            </Field>
          )}
          <Field label="Date">
            <input className="input" type="date" value={draft.measurement_date} onChange={(e) => set({ measurement_date: e.target.value })} />
          </Field>
        </div>

        <div className="section-label">Garments</div>
        {garments.length === 0 ? (
          <div className="banner info">No garment templates yet. Sync once while online.</div>
        ) : (
          <div className="chips">
            {garments.map((g) => (
              <button key={g.name} type="button" className={"chip" + (draft.garments.includes(g.name) ? " on" : "")} onClick={() => toggleGarment(g.name)}>
                {draft.garments.includes(g.name) ? <Icon name="check" width="16" height="16" /> : null}
                {g.name}
              </button>
            ))}
          </div>
        )}
        {err ? <div className="err-text" style={{ marginTop: 14 }}>{err}</div> : null}
      </div>
      <div className="bottom-bar">
        <button className="btn" onClick={next}>
          {isNew ? "Start measuring" : "Back to measurements"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- entry

export function EntryScreen({ draft, setDraft, garments, config, online, onBack, onDetails, onSave, saving }) {
  const [tab, setTab] = useState(draft.garments[0]);
  const [active, setActive] = useState(null);
  const [noteFor, setNoteFor] = useState(null);
  const [prev, setPrev] = useState(null);
  const [prevDismissed, setPrevDismissed] = useState(false);
  const [err, setErr] = useState("");
  const inputs = useRef({});

  useEffect(() => {
    if (!draft.garments.includes(tab)) setTab(draft.garments[0]);
  }, [draft.garments, tab]);

  const [asking, setAsking] = useState(false);
  const [askedServer, setAskedServer] = useState(false);
  useEffect(() => {
    const key = personKey(draft.employee_code, draft.person_name);
    setAskedServer(false);
    findPrevious(draft, key).then(setPrev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.assignment, draft.customer_name, draft.employee_code, draft.person_name, draft.id]);

  async function askServer() {
    setAsking(true);
    try {
      const p = await api.previous({
        assignment: draft.assignment,
        person_name: draft.person_name,
        employee_code: draft.employee_code,
        exclude: draft.name || undefined,
      });
      setAskedServer(true);
      if (p) setPrev(p);
    } catch (e) {
      setErr(e.message || "Could not check earlier measurements");
    } finally {
      setAsking(false);
    }
  }

  const meta = garments.find((g) => g.name === tab) || {
    name: tab,
    diagram: "Top",
    measurements: draft.values.filter((v) => v.garment === tab).map((v) => v.measurement_type),
  };
  const unit = symbolOf(config, draft.unit);
  const howTo = (m) => (config.measurement_types || []).find((t) => t.name === m)?.description || "";
  const val = (g, m) => draft.values.find((v) => v.garment === g && v.measurement_type === m) || {};

  function setVal(g, m, field, v) {
    setDraft((d) => ({
      ...d,
      values: d.values.map((x) => (x.garment === g && x.measurement_type === m ? { ...x, [field]: v } : x)),
    }));
  }

  function focusMeasure(m) {
    setActive(m);
    const el = inputs.current[m];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function nextInput(i) {
    const ms = meta.measurements;
    if (i + 1 < ms.length) focusMeasure(ms[i + 1]);
    else {
      const gi = draft.garments.indexOf(tab);
      if (gi + 1 < draft.garments.length) {
        setTab(draft.garments[gi + 1]);
        setActive(null);
      } else {
        inputs.current[ms[i]]?.blur();
        setActive(null);
      }
    }
  }

  function copyPrev() {
    const map = new Map((prev.values || []).map((v) => [`${v.garment}::${v.measurement_type}`, v]));
    const missing = (prev.garments || []).filter((g) => !draft.garments.includes(g) && garments.some((x) => x.name === g));
    setDraft((d) => {
      const gs = [...d.garments, ...missing];
      const values = buildValues(gs, garments, d.values).map((v) => {
        const p = map.get(`${v.garment}::${v.measurement_type}`);
        return p && p.value && !v.value ? { ...v, value: p.value, notes: v.notes || p.notes || "" } : v;
      });
      return { ...d, garments: gs, values, unit: prev.unit || d.unit };
    });
    setPrevDismissed(true);
  }

  async function save(nextPerson) {
    if (!draft.values.some((v) => String(v.value || "").trim())) return setErr("Enter at least one measurement");
    setErr("");
    await onSave(nextPerson);
  }

  const counts = (g) => {
    const rows = draft.values.filter((v) => v.garment === g);
    return `${rows.filter((v) => String(v.value || "").trim()).length}/${rows.length}`;
  };

  return (
    <div className="screen">
      <TopBar
        title={draft.person_name || "Measurements"}
        sub={draft.customer_name}
        onBack={onBack}
        right={
          <button className="icon-btn" onClick={onDetails} aria-label="Edit details">
            <Icon name="edit" />
          </button>
        }
      />
      <div className="entry-tabs">
        {draft.garments.map((g) => (
          <button key={g} className={"chip" + (g === tab ? " on" : "")} onClick={() => { setTab(g); setActive(null); }}>
            {g} <span className="count">{counts(g)}</span>
          </button>
        ))}
      </div>
      <Diagram garment={meta} active={active} onPick={focusMeasure} compact={!!active} />
      <div className="scroll" style={{ paddingTop: 10 }}>
        {!prev && !prevDismissed && online && draft.assignment && (draft.person_name || draft.employee_code) &&
        !draft.values.some((v) => String(v.value || "").trim()) ? (
          <div className="banner info">
            <Icon name="copy" width="20" height="20" />
            <span className="grow">{askedServer ? "No earlier measurement for this person." : "Measured before for this customer?"}</span>
            {askedServer ? null : (
              <button onClick={askServer} disabled={asking}>{asking ? "Checking…" : "Check"}</button>
            )}
            <button onClick={() => setPrevDismissed(true)}>✕</button>
          </div>
        ) : null}
        {prev && !prevDismissed && !draft.values.some((v) => String(v.value || "").trim()) ? (
          <div className="banner info">
            <Icon name="copy" width="20" height="20" />
            <span className="grow">
              Measured before on {fmtDate(prev.measurement_date)} ({(prev.garments || []).join(", ")})
            </span>
            <button onClick={copyPrev}>Copy</button>
            <button onClick={() => setPrevDismissed(true)}>✕</button>
          </div>
        ) : null}

        {meta.measurements.map((m, i) => {
          const v = val(tab, m);
          return (
            <div key={`${tab}-${m}`} className={"m-row" + (active === m ? " active" : "")} onClick={() => focusMeasure(m)}>
              <span className="m-num">{i + 1}</span>
              <span className="m-label">
                {m}
                {v.notes ? <span className="note">{v.notes}</span> : null}
                {active === m && howTo(m) ? <span className="howto">{howTo(m)}</span> : null}
              </span>
              <span className="m-input">
                <input
                  ref={(el) => (inputs.current[m] = el)}
                  value={v.value || ""}
                  inputMode="decimal"
                  enterKeyHint={i + 1 < meta.measurements.length ? "next" : "done"}
                  onFocus={(e) => {
                    setActive(m);
                    const el = e.target;
                    setTimeout(() => el.select(), 0); // typing replaces the old value
                  }}
                  onChange={(e) => setVal(tab, m, "value", e.target.value.replace(",", "."))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      nextInput(i);
                    }
                  }}
                  aria-label={`${m} in ${unit}`}
                />
                <span className="u">{unit}</span>
              </span>
              <button
                type="button"
                className={"m-note-btn" + (v.notes ? " has" : "")}
                onClick={(e) => {
                  e.stopPropagation();
                  setNoteFor(m);
                }}
                aria-label={`Note for ${m}`}
              >
                <Icon name="note" />
              </button>
            </div>
          );
        })}

        <div className="section-label">Remarks</div>
        <textarea className="input" rows={3} value={draft.remarks} onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))} placeholder="Fit, style or anything the tailor should know" />
        {err ? <div className="err-text" style={{ marginTop: 12 }}>{err}</div> : null}
      </div>
      <div className="bottom-bar">
        <button className="btn secondary" disabled={saving} onClick={() => save(true)}>
          Save &amp; next person
        </button>
        <button className="btn" disabled={saving} onClick={() => save(false)}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {noteFor ? (
        <NoteSheet
          title={`${tab} · ${noteFor}`}
          value={val(tab, noteFor).notes || ""}
          onClose={() => setNoteFor(null)}
          onSave={(t) => {
            setVal(tab, noteFor, "notes", t);
            setNoteFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function NoteSheet({ title, value, onClose, onSave }) {
  const [t, setT] = useState(value);
  return (
    <Sheet title={title} onClose={onClose}>
      <textarea className="input" rows={3} value={t} onChange={(e) => setT(e.target.value)} autoFocus placeholder="e.g. loose fit, add 1 inch" />
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={() => onSave(t.trim())}>Save note</button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- view

export function ViewScreen({ id, garments, config, onBack, onEdit, onDelete, onRetry, onPrint }) {
  const rec = useLiveQuery(() => db.measurements.get(id), [id]);
  const [tab, setTab] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  if (!rec) return <div className="screen"><TopBar title="Measurement" onBack={onBack} /></div>;
  const g = tab && rec.garments.includes(tab) ? tab : rec.garments[0];
  const meta = garments.find((x) => x.name === g) || { name: g, diagram: "Top", measurements: rec.values.filter((v) => v.garment === g).map((v) => v.measurement_type) };
  const rows = rec.values.filter((v) => v.garment === g);
  const unit = symbolOf(config, rec.unit);

  return (
    <div className="screen">
      <TopBar
        title={rec.person_name}
        sub={rec.customer_name}
        onBack={onBack}
        right={
          <>
            <button className="icon-btn" onClick={onPrint} aria-label="Print">
              <Icon name="printer" />
            </button>
            {rec.editable || rec.status !== "synced" ? (
              <button className="icon-btn" onClick={onEdit} aria-label="Edit">
                <Icon name="edit" />
              </button>
            ) : null}
          </>
        }
      />
      <div className="entry-tabs">
        {rec.garments.map((x) => (
          <button key={x} className={"chip" + (x === g ? " on" : "")} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>
      <Diagram garment={meta} active={null} compact />
      <div className="scroll">
        {rec.status === "error" ? (
          <div className="banner err">
            <span className="grow">Sync failed: {rec.error}</span>
            <button onClick={onRetry}>Retry</button>
          </div>
        ) : null}
        {rec.conflict ? <div className="banner info">This record was changed in ERPNext. The ERPNext version is shown.</div> : null}
        <div className="card">
          <table className="vt">
            <tbody>
              {rows.map((v, i) => (
                <tr key={v.measurement_type}>
                  <td className="n">{i + 1}</td>
                  <td>
                    {v.measurement_type}
                    {v.notes ? <div className="small">{v.notes}</div> : null}
                  </td>
                  <td className="v">{v.value ? `${v.value} ${unit}` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rec.remarks ? (
          <div className="card">
            <div className="small">Remarks</div>
            {rec.remarks}
          </div>
        ) : null}
        <div className="card">
          <div className="kv">
            <span className="k">Status</span><span className="v"><StatusPill rec={rec} /></span>
            {rec.name ? (<><span className="k">ERPNext ID</span><span className="v">{rec.name}</span></>) : null}
            <span className="k">Date</span><span className="v">{fmtDate(rec.measurement_date)}</span>
            {rec.employee_code ? (<><span className="k">Staff ID</span><span className="v">{rec.employee_code}</span></>) : null}
            {rec.designation ? (<><span className="k">Designation</span><span className="v">{rec.designation}</span></>) : null}
            {rec.gender ? (<><span className="k">Gender</span><span className="v">{rec.gender}</span></>) : null}
            {rec.sales_order ? (<><span className="k">Sales order</span><span className="v">{rec.sales_order}</span></>) : null}
            {rec.ref_no ? (<><span className="k">Ref. No.</span><span className="v">{rec.ref_no}</span></>) : null}
            {rec.measured_by ? (<><span className="k">Measured by</span><span className="v">{rec.measured_by}</span></>) : null}
          </div>
        </div>
        {!rec.name && rec.status !== "synced" ? (
          <button className="btn danger" style={{ marginTop: 16 }} onClick={() => setConfirmDel(true)}>
            <Icon name="trash" width="20" height="20" /> Delete (not synced yet)
          </button>
        ) : null}
      </div>
      {confirmDel ? (
        <Sheet title="Delete this measurement?" onClose={() => setConfirmDel(false)}>
          <p className="small">It has not been sent to ERPNext yet, so it will be lost.</p>
          <div className="btn-row">
            <button className="btn secondary" onClick={() => setConfirmDel(false)}>Keep</button>
            <button className="btn danger" onClick={onDelete}>Delete</button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- print preview

export function PrintScreen({ id, garments, config, company, onBack }) {
  const rec = useLiveQuery(() => db.measurements.get(id), [id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const html = useMemo(
    () => (rec ? buildPrintHtml({ ...rec, unit_symbol: symbolOf(config, rec.unit) }, garments, company) : ""),
    [rec, garments, company, config]
  );
  return (
    <div className="screen">
      <TopBar title="Print" sub={rec ? `${rec.person_name} · ${(rec.garments || []).length} page(s)` : ""} onBack={onBack} />
      <div className="scroll" style={{ padding: 12, paddingBottom: "calc(110px + var(--safe-bottom))" }}>
        <iframe title="Print preview" className="print-frame" srcDoc={html} />
        {err ? <div className="err-text">{err}</div> : null}
      </div>
      <div className="bottom-bar">
        <button
          className="btn"
          disabled={!rec || busy}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await printHtml(html, `${rec.person_name} - Measurements`);
            } catch (e) {
              if (!/cancel/i.test(e?.message || "")) setErr(e?.message || "Could not print");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="printer" width="22" height="22" /> Print / Save as PDF
        </button>
      </div>
    </div>
  );
}

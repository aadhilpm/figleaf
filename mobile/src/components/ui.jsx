import { useEffect, useMemo, useState } from "react";
import "@garment-diagram";

// ---------------------------------------------------------------- icons
const P = {
  back: "M15 18l-6-6 6-6",
  plus: "M12 5v14M5 12h14",
  sync: "M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M21 4v5h-5M3 20v-5h5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  check: "M20 6L9 17l-5-5",
  note: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
  chevron: "M9 18l6-6-6-6",
  finger: "M12 11v4M8 8a5 5 0 0 1 9 3v3a9 9 0 0 1-1 4M6 12a6 6 0 0 1 .5-2.5M6 15v1a8 8 0 0 0 2 5M10 21a10 10 0 0 1-1-5v-5a3 3 0 0 1 6 0v2",
  tape: "M4 12a8 8 0 1 1 16 0v8H12a8 8 0 0 1-8-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM15 20v-3M18 20v-2",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  printer: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z",
};

export function Icon({ name, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

export function TopBar({ title, sub, onBack, right }) {
  return (
    <header className="topbar">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
      ) : (
        <span style={{ width: 8 }} />
      )}
      <h1>
        {title}
        {sub ? <span className="sub">{sub}</span> : null}
      </h1>
      {right}
    </header>
  );
}

export function Field({ label, required, children }) {
  return (
    <label className="field">
      <span>
        {label} {required ? <b className="req">*</b> : null}
      </span>
      {children}
    </label>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <button type="button" key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)} role="radio" aria-checked={value === v}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Sheet({ title, onClose, children }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {title ? <h3>{title}</h3> : null}
        {children}
      </div>
    </div>
  );
}

export function StatusPill({ rec }) {
  if (rec.status === "pending") return <span className="pill pending">Not synced</span>;
  if (rec.status === "error") return <span className="pill error">Sync failed</span>;
  if (!rec.app_uuid) return <span className="pill desk">ERPNext</span>;
  return <span className="pill synced">Synced</span>;
}

export function useToast() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return [node, setMsg];
}

/** Garment drawing, shared with ERPNext (figleaf/public/js/garment_diagram.js). */
export function Diagram({ garment, active, onPick, compact }) {
  const svg = useMemo(() => {
    if (!garment || garment.diagram_image || !window.GarmentDiagram) return "";
    return window.GarmentDiagram.render(garment.diagram || "Top", garment.measurements || [], active, {
      ink: "currentColor",
      badge: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "#172026" : "#ffffff",
      muted: "#94a3b8",
    });
  }, [garment, active]);

  if (!garment) return null;
  return (
    <div
      className={"diagram-wrap" + (compact ? " min" : "")}
      onClick={(e) => {
        const g = e.target.closest("[data-measurement]");
        if (g && onPick) onPick(g.getAttribute("data-measurement"));
      }}
    >
      {garment.diagram_image ? (
        <img src={garment.diagram_image} alt={garment.name} />
      ) : (
        <div className="svg" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function timeAgo(iso) {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return fmtDate(iso);
}

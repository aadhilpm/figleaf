// Printable measurement form (one page per garment), built on the phone so it works offline.
import { Capacitor } from "@capacitor/core";
import { Printer } from "@capgo/capacitor-printer";
import "@garment-diagram";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function buildPrintHtml(rec, garmentsMeta, company) {
  const unit = rec.unit_symbol || rec.unit || "";
  const info = [
    ["Customer", rec.customer_name],
    ["Person / Staff Name", [rec.person_name, rec.employee_code ? `(${rec.employee_code})` : ""].filter(Boolean).join(" ")],
    ["Designation", rec.designation],
    ["Date", fmtDate(rec.measurement_date)],
    ["Order / Ref. No.", rec.ref_no || rec.sales_order],
  ].filter(([, v]) => v);

  const pages = (rec.garments || []).map((g) => {
    const meta = garmentsMeta.find((x) => x.name === g) || {
      name: g,
      diagram: "Top",
      measurements: rec.values.filter((v) => v.garment === g).map((v) => v.measurement_type),
    };
    const rows = rec.values.filter((v) => v.garment === g);
    const order = meta.measurements;
    rows.sort((a, b) => order.indexOf(a.measurement_type) - order.indexOf(b.measurement_type));
    const diagram = meta.diagram_image
      ? `<img src="${esc(meta.diagram_image)}" alt="">`
      : window.GarmentDiagram
        ? window.GarmentDiagram.render(meta.diagram || "Top", order, null, {
            ink: "#1f2937",
            muted: "#64748b",
            badge: "#ffffff",
            clickable: false,
          })
        : "";
    return `
    <section class="page">
      ${company ? `<div class="co">${esc(company)}</div>` : ""}
      <h1>${esc(g).toUpperCase()}</h1>
      <div class="sub">MEASUREMENT FORM</div>
      <table class="info">${info.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
      <div class="body">
        <div class="fig">${diagram}</div>
        <table class="vals">
          <thead><tr><th class="n">#</th><th>Measurement</th><th class="v">Value / Size (${unit})</th></tr></thead>
          <tbody>
          ${rows
            .map(
              (r) => `<tr><td class="n">${order.indexOf(r.measurement_type) + 1 || ""}</td><td>${esc(r.measurement_type)}${
                r.notes ? `<div class="note">${esc(r.notes)}</div>` : ""
              }</td><td class="v">${esc(r.value || "")}</td></tr>`
            )
            .join("")}
          </tbody>
        </table>
      </div>
      <table class="info rem"><tr><th>Remarks</th><td>${esc(rec.remarks || "")}</td></tr></table>
      <div class="foot">${esc(rec.name || "Not synced yet")}${rec.measured_by ? ` · Measured by ${esc(rec.measured_by)}` : ""}</div>
    </section>`;
  });

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(rec.person_name)} - Measurements</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2937; margin: 0; background: #fff; }
  .page { padding: 0; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .co { text-align: center; font-size: 12px; font-weight: 700; color: #475569; letter-spacing: .04em; margin-bottom: 4px; }
  h1 { text-align: center; color: #1f4e79; margin: 0; font-size: 28px; letter-spacing: 1px; }
  .sub { text-align: center; font-weight: 700; font-size: 12px; letter-spacing: 1px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  .info th, .info td, .vals th, .vals td { border: 1px solid #b8c7d9; padding: 6px 9px; font-size: 13px; text-align: left; vertical-align: top; }
  .info th { background: #f5f7fa; color: #1f4e79; width: 34%; }
  .body { display: flex; gap: 14px; margin: 14px 0; align-items: flex-start; }
  .fig { width: 40%; flex: none; }
  .fig svg, .fig img { width: 100%; height: auto; display: block; }
  .vals thead th { background: #1f4e79; color: #fff; }
  .vals .n { width: 30px; text-align: center; color: #64748b; font-weight: 700; }
  .vals .v { text-align: center; font-weight: 800; font-size: 15px; width: 34%; }
  .note { font-size: 11px; color: #64748b; margin-top: 2px; }
  .rem td { height: 48px; }
  .foot { text-align: center; font-size: 10px; color: #64748b; margin-top: 10px; }
</style></head><body>${pages.join("")}</body></html>`;
}

export async function printHtml(html, name) {
  if (Capacitor.isNativePlatform()) {
    await Printer.printHtml({ name, html });
    return;
  }
  const w = window.open("", "_blank");
  if (!w) throw new Error("Allow pop-ups to print");
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

// Copyright (c) 2026, Badeel Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Garment Template", {
	setup(frm) {
		frm.set_query("items", () => ({ filters: { is_sales_item: 1, disabled: 0 } }));
	},
	refresh(frm) {
		frappe.require("/assets/figleaf/js/garment_diagram.js", () => preview(frm));
	},
	diagram: preview,
	diagram_image: preview,
});

frappe.ui.form.on("Garment Template Measurement", {
	measurement_type: preview,
	measurements_remove: preview,
});

function preview(frm) {
	const $f = frm.get_field("diagram").$wrapper;
	$f.find(".gt-preview").remove();
	const $p = $('<div class="gt-preview" style="max-width:220px;margin-top:12px;color:var(--text-color)"></div>');
	$f.append($p);
	if (frm.doc.diagram_image) {
		$p.html(`<img src="${encodeURI(frm.doc.diagram_image)}" style="width:100%">`);
	} else if (window.GarmentDiagram) {
		const ms = (frm.doc.measurements || []).map((r) => r.measurement_type).filter(Boolean);
		$p.html(window.GarmentDiagram.render(frm.doc.diagram || "Top", ms, null));
	}
}

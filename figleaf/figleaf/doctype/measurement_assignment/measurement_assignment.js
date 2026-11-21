// Copyright (c) 2026, Badeel Technology and contributors
// For license information, please see license.txt

const MA_METHOD = "figleaf.figleaf.doctype.measurement_assignment.measurement_assignment";

frappe.ui.form.on("Measurement Assignment", {
	setup(frm) {
		frm.set_query("sales_order", () => ({ filters: { docstatus: ["<", 2] } }));
		frm.set_query("quotation", () => ({ filters: { docstatus: ["<", 2] } }));
		frm.set_query("assigned_to", () => ({
			query: "frappe.core.doctype.user.user.user_query",
			filters: { enabled: 1, user_type: "System User" },
		}));
	},

	refresh(frm) {
		if (frm.is_new()) return;
		if (["Open", "In Progress"].includes(frm.doc.status)) {
			frm.add_custom_button(__("Mark Completed"), () => set_status(frm, "Completed"), __("Status"));
			frm.add_custom_button(__("Cancel Assignment"), () => set_status(frm, "Cancelled"), __("Status"));
		} else {
			frm.add_custom_button(__("Reopen"), () => set_status(frm, "Open"), __("Status"));
		}
		frm.add_custom_button(__("Measurement Sheet"), () =>
			frappe.set_route("query-report", "Measurement Sheet", {
				assignment: frm.doc.name,
				garment: (frm.doc.garments[0] || {}).garment,
			})
		);
		frm.add_custom_button(__("New Measurement"), () =>
			frappe.new_doc("Customer Measurement", { assignment: frm.doc.name })
		);
		frm.dashboard.add_indicator(
			__("{0} people measured", [frm.doc.measured_count || 0]),
			frm.doc.measured_count ? "green" : "gray"
		);
		const listed = (frm.doc.people || []).length;
		if (listed) {
			const done = frm.doc.people.filter((p) => p.status === "Measured").length;
			frm.dashboard.add_indicator(
				__("{0} of {1} on the list measured", [done, listed]),
				done === listed ? "green" : "orange"
			);
		}
	},

	based_on(frm) {
		["sales_order", "quotation"].forEach((f) => frm.set_value(f, ""));
		if (frm.doc.based_on !== "Customer") frm.set_value("customer", "");
	},
	sales_order(frm) {
		reset_garments(frm);
	},
	quotation(frm) {
		reset_garments(frm);
	},
});

function reset_garments(frm) {
	// garments are filled from the order / quotation on save when the table is empty
	frm.clear_table("garments");
	frm.refresh_field("garments");
}

function set_status(frm, status) {
	frappe.call(`${MA_METHOD}.set_status`, { name: frm.doc.name, status }).then(() => frm.reload_doc());
}

// Measurements before order confirmation
frappe.ui.form.on("Quotation", {
	refresh(frm) {
		if (frm.is_new() || frm.doc.docstatus === 2) return;
		const grp = __("Measurements");
		frm.add_custom_button(
			__("Assign Measurement"),
			() => frappe.new_doc("Measurement Assignment", { based_on: "Quotation", quotation: frm.doc.name }),
			grp
		);
		frm.add_custom_button(
			__("View Measurements"),
			() => frappe.set_route("List", "Customer Measurement", { quotation: frm.doc.name }),
			grp
		);
	},
});

// Measurements from a Sales Order
frappe.ui.form.on("Sales Order", {
	refresh(frm) {
		if (frm.is_new() || frm.doc.docstatus === 2) return;
		const grp = __("Measurements");
		if (frm.doc.docstatus < 2) {
			frm.add_custom_button(
				__("Assign Measurement"),
				() => frappe.new_doc("Measurement Assignment", { based_on: "Sales Order", sales_order: frm.doc.name }),
				grp
			);
		}
		frm.add_custom_button(
			__("New Measurement"),
			() => {
				frappe.call(
					"figleaf.figleaf.doctype.customer_measurement.customer_measurement.get_suggested_garments",
					{ sales_order: frm.doc.name }
				).then((r) => {
					frappe.model.with_doctype("Customer Measurement", () => {
						const doc = frappe.model.get_new_doc("Customer Measurement");
						doc.customer = frm.doc.customer;
						doc.sales_order = frm.doc.name;
						doc.ref_no = frm.doc.po_no || frm.doc.name;
						(r.message || []).forEach((g) => {
							frappe.model.add_child(doc, "garments").garment = g;
						});
						frappe.set_route("Form", "Customer Measurement", doc.name);
					});
				});
			},
			grp
		);
		frm.add_custom_button(
			__("View Measurements"),
			() => frappe.set_route("List", "Customer Measurement", { sales_order: frm.doc.name }),
			grp
		);
		frm.add_custom_button(
			__("Measurement Sheet"),
			() =>
				frappe.call(
					"figleaf.figleaf.doctype.customer_measurement.customer_measurement.get_suggested_garments",
					{ sales_order: frm.doc.name }
				).then((r) =>
					frappe.set_route("query-report", "Measurement Sheet", {
						customer: frm.doc.customer,
						sales_order: frm.doc.name,
						garment: (r.message || [])[0],
					})
				),
			grp
		);
	},
});

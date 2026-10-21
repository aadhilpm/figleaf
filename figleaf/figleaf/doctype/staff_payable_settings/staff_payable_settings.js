// Copyright (c) 2026, Badeel Technology and contributors
// For license information, please see license.txt

frappe.ui.form.on("Staff Payable Settings", {
	setup(frm) {
		frm.set_query("account", "ledgers", () => ({ filters: { is_group: 0 } }));
	},
	refresh(frm) {
		frm.add_custom_button(__("Open Report"), () =>
			frappe.set_route("query-report", "Staff Outstanding Report")
		);
	},
});

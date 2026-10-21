// Copyright (c) 2026, Badeel Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Staff Outstanding Report"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default:
				frappe.defaults.get_user_default("Company") ||
				frappe.defaults.get_global_default("company"),
			reqd: 1,
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.year_start(),
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
		{
			fieldname: "payable_type",
			label: __("Type"),
			fieldtype: "MultiSelectList",
			get_data(txt) {
				return frappe
					.xcall(
						"figleaf.figleaf.doctype.staff_payable_settings.staff_payable_settings.get_payable_types",
						{ company: frappe.query_report.get_filter_value("company") }
					)
					.then((types) =>
						(types || [])
							.filter((t) => !txt || t.toLowerCase().includes(txt.toLowerCase()))
							.map((t) => ({ value: t, description: "" }))
					);
			},
		},
		{
			fieldname: "employee",
			label: __("Employee"),
			fieldtype: "MultiSelectList",
			get_data(txt) {
				return frappe.db.get_link_options("Employee", txt, {
					company: frappe.query_report.get_filter_value("company"),
				});
			},
		},
		{
			fieldname: "status",
			label: __("Employee Status"),
			fieldtype: "Select",
			options: ["All", "Active", "Inactive", "Suspended", "Left"],
			default: "All",
		},
		{
			fieldname: "view",
			label: __("View"),
			fieldtype: "Select",
			options: ["Detailed", "Summary"],
			default: "Detailed",
		},
		{
			fieldname: "show_zero",
			label: __("Show Zero Balances"),
			fieldtype: "Check",
		},
	],

	onload(report) {
		report.page.add_inner_button(__("Ledger Settings"), () =>
			frappe.set_route("Form", "Staff Payable Settings")
		);
	},

	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (!data) return value;

		if (["balance", "net"].includes(column.fieldname)) {
			const amt = data[column.fieldname] || 0;
			const color = amt > 0 ? "var(--red-600)" : amt < 0 ? "var(--green-600)" : "inherit";
			value = `<span style="color:${color};font-weight:600">${value}</span>`;
		}

		// Balance cell opens the General Ledger for that employee and type
		if (column.fieldname === "balance" && data.accounts) {
			const f = frappe.query_report.get_values();
			const args = encodeURIComponent(
				JSON.stringify({
					company: f.company,
					from_date: f.from_date || "2000-01-01",
					to_date: f.to_date,
					party_type: "Employee",
					party: [data.employee],
					account: data.accounts.split(","),
					categorize_by: "Categorize by Voucher (Consolidated)",
				})
			);
			value = `<a href="#" title="${__("Open General Ledger")}"
				onclick="frappe.route_options = JSON.parse(decodeURIComponent('${args}'));
				frappe.set_route('query-report', 'General Ledger'); return false;">${value}</a>`;
		}
		return value;
	},
};

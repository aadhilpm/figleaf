// Copyright (c) 2026, Badeel Technology and contributors
// For license information, please see license.txt

frappe.query_reports["Measurement Sheet"] = {
	filters: [
		{ fieldname: "customer", label: __("Customer"), fieldtype: "Link", options: "Customer" },
		{
			fieldname: "sales_order",
			label: __("Sales Order"),
			fieldtype: "Link",
			options: "Sales Order",
			get_query: () => {
				const c = frappe.query_report.get_filter_value("customer");
				return { filters: c ? { customer: c } : {} };
			},
		},
		{ fieldname: "quotation", label: __("Quotation"), fieldtype: "Link", options: "Quotation" },
		{
			fieldname: "assignment",
			label: __("Assignment"),
			fieldtype: "Link",
			options: "Measurement Assignment",
		},
		{
			fieldname: "garment",
			label: __("Garment"),
			fieldtype: "Link",
			options: "Garment Template",
			reqd: 1,
		},
		{ fieldname: "from_date", label: __("From Date"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To Date"), fieldtype: "Date" },
		{
			fieldname: "latest_only",
			label: __("Latest per Person"),
			fieldtype: "Check",
			default: 1,
		},
	],
	onload(report) {
		report.page.add_inner_button(__("New Measurement"), () => {
			const f = report.get_values();
			frappe.new_doc("Customer Measurement", {
				customer: f.customer,
				sales_order: f.sales_order,
			});
		});
	},
};

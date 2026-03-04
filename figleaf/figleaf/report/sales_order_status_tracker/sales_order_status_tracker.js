// Copyright (c) 2024, Figleaf and contributors
// For license information, please see license.txt

frappe.query_reports["Sales Order Status Tracker"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_default("company")
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1)
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today()
		},
		{
			fieldname: "customer",
			label: __("Customer"),
			fieldtype: "Link",
			options: "Customer"
		},
		{
			fieldname: "sales_order",
			label: __("Sales Order"),
			fieldtype: "Link",
			options: "Sales Order"
		},
		{
			fieldname: "item_code",
			label: __("Item Code"),
			fieldtype: "Link",
			options: "Item"
		},
		{
			fieldname: "sales_person",
			label: __("Sales Person"),
			fieldtype: "Link",
			options: "Sales Person"
		}
	],

	formatter: function(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);

		if (column.fieldname === "order_status" && data) {
			if (data.order_status === "Completed") {
				value = "<span style='color:green;font-weight:bold'>" + value + "</span>";
			} else if (data.order_status === "To Deliver and Bill") {
				value = "<span style='color:orange'>" + value + "</span>";
			} else if (data.order_status === "Cancelled" || data.order_status === "Closed") {
				value = "<span style='color:red'>" + value + "</span>";
			}
		}

		if (column.fieldname === "work_order_status" && data && data.work_order_status) {
			if (data.work_order_status === "Completed") {
				value = "<span style='color:green;font-weight:bold'>" + value + "</span>";
			} else if (data.work_order_status === "In Process") {
				value = "<span style='color:blue'>" + value + "</span>";
			} else if (data.work_order_status === "Not Started") {
				value = "<span style='color:orange'>" + value + "</span>";
			}
		}

		return value;
	}
};

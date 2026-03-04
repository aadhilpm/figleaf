# Copyright (c) 2024, Figleaf and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	filters = filters or {}
	columns = get_columns(filters)
	data = get_data(filters)

	return columns, data


def get_columns(filters):
	columns = [
		{
			"label": _("Sales Order"),
			"fieldname": "sales_order",
			"fieldtype": "Link",
			"options": "Sales Order",
			"width": 140,
		},
		{
			"label": _("Date"),
			"fieldname": "transaction_date",
			"fieldtype": "Date",
			"width": 100,
		},
		{
			"label": _("Customer"),
			"fieldname": "customer_name",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"label": _("Item Code"),
			"fieldname": "item_code",
			"fieldtype": "Link",
			"options": "Item",
			"width": 120,
		},
		{
			"label": _("Item Name"),
			"fieldname": "item_name",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"label": _("Description"),
			"fieldname": "description",
			"fieldtype": "Small Text",
			"width": 200,
		},
		{
			"label": _("Quantity"),
			"fieldname": "qty",
			"fieldtype": "Float",
			"width": 80,
		},
		{
			"label": _("Delivery Date"),
			"fieldname": "delivery_date",
			"fieldtype": "Date",
			"width": 100,
		},
		{
			"label": _("Work Order"),
			"fieldname": "work_order",
			"fieldtype": "Link",
			"options": "Work Order",
			"width": 140,
		},
		{
			"label": _("Work Order Status"),
			"fieldname": "work_order_status",
			"fieldtype": "Data",
			"width": 120,
		},
		{
			"label": _("BOM Ref"),
			"fieldname": "bom_no",
			"fieldtype": "Link",
			"options": "BOM",
			"width": 140,
		},
		{
			"label": _("Delivery Note"),
			"fieldname": "delivery_note",
			"fieldtype": "Link",
			"options": "Delivery Note",
			"width": 140,
		},
		{
			"label": _("Sales Invoice"),
			"fieldname": "sales_invoice",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"width": 140,
		},
		{
			"label": _("Invoice Amount"),
			"fieldname": "invoice_amount",
			"fieldtype": "Currency",
			"width": 120,
		},
		{
			"label": _("Sales Person"),
			"fieldname": "sales_person",
			"fieldtype": "Data",
			"width": 130,
		},
		{
			"label": _("Order Status"),
			"fieldname": "order_status",
			"fieldtype": "Data",
			"width": 120,
		},
	]

	return columns


def get_data(filters):
	conditions = get_conditions(filters)

	data = frappe.db.sql(
		f"""
		SELECT
			so.name as sales_order,
			so.transaction_date,
			so.customer_name,
			so.status as order_status,
			soi.item_code,
			soi.item_name,
			soi.description,
			soi.qty,
			soi.delivery_date,
			soi.bom_no,
			soi.name as so_item_name,
			(
				SELECT GROUP_CONCAT(DISTINCT st.sales_person SEPARATOR ', ')
				FROM `tabSales Team` st
				WHERE st.parent = so.name AND st.parenttype = 'Sales Order'
			) as sales_person
		FROM
			`tabSales Order` so
		INNER JOIN `tabSales Order Item` soi ON soi.parent = so.name
		WHERE
			so.docstatus = 1
			{conditions}
		ORDER BY so.transaction_date DESC, soi.idx ASC
		""",
		filters,
		as_dict=1,
	)

	# Get Work Orders for each SO Item
	so_item_names = [d.so_item_name for d in data]
	work_orders = {}
	if so_item_names:
		wo_data = frappe.db.sql(
			"""
			SELECT
				wo.name as work_order,
				wo.sales_order_item,
				wo.status as work_order_status,
				wo.bom_no as wo_bom_no
			FROM `tabWork Order` wo
			WHERE wo.docstatus = 1 AND wo.sales_order_item IN %(so_items)s
			""",
			{"so_items": so_item_names},
			as_dict=1,
		)
		for wo in wo_data:
			if wo.sales_order_item not in work_orders:
				work_orders[wo.sales_order_item] = []
			work_orders[wo.sales_order_item].append(wo)

	# Get Delivery Notes for each SO Item
	delivery_notes = {}
	if so_item_names:
		dn_data = frappe.db.sql(
			"""
			SELECT
				dni.so_detail,
				dn.name as delivery_note
			FROM `tabDelivery Note Item` dni
			INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
			WHERE dn.docstatus = 1 AND dni.so_detail IN %(so_items)s
			""",
			{"so_items": so_item_names},
			as_dict=1,
		)
		for dn in dn_data:
			if dn.so_detail not in delivery_notes:
				delivery_notes[dn.so_detail] = []
			delivery_notes[dn.so_detail].append(dn.delivery_note)

	# Get Sales Invoices for each SO Item
	sales_invoices = {}
	if so_item_names:
		si_data = frappe.db.sql(
			"""
			SELECT
				sii.so_detail,
				si.name as sales_invoice,
				sii.amount as invoice_amount
			FROM `tabSales Invoice Item` sii
			INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
			WHERE si.docstatus = 1 AND sii.so_detail IN %(so_items)s
			""",
			{"so_items": so_item_names},
			as_dict=1,
		)
		for si in si_data:
			if si.so_detail not in sales_invoices:
				sales_invoices[si.so_detail] = []
			sales_invoices[si.so_detail].append(si)

	# Merge data
	result = []
	for row in data:
		so_item = row.so_item_name

		# Get Work Orders for this SO Item
		wo_list = work_orders.get(so_item, [])
		dn_list = delivery_notes.get(so_item, [])
		si_list = sales_invoices.get(so_item, [])

		if wo_list:
			# Create a row for each work order
			for wo in wo_list:
				new_row = row.copy()
				new_row["work_order"] = wo.work_order
				new_row["work_order_status"] = wo.work_order_status
				if not new_row.get("bom_no"):
					new_row["bom_no"] = wo.wo_bom_no

				# Add Delivery Notes
				new_row["delivery_note"] = ", ".join(list(set(dn_list))) if dn_list else None

				# Add Sales Invoices
				if si_list:
					new_row["sales_invoice"] = ", ".join(list(set([s.sales_invoice for s in si_list])))
					new_row["invoice_amount"] = sum([flt(s.invoice_amount) for s in si_list])
				else:
					new_row["sales_invoice"] = None
					new_row["invoice_amount"] = 0

				result.append(new_row)
		else:
			# No work orders, add single row
			row["work_order"] = None
			row["work_order_status"] = None

			# Add Delivery Notes
			row["delivery_note"] = ", ".join(list(set(dn_list))) if dn_list else None

			# Add Sales Invoices
			if si_list:
				row["sales_invoice"] = ", ".join(list(set([s.sales_invoice for s in si_list])))
				row["invoice_amount"] = sum([flt(s.invoice_amount) for s in si_list])
			else:
				row["sales_invoice"] = None
				row["invoice_amount"] = 0

			result.append(row)

	return result


def get_conditions(filters):
	conditions = ""

	if filters.get("from_date"):
		conditions += " AND so.transaction_date >= %(from_date)s"

	if filters.get("to_date"):
		conditions += " AND so.transaction_date <= %(to_date)s"

	if filters.get("company"):
		conditions += " AND so.company = %(company)s"

	if filters.get("customer"):
		conditions += " AND so.customer = %(customer)s"

	if filters.get("sales_order"):
		conditions += " AND so.name = %(sales_order)s"

	if filters.get("item_code"):
		conditions += " AND soi.item_code = %(item_code)s"

	if filters.get("status"):
		status_list = filters.get("status")
		if isinstance(status_list, list):
			conditions += " AND so.status IN %(status)s"
		else:
			conditions += " AND so.status = %(status)s"

	if filters.get("sales_person"):
		conditions += """ AND EXISTS (
			SELECT 1 FROM `tabSales Team` st
			WHERE st.parent = so.name AND st.parenttype = 'Sales Order'
			AND st.sales_person = %(sales_person)s
		)"""

	return conditions

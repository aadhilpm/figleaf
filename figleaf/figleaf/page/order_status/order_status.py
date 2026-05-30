import frappe
from frappe import _
from frappe.utils import time_diff_in_seconds, now_datetime, get_datetime


@frappe.whitelist()
def get_order_status(filters=None):
	import json

	if isinstance(filters, str):
		filters = json.loads(filters)
	filters = filters or {}

	conditions = get_conditions(filters)

	# Get Sales Order items
	data = frappe.db.sql(
		f"""
		SELECT
			so.name as sales_order,
			so.transaction_date,
			so.customer,
			so.customer_name,
			so.status as order_status,
			so.delivery_date as so_delivery_date,
			so.po_no,
			so.grand_total,
			soi.name as so_detail,
			soi.item_code,
			soi.item_name,
			soi.description,
			soi.qty,
			soi.delivery_date,
			soi.rate,
			soi.amount,
			soi.delivered_qty,
			soi.billed_amt,
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
		ORDER BY so.transaction_date DESC, so.name DESC, soi.idx ASC
		""",
		filters,
		as_dict=1,
	)

	if not data:
		return []

	so_detail_names = [d.so_detail for d in data]

	work_orders = get_work_orders(so_detail_names)
	production_stages = get_production_stages(work_orders)
	delivery_notes = get_delivery_notes(so_detail_names)
	sales_invoices = get_sales_invoices(so_detail_names)

	result = []
	for row in data:
		so_detail = row.so_detail
		wo = work_orders.get(so_detail)
		wo_name = wo.get("name") if wo else None
		dn_info = delivery_notes.get(so_detail, {"names": [], "date": None})
		si_list = sales_invoices.get(so_detail, [])

		row["work_order"] = wo_name
		row["work_order_status"] = wo.get("status") if wo else None
		row["produced_qty"] = wo.get("produced_qty", 0) if wo else 0

		row["delivery_note"] = ", ".join(dn_info["names"]) if dn_info["names"] else None
		row["is_delivered"] = len(dn_info["names"]) > 0
		row["actual_delivery_date"] = dn_info["date"]
		row["expected_delivery_date"] = str(row.get("delivery_date")) if row.get("delivery_date") else None

		# Calculate delay
		row["delay_days"] = compute_delay(row["expected_delivery_date"], row["actual_delivery_date"], row["is_delivered"])

		if si_list:
			row["sales_invoice"] = ", ".join([s["name"] for s in si_list])
			row["is_billed"] = any(s["docstatus"] == 1 for s in si_list)
			row["has_draft_invoice"] = any(s["docstatus"] == 0 for s in si_list)
			row["billing_date"] = str(si_list[0].posting_date) if si_list[0].posting_date else None
		else:
			row["sales_invoice"] = None
			row["is_billed"] = False
			row["has_draft_invoice"] = False
			row["billing_date"] = None

		stage_logs = production_stages.get(wo_name, []) if wo_name else []
		row["stages"] = compute_stages(row, stage_logs)
		result.append(row)

	return result


def compute_stages(row, stage_logs):
	stages = []

	# Stage 1: Order Confirmed
	stages.append({
		"label": "Ordered",
		"status": "completed",
		"doc": row.get("sales_order"),
		"doctype": "Sales Order",
		"duration": None,
		"date": str(row.get("transaction_date")) if row.get("transaction_date") else None,
	})

	# Production stages — show all stages from Stage master
	all_stages = frappe.get_all("Stage", pluck="name", order_by="sequence asc")
	stage_map = {log.stage: log for log in stage_logs}

	for stage_name in all_stages:
		log = stage_map.get(stage_name)

		if log:
			if log.status == "Completed":
				status = "completed"
			elif log.status == "Progress":
				status = "in-progress"
			else:
				status = "pending"
			duration = compute_duration(log)
			date = str(log.start_time).split(" ")[0] if log.start_time else None
		else:
			status = "pending"
			duration = None
			date = None

		stages.append({
			"label": stage_name,
			"status": status,
			"doc": None,
			"doctype": None,
			"duration": duration,
			"date": date,
		})

	# Delivered
	if row.get("is_delivered"):
		delivery_status = "completed"
	else:
		delivery_status = "pending"

	stages.append({
		"label": "Delivered",
		"status": delivery_status,
		"doc": row.get("delivery_note"),
		"doctype": "Delivery Note",
		"duration": None,
		"date": row.get("actual_delivery_date"),
	})

	# Billed
	if row.get("is_billed"):
		bill_status = "completed"
	elif row.get("has_draft_invoice"):
		bill_status = "in-progress"
	else:
		bill_status = "pending"

	stages.append({
		"label": "Billed",
		"status": bill_status,
		"doc": row.get("sales_invoice"),
		"doctype": "Sales Invoice",
		"duration": None,
		"date": row.get("billing_date"),
	})

	return stages


def compute_duration(log):
	if not log.start_time:
		return None

	start = get_datetime(log.start_time)

	if log.end_time:
		end = get_datetime(log.end_time)
	elif log.status == "Progress":
		end = now_datetime()
	else:
		return None

	diff_seconds = time_diff_in_seconds(end, start)
	if diff_seconds < 0:
		return None

	return format_duration(diff_seconds)


def compute_delay(expected_date, actual_date, is_delivered):
	if not expected_date:
		return None

	from frappe.utils import date_diff, today, getdate

	expected = getdate(expected_date)

	if is_delivered and actual_date:
		compare_date = getdate(actual_date)
	else:
		compare_date = getdate(today())

	delay = date_diff(compare_date, expected)
	return delay  # positive = delayed, negative = early, 0 = on time


def format_duration(seconds):
	seconds = int(seconds)
	days = seconds // 86400
	hours = (seconds % 86400) // 3600
	minutes = (seconds % 3600) // 60

	parts = []
	if days > 0:
		parts.append(f"{days}d")
	if hours > 0:
		parts.append(f"{hours}h")
	if minutes > 0 or not parts:
		parts.append(f"{minutes}m")

	return " ".join(parts)


def get_work_orders(so_detail_names):
	if not so_detail_names:
		return {}

	wo_data = frappe.db.sql(
		"""
		SELECT
			wo.name,
			wo.sales_order_item,
			wo.status,
			wo.custom_stage,
			wo.produced_qty,
			wo.qty
		FROM `tabWork Order` wo
		WHERE wo.docstatus = 1 AND wo.sales_order_item IN %(so_items)s
		ORDER BY wo.creation DESC
		""",
		{"so_items": so_detail_names},
		as_dict=1,
	)

	work_orders = {}
	for wo in wo_data:
		if wo.sales_order_item not in work_orders:
			work_orders[wo.sales_order_item] = wo

	return work_orders


def get_production_stages(work_orders):
	wo_names = [wo["name"] for wo in work_orders.values()]
	if not wo_names:
		return {}

	ps_data = frappe.db.sql(
		"""
		SELECT
			ps.name,
			ps.production_order,
			ps.stage,
			ps.status,
			ps.start_time,
			ps.end_time,
			ps.quantity_completed,
			ps.total_quanity_to_manufacture
		FROM `tabProduction Stage` ps
		WHERE ps.docstatus = 1 AND ps.production_order IN %(wo_names)s
		ORDER BY ps.creation ASC
		""",
		{"wo_names": wo_names},
		as_dict=1,
	)

	production_stages = {}
	for ps in ps_data:
		if ps.production_order not in production_stages:
			production_stages[ps.production_order] = []
		production_stages[ps.production_order].append(ps)

	return production_stages


def get_delivery_notes(so_detail_names):
	if not so_detail_names:
		return {}

	dn_data = frappe.db.sql(
		"""
		SELECT
			dni.so_detail,
			dn.name,
			dn.posting_date
		FROM `tabDelivery Note Item` dni
		INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
		WHERE dn.docstatus = 1 AND dni.so_detail IN %(so_items)s
		""",
		{"so_items": so_detail_names},
		as_dict=1,
	)

	delivery_notes = {}
	for dn in dn_data:
		if dn.so_detail not in delivery_notes:
			delivery_notes[dn.so_detail] = {"names": [], "date": None}
		if dn.name not in delivery_notes[dn.so_detail]["names"]:
			delivery_notes[dn.so_detail]["names"].append(dn.name)
		if dn.posting_date:
			delivery_notes[dn.so_detail]["date"] = str(dn.posting_date)

	return delivery_notes


def get_sales_invoices(so_detail_names):
	if not so_detail_names:
		return {}

	si_data = frappe.db.sql(
		"""
		SELECT
			sii.so_detail,
			si.name,
			si.docstatus,
			si.posting_date
		FROM `tabSales Invoice Item` sii
		INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
		WHERE si.docstatus IN (0, 1) AND sii.so_detail IN %(so_items)s
		""",
		{"so_items": so_detail_names},
		as_dict=1,
	)

	sales_invoices = {}
	for si in si_data:
		if si.so_detail not in sales_invoices:
			sales_invoices[si.so_detail] = []
		sales_invoices[si.so_detail].append(si)

	return sales_invoices


def get_conditions(filters):
	conditions = ""

	if filters.get("customer"):
		conditions += " AND so.customer = %(customer)s"

	if filters.get("sales_order"):
		conditions += " AND so.name = %(sales_order)s"

	if filters.get("from_date"):
		conditions += " AND so.transaction_date >= %(from_date)s"

	if filters.get("to_date"):
		conditions += " AND so.transaction_date <= %(to_date)s"

	if filters.get("sales_person"):
		conditions += """ AND EXISTS (
			SELECT 1 FROM `tabSales Team` st
			WHERE st.parent = so.name AND st.parenttype = 'Sales Order'
			AND st.sales_person = %(sales_person)s
		)"""

	if filters.get("billing_status"):
		if filters["billing_status"] == "Not Billed":
			conditions += " AND so.per_billed < 100"
		elif filters["billing_status"] == "Billed":
			conditions += " AND so.per_billed = 100"

	return conditions

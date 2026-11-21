# Copyright (c) 2026, Badeel Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	if not filters.garment:
		frappe.throw(_("Select a Garment"))
	if not (filters.customer or filters.sales_order or filters.assignment or filters.quotation):
		frappe.throw(_("Select a Customer, Sales Order, Quotation or Assignment"))

	measures = frappe.get_all(
		"Garment Template Measurement",
		filters={"parent": filters.garment, "parenttype": "Garment Template"},
		pluck="measurement_type",
		order_by="idx asc",
	)

	docs = get_measurements(filters)
	values = get_values([d.name for d in docs], filters.garment)

	# columns for measurements recorded outside the template (kept, appended at the end)
	for name in values:
		for mtype in values[name]:
			if mtype not in measures and not mtype.startswith("__"):
				measures.append(mtype)

	columns = [
		{"label": _("#"), "fieldname": "idx", "fieldtype": "Int", "width": 50},
		{"label": _("Person / Staff Name"), "fieldname": "person_name", "fieldtype": "Data", "width": 180},
		{"label": _("Staff ID"), "fieldname": "employee_code", "fieldtype": "Data", "width": 90},
		{"label": _("Designation"), "fieldname": "designation", "fieldtype": "Data", "width": 120},
		{"label": _("Gender"), "fieldname": "gender", "fieldtype": "Data", "width": 70},
	]
	if not filters.customer:
		columns.insert(1, {"label": _("Customer"), "fieldname": "customer_name", "fieldtype": "Data", "width": 160})
	for i, m in enumerate(measures):
		columns.append({"label": _(m), "fieldname": f"m_{i}", "fieldtype": "Data", "width": 85, "align": "right"})
	columns += [
		{"label": _("Unit"), "fieldname": "unit", "fieldtype": "Data", "width": 55},
		{"label": _("Notes"), "fieldname": "notes", "fieldtype": "Data", "width": 200},
		{"label": _("Date"), "fieldname": "measurement_date", "fieldtype": "Date", "width": 95},
		{"label": _("Measurement"), "fieldname": "name", "fieldtype": "Link", "options": "Customer Measurement", "width": 130},
	]

	data = []
	for d in docs:
		v = values.get(d.name, {})
		row = dict(d)
		row["idx"] = len(data) + 1
		for i, m in enumerate(measures):
			row[f"m_{i}"] = v.get(m)
		notes = [f"{m}: {n}" for m, n in v.get("__notes", [])]
		if d.remarks:
			notes.append(d.remarks)
		row["notes"] = "; ".join(notes)
		data.append(row)

	return columns, data, None, None, [
		{"value": len(data), "label": _("People"), "datatype": "Int", "indicator": "Blue"}
	]


def get_measurements(filters):
	cond = {"name": ("in", frappe.get_all(
		"Customer Measurement Garment",
		filters={"garment": filters.garment, "parenttype": "Customer Measurement"},
		pluck="parent",
	) or [""])}
	if filters.customer:
		cond["customer"] = filters.customer
	if filters.sales_order:
		cond["sales_order"] = filters.sales_order
	if filters.quotation:
		cond["quotation"] = filters.quotation
	if filters.assignment:
		cond["assignment"] = filters.assignment
	if filters.from_date:
		cond["measurement_date"] = (">=", filters.from_date)
	if filters.to_date:
		cond.setdefault("measurement_date", ("<=", filters.to_date))
		if filters.from_date:
			cond["measurement_date"] = ("between", [filters.from_date, filters.to_date])

	docs = frappe.get_list(
		"Customer Measurement",
		filters=cond,
		fields=["name", "customer", "customer_name", "person_name", "employee_code", "designation",
			"gender", "unit", "measurement_date", "remarks", "modified"],
		order_by="person_name asc, measurement_date desc, modified desc",
		limit_page_length=0,
	)
	if filters.get("latest_only", 1):
		seen, latest = set(), []
		for d in docs:
			key = (d.customer, (d.employee_code or d.person_name or "").strip().lower())
			if key in seen:
				continue
			seen.add(key)
			latest.append(d)
		docs = latest
	return docs


def get_values(names, garment):
	out = {}
	if not names:
		return out
	for r in frappe.get_all(
		"Customer Measurement Value",
		filters={"parent": ("in", names), "parenttype": "Customer Measurement", "garment": garment},
		fields=["parent", "measurement_type", "value", "notes"],
		order_by="idx asc",
	):
		d = out.setdefault(r.parent, {})
		d[r.measurement_type] = r.value
		if r.notes:
			d.setdefault("__notes", []).append((r.measurement_type, r.notes))
	return out

# Copyright (c) 2026, Badeel Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

# Users with any of these roles see all measurement data. A user who only has
# "Measurement User" (a tailor) sees just their own assignments and measurements.
FULL_ACCESS_ROLES = {
	"System Manager",
	"Sales Manager",
	"Sales User",
	"Manufacturing User",
	"Manufacturing Manager",
}
OPEN_STATUSES = ("Open", "In Progress")


def is_restricted(user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return False
	roles = set(frappe.get_roles(user))
	return "Measurement User" in roles and not (roles & FULL_ACCESS_ROLES)


class MeasurementAssignment(Document):
	def validate(self):
		self.set_party()
		if not self.garments:
			self.fill_garments()
		self.clean_people()
		self.apply_people_progress()
		if self.status == "Completed" and not self.completed_on:
			self.completed_on = now_datetime()
		if self.status in OPEN_STATUSES:
			self.completed_on = None

	def set_party(self):
		if self.based_on == "Sales Order" and self.sales_order:
			so = frappe.db.get_value(
				"Sales Order", self.sales_order, ["customer", "customer_name", "docstatus"], as_dict=True
			)
			if not so:
				frappe.throw(_("Sales Order {0} not found").format(self.sales_order))
			if so.docstatus == 2:
				frappe.throw(_("Sales Order {0} is cancelled").format(self.sales_order))
			self.customer, self.party_name = so.customer, so.customer_name
		elif self.based_on == "Quotation" and self.quotation:
			q = frappe.db.get_value(
				"Quotation", self.quotation, ["quotation_to", "party_name", "customer_name", "docstatus"],
				as_dict=True,
			)
			if not q:
				frappe.throw(_("Quotation {0} not found").format(self.quotation))
			if q.docstatus == 2:
				frappe.throw(_("Quotation {0} is cancelled").format(self.quotation))
			self.customer = q.party_name if q.quotation_to == "Customer" else None
			self.party_name = q.customer_name or q.party_name
		elif self.based_on == "Customer":
			self.sales_order = None
			self.quotation = None
			if self.customer:
				self.party_name = frappe.db.get_value("Customer", self.customer, "customer_name")
		if not self.party_name:
			frappe.throw(_("Select the Sales Order, Quotation or Customer to measure for"))

	def clean_people(self):
		"""Trim names, drop blank rows, check per-person garments, refuse duplicates."""
		seen = {}
		keep = []
		valid = {g.garment for g in self.garments}
		for row in self.people:
			row.person_name = (row.person_name or "").strip()
			row.employee_code = (row.employee_code or "").strip() or None
			if not row.person_name:
				continue
			key = person_key(row.person_name, row.employee_code)
			if key in seen:
				frappe.throw(
					_("Row {0}: {1} is already on the list (row {2})").format(row.idx, row.person_name, seen[key])
				)
			seen[key] = row.idx
			if row.garments:
				names = [g.strip() for g in row.garments.split(",") if g.strip()]
				unknown = [g for g in names if valid and g not in valid]
				if unknown:
					frappe.throw(
						_("Row {0} ({1}): {2} is not one of the garments of this assignment").format(
							row.idx, row.person_name, ", ".join(unknown)
						)
					)
				row.garments = ", ".join(names)
			keep.append(row)
		if len(keep) != len(self.people):
			self.set("people", keep)
			for i, row in enumerate(self.people, 1):
				row.idx = i
		self.people_count = len(self.people)

	def apply_people_progress(self):
		if self.is_new() or not self.people:
			return
		matches = match_people(self.name, self.people)
		for row in self.people:
			row.measurement = matches.get(_row_id(row))
			row.status = "Measured" if row.measurement else "Pending"

	def fill_garments(self):
		dt, name = (
			("Sales Order", self.sales_order) if self.sales_order else ("Quotation", self.quotation)
		)
		if not name:
			return
		for garment, qty in suggested_garments(dt, name):
			self.append("garments", {"garment": garment, "qty": qty})

	def on_update(self):
		self.sync_todo()

	def on_trash(self):
		if frappe.db.exists("Customer Measurement", {"assignment": self.name}):
			frappe.throw(_("Measurements are linked to this assignment. Cancel it instead."))
		close_todos(self.name, cancel=True)

	def sync_todo(self):
		"""Mirror the assignment in the tailor's ToDo list (standard ERPNext notification)."""
		try:
			from frappe.desk.form import assign_to

			def assign_add(args):
				# v16: _add(args, ignore_permissions=...); v15: add(args, ignore_permissions=...)
				fn = getattr(assign_to, "_add", None) or assign_to.add
				return fn(args, ignore_permissions=True)

			before = self.get_doc_before_save()
			if before and before.assigned_to != self.assigned_to:
				close_todos(self.name, user=before.assigned_to, cancel=True)
			if self.status in OPEN_STATUSES:
				if not frappe.db.exists(
					"ToDo",
					{"reference_type": self.doctype, "reference_name": self.name,
						"allocated_to": self.assigned_to, "status": "Open"},
				):
					assign_add(
						{
							"assign_to": [self.assigned_to],
							"doctype": self.doctype,
							"name": self.name,
							"description": _("Take measurements: {0}").format(self.party_name),
							"date": self.due_date,
						}
					)
			else:
				close_todos(self.name, cancel=self.status == "Cancelled")
		except Exception:
			frappe.log_error(title="Measurement Assignment: ToDo sync failed")


def close_todos(name, user=None, cancel=False):
	filters = {"reference_type": "Measurement Assignment", "reference_name": name, "status": "Open"}
	if user:
		filters["allocated_to"] = user
	for todo in frappe.get_all("ToDo", filters=filters, pluck="name"):
		frappe.db.set_value("ToDo", todo, "status", "Cancelled" if cancel else "Closed")


def suggested_garments(doctype, name):
	"""[(garment, qty)] from the document's items, via Garment Template item mapping."""
	items = frappe.get_all(
		f"{doctype} Item", filters={"parent": name, "parenttype": doctype}, fields=["item_code", "qty"]
	)
	if not items:
		return []
	mapping = dict(
		frappe.get_all(
			"Garment Template Item",
			filters={"parenttype": "Garment Template", "item": ("in", [i.item_code for i in items])},
			fields=["item", "parent"],
			as_list=True,
		)
	)
	out = {}
	for i in items:
		g = mapping.get(i.item_code)
		if g:
			out[g] = out.get(g, 0) + int(i.qty or 0)
	return list(out.items())


def _row_id(row):
	# rows added in this save have no name yet
	return row.name or f"new-{row.idx}"


def person_key(person_name, employee_code=None):
	code = (employee_code or "").strip().lower()
	return f"id:{code}" if code else "name:" + " ".join((person_name or "").lower().split())


def match_people(assignment, people):
	"""{person row name: Customer Measurement name} for the people on an assignment's list.
	A measurement counts for a row when it was taken from that row in the app, otherwise when
	the staff ID (or, without one, the name) is the same."""
	if not people:
		return {}
	measured = frappe.get_all(
		"Customer Measurement",
		filters={"assignment": assignment},
		fields=["name", "assignment_person", "person_name", "employee_code"],
		order_by="creation asc",
	)
	out, used = {}, set()
	by_row = {m.assignment_person: m.name for m in measured if m.assignment_person}
	for row in people:
		if row.name and row.name in by_row:
			out[row.name] = by_row[row.name]
			used.add(by_row[row.name])
	# then by staff ID, or by name when one side has no staff ID
	by_code, by_name, by_name_no_code = {}, {}, {}
	for m in measured:
		if m.name in used:
			continue
		name = person_key(m.person_name)
		by_name.setdefault(name, m.name)
		if (m.employee_code or "").strip():
			by_code.setdefault(person_key(m.person_name, m.employee_code), m.name)
		else:
			by_name_no_code.setdefault(name, m.name)
	for row in people:
		if _row_id(row) in out:
			continue
		if (row.employee_code or "").strip():
			m = by_code.get(person_key(row.person_name, row.employee_code)) or by_name_no_code.get(
				person_key(row.person_name)
			)
		else:
			m = by_name.get(person_key(row.person_name))
		if m and m not in used:
			out[_row_id(row)] = m
			used.add(m)
	return out


def update_progress(name):
	if not name or not frappe.db.exists("Measurement Assignment", name):
		return
	people = frappe.get_all(
		"Measurement Assignment Person",
		filters={"parent": name, "parenttype": "Measurement Assignment"},
		fields=["name", "person_name", "employee_code", "status", "measurement"],
	)
	matches = match_people(name, people)
	for row in people:
		m = matches.get(row.name)
		status = "Measured" if m else "Pending"
		if (row.measurement or None) != m or row.status != status:
			frappe.db.set_value(
				"Measurement Assignment Person", row.name, {"measurement": m, "status": status},
				update_modified=False,
			)
	count = frappe.db.count("Customer Measurement", {"assignment": name})
	a = frappe.db.get_value("Measurement Assignment", name, ["status", "measured_count"], as_dict=True)
	updates = {"measured_count": count}
	if a.status == "Open" and count:
		updates["status"] = "In Progress"
	frappe.db.set_value("Measurement Assignment", name, updates, update_modified=False)


@frappe.whitelist()
def set_status(name, status):
	if status not in ("Open", "In Progress", "Completed", "Cancelled"):
		frappe.throw(_("Invalid status"))
	doc = frappe.get_doc("Measurement Assignment", name)
	if is_restricted():
		if doc.assigned_to != frappe.session.user or status not in ("In Progress", "Completed"):
			frappe.throw(_("Not permitted"), frappe.PermissionError)
		doc.flags.ignore_permissions = True
	else:
		doc.check_permission("write")
	doc.status = status
	doc.save()
	return doc.status


# ---------------------------------------------------------------- permissions (hooks)


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if not is_restricted(user):
		return ""
	return f"`tabMeasurement Assignment`.assigned_to = {frappe.db.escape(user)}"


def has_permission(doc, ptype=None, user=None):
	user = user or frappe.session.user
	if not is_restricted(user):
		return True
	return doc.assigned_to == user

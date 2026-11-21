# Copyright (c) 2026, Badeel Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from figleaf.figleaf.doctype.measurement_assignment.measurement_assignment import (
	is_restricted,
	update_progress,
)


class CustomerMeasurement(Document):
	def validate(self):
		self.person_name = (self.person_name or "").strip()
		self.validate_app_uuid()
		self.apply_assignment()
		self.validate_sales_order()
		self.validate_quotation()
		self.validate_party()
		self.sync_value_rows()
		self.apply_settings()
		self.clean_values()
		if not self.measured_by:
			self.measured_by = frappe.session.user

	def validate_app_uuid(self):
		if not self.app_uuid:
			return
		dup = frappe.db.get_value(
			"Customer Measurement", {"app_uuid": self.app_uuid, "name": ("!=", self.name)}, "name"
		)
		if dup:
			frappe.throw(_("This app record was already synced as {0}").format(dup))

	def apply_assignment(self):
		if not self.assignment:
			self.assignment_person = None
			return
		if self.assignment_person and not frappe.db.exists(
			"Measurement Assignment Person",
			{"name": self.assignment_person, "parent": self.assignment, "parenttype": "Measurement Assignment"},
		):
			self.assignment_person = None  # row removed from the list, or another assignment
		a = frappe.db.get_value(
			"Measurement Assignment",
			self.assignment,
			["customer", "party_name", "sales_order", "quotation", "assigned_to", "status"],
			as_dict=True,
		)
		if not a:
			frappe.throw(_("Assignment {0} not found").format(self.assignment))
		if is_restricted() and a.assigned_to != frappe.session.user:
			frappe.throw(_("Assignment {0} is not assigned to you").format(self.assignment), frappe.PermissionError)
		if a.status == "Cancelled" and self.is_new():
			frappe.throw(_("Assignment {0} is cancelled").format(self.assignment))
		if a.customer:
			if self.customer and self.customer != a.customer:
				frappe.throw(_("Assignment {0} is for customer {1}").format(self.assignment, a.customer))
			self.customer = a.customer
		elif not self.customer:
			self.party_name = a.party_name
		self.sales_order = self.sales_order or a.sales_order
		self.quotation = self.quotation or a.quotation

	def validate_quotation(self):
		if not self.quotation:
			return
		q = frappe.db.get_value(
			"Quotation", self.quotation, ["quotation_to", "party_name", "customer_name"], as_dict=True
		)
		if not q:
			return
		if q.quotation_to == "Customer":
			if not self.customer:
				self.customer = q.party_name
		elif not self.customer and not self.party_name:
			self.party_name = q.customer_name or q.party_name

	def validate_party(self):
		if self.customer:
			self.customer_name = frappe.db.get_value("Customer", self.customer, "customer_name")
		else:
			self.party_name = (self.party_name or "").strip()
			if not self.party_name:
				frappe.throw(_("Select a Customer, or enter the customer name for a walk-in"))
			self.customer_name = self.party_name

	def on_update(self):
		update_progress(self.assignment)
		before = self.get_doc_before_save()
		if before and before.assignment and before.assignment != self.assignment:
			update_progress(before.assignment)

	def on_trash(self):
		frappe.flags.cm_deleted_assignment = self.assignment

	def after_delete(self):
		update_progress(frappe.flags.pop("cm_deleted_assignment", None))

	def validate_sales_order(self):
		if not self.sales_order:
			return
		so_customer = frappe.db.get_value("Sales Order", self.sales_order, "customer")
		if so_customer and not self.customer:
			self.customer = so_customer
		if so_customer and so_customer != self.customer:
			frappe.throw(
				_("Sales Order {0} belongs to {1}, not {2}").format(
					self.sales_order, so_customer, self.customer
				)
			)
		if not self.ref_no:
			self.ref_no = self.sales_order

	def sync_value_rows(self):
		"""Keep one value row per (garment, measurement) of the selected garments,
		in template order. Values already entered are kept."""
		garments = [g.garment for g in self.garments if g.garment]
		if not garments:
			# Allow callers that only send values (e.g. imports) to imply the garments
			for row in self.measurement_values:
				if row.garment and row.garment not in garments:
					garments.append(row.garment)
					self.append("garments", {"garment": row.garment})
		if not garments:
			frappe.throw(_("Select at least one garment"))

		existing = {}
		for row in self.measurement_values:
			existing.setdefault((row.garment, row.measurement_type), row)

		new_rows = []
		for garment in garments:
			used = set()
			for mtype in get_template_measurements(garment):
				row = existing.get((garment, mtype))
				new_rows.append(
					{
						"garment": garment,
						"measurement_type": mtype,
						"value": row.value if row else None,
						"notes": row.notes if row else None,
					}
				)
				used.add(mtype)
			# keep extra rows added for this garment that are not in the template
			for (g, mtype), row in existing.items():
				if g == garment and mtype not in used and mtype:
					new_rows.append(
						{"garment": g, "measurement_type": mtype, "value": row.value, "notes": row.notes}
					)

		self.set("measurement_values", new_rows)

	def apply_settings(self):
		settings = get_measurement_settings()
		if settings.require_staff_id and not (self.employee_code or "").strip():
			frappe.throw(_("Staff ID is mandatory (Measurement Settings)"))
		template_unit = None
		first = self.garments[0].garment if self.garments else None
		if first:
			template_unit = frappe.db.get_value("Garment Template", first, "default_unit")
		default = template_unit or settings.default_unit
		if not self.unit or not settings.allow_unit_change:
			self.unit = default or self.unit
		if not self.unit:
			frappe.throw(_("Set a Default Unit in Measurement Settings"))

	def clean_values(self):
		filled = 0
		for row in self.measurement_values:
			row.value = (row.value or "").strip() or None
			row.notes = (row.notes or "").strip() or None
			if row.value:
				filled += 1
		if not filled:
			frappe.throw(_("Enter at least one measurement value"))


def get_measurement_settings():
	s = frappe.get_cached_doc("Measurement Settings")
	return frappe._dict(
		default_unit=s.default_unit or "Inch",
		allow_unit_change=int(s.allow_unit_change if s.allow_unit_change is not None else 1),
		require_staff_id=int(s.require_staff_id or 0),
		allow_walk_in=int(s.allow_walk_in if s.allow_walk_in is not None else 1),
	)


@frappe.whitelist()
def get_entry_config():
	"""Units and rules for the entry panel."""
	return {
		"settings": get_measurement_settings(),
		"units": frappe.get_all(
			"Measurement Unit", filters={"enabled": 1}, fields=["name", "symbol"], order_by="name asc"
		),
	}


def get_template_measurements(garment):
	return frappe.get_all(
		"Garment Template Measurement",
		filters={"parent": garment, "parenttype": "Garment Template"},
		pluck="measurement_type",
		order_by="idx asc",
	)


@frappe.whitelist()
def get_garment_details(garments):
	"""Template measurements and diagram for each garment, for the entry panel."""
	garments = frappe.parse_json(garments) if isinstance(garments, str) else garments
	out = {}
	for g in garments or []:
		if not frappe.db.exists("Garment Template", g):
			continue
		doc = frappe.get_cached_doc("Garment Template", g)
		out[g] = {
			"diagram": doc.diagram or "Top",
			"diagram_image": doc.diagram_image,
			"default_unit": doc.default_unit,
			"measurements": [r.measurement_type for r in doc.measurements],
		}
	return out


@frappe.whitelist()
def get_previous_measurement(customer, person_name=None, employee_code=None, exclude=None):
	"""Latest measurement of the same person for this customer (by staff ID, else name)."""
	filters = {"customer": customer}
	if employee_code:
		filters["employee_code"] = employee_code
	elif person_name:
		filters["person_name"] = person_name
	else:
		return None
	if exclude:
		filters["name"] = ("!=", exclude)
	name = frappe.db.get_value(
		"Customer Measurement", filters, "name", order_by="measurement_date desc, modified desc"
	)
	if not name:
		return None
	doc = frappe.get_doc("Customer Measurement", name)
	if is_restricted():
		# tailors may copy only for customers they currently have an assignment for
		if not frappe.db.exists(
			"Measurement Assignment",
			{"assigned_to": frappe.session.user, "customer": customer, "status": ("in", ["Open", "In Progress"])},
		):
			frappe.throw(_("Not permitted"), frappe.PermissionError)
	else:
		doc.check_permission("read")
	return {
		"name": doc.name,
		"measurement_date": doc.measurement_date,
		"unit": doc.unit,
		"values": [
			{"garment": r.garment, "measurement_type": r.measurement_type, "value": r.value, "notes": r.notes}
			for r in doc.measurement_values
		],
	}


@frappe.whitelist()
def get_assignment_info(assignment):
	a = frappe.get_doc("Measurement Assignment", assignment)
	a.check_permission("read")
	return {
		"customer": a.customer,
		"party_name": a.party_name,
		"sales_order": a.sales_order,
		"quotation": a.quotation,
		"garments": [g.garment for g in a.garments],
		"people": [
			{
				"row": p.name,
				"person_name": p.person_name,
				"employee_code": p.employee_code,
				"designation": p.designation,
				"gender": p.gender,
				"garments": [g.strip() for g in (p.garments or "").split(",") if g.strip()],
				"status": p.status,
				"measurement": p.measurement,
			}
			for p in a.people
		],
	}


@frappe.whitelist()
def get_sales_order_info(sales_order):
	"""Customer, PO and suggested garments of a Sales Order, for users who may record
	measurements but cannot read Sales Orders (e.g. Measurement User)."""
	if not frappe.has_permission("Customer Measurement", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	so = frappe.db.get_value(
		"Sales Order", sales_order, ["name", "customer", "customer_name", "po_no", "docstatus"], as_dict=True
	)
	if not so:
		return None
	so["garments"] = get_suggested_garments(sales_order)
	return so


@frappe.whitelist()
def get_suggested_garments(sales_order):
	"""Garments whose template lists an item on the Sales Order."""
	items = frappe.get_all(
		"Sales Order Item", filters={"parent": sales_order, "parenttype": "Sales Order"}, pluck="item_code"
	)
	if not items:
		return []
	rows = frappe.get_all(
		"Garment Template Item",
		filters={"parenttype": "Garment Template", "item": ("in", items)},
		pluck="parent",
		distinct=True,
	)
	return sorted(set(rows))


# ---------------------------------------------------------------- hooks


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if not is_restricted(user):
		return ""
	u = frappe.db.escape(user)
	return (
		f"(`tabCustomer Measurement`.owner = {u} or `tabCustomer Measurement`.measured_by = {u} "
		f"or `tabCustomer Measurement`.assignment in "
		f"(select name from `tabMeasurement Assignment` where assigned_to = {u}))"
	)


def has_permission(doc, ptype=None, user=None):
	user = user or frappe.session.user
	if not is_restricted(user) or doc.is_new():
		return True
	if user in (doc.owner, doc.measured_by):
		return True
	return bool(
		doc.assignment
		and frappe.db.get_value("Measurement Assignment", doc.assignment, "assigned_to") == user
	)


def link_quotation_measurements(doc, method=None):
	"""Sales Order on_submit: measurements and assignments taken against its quotation(s)
	now belong to the order."""
	quotations = {i.prevdoc_docname for i in doc.items if i.get("prevdoc_docname")}
	if not quotations:
		return
	for name in frappe.get_all(
		"Customer Measurement",
		filters={"quotation": ("in", list(quotations)), "sales_order": ("in", ["", None])},
		pluck="name",
	):
		frappe.db.set_value(
			"Customer Measurement",
			name,
			{"sales_order": doc.name, "customer": doc.customer, "customer_name": doc.customer_name},
		)
	for name in frappe.get_all(
		"Measurement Assignment",
		filters={"quotation": ("in", list(quotations)), "sales_order": ("in", ["", None])},
		pluck="name",
	):
		frappe.db.set_value(
			"Measurement Assignment",
			name,
			{"sales_order": doc.name, "customer": doc.customer, "party_name": doc.customer_name},
		)

# Copyright (c) 2026, Badeel Technology and contributors
# For license information, please see license.txt
"""API used by the Measurement Entry mobile app.

Data on the phone is limited to the work assigned to the user:
- open Measurement Assignments assigned to them (customer name, order, garments, notes),
- measurements of those assignments,
- their own walk-in measurements for a few days after sync.
No customer list, sales order list or other history is sent. Each response carries a
`keep` list so the phone deletes anything that is no longer assigned.

Auth: `login` with username/password returns an API token ("api_key:api_secret").
Every other call sends `Authorization: token <token>`.
Writes are idempotent on `app_uuid`, so an interrupted sync can be retried.
"""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import add_days, get_datetime, now_datetime
from frappe.utils.password import get_decrypted_password, set_encrypted_password

from figleaf.figleaf.doctype.customer_measurement.customer_measurement import get_entry_config
from figleaf.figleaf.doctype.measurement_assignment.measurement_assignment import OPEN_STATUSES

API_VERSION = 2
APP_ROLES = {"Measurement User", "Sales User", "Sales Manager", "System Manager"}
WALK_IN_KEEP_DAYS = 3
MAX_PUSH = 200


def _check_access(user=None):
	user = user or frappe.session.user
	if user == "Guest":
		raise frappe.AuthenticationError
	if user == "Administrator":
		return
	if not APP_ROLES.intersection(frappe.get_roles(user)):
		frappe.throw(_("User {0} is not allowed to use the measurement app").format(user), frappe.PermissionError)


def _me():
	return frappe.session.user


def _open_assignments(user=None):
	return frappe.get_all(
		"Measurement Assignment",
		filters={"assigned_to": user or _me(), "status": ("in", OPEN_STATUSES)},
		pluck="name",
	)


# ---------------------------------------------------------------- auth


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60)
def login(usr, pwd, device_id=None):
	from frappe.core.doctype.user.user import User

	found = User.find_by_credentials((usr or "").strip(), pwd or "")
	if not found or not found.get("is_authenticated"):
		raise frappe.AuthenticationError(_("Invalid username or password"))
	if not found.get("enabled"):
		raise frappe.AuthenticationError(_("This user is disabled"))
	user = found.name
	_check_access(user)

	api_key = frappe.db.get_value("User", user, "api_key")
	secret = None
	if api_key:
		secret = get_decrypted_password("User", user, "api_secret", raise_exception=False)
	if not api_key:
		api_key = frappe.generate_hash(length=15)
		frappe.db.set_value("User", user, "api_key", api_key, update_modified=False)
	if not secret:
		secret = frappe.generate_hash(length=15)
		set_encrypted_password("User", user, secret, "api_secret")
	frappe.db.commit()

	return {
		"user": user,
		"full_name": frappe.db.get_value("User", user, "full_name"),
		"token": f"{api_key}:{secret}",
		"api_version": API_VERSION,
		"company": frappe.defaults.get_global_default("company"),
		"server_time": str(now_datetime()),
	}


@frappe.whitelist(methods=["GET"])
def ping():
	_check_access()
	return {
		"user": _me(),
		"full_name": frappe.db.get_value("User", _me(), "full_name"),
		"company": frappe.defaults.get_global_default("company"),
		"api_version": API_VERSION,
		"server_time": str(now_datetime()),
	}


# ---------------------------------------------------------------- pull


@frappe.whitelist(methods=["GET", "POST"])
def get_master_data(since=None):
	"""Garment templates, units, rules and the user's open assignments (always the full list)."""
	_check_access()
	server_time = str(now_datetime())

	garments = []
	for g in frappe.get_all(
		"Garment Template",
		filters={"disabled": 0},
		fields=["name", "default_unit", "diagram", "diagram_image"],
		order_by="name asc",
	):
		g["measurements"] = frappe.get_all(
			"Garment Template Measurement",
			filters={"parent": g.name, "parenttype": "Garment Template"},
			pluck="measurement_type",
			order_by="idx asc",
		)
		if g.diagram_image and g.diagram_image.startswith("/"):
			g["diagram_image"] = frappe.utils.get_url(g.diagram_image)
		garments.append(g)

	config = get_entry_config()
	return {
		"server_time": server_time,
		"garments": garments,
		"measurement_types": frappe.get_all(
			"Measurement Type", fields=["name", "description"], order_by="name asc"
		),
		"units": config["units"],
		"settings": config["settings"],
		"assignments": [_assignment_dict(n) for n in _open_assignments()],
	}


def _assignment_dict(name):
	a = frappe.get_doc("Measurement Assignment", name)
	return {
		"name": a.name,
		"based_on": a.based_on,
		"sales_order": a.sales_order,
		"quotation": a.quotation,
		"customer": a.customer,
		"party_name": a.party_name,
		"due_date": str(a.due_date) if a.due_date else None,
		"status": a.status,
		"contact_person": a.contact_person,
		"contact_mobile": a.contact_mobile,
		"location": a.location,
		"notes": a.notes,
		"garments": [{"garment": g.garment, "qty": g.qty} for g in a.garments],
		"measured_count": a.measured_count,
		"modified": str(a.modified),
	}


def _visible_names():
	"""Names of all measurements the phone may hold right now."""
	user = _me()
	names = set()
	open_ = _open_assignments(user)
	if open_:
		names.update(frappe.get_all("Customer Measurement", filters={"assignment": ("in", open_)}, pluck="name"))
	names.update(
		frappe.get_all(
			"Customer Measurement",
			filters={
				"assignment": ("in", ["", None]),
				"measured_by": user,
				"modified": (">=", add_days(now_datetime(), -WALK_IN_KEEP_DAYS)),
			},
			pluck="name",
		)
	)
	return names


@frappe.whitelist(methods=["GET", "POST"])
def get_measurements(since=None):
	"""Measurements the phone may hold. `records` are those changed since `since`; `keep` is the
	full list of names allowed on the phone (anything else synced must be removed)."""
	_check_access()
	server_time = str(now_datetime())
	keep = _visible_names()
	names = list(keep)
	if since and names:
		names = frappe.get_all(
			"Customer Measurement",
			filters={"name": ("in", names), "modified": (">", get_datetime(since))},
			pluck="name",
		)
	return {
		"server_time": server_time,
		"records": [_to_dict(frappe.get_doc("Customer Measurement", n)) for n in names],
		"keep": sorted(keep),
	}


@frappe.whitelist(methods=["GET", "POST"])
def get_previous(person_name=None, employee_code=None, assignment=None, exclude=None):
	"""The person's latest earlier measurement for the same customer, on request (not stored).
	Only for a customer the user currently has an open assignment for."""
	_check_access()
	if not assignment or assignment not in _open_assignments():
		frappe.throw(_("Copy previous is available for assigned work only"), frappe.PermissionError)
	a = frappe.db.get_value("Measurement Assignment", assignment, ["customer", "party_name"], as_dict=True)
	filters = {"customer": a.customer} if a.customer else {"party_name": a.party_name, "customer": ("in", ["", None])}
	if employee_code:
		filters["employee_code"] = employee_code
	elif person_name:
		filters["person_name"] = person_name
	else:
		return None
	if exclude:
		filters["name"] = ("!=", exclude)
	name = frappe.db.get_value("Customer Measurement", filters, "name", order_by="measurement_date desc, modified desc")
	if not name:
		return None
	d = _to_dict(frappe.get_doc("Customer Measurement", name))
	return {k: d[k] for k in ("name", "measurement_date", "unit", "garments", "values")}


@frappe.whitelist(methods=["POST"])
def set_assignment_status(assignment, status):
	_check_access()
	from figleaf.figleaf.doctype.measurement_assignment.measurement_assignment import set_status

	if frappe.db.get_value("Measurement Assignment", assignment, "assigned_to") != _me():
		frappe.throw(_("This assignment is not yours"), frappe.PermissionError)
	if status not in ("In Progress", "Completed"):
		frappe.throw(_("Invalid status"))
	return set_status(assignment, status)


# ---------------------------------------------------------------- push


@frappe.whitelist(methods=["POST"])
def push_measurements(records, device_id=None):
	"""Create or update measurements recorded on the phone.

	Each record: {app_uuid, assignment | party_name (walk-in), person_name, employee_code, designation,
	gender, measurement_date, ref_no, unit, remarks, garments: [..],
	values: [{garment, measurement_type, value, notes}], base_modified}
	"""
	_check_access()
	records = frappe.parse_json(records) if isinstance(records, str) else records
	if not isinstance(records, list):
		frappe.throw(_("records must be a list"))
	if len(records) > MAX_PUSH:
		frappe.throw(_("Send at most {0} records per call").format(MAX_PUSH))

	results = []
	for rec in records:
		uuid = (rec or {}).get("app_uuid")
		if not uuid:
			results.append({"app_uuid": None, "status": "error", "message": "app_uuid missing"})
			continue
		frappe.db.savepoint("mobile_push")
		try:
			results.append(_upsert(rec, device_id))
		except Exception as e:
			frappe.db.rollback(save_point="mobile_push")
			frappe.clear_messages()
			results.append({"app_uuid": uuid, "status": "error", "message": _error_text(e)})
	frappe.db.commit()
	return {"server_time": str(now_datetime()), "results": results}


def _upsert(rec, device_id):
	uuid = rec["app_uuid"]
	user = _me()
	existing = frappe.db.get_value(
		"Customer Measurement", {"app_uuid": uuid}, ["name", "modified", "measured_by", "owner"], as_dict=True
	)

	if existing:
		if user not in (existing.measured_by, existing.owner) and user != "Administrator":
			frappe.throw(_("This measurement was recorded by another user"), frappe.PermissionError)
		doc = frappe.get_doc("Customer Measurement", existing.name)
		base = rec.get("base_modified")
		if not base:
			# retry after a lost response: already saved
			return {"app_uuid": uuid, "status": "ok", "name": doc.name, "record": _to_dict(doc)}
		if get_datetime(base) != get_datetime(existing.modified):
			return {"app_uuid": uuid, "status": "conflict", "name": doc.name, "record": _to_dict(doc)}
	else:
		doc = frappe.new_doc("Customer Measurement")
		doc.app_uuid = uuid
		doc.source = "Mobile App"
		doc.measured_by = user

	assignment = rec.get("assignment") or None
	if assignment:
		a = frappe.db.get_value("Measurement Assignment", assignment, ["assigned_to", "status"], as_dict=True)
		if not a:
			frappe.throw(_("Assignment {0} no longer exists").format(assignment))
		if a.assigned_to != user:
			frappe.throw(_("Assignment {0} is not assigned to you").format(assignment), frappe.PermissionError)
		if a.status == "Cancelled":
			frappe.throw(_("Assignment {0} was cancelled").format(assignment))
		doc.assignment = assignment
	else:
		if not get_entry_config()["settings"].allow_walk_in:
			frappe.throw(_("Walk-in measurements are turned off. Ask the office for an assignment."))
		party = (rec.get("party_name") or "").strip()
		if not party:
			frappe.throw(_("Customer name is required"))
		doc.assignment = None
		if not doc.customer:  # the office may already have linked it to a Customer
			doc.party_name = party

	for f in ("person_name", "employee_code", "designation", "gender", "measurement_date", "ref_no", "unit", "remarks"):
		if f in rec:
			doc.set(f, rec.get(f))

	doc.set("garments", [{"garment": g} for g in (rec.get("garments") or []) if g])
	doc.set(
		"measurement_values",
		[
			{
				"garment": v.get("garment"),
				"measurement_type": v.get("measurement_type"),
				"value": v.get("value"),
				"notes": v.get("notes"),
			}
			for v in (rec.get("values") or [])
			if v.get("garment") and v.get("measurement_type")
		],
	)
	doc.device_id = device_id or rec.get("device_id")
	doc.synced_on = now_datetime()
	doc.flags.ignore_permissions = True  # access is checked above against the assignment
	doc.save()
	return {"app_uuid": uuid, "status": "ok", "name": doc.name, "record": _to_dict(doc)}


def _to_dict(doc):
	return {
		"name": doc.name,
		"app_uuid": doc.app_uuid,
		"assignment": doc.assignment,
		"customer": doc.customer,
		"customer_name": doc.customer_name or doc.party_name,
		"party_name": doc.party_name,
		"person_name": doc.person_name,
		"employee_code": doc.employee_code,
		"designation": doc.designation,
		"gender": doc.gender,
		"measurement_date": str(doc.measurement_date) if doc.measurement_date else None,
		"sales_order": doc.sales_order,
		"quotation": doc.quotation,
		"ref_no": doc.ref_no,
		"unit": doc.unit,
		"remarks": doc.remarks,
		"source": doc.source,
		"measured_by": doc.measured_by,
		"garments": [g.garment for g in doc.garments],
		"values": [
			{"garment": v.garment, "measurement_type": v.measurement_type, "value": v.value, "notes": v.notes}
			for v in doc.measurement_values
		],
		"modified": str(doc.modified),
	}


def _error_text(e):
	if isinstance(e, frappe.MandatoryError):
		meta = frappe.get_meta("Customer Measurement")
		missing = str(e).split(":", 1)[-1]
		labels = [meta.get_label(f.strip()) or f.strip() for f in missing.split(",") if f.strip()]
		return _("Missing: {0}").format(", ".join(labels))
	msg = str(e) or e.__class__.__name__
	return frappe.utils.strip_html(msg)[:500]

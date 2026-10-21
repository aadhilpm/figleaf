# Copyright (c) 2026, Badeel Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate

from figleaf.figleaf.doctype.staff_payable_settings.staff_payable_settings import get_ledger_map

PAYABLE = "Payable to Staff"


def execute(filters=None):
	filters = frappe._dict(filters or {})
	validate_filters(filters)

	ledger_map = get_ledger_map(filters.company)
	if not ledger_map:
		frappe.msgprint(
			_("No ledgers are mapped. Set them up in {0}.").format(
				"<a href='/app/staff-payable-settings'>Staff Payable Settings</a>"
			)
		)
		return [], []

	types = [t for t in (filters.payable_type or []) if t in ledger_map] or list(ledger_map)
	ledger_map = {t: ledger_map[t] for t in types}

	employees = get_employees(filters)
	if not employees:
		return [], []

	balances = get_balances(filters, ledger_map, list(employees))

	if filters.view == "Summary":
		columns, data = get_summary(filters, ledger_map, employees, balances)
	else:
		columns, data = get_detailed(filters, ledger_map, employees, balances)

	return columns, data, None, None, get_report_summary(filters, ledger_map, employees, balances)


def get_report_summary(filters, ledger_map, employees, balances):
	payable = receivable = 0.0
	for emp in employees:
		for ptype, cfg in ledger_map.items():
			balance = type_figures(ledger_map, ptype, emp, balances)[3]
			if cfg["nature"] == PAYABLE:
				payable += balance
			else:
				receivable += balance
	net = payable - receivable
	currency = frappe.get_cached_value("Company", filters.company, "default_currency")
	return [
		{"value": payable, "label": _("Payable to Staff"), "datatype": "Currency", "currency": currency,
			"indicator": "Red"},
		{"value": receivable, "label": _("Receivable from Staff"), "datatype": "Currency",
			"currency": currency, "indicator": "Blue"},
		{"value": net, "label": _("Net Payable"), "datatype": "Currency", "currency": currency,
			"indicator": "Red" if net > 0 else "Green"},
	]


def validate_filters(filters):
	if not filters.company:
		filters.company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
			"Global Defaults", "default_company"
		)
	if not filters.company:
		frappe.throw(_("Company is required"))
	if not filters.to_date:
		frappe.throw(_("To Date is required"))
	if filters.from_date and getdate(filters.from_date) > getdate(filters.to_date):
		frappe.throw(_("From Date cannot be after To Date"))
	for key in ("payable_type", "employee"):
		val = filters.get(key)
		if isinstance(val, str):
			filters[key] = frappe.parse_json(val) if val.startswith("[") else [val]


def get_employees(filters):
	conditions = {"company": filters.company}
	if filters.employee:
		conditions["name"] = ["in", filters.employee]
	if filters.status and filters.status != "All":
		conditions["status"] = filters.status
	rows = frappe.get_all(
		"Employee", filters=conditions, fields=["name", "employee_name", "status"], order_by="name asc"
	)
	return {r.name: r for r in rows}


def get_balances(filters, ledger_map, employees):
	"""Per (employee, account): opening (dr-cr) before from_date, period debit and credit."""
	accounts = [a for t in ledger_map.values() for a in t["accounts"]]
	from_date = filters.from_date or "1900-01-01"

	rows = frappe.db.sql(
		"""
		SELECT
			party,
			account,
			SUM(IF(posting_date < %(from_date)s, debit - credit, 0)) AS opening,
			SUM(IF(posting_date >= %(from_date)s, debit, 0)) AS debit,
			SUM(IF(posting_date >= %(from_date)s, credit, 0)) AS credit
		FROM `tabGL Entry`
		WHERE is_cancelled = 0
			AND company = %(company)s
			AND party_type = 'Employee'
			AND party IN %(employees)s
			AND account IN %(accounts)s
			AND posting_date <= %(to_date)s
		GROUP BY party, account
		""",
		{
			"company": filters.company,
			"from_date": from_date,
			"to_date": filters.to_date,
			"employees": employees,
			"accounts": accounts,
		},
		as_dict=True,
	)
	return {(r.party, r.account): r for r in rows}


def type_figures(ledger_map, ptype, emp, balances):
	"""Opening, added, settled and balance for one employee and type, signed by nature."""
	cfg = ledger_map[ptype]
	sign = -1 if cfg["nature"] == PAYABLE else 1  # payable = credit balance
	opening = added = settled = 0.0
	for acc in cfg["accounts"]:
		r = balances.get((emp, acc))
		if not r:
			continue
		opening += sign * flt(r.opening)
		inc, dec = (r.credit, r.debit) if cfg["nature"] == PAYABLE else (r.debit, r.credit)
		added += flt(inc)
		settled += flt(dec)
	return opening, added, settled, opening + added - settled


def get_detailed(filters, ledger_map, employees, balances):
	columns = [
		{"label": _("Staff ID"), "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 100},
		{"label": _("Staff Name"), "fieldname": "employee_name", "fieldtype": "Data", "width": 220},
		{"label": _("Type"), "fieldname": "payable_type", "fieldtype": "Data", "width": 130},
		{"label": _("Nature"), "fieldname": "nature", "fieldtype": "Data", "width": 90},
		{"label": _("Opening"), "fieldname": "opening", "fieldtype": "Currency", "width": 120},
		{"label": _("Added in Period"), "fieldname": "added", "fieldtype": "Currency", "width": 130},
		{"label": _("Total Payable"), "fieldname": "total", "fieldtype": "Currency", "width": 130},
		{"label": _("Paid / Recovered"), "fieldname": "settled", "fieldtype": "Currency", "width": 130},
		{"label": _("Balance Outstanding"), "fieldname": "balance", "fieldtype": "Currency", "width": 150},
		{"label": _("Accounts"), "fieldname": "accounts", "fieldtype": "Data", "hidden": 1},
	]
	data = []
	for emp, e in employees.items():
		for ptype, cfg in ledger_map.items():
			opening, added, settled, balance = type_figures(ledger_map, ptype, emp, balances)
			if not filters.show_zero and not any(flt(x, 2) for x in (opening, added, settled, balance)):
				continue
			data.append(
				{
					"employee": emp,
					"employee_name": e.employee_name,
					"payable_type": ptype,
					"nature": _("Payable") if cfg["nature"] == PAYABLE else _("Receivable"),
					"opening": opening,
					"added": added,
					"total": opening + added,
					"settled": settled,
					"balance": balance,
					"accounts": ",".join(cfg["accounts"]),
				}
			)
	return columns, data


def get_summary(filters, ledger_map, employees, balances):
	columns = [
		{"label": _("Staff ID"), "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 100},
		{"label": _("Staff Name"), "fieldname": "employee_name", "fieldtype": "Data", "width": 220},
	]
	keys = {}
	for i, (ptype, cfg) in enumerate(ledger_map.items()):
		keys[ptype] = f"type_{i}"
		suffix = "" if cfg["nature"] == PAYABLE else _(" (Receivable)")
		columns.append(
			{"label": ptype + suffix, "fieldname": keys[ptype], "fieldtype": "Currency", "width": 150}
		)
	columns.append(
		{"label": _("Net Payable to Staff"), "fieldname": "net", "fieldtype": "Currency", "width": 160}
	)

	data = []
	for emp, e in employees.items():
		row = {"employee": emp, "employee_name": e.employee_name}
		net, nonzero = 0.0, False
		for ptype, cfg in ledger_map.items():
			balance = type_figures(ledger_map, ptype, emp, balances)[3]
			row[keys[ptype]] = balance
			net += balance if cfg["nature"] == PAYABLE else -balance
			nonzero = nonzero or bool(flt(balance, 2))
		row["net"] = net
		if nonzero or filters.show_zero:
			data.append(row)
	return columns, data

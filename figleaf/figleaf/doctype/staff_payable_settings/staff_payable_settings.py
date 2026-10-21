# Copyright (c) 2026, Badeel Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class StaffPayableSettings(Document):
	def validate(self):
		seen = set()
		for row in self.ledgers:
			row.payable_type = (row.payable_type or "").strip()
			acc = frappe.db.get_value("Account", row.account, ["is_group", "company"], as_dict=True)
			if not acc:
				continue
			if acc.is_group:
				frappe.throw(_("Row {0}: {1} is a group account. Select a ledger.").format(row.idx, row.account))
			row.company = acc.company
			if row.account in seen:
				frappe.throw(_("Row {0}: account {1} is mapped more than once.").format(row.idx, row.account))
			seen.add(row.account)


def get_ledger_map(company=None):
	"""Return {payable_type: {"nature": ..., "accounts": [...]}} in settings order."""
	out = {}
	for row in frappe.get_single("Staff Payable Settings").ledgers:
		if company and row.company and row.company != company:
			continue
		entry = out.setdefault(row.payable_type, {"nature": row.balance_nature, "accounts": []})
		entry["accounts"].append(row.account)
	return out


@frappe.whitelist()
def get_payable_types(company=None):
	return list(get_ledger_map(company).keys())

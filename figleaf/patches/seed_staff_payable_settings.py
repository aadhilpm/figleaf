import frappe

DEFAULTS = [
	("Salary", "2120 - Payroll Payable", "Payable to Staff"),
	("Leave Salary", "2114 - Leave Salary Provision", "Payable to Staff"),
	("Loan / Advance", "1610 - Employee Loan", "Receivable from Staff"),
]


def execute():
	settings = frappe.get_single("Staff Payable Settings")
	if settings.ledgers:
		return

	for company in frappe.get_all("Company", pluck="name"):
		abbr = frappe.get_cached_value("Company", company, "abbr")
		for ptype, acc_name, nature in DEFAULTS:
			account = f"{acc_name} - {abbr}"
			if frappe.db.exists("Account", {"name": account, "is_group": 0}):
				settings.append(
					"ledgers", {"payable_type": ptype, "account": account, "balance_nature": nature}
				)

	if settings.ledgers:
		settings.save(ignore_permissions=True)

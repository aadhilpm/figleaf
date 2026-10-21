import frappe


def execute():
	"""The Figleaf Module Def was created as a custom (DB-only) module, so Frappe
	ignores report .js files on disk. Point it at the figleaf app instead."""
	if frappe.db.exists("Module Def", "Figleaf"):
		frappe.db.set_value("Module Def", "Figleaf", {"app_name": "figleaf", "custom": 0})
		frappe.clear_cache()

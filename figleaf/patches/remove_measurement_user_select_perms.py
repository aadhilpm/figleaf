import frappe


def execute():
	"""Tailors (Measurement User) work only through their Measurement Assignments, so they must
	not be able to search the customer or order lists. Remove any select permission added earlier."""
	frappe.db.delete(
		"Custom DocPerm",
		{"role": "Measurement User", "parent": ("in", ["Customer", "Sales Order", "Item", "Quotation"])},
	)
	frappe.clear_cache()

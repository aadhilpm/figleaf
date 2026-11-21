import frappe


def execute():
	for name, symbol in (("Inch", "in"), ("CM", "cm")):
		if not frappe.db.exists("Measurement Unit", name):
			frappe.get_doc(
				{"doctype": "Measurement Unit", "unit_name": name, "symbol": symbol, "enabled": 1}
			).insert(ignore_permissions=True)

	if not frappe.db.table_exists("Measurement Settings") and not frappe.db.exists("DocType", "Measurement Settings"):
		return
	settings = frappe.get_single("Measurement Settings")
	if not settings.default_unit:
		settings.default_unit = "Inch"
		settings.allow_unit_change = 1
		settings.save(ignore_permissions=True)

import frappe


def execute():
	for name, symbol in (("Inch", "in"), ("CM", "cm")):
		if not frappe.db.exists("Measurement Unit", name):
			frappe.get_doc(
				{"doctype": "Measurement Unit", "unit_name": name, "symbol": symbol, "enabled": 1}
			).insert(ignore_permissions=True)

	settings = frappe.get_single("Measurement Settings")
	if not settings.default_unit:
		settings.default_unit = "Inch"
		settings.allow_unit_change = 1
		settings.save(ignore_permissions=True)

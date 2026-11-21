import frappe

OLD_DOCTYPES = ["Order Measurements", "Measurement Details", "Measurement Template"]


def execute():
	"""Remove the first measurement tool (replaced by Customer Measurement) and
	create the role used by the measurement mobile app. Runs before model sync."""
	if not frappe.db.exists("Role", "Measurement User"):
		frappe.get_doc({"doctype": "Role", "role_name": "Measurement User", "desk_access": 1}).insert(
			ignore_permissions=True
		)

	for dt in OLD_DOCTYPES:
		if frappe.db.exists("DocType", dt):
			frappe.delete_doc("DocType", dt, force=True, ignore_permissions=True, ignore_missing=True)

	if frappe.db.exists("Page", "measurement-entry"):
		frappe.delete_doc("Page", "measurement-entry", force=True, ignore_permissions=True)

	# old upper-case measurement names (LENGTH, BICEPS, ...) are re-created in form names
	if frappe.db.table_exists("Measurement Type"):
		frappe.db.delete("Measurement Type")

	frappe.clear_cache()

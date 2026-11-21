import frappe


def execute():
	"""The FIG LEAF workspace was made on the site without a module. Frappe v16 builds the desk
	navigation per module, so a workspace without one is not shown. Put it under Figleaf, where
	the app's sidebar (figleaf/sidebar/figleaf) links it as Home. It stays a site workspace and
	can still be edited from the screen."""
	for name in frappe.get_all("Workspace", filters={"label": "FIG LEAF", "for_user": ("in", ("", None))}, pluck="name"):
		if not frappe.db.get_value("Workspace", name, "module"):
			frappe.db.set_value("Workspace", name, "module", "Figleaf", update_modified=False)

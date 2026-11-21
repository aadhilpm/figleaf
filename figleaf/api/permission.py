import frappe


def has_app_permission():
	"""Show the Fig Leaf app tile to every desk user (not to website users)."""
	if frappe.session.user == "Administrator":
		return True
	return frappe.get_cached_value("User", frappe.session.user, "user_type") == "System User"

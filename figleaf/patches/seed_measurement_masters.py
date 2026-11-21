import frappe

# From "Fig Leaf Uniforms - Measurement Form" (one page per garment)
TOP = ["Length", "Shoulder", "Sleeve", "Bicep", "Cuff", "Chest", "Waist", "Hip", "Neck"]
BOTTOM = ["Length", "Waist", "Hip", "High", "Thigh", "Knee", "Bottom"]

GARMENTS = [
	("Shirt", "Top", TOP),
	("Trouser", "Bottom", BOTTOM),
	("Blazer", "Top", ["Length", "Shoulder", "Armhole", "Sleeve", "Bicep", "Cuff", "Chest", "Waist", "Hip"]),
	("Tshirt", "Top", TOP),
	("Cargo", "Bottom", BOTTOM),
	("Vest Coat", "Top Sleeveless", ["Length", "Shoulder", "Chest", "Waist", "Hip"]),
	("Chef Coat", "Top", TOP),
	("Graduation Gown", "Long Coat", TOP),
	("Lab Coat", "Long Coat", TOP),
	("Coverall", "Full Body", TOP),
]

# item name keywords -> garment, checked in order (first match wins)
ITEM_RULES = [
	("Vest Coat", ["VEST"]),
	("Chef Coat", ["CHEF"]),
	("Lab Coat", ["LAB COAT", "LABCOAT"]),
	("Coverall", ["COVERALL"]),
	("Graduation Gown", ["GOWN"]),
	("Blazer", ["BLAZER"]),
	("Cargo", ["CARGO"]),
	("Trouser", ["TROUSER", "PANT"]),
	("Tshirt", ["T-SHIRT", "TSHIRT", "T SHIRT", "POLO"]),
	("Shirt", ["SHIRT"]),
]
SKIP_MARKERS = ["/RM", "/ RM", "/STD", "/ STD", "SERVICE"]


def execute():
	for m in dict.fromkeys(sum([g[2] for g in GARMENTS], [])):
		if not frappe.db.exists("Measurement Type", m):
			frappe.get_doc({"doctype": "Measurement Type", "measurement_type": m}).insert(ignore_permissions=True)

	mapping = guess_item_mapping()
	for name, diagram, measures in GARMENTS:
		if frappe.db.exists("Garment Template", name):
			continue
		frappe.get_doc(
			{
				"doctype": "Garment Template",
				"garment_name": name,
				"diagram": diagram,
				"default_unit": "Inch",
				"measurements": [{"measurement_type": m} for m in measures],
				"items": [{"item": i} for i in mapping.get(name, [])],
			}
		).insert(ignore_permissions=True)


def guess_item_mapping():
	mapped = set(frappe.get_all("Garment Template Item", filters={"parenttype": "Garment Template"}, pluck="item"))
	out = {}
	for item in frappe.get_all(
		"Item",
		filters={"is_sales_item": 1, "disabled": 0, "item_group": ("!=", "Ready Made")},
		fields=["name", "item_name"],
	):
		if item.name in mapped:
			continue
		label = (item.item_name or item.name).upper()
		if any(s in label for s in SKIP_MARKERS):
			continue
		for garment, words in ITEM_RULES:
			if any(w in label for w in words):
				out.setdefault(garment, []).append(item.name)
				break
	return out

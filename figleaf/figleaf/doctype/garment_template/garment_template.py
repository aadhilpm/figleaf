# Copyright (c) 2026, Badeel Technology and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class GarmentTemplate(Document):
	def validate(self):
		seen = set()
		for row in self.measurements:
			if row.measurement_type in seen:
				frappe.throw(_("Row {0}: {1} is listed twice").format(row.idx, row.measurement_type))
			seen.add(row.measurement_type)
		items = set()
		for row in self.items:
			if row.item in items:
				frappe.throw(_("Item {0} is listed twice").format(row.item))
			items.add(row.item)
			other = frappe.db.get_value(
				"Garment Template Item",
				{"parenttype": "Garment Template", "item": row.item, "parent": ("!=", self.name)},
				"parent",
			)
			if other:
				frappe.throw(_("Item {0} is already mapped to garment {1}").format(row.item, other))

	def on_update(self):
		self.clear_cache()

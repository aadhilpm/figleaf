# Copyright (c) 2024, Badeel Technology and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class ProductionStage(Document):
	def validate(self):
		self.set_timestamps()

	def on_submit(self):
		self.update_work_order_stage()

	def on_update_after_submit(self):
		self.set_timestamps()
		self.update_work_order_stage()

	def set_timestamps(self):
		if self.status == "Progress" and not self.start_time:
			self.start_time = now_datetime()
		if self.status == "Completed" and not self.end_time:
			self.end_time = now_datetime()

	def update_work_order_stage(self):
		if not self.production_order:
			return

		# Find the current active stage (latest in-progress or most recently completed)
		current_stage = get_current_stage(self.production_order)
		if current_stage:
			frappe.db.set_value("Work Order", self.production_order, "custom_stage", current_stage)


def get_current_stage(work_order):
	# Priority: first "Progress" stage, then latest "Not Started", then latest "Completed"
	in_progress = frappe.db.get_value(
		"Production Stage",
		{"production_order": work_order, "docstatus": 1, "status": "Progress"},
		"stage",
		order_by="creation asc",
	)
	if in_progress:
		return in_progress

	not_started = frappe.db.get_value(
		"Production Stage",
		{"production_order": work_order, "docstatus": 1, "status": "Not Started"},
		"stage",
		order_by="creation asc",
	)
	if not_started:
		return not_started

	# All completed — return the last completed one
	completed = frappe.db.get_value(
		"Production Stage",
		{"production_order": work_order, "docstatus": 1, "status": "Completed"},
		"stage",
		order_by="creation desc",
	)
	return completed


@frappe.whitelist()
def start_stage(work_order, stage):
	wo = frappe.get_doc("Work Order", work_order)
	if wo.docstatus != 1:
		frappe.throw("Work Order must be submitted first")

	# Check if this stage already exists and is not completed
	existing = frappe.db.get_value(
		"Production Stage",
		{"production_order": work_order, "stage": stage, "docstatus": 1, "status": ["in", ["Not Started", "Progress"]]},
		"name",
	)
	if existing:
		frappe.throw(f"Stage '{stage}' is already active for this Work Order")

	ps = frappe.new_doc("Production Stage")
	ps.production_order = work_order
	ps.stage = stage
	ps.status = "Progress"
	ps.start_time = now_datetime()
	ps.insert()
	ps.submit()

	frappe.msgprint(f"Started: {stage}", indicator="orange", alert=True)
	return {"stage": ps.stage, "name": ps.name}


@frappe.whitelist()
def complete_stage(work_order, stage_name):
	doc = frappe.get_doc("Production Stage", stage_name)

	if doc.production_order != work_order:
		frappe.throw("Stage does not belong to this Work Order")

	if doc.status != "Progress":
		frappe.throw("Only in-progress stages can be completed")

	doc.status = "Completed"
	doc.end_time = now_datetime()
	doc.save(ignore_permissions=True)

	frappe.msgprint(f"Completed: {doc.stage}", indicator="green", alert=True)
	return {"stage": doc.stage, "name": doc.name}


@frappe.whitelist()
def get_stage_status(work_order):
	stages = frappe.get_all(
		"Production Stage",
		filters={"production_order": work_order, "docstatus": 1},
		fields=["name", "stage", "status", "start_time", "end_time"],
		order_by="creation asc",
	)
	return stages

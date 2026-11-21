frappe.listview_settings["Measurement Assignment"] = {
	add_fields: ["status", "due_date"],
	get_indicator(doc) {
		const c = { Open: "orange", "In Progress": "blue", Completed: "green", Cancelled: "red" }[doc.status];
		return [__(doc.status), c, "status,=," + doc.status];
	},
};

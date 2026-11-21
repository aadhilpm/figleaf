frappe.listview_settings["Customer Measurement"] = {
	add_fields: ["source", "sales_order"],
	get_indicator(doc) {
		return doc.source === "Mobile App"
			? [__("Mobile App"), "blue", "source,=,Mobile App"]
			: [__("Desk"), "gray", "source,=,Desk"];
	},
};

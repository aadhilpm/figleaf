from frappe import _


def _add(data, items):
	data.setdefault("transactions", []).append({"label": _("Measurements"), "items": items})
	return data


def sales_order(data):
	# both doctypes link with the fieldname "sales_order", same as the Sales Order dashboard
	return _add(data, ["Measurement Assignment", "Customer Measurement"])


def customer(data):
	return _add(data, ["Measurement Assignment", "Customer Measurement"])


def quotation(data):
	data.setdefault("non_standard_fieldnames", {}).update(
		{"Customer Measurement": "quotation", "Measurement Assignment": "quotation"}
	)
	return _add(data, ["Measurement Assignment", "Customer Measurement"])

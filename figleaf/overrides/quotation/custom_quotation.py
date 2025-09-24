import frappe
from erpnext.selling.doctype.quotation.quotation import Quotation


class CustomQuotation(Quotation):
    @frappe.whitelist()
    def quotation_update(self, updated_quotation_items):
        if self.status in ["Open", "Replied"]:
            current_quotation_items = frappe.get_all(
                "Quotation Item",
                filters={"parent": self.name},
                fields=["name"]
            )

            total_qty = 0
            total_amount = 0

            current_docnames = [i.name for i in current_quotation_items]
            updated_docnames = [item.get("docname") for item in updated_quotation_items]
            idx = 1
            for item in updated_quotation_items:
                qty = item.get("qty", 0)
                rate = item.get("rate", 0)
                amount = qty * rate
                docname = item.get("docname")

                if docname in current_docnames:
                    # update existing
                    frappe.db.set_value("Quotation Item", docname, "qty", qty)
                    frappe.db.set_value("Quotation Item", docname, "rate", rate)
                    frappe.db.set_value("Quotation Item", docname, "amount", amount)

            # delete if removed
            for item in current_quotation_items:
                if item.name not in updated_docnames:
                    if len(current_quotation_items) > 1:
                        frappe.delete_doc("Quotation Item", item.name)
                        current_quotation_items.remove(item)
                    else:
                        frappe.throw("Quotation must have at least one Item.")

            # update totals
            frappe.db.set_value("Quotation", self.name, "total_qty", total_qty)
            frappe.db.set_value("Quotation", self.name, "net_total", total_amount - (self.discount_amount or 0))
            frappe.db.set_value("Quotation", self.name, "grand_total", total_amount)
            frappe.db.set_value("Quotation", self.name, "in_words", frappe.utils.money_in_words(total_amount))

            frappe.db.commit()
            return "success"

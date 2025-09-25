import frappe

from frappe.contacts.doctype.contact.contact import Contact

class CustomContact(Contact):
    def before_save(self):
        qatar_phone_condition = "+974-"+(self.mobile_no)
        frappe.utils.validate_phone_number_with_country_code(qatar_phone_condition, "mobile_no") 
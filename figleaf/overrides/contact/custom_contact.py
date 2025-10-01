import frappe

from frappe.contacts.doctype.contact.contact import Contact

class CustomContact(Contact):
    def before_save(self):
        if not self.mobile_no:
            return
        if not self.mobile_no.startswith("+") or self.mobile_no.startswith("+974"):
            # Determine Qatar phone format
            qatar_phone_condition = (
                self.mobile_no if self.mobile_no.startswith("+974")
                else "+974-" + self.mobile_no
            )
            # Validate the number with country code
            if frappe.utils.validate_phone_number_with_country_code(qatar_phone_condition, "mobile_no"):
                # Update mobile_no with validated Qatar format
                self.mobile_no = qatar_phone_condition

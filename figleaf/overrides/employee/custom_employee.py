import frappe
from erpnext.setup.doctype.employee.employee import Employee

class CustomEmployee(Employee):
    def before_save(self):
        if not self.cell_number:
            return

        # Determine Qatar phone format
        if not self.cell_number.startswith("+") or self.cell_number.startswith("+974"):
            qatar_phone_condition = (
                self.cell_number if self.cell_number.startswith("+974") 
                else "+974-" + self.cell_number
            )

            # Validate the number with country code
            if frappe.utils.validate_phone_number_with_country_code(qatar_phone_condition, "cell_number"):
                # Update cell_number with validated Qatar format
                self.cell_number = qatar_phone_condition

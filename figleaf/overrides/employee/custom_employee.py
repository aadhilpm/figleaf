import frappe
from erpnext.setup.doctype.employee.employee import Employee

class CustomEmployee(Employee):
    def before_save(self):
        qatar_phone_condition = "+974-"+(self.cell_number)
        frappe.utils.validate_phone_number_with_country_code(qatar_phone_condition, "cell_number")
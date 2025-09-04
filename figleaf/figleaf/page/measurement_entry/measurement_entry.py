import frappe
from frappe import _

@frappe.whitelist()
def get_measurement_types():
    """Get all measurement types"""
    return frappe.get_all('Measurement Type', 
                         fields=['name', 'measurement_type'],
                         order_by='measurement_type')

@frappe.whitelist()
def get_measurement_templates():
    """Get all measurement templates"""
    return frappe.get_all('Measurement Template', 
                         fields=['name', 'measurement_template'],
                         order_by='measurement_template')

@frappe.whitelist()
def get_template_details(template_name):
    """Get measurement details for a template"""
    doc = frappe.get_doc('Measurement Template', template_name)
    return doc.measurement_details

@frappe.whitelist()
def save_measurements(customer, customer_name, gender, item, quantity, 
                      measurement_template, measurements, document_type=None, 
                      ref_no=None, remark=None):
    """Save order measurements"""
    
    doc = frappe.new_doc('Order Measurements')
    doc.customer = customer
    doc.customer_name = customer_name
    doc.gender = gender
    doc.item = item
    doc.quantity = quantity
    doc.date = frappe.utils.today()
    doc.measurement_template = measurement_template
    doc.document_type = document_type
    doc.ref_no = ref_no
    doc.remark = remark
    
    import json
    if isinstance(measurements, str):
        measurements = json.loads(measurements)
    
    for measurement in measurements:
        doc.append('measurement_details', {
            'measurement_type': measurement.get('measurement_type'),
            'measurement_value': measurement.get('measurement_value'),
            'unit': measurement.get('unit', 'inch'),
            'additional_notes': measurement.get('additional_notes')
        })
    
    doc.insert()
    frappe.db.commit()
    
    return doc.name

@frappe.whitelist()
def get_customer_measurements(customer):
    """Get last measurements for a customer"""
    last_order = frappe.get_all('Order Measurements',
                                filters={'customer': customer},
                                fields=['name', 'date', 'item', 'gender'],
                                order_by='date desc',
                                limit=1)
    
    if last_order:
        doc = frappe.get_doc('Order Measurements', last_order[0].name)
        return {
            'order': last_order[0],
            'measurements': doc.measurement_details
        }
    return None

@frappe.whitelist()
def convert_measurement(value, from_unit, to_unit):
    """Convert measurement between units"""
    value = float(value)
    
    conversion_factors = {
        'inch_to_cm': 2.54,
        'cm_to_inch': 0.393701,
        'inch_to_mm': 25.4,
        'mm_to_inch': 0.0393701,
        'cm_to_mm': 10,
        'mm_to_cm': 0.1
    }
    
    if from_unit == to_unit:
        return value
    
    key = f"{from_unit}_to_{to_unit}"
    if key in conversion_factors:
        return round(value * conversion_factors[key], 2)
    
    return value
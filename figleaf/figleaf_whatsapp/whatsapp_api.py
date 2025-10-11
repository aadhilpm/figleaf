import frappe
from frappe import _
from frappe.email.doctype.notification.notification import Notification, get_context, json
from frappe.core.doctype.role.role import get_info_based_on_role, get_user_info
import requests
import io
import base64
from frappe.utils import now
import time
from frappe import enqueue


def create_pdf(doctype, docname, print_format):
    file = frappe.get_print(doctype, docname, print_format, as_pdf=True)
    pdf_bytes = io.BytesIO(file)
    pdf_base64 = base64.b64encode(pdf_bytes.getvalue()).decode()
    in_memory_url = f"data:application/pdf;base64,{pdf_base64}"
    return in_memory_url

@frappe.whitelist()
def send_whatsapp_without_pdf(to_number, message, doctype, docname):
    memory_url= create_pdf(doctype, docname, "Custom Format PE")
    token = frappe.get_doc('whatsapp message').get('token')
    instance_id = frappe.get_doc('whatsapp message').get('instance_id')
    message_url = frappe.get_doc('whatsapp message').get('message_url')
    msg1 = message
    recipients = to_number

    payload = {
        'number': recipients,
        'type': 'media',
        'message': msg1,
        'media_url': memory_url,
        'filename': 'RV-25-01067-2.pdf',
        'instance_id': instance_id,
        'access_token': token
    }
    headers = {'Content-Type': 'application/json'}

    try:
        time.sleep(1)
        response = requests.post(message_url, json=payload, headers=headers)
        if response.status_code == 200:
            response_json = response.json()
            if "sent" in response_json and response_json["sent"] == "true":
                # Log success
                current_time = now()
                frappe.get_doc({
                    "doctype": "Whatsapp Message Log",
                    "title": "Whatsapp message successfully sent",
                    "message": msg1,
                    "to_number": recipients,
                    "time": current_time
                }).insert()
            elif "error" in response_json:
                frappe.log("WhatsApp API Error: ", response_json.get("error"))
            else:
                frappe.log("Unexpected response from WhatsApp API")
        else:
            frappe.log("WhatsApp API returned a non-200 status code: ", str(response.status_code))
        return response.text
    except Exception as e:
        frappe.log_error(title='Failed to send whatsapp message', message=frappe.get_traceback())

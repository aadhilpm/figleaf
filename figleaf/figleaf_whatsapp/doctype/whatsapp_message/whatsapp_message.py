import frappe
# from frappe.model.document import Document
import requests
import frappe
from frappe.model.document import Document

import frappe
import requests

class whatsappmessage(Document):  
    @frappe.whitelist()
    def msg(self, token, recipient, message_url, instance_id):
        payload = {
  			'number': int(recipient),
            'type': 'media',
            'message': 'test message from erpnext',
            'media_url': 'https://i.pravatar.cc',
            'filename': 'file_test.jpg',
            'instance_id': instance_id,
            'access_token': token
        }

        headers = {
            'Content-Type': 'application/json'
        }
        try:
            # POST as form data
            response = requests.post(message_url, json=payload, headers=headers)

            frappe.msgprint(f"Response: {response.text}")
            print(f"🔁 Response Code: {response.status_code}")
            return response.text
        except Exception as e:
            frappe.throw(f"Error sending message: {e}")

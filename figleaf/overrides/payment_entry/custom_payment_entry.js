frappe.ui.form.on('Payment Entry', {
    refresh: function (frm) {
        // only for submitted Customer receipts
        if (
            frm.doc.docstatus === 1 &&
            frm.doc.party_type === 'Customer' &&
            frm.doc.payment_type === 'Receive'
        ) {
            frm.add_custom_button('Send to WhatsApp', function () {
                const d = new frappe.ui.Dialog({
                    title: 'Send Payment Receipt via WhatsApp',
                    fields: [
                        {
                            label: 'Mobile Number (without +)',
                            fieldname: 'mobile',
                            fieldtype: 'Data',
                            reqd: true,
                            default: '974'
                        },
                        {
                            label: 'Message',
                            fieldname: 'message',
                            fieldtype: 'Small Text',
                            default:
                                `Dear ${frm.doc.party_name || 'Customer'},\n` +
                                `We have received your payment of ${frm.doc.paid_amount} ${frm.doc.paid_to_account_currency || frm.doc.currency}.\n` +
                                `Reference: ${frm.doc.name}\nThank you.`
                        }
                    ],
                    primary_action_label: 'Send',
                    primary_action(values) {
                        frappe.call({
                            method: 'figleaf.figleaf_whatsapp.whatsapp_api.send_whatsapp_without_pdf', // your Server Script API method
                            freeze: true,
                            freeze_message: 'Sending WhatsApp message...',
                            args: {
                                to_number: values.mobile,
                                message: values.message,
                                doctype: frm.doc.doctype,
                                docname: frm.docname
                            },
                            callback(r) {
                                console.log(r);                                
                                if (r.message && r.message.ok) {
                                    frappe.show_alert({ message: 'WhatsApp message sent ✅', indicator: 'green' });
                                } else {
                                    const err = (r.message && r.message.error) || 'Unknown error';
                                    frappe.msgprint(__('Failed to send: {0}', [err]));
                                    console.error('WhatsApp send error:', r);
                                }
                            }
                        });
                        d.hide();
                    }
                });
                d.show();
            });
        }
    }
});

// Copyright (c) 2023, ERPGulf and contributors
// For license information, please see license.txt
frappe.ui.form.on("whatsapp message", {
    refresh: function (frm) {

        frm.add_custom_button(__("click"), function () {

            frm.call("msg", {
                token: frm.doc.token,
                recipient: frm.doc.to,
                message_url: frm.doc.message_url,
                instance_id: frm.doc.instance_id

            }).then(r => {
                console.log(r.message);
                
                frappe.msgprint(r.message.status);;
            })
        }, __("Send Test Message"));
    }
});

frappe.ui.form.on('Opportunity', {
    expected_closing: function(frm) {
        if (frm.doc.expected_closing && frappe.datetime.get_diff(frm.doc.expected_closing, frappe.datetime.now_date()) < 0) {
            frappe.msgprint(__('Expected Closing Date cannot be in the past.'));
            frm.set_value('expected_closing', null);
        }
    },
    validate: function(frm) {
        if (frm.doc.expected_closing && frappe.datetime.get_diff(frm.doc.expected_closing, frappe.datetime.now_date()) < 0) {
            frappe.throw(__('Expected Closing Date cannot be in the past.'));
        }
    }
});

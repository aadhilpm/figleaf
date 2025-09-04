frappe.ui.form.on('Order Measurements', {
    refresh: function(frm) {
        frm.add_custom_button(__('Quick Entry'), function() {
            frappe.set_route('measurement-entry');
        }, __('Actions'));
    },
    
    customer: function(frm) {
        if (frm.doc.customer) {
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Order Measurements',
                    filters: {
                        'customer': frm.doc.customer
                    },
                    fields: ['name', 'date', 'item'],
                    order_by: 'date desc',
                    limit: 1
                },
                callback: function(r) {
                    if (r.message && r.message.length > 0) {
                        frappe.msgprint({
                            title: __('Previous Measurements Found'),
                            message: __('Customer has previous measurements from {0}. Would you like to copy them?', [frappe.datetime.str_to_user(r.message[0].date)]),
                            primary_action: {
                                label: __('Copy Measurements'),
                                action: function() {
                                    frappe.call({
                                        method: 'frappe.client.get',
                                        args: {
                                            doctype: 'Order Measurements',
                                            name: r.message[0].name
                                        },
                                        callback: function(data) {
                                            if (data.message && data.message.measurement_details) {
                                                frm.clear_table('measurement_details');
                                                data.message.measurement_details.forEach(function(row) {
                                                    let child = frm.add_child('measurement_details');
                                                    child.measurement_type = row.measurement_type;
                                                    child.measurement_value = row.measurement_value;
                                                    child.unit = row.unit;
                                                    child.additional_notes = row.additional_notes;
                                                });
                                                frm.refresh_field('measurement_details');
                                                frappe.show_alert(__('Measurements copied successfully'), 5);
                                            }
                                        }
                                    });
                                }
                            }
                        });
                    }
                }
            });
        }
    },
    
    measurement_template: function(frm) {
        if (frm.doc.measurement_template) {
            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Measurement Template',
                    name: frm.doc.measurement_template
                },
                callback: function(r) {
                    if (r.message && r.message.measurement_details) {
                        frm.clear_table('measurement_details');
                        r.message.measurement_details.forEach(function(row) {
                            let child = frm.add_child('measurement_details');
                            child.measurement_type = row.measurement_type;
                            child.measurement_value = row.measurement_value;
                            child.unit = row.unit || 'inch';
                            child.additional_notes = row.additional_notes;
                        });
                        frm.refresh_field('measurement_details');
                        frappe.show_alert(__('Template applied successfully'), 5);
                    }
                }
            });
        }
    },
    
    validate: function(frm) {
        if (frm.doc.measurement_details) {
            let hasError = false;
            frm.doc.measurement_details.forEach(function(row) {
                if (row.measurement_value) {
                    if (isNaN(row.measurement_value) || row.measurement_value <= 0) {
                        frappe.msgprint(__('Invalid measurement value for {0}. Please enter a positive number.', [row.measurement_type]));
                        hasError = true;
                    }
                    
                    if (row.unit === 'inch' && row.measurement_value > 100) {
                        frappe.msgprint(__('Measurement value for {0} seems too large ({1} inches). Please verify.', [row.measurement_type, row.measurement_value]));
                    }
                    
                    if (row.unit === 'cm' && row.measurement_value > 250) {
                        frappe.msgprint(__('Measurement value for {0} seems too large ({1} cm). Please verify.', [row.measurement_type, row.measurement_value]));
                    }
                }
            });
            
            if (hasError) {
                frappe.validated = false;
            }
        }
    }
});

frappe.ui.form.on('Measurement Details', {
    measurement_value: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.measurement_value && row.measurement_value < 0) {
            frappe.model.set_value(cdt, cdn, 'measurement_value', Math.abs(row.measurement_value));
            frappe.show_alert(__('Measurement value converted to positive'), 3);
        }
    },
    
    unit: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.measurement_value && row.unit) {
            frappe.show_alert(__('Unit changed to {0}', [row.unit]), 3);
        }
    }
});
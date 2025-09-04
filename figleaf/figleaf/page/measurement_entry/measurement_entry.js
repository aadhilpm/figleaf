frappe.pages['measurement-entry'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Quick Measurement Entry',
        single_column: true
    });

    new MeasurementEntry(page);
}

class MeasurementEntry {
    constructor(page) {
        this.page = page;
        this.measurements = [];
        this.setup();
        this.make();
        this.load_data();
    }

    setup() {
        this.page.set_primary_action('Save Measurements', () => this.save_measurements(), 'btn-primary');
        this.page.set_secondary_action('Clear Form', () => this.clear_form());
    }

    make() {
        let $container = $('<div class="measurement-entry-container"></div>').appendTo(this.page.main);
        
        $container.html(`
            <div class="row">
                <div class="col-md-12">
                    <div class="measurement-form">
                        <div class="customer-section card mb-4">
                            <div class="card-header bg-primary text-white">
                                <h5 class="mb-0">Customer Information</h5>
                            </div>
                            <div class="card-body">
                                <div class="row">
                                    <div class="col-md-4">
                                        <div class="form-group">
                                            <label>Customer *</label>
                                            <div class="customer-field"></div>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="form-group">
                                            <label>Customer Name</label>
                                            <input type="text" class="form-control customer-name" readonly>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="form-group">
                                            <label>Gender *</label>
                                            <select class="form-control gender-field">
                                                <option value="">Select Gender</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Unisex">Unisex</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="order-section card mb-4">
                            <div class="card-header bg-info text-white">
                                <h5 class="mb-0">Order Details</h5>
                            </div>
                            <div class="card-body">
                                <div class="row">
                                    <div class="col-md-3">
                                        <div class="form-group">
                                            <label>Item *</label>
                                            <div class="item-field"></div>
                                        </div>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="form-group">
                                            <label>Quantity *</label>
                                            <input type="number" class="form-control quantity-field" value="1" min="1">
                                        </div>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="form-group">
                                            <label>Document Type</label>
                                            <select class="form-control doc-type-field">
                                                <option value="">None</option>
                                                <option value="Opportunity">Opportunity</option>
                                                <option value="Sales Order">Sales Order</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="form-group">
                                            <label>Reference No</label>
                                            <div class="ref-no-field"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="template-section card mb-4">
                            <div class="card-header bg-success text-white">
                                <h5 class="mb-0">Measurement Template</h5>
                            </div>
                            <div class="card-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="form-group">
                                            <label>Select Template (Optional)</label>
                                            <div class="template-field"></div>
                                        </div>
                                    </div>
                                    <div class="col-md-6 d-flex align-items-end">
                                        <button class="btn btn-sm btn-secondary apply-template mr-2">Apply Template</button>
                                        <button class="btn btn-sm btn-warning copy-last-measurements">Copy Last Measurements</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="measurements-section card mb-4">
                            <div class="card-header bg-secondary text-white d-flex justify-content-between align-items-center">
                                <h5 class="mb-0">Measurements</h5>
                                <div>
                                    <select class="form-control form-control-sm default-unit d-inline-block" style="width: 100px;">
                                        <option value="inch">Inches</option>
                                        <option value="cm">CM</option>
                                        <option value="mm">MM</option>
                                    </select>
                                    <button class="btn btn-sm btn-light ml-2 add-measurement">+ Add Row</button>
                                </div>
                            </div>
                            <div class="card-body">
                                <div class="measurements-grid">
                                    <table class="table table-bordered table-hover">
                                        <thead class="thead-light">
                                            <tr>
                                                <th width="5%">#</th>
                                                <th width="30%">Measurement Type</th>
                                                <th width="20%">Value</th>
                                                <th width="15%">Unit</th>
                                                <th width="25%">Notes</th>
                                                <th width="5%">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody class="measurements-tbody">
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div class="remarks-section card">
                            <div class="card-header bg-dark text-white">
                                <h5 class="mb-0">Additional Information</h5>
                            </div>
                            <div class="card-body">
                                <div class="form-group">
                                    <label>Remarks</label>
                                    <textarea class="form-control remarks-field" rows="3" placeholder="Enter any special instructions or notes..."></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);

        this.setup_fields();
        this.bind_events();
        this.add_measurement_row();
    }

    setup_fields() {
        this.customer_field = frappe.ui.form.make_control({
            df: {
                fieldtype: 'Link',
                options: 'Customer',
                label: 'Customer',
                reqd: 1,
                onchange: () => this.on_customer_change()
            },
            parent: this.page.main.find('.customer-field'),
            render_input: true
        });

        this.item_field = frappe.ui.form.make_control({
            df: {
                fieldtype: 'Link',
                options: 'Item',
                label: 'Item',
                reqd: 1
            },
            parent: this.page.main.find('.item-field'),
            render_input: true
        });

        this.template_field = frappe.ui.form.make_control({
            df: {
                fieldtype: 'Link',
                options: 'Measurement Template',
                label: 'Template'
            },
            parent: this.page.main.find('.template-field'),
            render_input: true
        });

        this.ref_no_field = frappe.ui.form.make_control({
            df: {
                fieldtype: 'Dynamic Link',
                options: 'doc_type',
                label: 'Reference'
            },
            parent: this.page.main.find('.ref-no-field'),
            render_input: true
        });
    }

    bind_events() {
        const me = this;
        
        this.page.main.find('.add-measurement').on('click', () => {
            this.add_measurement_row();
        });

        this.page.main.find('.apply-template').on('click', () => {
            this.apply_template();
        });

        this.page.main.find('.copy-last-measurements').on('click', () => {
            this.copy_last_measurements();
        });

        this.page.main.find('.doc-type-field').on('change', function() {
            const doctype = $(this).val();
            if (doctype) {
                me.ref_no_field.df.options = doctype;
                me.ref_no_field.refresh();
                me.ref_no_field.set_input();
            }
        });

        this.page.main.find('.default-unit').on('change', function() {
            const unit = $(this).val();
            me.page.main.find('.measurement-unit').val(unit);
        });
    }

    add_measurement_row() {
        const default_unit = this.page.main.find('.default-unit').val();
        const row_html = `
            <tr class="measurement-row">
                <td class="text-center row-number">${this.page.main.find('.measurement-row').length + 1}</td>
                <td>
                    <select class="form-control measurement-type">
                        <option value="">Select Type</option>
                    </select>
                </td>
                <td>
                    <input type="number" class="form-control measurement-value" step="0.01" min="0">
                </td>
                <td>
                    <select class="form-control measurement-unit">
                        <option value="inch">Inch</option>
                        <option value="cm">CM</option>
                        <option value="mm">MM</option>
                    </select>
                </td>
                <td>
                    <input type="text" class="form-control measurement-notes" placeholder="Optional notes">
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-danger remove-row">×</button>
                </td>
            </tr>
        `;

        const $row = $(row_html).appendTo(this.page.main.find('.measurements-tbody'));
        $row.find('.measurement-unit').val(default_unit);
        
        $row.find('.remove-row').on('click', function() {
            $(this).closest('tr').remove();
            me.update_row_numbers();
        });

        this.populate_measurement_types($row.find('.measurement-type'));
    }

    populate_measurement_types(select) {
        frappe.call({
            method: 'figleaf.figleaf.page.measurement_entry.measurement_entry.get_measurement_types',
            callback: (r) => {
                if (r.message) {
                    r.message.forEach(type => {
                        select.append(`<option value="${type.name}">${type.measurement_type}</option>`);
                    });
                }
            }
        });
    }

    update_row_numbers() {
        this.page.main.find('.measurement-row').each((i, row) => {
            $(row).find('.row-number').text(i + 1);
        });
    }

    on_customer_change() {
        const customer = this.customer_field.get_value();
        if (!customer) return;

        frappe.call({
            method: 'frappe.client.get_value',
            args: {
                doctype: 'Customer',
                name: customer,
                fieldname: 'customer_name'
            },
            callback: (r) => {
                if (r.message) {
                    this.page.main.find('.customer-name').val(r.message.customer_name);
                }
            }
        });
    }

    apply_template() {
        const template = this.template_field.get_value();
        if (!template) {
            frappe.msgprint(__('Please select a template'));
            return;
        }

        frappe.call({
            method: 'figleaf.figleaf.page.measurement_entry.measurement_entry.get_template_details',
            args: { template_name: template },
            callback: (r) => {
                if (r.message) {
                    this.page.main.find('.measurements-tbody').empty();
                    r.message.forEach(detail => {
                        this.add_measurement_row();
                        const $row = this.page.main.find('.measurement-row:last');
                        $row.find('.measurement-type').val(detail.measurement_type);
                        $row.find('.measurement-value').val(detail.measurement_value);
                        $row.find('.measurement-unit').val(detail.unit || 'inch');
                        $row.find('.measurement-notes').val(detail.additional_notes || '');
                    });
                    frappe.show_alert('Template applied successfully', 5);
                }
            }
        });
    }

    copy_last_measurements() {
        const customer = this.customer_field.get_value();
        if (!customer) {
            frappe.msgprint(__('Please select a customer first'));
            return;
        }

        frappe.call({
            method: 'figleaf.figleaf.page.measurement_entry.measurement_entry.get_customer_measurements',
            args: { customer: customer },
            callback: (r) => {
                if (r.message && r.message.measurements) {
                    this.page.main.find('.measurements-tbody').empty();
                    r.message.measurements.forEach(detail => {
                        this.add_measurement_row();
                        const $row = this.page.main.find('.measurement-row:last');
                        $row.find('.measurement-type').val(detail.measurement_type);
                        $row.find('.measurement-value').val(detail.measurement_value);
                        $row.find('.measurement-unit').val(detail.unit || 'inch');
                        $row.find('.measurement-notes').val(detail.additional_notes || '');
                    });
                    this.page.main.find('.gender-field').val(r.message.order.gender);
                    frappe.show_alert('Previous measurements loaded successfully', 5);
                } else {
                    frappe.msgprint(__('No previous measurements found for this customer'));
                }
            }
        });
    }

    save_measurements() {
        const customer = this.customer_field.get_value();
        const item = this.item_field.get_value();
        const gender = this.page.main.find('.gender-field').val();
        const quantity = this.page.main.find('.quantity-field').val();

        if (!customer || !item || !gender || !quantity) {
            frappe.msgprint(__('Please fill all required fields'));
            return;
        }

        const measurements = [];
        this.page.main.find('.measurement-row').each((i, row) => {
            const $row = $(row);
            const type = $row.find('.measurement-type').val();
            const value = $row.find('.measurement-value').val();
            
            if (type && value) {
                measurements.push({
                    measurement_type: type,
                    measurement_value: parseFloat(value),
                    unit: $row.find('.measurement-unit').val(),
                    additional_notes: $row.find('.measurement-notes').val()
                });
            }
        });

        if (measurements.length === 0) {
            frappe.msgprint(__('Please add at least one measurement'));
            return;
        }

        frappe.call({
            method: 'figleaf.figleaf.page.measurement_entry.measurement_entry.save_measurements',
            args: {
                customer: customer,
                customer_name: this.page.main.find('.customer-name').val(),
                gender: gender,
                item: item,
                quantity: parseInt(quantity),
                measurement_template: this.template_field.get_value(),
                measurements: JSON.stringify(measurements),
                document_type: this.page.main.find('.doc-type-field').val(),
                ref_no: this.ref_no_field.get_value(),
                remark: this.page.main.find('.remarks-field').val()
            },
            callback: (r) => {
                if (r.message) {
                    frappe.show_alert({
                        message: __('Measurements saved successfully'),
                        indicator: 'green'
                    }, 5);
                    
                    frappe.msgprint({
                        title: __('Success'),
                        message: __('Order Measurements {0} created successfully', [r.message]),
                        primary_action: {
                            label: __('View Record'),
                            action: () => {
                                frappe.set_route('Form', 'Order Measurements', r.message);
                            }
                        },
                        secondary_action: {
                            label: __('New Entry'),
                            action: () => {
                                this.clear_form();
                            }
                        }
                    });
                }
            }
        });
    }

    clear_form() {
        this.customer_field.set_value('');
        this.item_field.set_value('');
        this.template_field.set_value('');
        this.ref_no_field.set_value('');
        this.page.main.find('.customer-name').val('');
        this.page.main.find('.gender-field').val('');
        this.page.main.find('.quantity-field').val('1');
        this.page.main.find('.doc-type-field').val('');
        this.page.main.find('.remarks-field').val('');
        this.page.main.find('.measurements-tbody').empty();
        this.add_measurement_row();
    }

    load_data() {
        this.populate_measurement_types();
    }
}
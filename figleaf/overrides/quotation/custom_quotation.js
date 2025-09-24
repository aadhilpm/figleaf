frappe.ui.form.on('Quotation', {
    refresh(frm) {
        if (frm.doc.docstatus === 1) {
            frm.add_custom_button(__("Custom Update Items"), () => {
                frm.trigger("update_child_items_custom")
                frm.reload_doc()
            });
        }
    },
    update_child_items_custom: function (frm) {
        current_quotation_item = frm.doc.items.map((d) => {
            return {
                docname: d.name,
                name: d.name,
                item_code: d.item_code,
                qty: d.qty,
                rate: d.rate,
            };
        });
        const fields = [
            {
                fieldtype: "Data",
                fieldname: "docname",
                read_only: 1,
                hidden: 1,
            },
            {
                fieldtype: "Link",
                fieldname: "item_code",
                options: "Item",
                in_list_view: 1,
                read_only: 0,
                disabled: 0,
                label: __("Item Code"),
                get_query: function () {
                    return {
                        filters: {
                            "is_sales_item": 1
                        },
                    };
                },
                onchange: function () {
                    const me = this;

                    frm.call({
                        method: "erpnext.stock.get_item_details.get_item_details",
                        args: {
                            doc: frm.doc,
                            args: {
                                item_code: this.value,
                                set_warehouse: frm.doc.set_warehouse,
                                customer: frm.doc.customer || frm.doc.party_name,
                                quotation_to: frm.doc.quotation_to,
                                supplier: frm.doc.supplier,
                                currency: frm.doc.currency,
                                is_internal_supplier: frm.doc.is_internal_supplier,
                                is_internal_customer: frm.doc.is_internal_customer,
                                conversion_rate: frm.doc.conversion_rate,
                                price_list: frm.doc.selling_price_list || frm.doc.buying_price_list,
                                price_list_currency: frm.doc.price_list_currency,
                                plc_conversion_rate: frm.doc.plc_conversion_rate,
                                company: frm.doc.company,
                                order_type: frm.doc.order_type,
                                is_pos: cint(frm.doc.is_pos),
                                is_return: cint(frm.doc.is_return),
                                is_subcontracted: frm.doc.is_subcontracted,
                                ignore_pricing_rule: frm.doc.ignore_pricing_rule,
                                doctype: frm.doc.doctype,
                                name: frm.doc.name,
                                qty: me.doc.qty || 1,
                                uom: me.doc.uom,
                                pos_profile: cint(frm.doc.is_pos) ? frm.doc.pos_profile : "",
                                tax_category: frm.doc.tax_category,
                                child_doctype: frm.doc.doctype + " Item",
                                is_old_subcontracting_flow: frm.doc.is_old_subcontracting_flow,
                            },
                        },
                        callback: function (r) {
                            if (r.message) {
                                const { qty, price_list_rate: rate, uom, conversion_factor, bom_no } = r.message;

                                const row = dialog.fields_dict.trans_items.df.data.find(
                                    (doc) => doc.idx == me.doc.idx
                                );
                                if (row) {
                                    Object.assign(row, {
                                        conversion_factor: me.doc.conversion_factor || conversion_factor,
                                        uom: me.doc.uom || uom,
                                        qty: me.doc.qty || qty,
                                        rate: me.doc.rate || rate,
                                        bom_no: bom_no,
                                    });
                                    dialog.fields_dict.trans_items.grid.refresh();
                                }
                            }
                        },
                    });
                },
            },
            {
                fieldtype: "Link",
                fieldname: "uom",
                options: "UOM",
                read_only: 0,
                label: __("UOM"),
                reqd: 1,
                onchange: function () {
                    frappe.call({
                        method: "erpnext.stock.get_item_details.get_conversion_factor",
                        args: { item_code: this.doc.item_code, uom: this.value },
                        callback: (r) => {
                            if (!r.exc) {
                                if (this.doc.conversion_factor == r.message.conversion_factor) return;

                                const docname = this.doc.docname;
                                dialog.fields_dict.trans_items.df.data.some((doc) => {
                                    if (doc.docname == docname) {
                                        doc.conversion_factor = r.message.conversion_factor;
                                        dialog.fields_dict.trans_items.grid.refresh();
                                        return true;
                                    }
                                });
                            }
                        },
                    });
                },
            },
            {
                fieldtype: "Float",
                fieldname: "qty",
                default: 0,
                read_only: 0,
                in_list_view: 1,
                label: __("Qty"),
            },
            {
                fieldtype: "Currency",
                fieldname: "rate",
                options: "currency",
                default: 0,
                read_only: 0,
                in_list_view: 1,
                label: __("Rate"),
            },
        ];

        let dialog = new frappe.ui.Dialog({
            title: __("Update Items"),
            size: "extra-large",
            fields: [
                {
                    fieldname: "trans_items",
                    fieldtype: "Table",
                    label: "Items",
                    in_place_edit: false,
                    reqd: 1,
                    data: current_quotation_item,
                    get_data: () => {
                        return current_quotation_item;
                    },
                    fields: fields,
                },
            ],
            primary_action(values) {
                let updated_quotation_items = values.trans_items || [];
                frappe.confirm('Are you sure you want to update?',
                    () => {
                        frm.call("quotation_update", updated_quotation_items).then(r => {
                            if (r.message == "success") {
                                dialog.hide()
                            }
                        })
                    }, () => {
                        dialog.hide()
                    })
            },
            primary_action_label: __("Update"),
        });
        dialog.show();
    }
})



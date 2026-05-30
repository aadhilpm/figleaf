frappe.pages['order-status'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Order Status',
		single_column: true
	});

	new OrderStatus(page);
}

class OrderStatus {
	constructor(page) {
		this.page = page;
		this.data = [];
		this.selected_order = null;
		this.refresh_interval = null;
		this.make();
		this.setup_filters();
		this.refresh();
		this.start_auto_refresh();
	}

	make() {
		this.page.main.html(`
			<div class="order-status-container">
				<div class="order-status-filters">
					<div class="filter-row"></div>
				</div>
				<div class="order-status-body">
					<div class="order-list-sidebar">
						<div class="sidebar-title">Orders</div>
						<div class="order-list"></div>
					</div>
					<div class="order-cards-area"></div>
				</div>
			</div>
		`);
	}

	setup_filters() {
		let filter_row = this.page.main.find('.filter-row');

		this.filters = {};

		let filter_config = [
			{ fieldname: 'customer', label: __('Customer'), fieldtype: 'Link', options: 'Customer' },
			{ fieldname: 'sales_order', label: __('Sales Order'), fieldtype: 'Link', options: 'Sales Order' },
			{ fieldname: 'from_date', label: __('From Date'), fieldtype: 'Date', default: frappe.datetime.add_months(frappe.datetime.get_today(), -1) },
			{ fieldname: 'to_date', label: __('To Date'), fieldtype: 'Date', default: frappe.datetime.get_today() },
			{ fieldname: 'sales_person', label: __('Sales Person'), fieldtype: 'Link', options: 'Sales Person' },
		];

		filter_config.forEach(f => {
			let wrapper = $(`<div class="filter-field"></div>`).appendTo(filter_row);
			this.filters[f.fieldname] = frappe.ui.form.make_control({
				df: {
					fieldtype: f.fieldtype,
					label: f.label,
					fieldname: f.fieldname,
					options: f.options,
					default: f.default,
					change: () => {
						this.selected_order = null;
						this.refresh();
					}
				},
				parent: wrapper,
				render_input: true
			});
			if (f.default) {
				this.filters[f.fieldname].set_value(f.default);
			}
		});
	}

	get_filter_values() {
		let values = {};
		for (let key in this.filters) {
			let val = this.filters[key].get_value();
			if (val) values[key] = val;
		}
		return values;
	}

	refresh() {
		let filters = this.get_filter_values();

		frappe.call({
			method: 'figleaf.figleaf.page.order_status.order_status.get_order_status',
			args: { filters },
			callback: (r) => {
				this.data = r.message || [];
				this.render_sidebar();
				this.render_cards();
			}
		});
	}

	render_sidebar() {
		let sidebar = this.page.main.find('.order-list');
		sidebar.empty();

		let orders = [];
		let seen = {};
		this.data.forEach(row => {
			if (!seen[row.sales_order]) {
				seen[row.sales_order] = true;
				orders.push({
					name: row.sales_order,
					customer: row.customer_name,
					date: row.transaction_date
				});
			}
		});

		if (orders.length === 0) {
			sidebar.html(`<div class="text-muted text-sm">${__('No orders found')}</div>`);
			return;
		}

		orders.forEach(order => {
			let is_active = this.selected_order === order.name;
			let $item = $(`
				<div class="order-list-item ${is_active ? 'active' : ''}" data-order="${order.name}">
					<div class="order-id">${order.name}</div>
					<div class="order-customer">${order.customer}</div>
				</div>
			`).appendTo(sidebar);

			$item.on('click', () => {
				if (this.selected_order === order.name) {
					this.selected_order = null;
				} else {
					this.selected_order = order.name;
				}
				this.render_sidebar();
				this.render_cards();
			});
		});
	}

	render_cards() {
		let area = this.page.main.find('.order-cards-area');
		area.empty();

		let filtered_data = this.data;
		if (this.selected_order) {
			filtered_data = this.data.filter(r => r.sales_order === this.selected_order);
		}

		if (filtered_data.length === 0) {
			area.html(`
				<div class="order-status-empty">
					<div class="empty-icon">
						<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
						</svg>
					</div>
					<div>${__('No orders to display. Adjust your filters.')}</div>
				</div>
			`);
			return;
		}

		// Group by sales order
		let grouped = {};
		filtered_data.forEach(row => {
			if (!grouped[row.sales_order]) {
				grouped[row.sales_order] = {
					sales_order: row.sales_order,
					customer_name: row.customer_name,
					transaction_date: row.transaction_date,
					po_no: row.po_no,
					grand_total: row.grand_total,
					order_status: row.order_status,
					sales_person: row.sales_person,
					items: []
				};
			}
			grouped[row.sales_order].items.push(row);
		});

		Object.values(grouped).forEach(order => {
			area.append(this.make_order_card(order));
		});
	}

	make_order_card(order) {
		let meta_parts = [];
		if (order.transaction_date) meta_parts.push(frappe.datetime.str_to_user(order.transaction_date));
		if (order.po_no) meta_parts.push(`PO: ${order.po_no}`);
		if (order.sales_person) meta_parts.push(order.sales_person);

		let $card = $(`
			<div class="order-card">
				<div class="order-card-header">
					<div class="order-title">
						<a href="/app/sales-order/${order.sales_order}">${order.sales_order}</a>
						<span style="font-weight:normal; color: var(--text-muted);"> | ${order.customer_name}</span>
					</div>
					<div class="order-meta">
						${meta_parts.map(p => `<span>${p}</span>`).join('')}
					</div>
				</div>
				<div class="order-card-body"></div>
			</div>
		`);

		let $body = $card.find('.order-card-body');

		order.items.forEach(item => {
			$body.append(this.make_line_item(item));
		});

		return $card;
	}

	get_wo_status_indicator(status) {
		let color = {
			'Not Started': 'orange',
			'In Process': 'blue',
			'Completed': 'green',
			'Stopped': 'red',
			'Cancelled': 'red',
		}[status] || 'gray';
		return `<span class="indicator-pill ${color}">${status}</span>`;
	}

	make_line_item(item) {
		let wo_badge = '';
		if (item.work_order) {
			wo_badge = `
				<div class="item-wo-status">
					<a href="/app/work-order/${item.work_order}" class="wo-link">${item.work_order}</a>
					${this.get_wo_status_indicator(item.work_order_status)}
				</div>`;
		}

		let delay_html = '';
		if (item.expected_delivery_date) {
			let delivery_label = `Due: ${frappe.datetime.str_to_user(item.expected_delivery_date)}`;
			if (item.delay_days !== null && item.delay_days !== undefined) {
				if (item.delay_days > 0) {
					delay_html = `<div class="item-delay overdue">${delivery_label} &middot; <strong>${item.delay_days}d overdue</strong></div>`;
				} else if (item.delay_days < 0) {
					delay_html = `<div class="item-delay early">${delivery_label} &middot; ${Math.abs(item.delay_days)}d early</div>`;
				} else {
					delay_html = `<div class="item-delay on-time">${delivery_label} &middot; On time</div>`;
				}
			} else {
				delay_html = `<div class="item-delay">${delivery_label}</div>`;
			}
		}

		let $line = $(`
			<div class="line-item">
				<div class="line-item-header">
					<div class="item-info">
						<span class="item-code">${item.item_code}</span>
						- ${item.item_name}
					</div>
					<div class="item-meta">
						${wo_badge}
						${delay_html}
						<div class="item-qty">Qty: ${item.qty}</div>
					</div>
				</div>
				<div class="progress-tracker-wrapper"></div>
			</div>
		`);

		$line.find('.progress-tracker-wrapper').append(this.make_progress_tracker(item.stages));
		return $line;
	}

	make_progress_tracker(stages) {
		let $tracker = $(`<div class="progress-tracker"></div>`);

		// Find the last completed or in-progress index for the fill line
		let last_active_idx = -1;
		stages.forEach((s, i) => {
			if (s.status === 'completed' || s.status === 'in-progress') {
				last_active_idx = i;
			}
		});

		let total_steps = stages.length;
		let fill_pct = total_steps > 1 ? (last_active_idx / (total_steps - 1)) * 100 : 0;

		$tracker.append(`<div class="progress-tracker-line"></div>`);
		$tracker.append(`<div class="progress-tracker-fill" style="width: calc(${fill_pct}% - ${fill_pct > 0 ? 0 : 0}px)"></div>`);

		stages.forEach(stage => {
			let icon = '';
			if (stage.status === 'completed') {
				icon = '&#10003;';
			} else if (stage.status === 'in-progress') {
				icon = '&#9679;';
			}

			let doc_link = '';
			if (stage.doc && stage.doctype) {
				let docs = stage.doc.split(', ');
				let links = docs.map(d =>
					`<a href="/app/${frappe.router.slug(stage.doctype)}/${d}">${d}</a>`
				);
				doc_link = `<div class="step-doc-link">${links.join(', ')}</div>`;
			}

			let duration_html = '';
			if (stage.duration) {
				let duration_class = stage.status === 'in-progress' ? 'duration-live' : '';
				duration_html = `<div class="step-duration ${duration_class}">${stage.duration}</div>`;
			}

			let date_html = '';
			if (stage.date) {
				date_html = `<div class="step-date">${frappe.datetime.str_to_user(stage.date)}</div>`;
			}

			$tracker.append(`
				<div class="progress-step">
					<div class="step-dot ${stage.status}" title="${stage.label}: ${stage.status}">${icon}</div>
					<div class="step-label ${stage.status}">${stage.label}</div>
					${date_html}
					${duration_html}
					${doc_link}
				</div>
			`);
		});

		return $tracker;
	}

	start_auto_refresh() {
		this.refresh_interval = setInterval(() => this.refresh(), 30000);

		// Clean up on page hide
		$(this.page.wrapper).on('hide', () => {
			if (this.refresh_interval) {
				clearInterval(this.refresh_interval);
			}
		});

		$(this.page.wrapper).on('show', () => {
			this.refresh();
			this.refresh_interval = setInterval(() => this.refresh(), 30000);
		});
	}
}

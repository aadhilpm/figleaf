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
		this.active_stat_filter = null;
		this.refresh_interval = null;
		this.make();
		this.setup_filters().then(() => {
			this.refresh();
			this.start_auto_refresh();
		});
	}

	make() {
		this.page.main.html(`
			<div class="order-status-container">
				<div class="order-status-filters">
					<div class="filter-row"></div>
				</div>
				<div class="order-status-summary"></div>
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

	async setup_filters() {
		let filter_row = this.page.main.find('.filter-row');

		this.filters = {};

		let filter_config = [
			{ fieldname: 'customer', label: __('Customer'), fieldtype: 'Link', options: 'Customer' },
			{ fieldname: 'sales_order', label: __('Sales Order'), fieldtype: 'Link', options: 'Sales Order' },
			{ fieldname: 'from_date', label: __('From Date'), fieldtype: 'Date', default: frappe.datetime.add_months(frappe.datetime.get_today(), -1) },
			{ fieldname: 'to_date', label: __('To Date'), fieldtype: 'Date', default: frappe.datetime.get_today() },
			{ fieldname: 'sales_person', label: __('Sales Person'), fieldtype: 'Link', options: 'Sales Person' },
			{ fieldname: 'billing_status', label: __('Billing Status'), fieldtype: 'Select', options: '\nNot Billed\nBilled', default: 'Not Billed' },
		];

		// Check user permission for Sales Person
		let user_sales_person = frappe.defaults.get_user_permissions()['Sales Person'];
		if (user_sales_person && user_sales_person.length) {
			let sp = user_sales_person[0].doc;
			let sp_config = filter_config.find(f => f.fieldname === 'sales_person');
			sp_config.default = sp;
			sp_config.read_only = 1;
		}

		filter_config.forEach(f => {
			let wrapper = $(`<div class="filter-field"></div>`).appendTo(filter_row);
			this.filters[f.fieldname] = frappe.ui.form.make_control({
				df: {
					fieldtype: f.fieldtype,
					label: f.label,
					fieldname: f.fieldname,
					options: f.options,
					default: f.default,
					read_only: f.read_only || 0,
					change: () => {
						this.selected_order = null;
						this.refresh();
					}
				},
				parent: wrapper,
				render_input: true
			});
		});

		// Set defaults before first refresh
		for (let f of filter_config) {
			if (f.default) {
				await this.filters[f.fieldname].set_value(f.default);
			}
		}
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
				this.render_summary();
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
				this.active_stat_filter = null;
				this.render_summary();
				this.render_sidebar();
				this.render_cards();
			});
		});
	}

	render_summary() {
		let $summary = this.page.main.find('.order-status-summary');
		$summary.empty();

		let data = this.data;
		if (!data.length) return;

		// Key numbers
		let unique_orders = new Set(data.map(r => r.sales_order)).size;
		let total_items = data.length;
		let total_qty = data.reduce((s, r) => s + (r.qty || 0), 0);
		let delivered_items = data.filter(r => r.is_delivered).length;
		let billed_items = data.filter(r => r.is_billed).length;
		let overdue_items = data.filter(r => r.delay_days > 0 && !r.is_delivered);
		let overdue_count = overdue_items.length;

		let delays = data.filter(r => r.delay_days !== null && r.delay_days !== undefined && !r.is_delivered && r.delay_days > 0);
		let avg_delay = delays.length ? (delays.reduce((s, r) => s + r.delay_days, 0) / delays.length).toFixed(1) : 0;

		let on_time_delivered = data.filter(r => r.is_delivered && r.delay_days !== null && r.delay_days <= 0).length;
		let total_delivered = delivered_items;
		let on_time_pct = total_delivered > 0 ? Math.round((on_time_delivered / total_delivered) * 100) : '-';

		// In production
		let in_production = data.filter(r => r.work_order && r.work_order_status !== 'Completed').length;

		// Stage pipeline counts
		let stage_counts = {};
		data.forEach(row => {
			if (!row.stages) return;
			row.stages.forEach(stage => {
				if (stage.label === 'Ordered' || stage.label === 'Delivered' || stage.label === 'Billed') return;
				if (!stage_counts[stage.label]) {
					stage_counts[stage.label] = { in_progress: 0, completed: 0, pending: 0 };
				}
				stage_counts[stage.label][stage.status === 'in-progress' ? 'in_progress' : stage.status]++;
			});
		});

		// Row 1: Key numbers
		let row1_cards = [
			{ key: 'total_orders', label: 'Total Orders', value: unique_orders, color: 'blue' },
			{ key: 'total_items', label: 'Total Items', value: total_items, sub: `Qty: ${total_qty}`, color: 'blue' },
			{ key: 'in_production', label: 'In Production', value: in_production, color: 'orange' },
			{ key: 'delivered', label: 'Delivered', value: `${delivered_items} / ${total_items}`, color: 'green' },
			{ key: 'billed', label: 'Billed', value: `${billed_items} / ${total_items}`, color: 'purple' },
			{ key: 'overdue', label: 'Overdue', value: overdue_count, color: overdue_count > 0 ? 'red' : 'green' },
			{ key: 'avg_delay', label: 'Avg Delay', value: avg_delay > 0 ? `${avg_delay}d` : '-', color: avg_delay > 0 ? 'red' : 'green' },
			{ key: 'on_time', label: 'On Time %', value: on_time_pct === '-' ? '-' : `${on_time_pct}%`, color: 'green' },
		];

		let row1_html = '<div class="summary-row">';
		row1_cards.forEach(card => {
			let active = this.active_stat_filter === card.key ? 'active' : '';
			let clickable = ['in_production', 'delivered', 'billed', 'overdue'].includes(card.key) ? 'clickable' : '';
			row1_html += `
				<div class="summary-card ${card.color} ${active} ${clickable}" data-stat="${card.key}">
					<div class="summary-value">${card.value}</div>
					<div class="summary-label">${card.label}</div>
					${card.sub ? `<div class="summary-sub">${card.sub}</div>` : ''}
				</div>`;
		});
		row1_html += '</div>';

		// Row 2: Pipeline stage counts
		let stage_names = Object.keys(stage_counts);
		let row2_html = '';
		if (stage_names.length) {
			row2_html = '<div class="summary-row pipeline-row">';
			stage_names.forEach(name => {
				let c = stage_counts[name];
				let active = this.active_stat_filter === `stage:${name}` ? 'active' : '';
				row2_html += `
					<div class="summary-card pipeline-card clickable ${active}" data-stat="stage:${name}">
						<div class="summary-label">${name}</div>
						<div class="pipeline-counts">
							${c.in_progress > 0 ? `<span class="pipeline-badge orange">${c.in_progress} active</span>` : ''}
							${c.completed > 0 ? `<span class="pipeline-badge green">${c.completed} done</span>` : ''}
							${c.pending > 0 ? `<span class="pipeline-badge gray">${c.pending} pending</span>` : ''}
						</div>
					</div>`;
			});
			row2_html += '</div>';
		}

		$summary.html(row1_html + row2_html);

		// Click handlers for stat cards
		$summary.find('.summary-card.clickable').on('click', (e) => {
			let key = $(e.currentTarget).data('stat');
			if (this.active_stat_filter === key) {
				this.active_stat_filter = null;
			} else {
				this.active_stat_filter = key;
			}
			this.selected_order = null;
			this.render_summary();
			this.render_sidebar();
			this.render_cards();
		});
	}

	get_filtered_data() {
		let data = this.data;

		if (this.selected_order) {
			data = data.filter(r => r.sales_order === this.selected_order);
		}

		if (this.active_stat_filter) {
			let f = this.active_stat_filter;
			if (f === 'in_production') {
				data = data.filter(r => r.work_order && r.work_order_status !== 'Completed');
			} else if (f === 'delivered') {
				data = data.filter(r => r.is_delivered);
			} else if (f === 'billed') {
				data = data.filter(r => r.is_billed);
			} else if (f === 'overdue') {
				data = data.filter(r => r.delay_days > 0 && !r.is_delivered);
			} else if (f.startsWith('stage:')) {
				let stage_name = f.replace('stage:', '');
				data = data.filter(r => {
					if (!r.stages) return false;
					return r.stages.some(s => s.label === stage_name && s.status === 'in-progress');
				});
			}
		}

		return data;
	}

	render_cards() {
		let area = this.page.main.find('.order-cards-area');
		area.empty();

		let filtered_data = this.get_filtered_data();

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

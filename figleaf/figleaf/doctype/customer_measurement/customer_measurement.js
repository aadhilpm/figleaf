// Copyright (c) 2026, Badeel Technology and contributors
// For license information, please see license.txt

const CM_METHOD = "figleaf.figleaf.doctype.customer_measurement.customer_measurement";

frappe.ui.form.on("Customer Measurement", {
	setup(frm) {
		frm.set_query("sales_order", () => ({
			filters: Object.assign({ docstatus: ["<", 2] }, frm.doc.customer ? { customer: frm.doc.customer } : {}),
		}));
		frm.set_query("garments", () => ({ filters: { disabled: 0 } }));
		frm.set_query("assignment", () => ({ filters: { status: ["in", ["Open", "In Progress"]] } }));
		frm.cm = { garments: {}, active_garment: null, active_measure: null };
	},

	onload(frm) {
		frappe.require("/assets/figleaf/js/garment_diagram.js");
		load_config(frm).then(() => {
			const st = frm.cm.config.settings || {};
			if (frm.is_new() && !frm.doc.unit && st.default_unit) frm.set_value("unit", st.default_unit);
			frm.toggle_enable("unit", !!st.allow_unit_change);
			frm.toggle_reqd("employee_code", !!st.require_staff_id);
			render_panel(frm);
		});
	},

	refresh(frm) {
		frm.cm = frm.cm || { garments: {} };
		frm.toggle_enable(["customer", "sales_order", "quotation"], !frm.doc.assignment);
		if (!frm.doc.customer && frm.doc.party_name && !frm.is_new()) {
			frm.dashboard.set_headline(
				__("Walk-in / lead: {0}. Link the Customer when it is created.", [frappe.utils.escape_html(frm.doc.party_name)]),
				"orange"
			);
		}
		load_garments(frm).then(() => render_panel(frm));

		if (frm.doc.assignment) {
			frm.add_custom_button(__("Pick Person"), () => pick_person(frm));
		}
		if (frm.doc.customer) {
			frm.add_custom_button(__("Copy Previous"), () => copy_previous(frm), __("Actions"));
		}
		if (!frm.is_new()) {
			frm.add_custom_button(__("Save & Next Person"), () => next_person(frm));
			frm.add_custom_button(
				__("Measurement Sheet"),
				() =>
					frappe.set_route("query-report", "Measurement Sheet", {
						customer: frm.doc.customer,
						sales_order: frm.doc.sales_order || undefined,
						garment: (frm.doc.garments[0] || {}).garment,
					}),
				__("Actions")
			);
		} else {
			frm.add_custom_button(__("Save & Next Person"), () =>
				frm.save().then(() => next_person(frm))
			);
		}
	},

	assignment(frm) {
		frm.doc.assignment_person = "";
		if (!frm.doc.assignment) return;
		frappe.call(`${CM_METHOD}.get_assignment_info`, { assignment: frm.doc.assignment }).then((r) => {
			const a = r.message;
			if (!a) return;
			frm.cm.assignment = a;
			// set directly: tailors cannot read Customer / Sales Order, the server re-checks on save
			Object.assign(frm.doc, {
				customer: a.customer || "",
				customer_name: a.customer ? a.party_name : "",
				party_name: a.customer ? "" : a.party_name,
				sales_order: a.sales_order || "",
				quotation: a.quotation || "",
			});
			frm.refresh_fields();
			frm.dirty();
			if (!(frm.doc.garments || []).length && a.garments.length) {
				frm.set_value("garments", a.garments.map((g) => ({ garment: g }))).then(() => sync_rows(frm));
			}
			frm.refresh();
			if (frm.is_new() && !frm.doc.person_name && a.people.some((p) => p.status !== "Measured")) {
				pick_person(frm, a);
			}
		});
	},

	person_name(frm) {
		// typed a different name after picking: no longer that person on the list
		const a = frm.cm.assignment;
		const row = a && frm.doc.assignment_person && (a.people || []).find((p) => p.row === frm.doc.assignment_person);
		if (row && row.person_name !== frm.doc.person_name) frm.doc.assignment_person = "";
	},

	customer(frm) {
		if (frm.doc.sales_order && frm.cm.so_customer && frm.cm.so_customer !== frm.doc.customer) {
			frm.set_value("sales_order", "");
		}
	},

	sales_order(frm) {
		if (!frm.doc.sales_order) {
			frm.cm.so_customer = null;
			return;
		}
		frappe.call(`${CM_METHOD}.get_sales_order_info`, { sales_order: frm.doc.sales_order }).then((r) => {
			const so = r.message;
			if (!so) return;
			frm.cm.so_customer = so.customer;
			if (frm.doc.customer !== so.customer) frm.set_value("customer", so.customer);
			if (!frm.doc.ref_no || frm.doc.ref_no === frm.doc.sales_order) {
				frm.set_value("ref_no", so.po_no || frm.doc.sales_order);
			}
			if (!(frm.doc.garments || []).length && (so.garments || []).length) {
				frm.set_value("garments", so.garments.map((g) => ({ garment: g }))).then(() => sync_rows(frm));
			}
		});
	},

	garments(frm) {
		sync_rows(frm);
	},

	unit(frm) {
		render_panel(frm);
	},
});

frappe.ui.form.on("Customer Measurement Garment", {
	garment(frm) {
		sync_rows(frm);
	},
});

frappe.ui.form.on("Customer Measurement Value", {
	value(frm) {
		update_inputs_from_doc(frm);
	},
});

// ------------------------------------------------------------------ data

function load_config(frm) {
	if (frm.cm.config) return Promise.resolve(frm.cm.config);
	return frappe.call(`${CM_METHOD}.get_entry_config`).then((r) => (frm.cm.config = r.message || { units: [], settings: {} }));
}

function unit_symbol(frm) {
	const u = ((frm.cm.config || {}).units || []).find((x) => x.name === frm.doc.unit);
	return u ? u.symbol : frm.doc.unit || "";
}

function selected_garments(frm) {
	return (frm.doc.garments || []).map((g) => g.garment).filter(Boolean);
}

function load_garments(frm) {
	const need = selected_garments(frm).filter((g) => !frm.cm.garments[g]);
	if (!need.length) return Promise.resolve();
	return frappe.call(`${CM_METHOD}.get_garment_details`, { garments: need }).then((r) => {
		Object.assign(frm.cm.garments, r.message || {});
	});
}

function sync_rows(frm) {
	load_garments(frm).then(() => {
		const garments = selected_garments(frm);
		const existing = {};
		(frm.doc.measurement_values || []).forEach((r) => (existing[`${r.garment}::${r.measurement_type}`] = r));

		const rows = [];
		garments.forEach((g) => {
			const tpl = (frm.cm.garments[g] || {}).measurements || [];
			tpl.forEach((m) => {
				const old = existing[`${g}::${m}`];
				rows.push({ garment: g, measurement_type: m, value: old ? old.value : "", notes: old ? old.notes : "" });
			});
		});
		frm.clear_table("measurement_values");
		rows.forEach((r) => frm.add_child("measurement_values", r));
		frm.refresh_field("measurement_values");
		if (!garments.includes(frm.cm.active_garment)) frm.cm.active_garment = garments[0] || null;
		// a new record takes the first garment's template unit
		const tu = garments.length && (frm.cm.garments[garments[0]] || {}).default_unit;
		if (frm.is_new() && tu && frm.doc.unit !== tu && (rows.every((r) => !r.value))) frm.set_value("unit", tu);
		render_panel(frm);
	});
}

function value_row(frm, garment, measure) {
	return (frm.doc.measurement_values || []).find((r) => r.garment === garment && r.measurement_type === measure);
}

// ------------------------------------------------------------------ panel

function render_panel(frm) {
	const field = frm.get_field("entry_html");
	if (!field) return;
	const $w = $(field.wrapper).empty();
	const garments = selected_garments(frm);

	if (!garments.length) {
		$w.html(`<div class="text-muted small" style="padding:12px 0">${__(
			"Select garments above to start entering measurements."
		)}</div>`);
		return;
	}
	if (garments.some((x) => !frm.cm.garments[x])) {
		load_garments(frm).then(() => render_panel(frm));
		return;
	}
	ensure_rows(frm, garments);
	if (!garments.includes(frm.cm.active_garment)) frm.cm.active_garment = garments[0];
	const g = frm.cm.active_garment;
	const info = frm.cm.garments[g];
	if (!info) return;

	const tabs = garments
		.map((name) => {
			const done = ((frm.cm.garments[name] || {}).measurements || []).filter(
				(m) => (value_row(frm, name, m) || {}).value
			).length;
			const total = ((frm.cm.garments[name] || {}).measurements || []).length;
			return `<button type="button" class="btn btn-sm ${
				name === g ? "btn-primary" : "btn-default"
			} cm-tab" data-garment="${frappe.utils.escape_html(name)}">${frappe.utils.escape_html(
				name
			)} <span class="${name === g ? "" : "text-muted"}" style="margin-left:4px">${done}/${total}</span></button>`;
		})
		.join(" ");

	const unit = unit_symbol(frm);
	const inputs = info.measurements
		.map((m, i) => {
			const row = value_row(frm, g, m) || {};
			return `<div class="cm-row" data-measure="${frappe.utils.escape_html(m)}">
				<span class="cm-num">${i + 1}</span>
				<label class="cm-label">${frappe.utils.escape_html(__(m))}</label>
				<div class="cm-input-wrap">
					<input class="form-control cm-value" inputmode="decimal" autocomplete="off"
						value="${frappe.utils.escape_html(row.value || "")}">
					<span class="cm-unit">${unit}</span>
				</div>
				<input class="form-control cm-notes" placeholder="${__("Notes")}" autocomplete="off"
					value="${frappe.utils.escape_html(row.notes || "")}">
			</div>`;
		})
		.join("");

	$w.html(`
		<style>
			.cm-panel { display:grid; grid-template-columns: minmax(180px, 260px) 1fr; gap:24px; margin-top:12px; }
			@media (max-width: 767px) { .cm-panel { grid-template-columns: 1fr; } .cm-diagram { max-width:220px; margin:0 auto; } }
			.cm-diagram { color: var(--text-color); position: sticky; top: 80px; align-self:start; }
			.cm-diagram img { width:100%; border-radius: var(--border-radius); }
			.cm-row { display:grid; grid-template-columns: 28px 1fr 130px 1fr; gap:10px; align-items:center;
				padding:6px 8px; border-radius: var(--border-radius); }
			.cm-row.active { background: var(--bg-orange, #fff7ed); }
			.cm-num { width:24px; height:24px; border-radius:50%; background: var(--control-bg); display:flex;
				align-items:center; justify-content:center; font-size:12px; font-weight:700; }
			.cm-row.active .cm-num { background:#d97706; color:#fff; }
			.cm-label { margin:0; font-weight:600; }
			.cm-input-wrap { position:relative; }
			.cm-value { font-size:18px; font-weight:600; text-align:right; padding-right:34px; height:40px; }
			.cm-unit { position:absolute; right:10px; top:50%; transform:translateY(-50%); color:var(--text-muted); font-size:12px; }
			.cm-tabs { display:flex; flex-wrap:wrap; gap:6px; }
			@media (max-width: 575px) { .cm-row { grid-template-columns: 28px 1fr 110px; } .cm-notes { grid-column: 2 / -1; } }
		</style>
		<div class="cm-tabs">${tabs}</div>
		<div class="cm-panel">
			<div class="cm-diagram"></div>
			<div class="cm-inputs">${inputs}</div>
		</div>`);

	draw_diagram(frm, $w);

	$w.find(".cm-tab").on("click", (e) => {
		frm.cm.active_garment = $(e.currentTarget).attr("data-garment");
		frm.cm.active_measure = null;
		render_panel(frm);
	});

	const $rows = $w.find(".cm-row");
	$rows.each((i, el) => {
		const $row = $(el);
		const m = $row.attr("data-measure");
		$row.find("input").on("focus", (e) => {
			set_active(frm, $w, m);
			if ($(e.target).hasClass("cm-value")) setTimeout(() => e.target.select(), 0);
		});
		$row.find(".cm-value").on("change", (e) => set_row(frm, g, m, "value", e.target.value));
		$row.find(".cm-notes").on("change", (e) => set_row(frm, g, m, "notes", e.target.value));
		$row.find(".cm-value").on("keydown", (e) => {
			if (e.key !== "Enter") return;
			e.preventDefault();
			const $next = $rows.eq(i + 1).find(".cm-value");
			if ($next.length) $next.trigger("focus");
			else $(e.target).trigger("blur");
		});
	});

	if (frm.cm.active_measure) {
		$rows.filter((i, el) => $(el).attr("data-measure") === frm.cm.active_measure).addClass("active");
	}
}

function draw_diagram(frm, $w) {
	const g = frm.cm.active_garment;
	const info = frm.cm.garments[g];
	const $d = $w.find(".cm-diagram");
	if (info.diagram_image) {
		$d.html(`<img src="${encodeURI(info.diagram_image)}" alt="${frappe.utils.escape_html(g)}">`);
		return;
	}
	if (!window.GarmentDiagram) {
		frappe.require("/assets/figleaf/js/garment_diagram.js", () => draw_diagram(frm, $w));
		return;
	}
	$d.html(window.GarmentDiagram.render(info.diagram, info.measurements, frm.cm.active_measure));
	$d.find("[data-measurement]").on("click", (e) => {
		const m = $(e.currentTarget).attr("data-measurement");
		$w.find(".cm-row")
			.filter((i, el) => $(el).attr("data-measure") === m)
			.find(".cm-value")
			.trigger("focus");
	});
}

function set_active(frm, $w, m) {
	frm.cm.active_measure = m;
	$w.find(".cm-row").removeClass("active");
	$w.find(".cm-row").filter((i, el) => $(el).attr("data-measure") === m).addClass("active");
	draw_diagram(frm, $w);
}

function set_row(frm, garment, measure, field, val) {
	const row = value_row(frm, garment, measure);
	if (!row) return;
	frm.cm.skip_redraw = true;
	frappe.model.set_value(row.doctype, row.name, field, (val || "").trim()).then(() => {
		frm.cm.skip_redraw = false;
		update_tab_counts(frm);
	});
}

function update_tab_counts(frm) {
	const $w = $(frm.get_field("entry_html").wrapper);
	$w.find(".cm-tab").each((i, el) => {
		const name = $(el).attr("data-garment");
		const ms = (frm.cm.garments[name] || {}).measurements || [];
		const done = ms.filter((m) => (value_row(frm, name, m) || {}).value).length;
		$(el).find("span").text(`${done}/${ms.length}`);
	});
}

function update_inputs_from_doc(frm) {
	if (frm.cm.skip_redraw) return;
	render_panel(frm);
}

// ------------------------------------------------------------------ actions

function copy_previous(frm) {
	if (!frm.doc.person_name && !frm.doc.employee_code) {
		frappe.msgprint(__("Enter the person's name or staff ID first."));
		return;
	}
	frappe
		.call(`${CM_METHOD}.get_previous_measurement`, {
			customer: frm.doc.customer,
			person_name: frm.doc.person_name,
			employee_code: frm.doc.employee_code,
			exclude: frm.is_new() ? null : frm.doc.name,
		})
		.then((r) => {
			const prev = r.message;
			if (!prev) {
				frappe.show_alert({ message: __("No previous measurement found"), indicator: "orange" });
				return;
			}
			const garments = new Set(selected_garments(frm));
			let copied = 0;
			const add = [];
			prev.values.forEach((v) => {
				if (!garments.has(v.garment) && !add.includes(v.garment)) add.push(v.garment);
			});
			add.forEach((g) => frm.add_child("garments", { garment: g }));
			frm.refresh_field("garments");
			load_garments(frm).then(() => {
				sync_rows_now(frm);
				prev.values.forEach((v) => {
					const row = value_row(frm, v.garment, v.measurement_type);
					if (row && v.value) {
						row.value = v.value;
						row.notes = v.notes;
						copied++;
					}
				});
				if (prev.unit) frm.doc.unit = prev.unit;
				frm.refresh_field("measurement_values");
				frm.dirty();
				render_panel(frm);
				frappe.show_alert({
					message: __("Copied {0} values from {1} ({2})", [
						copied,
						prev.name,
						frappe.datetime.str_to_user(prev.measurement_date),
					]),
					indicator: "green",
				});
			});
		});
}

function ensure_rows(frm, garments) {
	const expected = [];
	garments.forEach((g) => ((frm.cm.garments[g] || {}).measurements || []).forEach((m) => expected.push(`${g}::${m}`)));
	const have = (frm.doc.measurement_values || []).map((r) => `${r.garment}::${r.measurement_type}`);
	const missing = expected.some((k) => !have.includes(k));
	const stale = have.some((k) => !garments.includes(k.split("::")[0]));
	if (missing || stale) {
		sync_rows_now(frm);
		frm.refresh_field("measurement_values");
	}
}

function sync_rows_now(frm) {
	const existing = {};
	(frm.doc.measurement_values || []).forEach((r) => (existing[`${r.garment}::${r.measurement_type}`] = r));
	const rows = [];
	selected_garments(frm).forEach((g) => {
		((frm.cm.garments[g] || {}).measurements || []).forEach((m) => {
			const old = existing[`${g}::${m}`];
			rows.push({ garment: g, measurement_type: m, value: old ? old.value : "", notes: old ? old.notes : "" });
		});
	});
	frm.clear_table("measurement_values");
	rows.forEach((r) => frm.add_child("measurement_values", r));
}

function next_person(frm) {
	const keep = {
		assignment: frm.doc.assignment,
		party_name: frm.doc.party_name,
		quotation: frm.doc.quotation,
		customer: frm.doc.customer,
		sales_order: frm.doc.sales_order,
		ref_no: frm.doc.ref_no,
		unit: frm.doc.unit,
		measurement_date: frm.doc.measurement_date,
		garments: selected_garments(frm),
	};
	frappe.model.with_doctype("Customer Measurement", () => {
		const doc = frappe.model.get_new_doc("Customer Measurement");
		Object.assign(doc, {
			assignment: keep.assignment,
			party_name: keep.party_name,
			quotation: keep.quotation,
			customer: keep.customer,
			sales_order: keep.sales_order,
			ref_no: keep.ref_no,
			unit: keep.unit,
			measurement_date: keep.measurement_date,
		});
		keep.garments.forEach((g) => {
			const c = frappe.model.add_child(doc, "garments");
			c.garment = g;
		});
		frappe.set_route("Form", "Customer Measurement", doc.name).then(() => {
			const f = cur_frm;
			if (f && f.doc.name === doc.name) {
				sync_rows(f);
				if (f.doc.assignment) {
					pick_person(f, null, true);
				} else {
					setTimeout(() => f.get_field("person_name").$input && f.get_field("person_name").$input.focus(), 300);
				}
			}
		});
	});
}

// People listed on the assignment: pick one to fill name, staff ID, designation, gender and garments.
function pick_person(frm, info, quiet) {
	const load = info
		? Promise.resolve(info)
		: frappe
				.call(`${CM_METHOD}.get_assignment_info`, { assignment: frm.doc.assignment })
				.then((r) => r.message);
	load.then((a) => {
		if (!a) return;
		frm.cm.assignment = a;
		const pending = (a.people || []).filter((p) => p.status !== "Measured");
		if (!pending.length) {
			if (!quiet) {
				frappe.msgprint(
					(a.people || []).length
						? __("Everyone on this assignment's list is measured. Type the name to add someone else.")
						: __("This assignment has no list of people. Type the person's name.")
				);
			}
			const inp = frm.get_field("person_name").$input;
			if (inp) setTimeout(() => inp.focus(), 300);
			return;
		}
		const label = (p) =>
			[p.person_name, p.employee_code, p.designation].filter(Boolean).join(" · ");
		const d = new frappe.ui.Dialog({
			title: __("Pick Person ({0} still to measure)", [pending.length]),
			fields: [
				{
					fieldname: "person",
					fieldtype: "Autocomplete",
					label: __("Person"),
					reqd: 1,
					options: pending.map((p) => ({ label: label(p), value: p.row })),
				},
			],
			primary_action_label: __("Select"),
			primary_action(v) {
				const p = pending.find((x) => x.row === v.person);
				if (!p) return;
				d.hide();
				frm.doc.assignment_person = p.row;
				frm.set_value({
					person_name: p.person_name,
					employee_code: p.employee_code || "",
					designation: p.designation || "",
					gender: p.gender || frm.doc.gender || "",
				});
				if (p.garments.length) {
					frm.set_value("garments", p.garments.map((g) => ({ garment: g }))).then(() => sync_rows(frm));
				}
			},
			secondary_action_label: __("Someone Not on the List"),
			secondary_action() {
				d.hide();
				frm.doc.assignment_person = "";
				const inp = frm.get_field("person_name").$input;
				if (inp) setTimeout(() => inp.focus(), 300);
			},
		});
		d.show();
	});
}

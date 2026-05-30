frappe.ui.form.on("Work Order", {
	refresh(frm) {
		if (frm.doc.docstatus !== 1) return;

		frappe.call({
			method: "figleaf.figleaf.doctype.production_stage.production_stage.get_stage_status",
			args: { work_order: frm.doc.name },
			callback(r) {
				let stages = r.message || [];
				render_stage_buttons(frm, stages);
				render_stage_timeline(frm, stages);
			}
		});
	}
});

function render_stage_buttons(frm, stages) {
	let in_progress = stages.filter(s => s.status === "Progress");

	// Always show "Start Stage" button to pick any stage
	frm.add_custom_button(__("Start Stage"), () => {
		let d = new frappe.ui.Dialog({
			title: __("Start Production Stage"),
			fields: [
				{
					fieldname: "stage",
					fieldtype: "Link",
					label: __("Stage"),
					options: "Stage",
					reqd: 1
				}
			],
			primary_action_label: __("Start"),
			primary_action(values) {
				frappe.call({
					method: "figleaf.figleaf.doctype.production_stage.production_stage.start_stage",
					args: {
						work_order: frm.doc.name,
						stage: values.stage
					},
					callback() {
						d.hide();
						frm.reload_doc();
					}
				});
			}
		});
		d.show();
	}, __("Production"));

	// Show "Complete" button for each in-progress stage
	in_progress.forEach(stage => {
		frm.add_custom_button(
			__("Complete: {0}", [stage.stage]),
			() => {
				frappe.confirm(
					__("Complete stage <b>{0}</b>?", [stage.stage]),
					() => {
						frappe.call({
							method: "figleaf.figleaf.doctype.production_stage.production_stage.complete_stage",
							args: {
								work_order: frm.doc.name,
								stage_name: stage.name
							},
							callback() {
								frm.reload_doc();
							}
						});
					}
				);
			},
			__("Production")
		);
	});
}

function render_stage_timeline(frm, stages) {
	if (stages.length === 0) return;

	let html = `<div class="production-stage-tracker">`;

	stages.forEach(stage => {
		let status_class = stage.status === "Completed" ? "completed"
			: stage.status === "Progress" ? "in-progress"
			: "pending";

		let icon = stage.status === "Completed" ? "&#10003;"
			: stage.status === "Progress" ? "&#9679;"
			: "";

		let duration = "";
		if (stage.start_time) {
			let start = moment(stage.start_time);
			let end = stage.end_time ? moment(stage.end_time) : moment();
			duration = format_duration(end.diff(start, "seconds"));
		}

		let label = stage.stage;

		html += `
			<div class="stage-item">
				<div class="stage-dot ${status_class}">${icon}</div>
				<div class="stage-details">
					<div class="stage-name ${status_class}">${label}</div>
					${duration ? `<div class="stage-duration ${status_class}">${duration}</div>` : ""}
				</div>
			</div>
		`;
	});

	html += `</div>`;

	// Add CSS inline for the Work Order form widget
	let css = `
		<style>
			.production-stage-tracker {
				display: flex;
				gap: 8px;
				padding: 10px 0;
				flex-wrap: wrap;
			}
			.stage-item {
				display: flex;
				align-items: center;
				gap: 8px;
				padding: 6px 12px;
				border: 1px solid var(--border-color);
				border-radius: var(--border-radius);
				background: var(--card-bg);
				min-width: 0;
			}
			.stage-item .stage-dot {
				width: 22px;
				height: 22px;
				min-width: 22px;
				border-radius: 50%;
				border: 2px solid var(--border-color);
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 11px;
			}
			.stage-dot.completed {
				background: var(--green-500, #28a745);
				border-color: var(--green-500, #28a745);
				color: white;
			}
			.stage-dot.in-progress {
				background: var(--orange-500, #fd7e14);
				border-color: var(--orange-500, #fd7e14);
				color: white;
				animation: wo-pulse 2s infinite;
			}
			@keyframes wo-pulse {
				0% { box-shadow: 0 0 0 0 rgba(253, 126, 20, 0.4); }
				70% { box-shadow: 0 0 0 6px rgba(253, 126, 20, 0); }
				100% { box-shadow: 0 0 0 0 rgba(253, 126, 20, 0); }
			}
			.stage-details .stage-name {
				font-size: var(--text-sm);
				font-weight: 600;
				color: var(--text-muted);
			}
			.stage-name.completed { color: var(--green-500, #28a745); }
			.stage-name.in-progress { color: var(--orange-500, #fd7e14); }
			.stage-details .stage-duration {
				font-size: var(--text-xs);
				color: var(--text-muted);
			}
			.stage-duration.in-progress { color: var(--orange-500, #fd7e14); }
		</style>
	`;

	frm.set_df_property("custom_stage", "description", css + html);
}

function format_duration(seconds) {
	seconds = Math.abs(Math.floor(seconds));
	let days = Math.floor(seconds / 86400);
	let hours = Math.floor((seconds % 86400) / 3600);
	let minutes = Math.floor((seconds % 3600) / 60);

	let parts = [];
	if (days > 0) parts.push(days + "d");
	if (hours > 0) parts.push(hours + "h");
	if (minutes > 0 || parts.length === 0) parts.push(minutes + "m");
	return parts.join(" ");
}

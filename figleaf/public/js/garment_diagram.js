/*
 * Garment Diagram
 * Draws a simple garment outline as SVG with a guide line for each measurement,
 * numbered in template order. The active measurement is highlighted.
 *
 * Shared by the ERPNext form (window.GarmentDiagram) and the mobile app.
 * Keep this file dependency free and plain ES2017.
 *
 *   GarmentDiagram.render("Top", ["Length", "Shoulder", ...], "Chest", {accent: "#d97706"})
 */
(function (root) {
	"use strict";

	var ALIASES = { biceps: "bicep", hips: "hip", "arm hole": "armhole", "sleeve length": "sleeve" };

	function key(name) {
		var k = String(name || "").trim().toLowerCase();
		return ALIASES[k] || k;
	}

	// ---------------------------------------------------------------- shapes
	function topOutline(o) {
		var hem = o.hem, sl = o.sleeves, v = o.vneck;
		var neck = v
			? "M128 52 L150 118 L172 52"
			: "M128 52 Q150 70 172 52";
		var p = [];
		// collar / neckline
		p.push(neck);
		if (!v) p.push("M128 52 Q150 40 172 52", "M128 52 L138 66 L150 62 L162 66 L172 52");
		// shoulders
		p.push("M128 52 L92 64", "M172 52 L208 64");
		if (sl) {
			p.push(
				"M92 64 L48 220 L72 226 L100 122",
				"M208 64 L252 220 L228 226 L200 122",
				"M51 209 L75 215", "M249 209 L225 215"
			);
		} else {
			p.push("M92 64 Q104 96 101 128", "M208 64 Q196 96 199 128");
		}
		var under = sl ? 122 : 128;
		var flare = o.flare || 0;
		p.push(
			"M" + (sl ? 100 : 101) + " " + under + " L" + (102 - flare) + " " + hem,
			"M" + (sl ? 200 : 199) + " " + under + " L" + (198 + flare) + " " + hem,
			"M" + (102 - flare) + " " + hem + " Q150 " + (hem + 8) + " " + (198 + flare) + " " + hem
		);
		// placket + buttons
		var top = v ? 118 : 62;
		p.push("M150 " + top + " L150 " + (hem + 4));
		return p;
	}

	function bottomOutline(o) {
		var w = o.waist, crotch = o.crotch, hem = 345;
		return [
			"M95 " + w + " L205 " + w,
			"M95 " + (w + 12) + " L205 " + (w + 12),
			"M95 " + w + " L88 " + (w + 80) + " L92 " + hem + " L140 " + hem + " L150 " + crotch +
				" L160 " + hem + " L208 " + hem + " L212 " + (w + 80) + " L205 " + w,
			"M150 " + (w + 12) + " L150 " + (crotch - 20),
			o.pockets ? "M96 " + (w + 140) + " L128 " + (w + 140) + " L128 " + (w + 180) + " L96 " + (w + 180) + " Z" : "",
			o.pockets ? "M204 " + (w + 140) + " L172 " + (w + 140) + " L172 " + (w + 180) + " L204 " + (w + 180) + " Z" : "",
		].filter(Boolean);
	}

	function fullOutline() {
		return [
			"M128 52 Q150 70 172 52", "M128 52 Q150 40 172 52",
			"M128 52 L92 64", "M172 52 L208 64",
			"M92 64 L48 220 L72 226 L100 122",
			"M208 64 L252 220 L228 226 L200 122",
			"M51 209 L75 215", "M249 209 L225 215",
			"M100 122 L100 180 L96 345 L142 345 L150 215 L158 345 L204 345 L200 180 L200 122",
			"M100 180 L200 180",
			"M150 62 L150 200",
		];
	}

	// ---------------------------------------------------------------- guides
	// Each guide: [x1, y1, x2, y2] line, or {d: path}; label at [lx, ly]
	function topGuides(o) {
		var hem = o.hem, sl = o.sleeves, f = o.flare || 0;
		var g = {
			length: { line: [182, 54, 182, hem + 2], label: [192, (54 + hem) / 2] },
			shoulder: { line: [92, 44, 208, 44], label: [104, 34] },
			neck: { d: "M127 53 Q150 72 173 53 Q150 37 127 53", label: [150, 22] },
			chest: { line: [101, 140, 199, 140], label: [118, 132] },
			waist: { line: [101 - f * 0.4, hem * 0.62, 199 + f * 0.4, hem * 0.62], label: [118, hem * 0.62 - 8] },
			hip: { line: [102 - f * 0.8, hem - 26, 198 + f * 0.8, hem - 26], label: [118, hem - 34] },
			armhole: { d: sl ? "M92 64 Q106 92 100 122" : "M92 64 Q104 96 101 128", label: [114, 92] },
		};
		if (sl) {
			g.sleeve = { line: [84, 61, 40, 217], label: [52, 128] };
			g.bicep = { line: [75, 112, 101, 124], label: [70, 102] };
			g.cuff = { line: [48, 232, 72, 238], label: [44, 248] };
		}
		return g;
	}

	function bottomGuides(o) {
		var w = o.waist, crotch = o.crotch;
		return {
			length: { line: [78, w, 80, 345], label: [66, 200] },
			waist: { line: [95, w - 8, 205, w - 8], label: [150, w - 16] },
			hip: { line: [90, w + 55, 210, w + 55], label: [222, w + 55] },
			high: { line: [168, w + 12, 168, crotch], label: [180, (w + crotch) / 2] },
			thigh: { line: [89, crotch + 22, 148, crotch + 22], label: [118, crotch + 14] },
			knee: { line: [90, 262, 144, 262], label: [118, 254] },
			bottom: { line: [92, 354, 140, 354], label: [116, 364] },
		};
	}

	function fullGuides() {
		return {
			length: { line: [218, 54, 218, 345], label: [230, 200] },
			shoulder: { line: [92, 44, 208, 44], label: [104, 34] },
			neck: { d: "M127 53 Q150 72 173 53 Q150 37 127 53", label: [150, 22] },
			chest: { line: [101, 140, 199, 140], label: [118, 132] },
			waist: { line: [100, 176, 200, 176], label: [118, 168] },
			hip: { line: [99, 200, 201, 200], label: [118, 210] },
			armhole: { d: "M92 64 Q106 92 100 122", label: [114, 92] },
			sleeve: { line: [84, 61, 40, 217], label: [52, 128] },
			bicep: { line: [75, 112, 101, 124], label: [70, 102] },
			cuff: { line: [48, 232, 72, 238], label: [44, 248] },
			thigh: { line: [99, 238, 148, 238], label: [124, 230] },
			knee: { line: [98, 285, 145, 285], label: [122, 277] },
			bottom: { line: [96, 354, 142, 354], label: [118, 364] },
			high: { line: [168, 180, 168, 215], label: [180, 198] },
		};
	}

	var LAYOUTS = {
		"top": function () { var o = { hem: 300, sleeves: true }; return { outline: topOutline(o), guides: topGuides(o) }; },
		"top sleeveless": function () { var o = { hem: 290, sleeves: false, vneck: true }; return { outline: topOutline(o), guides: topGuides(o) }; },
		"long coat": function () { var o = { hem: 340, sleeves: true, flare: 8 }; return { outline: topOutline(o), guides: topGuides(o) }; },
		"bottom": function () { var o = { waist: 40, crotch: 150, pockets: false }; return { outline: bottomOutline(o), guides: bottomGuides(o) }; },
		"full body": function () { return { outline: fullOutline(), guides: fullGuides() }; },
	};

	function esc(s) {
		return String(s).replace(/[&<>"]/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
		});
	}

	function guideSvg(gd, n, active, opts) {
		var color = active ? opts.accent : opts.muted;
		var width = active ? 3 : 1.4;
		var dash = active ? "" : ' stroke-dasharray="4 3"';
		var shape;
		if (gd.d) {
			shape = '<path d="' + gd.d + '" fill="none" stroke="' + color + '" stroke-width="' + width + '"' + dash + "/>";
		} else {
			var l = gd.line;
			shape =
				'<line x1="' + l[0] + '" y1="' + l[1] + '" x2="' + l[2] + '" y2="' + l[3] + '" stroke="' + color +
				'" stroke-width="' + width + '"' + dash + ' stroke-linecap="round"/>' +
				'<circle cx="' + l[0] + '" cy="' + l[1] + '" r="' + (active ? 3.5 : 2) + '" fill="' + color + '"/>' +
				'<circle cx="' + l[2] + '" cy="' + l[3] + '" r="' + (active ? 3.5 : 2) + '" fill="' + color + '"/>';
		}
		var r = active ? 10 : 8;
		var label =
			'<circle cx="' + gd.label[0] + '" cy="' + gd.label[1] + '" r="' + r + '" fill="' +
			(active ? opts.accent : opts.badge) + '" stroke="' + color + '" stroke-width="1"/>' +
			'<text x="' + gd.label[0] + '" y="' + (gd.label[1] + (active ? 4 : 3.5)) +
			'" text-anchor="middle" font-size="' + (active ? 12 : 10) + '" font-weight="700" fill="' +
			(active ? "#fff" : opts.ink) + '" font-family="system-ui, sans-serif">' + n + "</text>";
		return "<g" + (opts.clickable ? ' data-measurement="' + esc(gd.name) + '" style="cursor:pointer"' : "") +
			">" + shape + label + "</g>";
	}

	/**
	 * @param {string} layout   Top | Top Sleeveless | Long Coat | Bottom | Full Body
	 * @param {string[]} measurements  measurement names in template order
	 * @param {string} active   measurement name to highlight
	 * @param {object} opts     {accent, ink, muted, badge, fill, clickable}
	 * @returns {string} svg markup
	 */
	function render(layout, measurements, active, opts) {
		opts = Object.assign(
			{ accent: "#d97706", ink: "currentColor", muted: "#94a3b8", badge: "#f1f5f9", fill: "none", clickable: true },
			opts || {}
		);
		var make = LAYOUTS[key(layout)] || LAYOUTS.top;
		var L = make();
		var out = [];
		out.push(
			'<svg viewBox="0 0 300 375" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' +
			esc(layout || "Garment") + ' diagram" style="width:100%;height:auto;display:block">'
		);
		out.push(
			'<g fill="' + opts.fill + '" stroke="' + opts.ink + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity="0.85">'
		);
		L.outline.forEach(function (d) { out.push('<path d="' + d + '"/>'); });
		out.push("</g>");

		var activeKey = key(active);
		var activeSvg = "";
		(measurements || []).forEach(function (m, i) {
			var gd = L.guides[key(m)];
			if (!gd) return;
			gd = Object.assign({ name: m }, gd);
			var isActive = key(m) === activeKey;
			var s = guideSvg(gd, i + 1, isActive, opts);
			if (isActive) activeSvg = s; else out.push(s);
		});
		out.push(activeSvg); // draw active guide on top
		out.push("</svg>");
		return out.join("");
	}

	function hasGuide(layout, measurement) {
		var make = LAYOUTS[key(layout)] || LAYOUTS.top;
		return !!make().guides[key(measurement)];
	}

	var api = { render: render, hasGuide: hasGuide, layouts: ["Top", "Top Sleeveless", "Long Coat", "Bottom", "Full Body"] };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	root.GarmentDiagram = api;
})(typeof window !== "undefined" ? window : globalThis);

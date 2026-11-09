"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load, makeItem } = require("./helpers");

// Drive the whole run() loop with the network and UI stubbed, to prove that a
// duplicate item (same DOI) is still labelled — not silently skipped.
function runner() {
	const { fv } = load();
	fv.ensureEmail = async () => "e@x.org";
	fv.attachPDF = async () => {};
	const calls = [];
	fv.resolveOA = async (doi) => {
		calls.push(doi);
		if (doi === "10.2/found") return { status: "found", source: "https://h/x.pdf", license: "cc-by", reason: "", oaStatus: "gold" };
		return { status: "missing", reason: "no open-access copy known", oaStatus: "" };
	};
	return { fv, calls };
}

test("duplicate items are tagged (mirroring the original) and not re-fetched", async () => {
	const { fv, calls } = runner();
	const a = makeItem({ DOI: "10.1/dup" }, { key: "A", id: 1 });
	const b = makeItem({ DOI: "10.1/dup" }, { key: "B", id: 2 }); // same paper
	await fv.run([a, b], { alert() {} });

	assert.deepEqual(calls, ["10.1/dup"]);              // resolveOA ran once, not twice
	assert.ok(a._tags.has("fulltext:pdf-missing"));
	assert.ok(b._tags.has("fulltext:pdf-missing"));     // the duplicate got labelled too
});

test("distinct items are each resolved and tagged by outcome", async () => {
	const { fv, calls } = runner();
	const a = makeItem({ DOI: "10.1/dup" }, { key: "A", id: 1 });
	const b = makeItem({ DOI: "10.1/dup" }, { key: "B", id: 2 });
	const c = makeItem({ DOI: "10.2/found" }, { key: "C", id: 3 });
	await fv.run([a, b, c], { alert() {} });

	assert.deepEqual(calls.sort(), ["10.1/dup", "10.2/found"]); // B mirrored, not re-fetched
	assert.ok(c._tags.has("fulltext:pdf-found"));
});

test("finding PDFs never creates a note, even with report notes on", async () => {
	const { fv, notes } = (() => {
		const h = load({ prefs: { "extensions.zotero.zotpdf.reportNote": true } });
		h.fv.ensureEmail = async () => "e@x.org";
		h.fv.attachPDF = async () => {};
		h.fv.resolveOA = async () => ({ status: "missing", reason: "none", oaStatus: "" });
		return h;
	})();
	await fv.run([makeItem({ DOI: "10.9/z" }, { key: "Z", id: 9 })], { alert() {} });
	assert.equal(notes.length, 0);
});

test("a found-by-Zotero result is not attached a second time", async () => {
	const { fv } = runner();
	let attached = 0;
	fv.attachPDF = async () => { attached++; };
	fv.resolveOA = async () => ({ status: "found", attached: true, source: "https://p/x", license: "", oaStatus: "" });
	const a = makeItem({ DOI: "10.3/p" }, { key: "P", id: 4 });
	await fv.run([a], { alert() {} });
	assert.equal(attached, 0);
	assert.ok(a._tags.has("fulltext:pdf-found"));
});

test("the progress row names the source that supplied the PDF", async () => {
	const { fv } = runner();
	fv.resolveOA = async () => ({ status: "found", source: "https://core/x.pdf", license: "", oaStatus: "", via: "CORE" });
	const rows = [];
	fv.openProgress = () => ({ cancelled: false, begin() {}, end(item, row) { rows.push(row); }, summary() {}, close() {} });
	await fv.run([makeItem({ DOI: "10.5/v" }, { key: "V", id: 7 })], { alert() {} });
	assert.equal(rows[0].via, "CORE");
});

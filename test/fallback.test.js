"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load, pdfBytes } = require("./helpers");

function fvWith(downloadPDF) {
	const { fv } = load();
	fv.politePause = async () => {};
	fv.fetchJSON = async () => ({ status: 404, response: null });
	fv.downloadPDF = downloadPDF;
	return fv;
}

test("OpenAlex fallback supplies the PDF when other sources miss", async () => {
	const fv = fvWith(async (u) => (u === "https://oa/a.pdf" ? pdfBytes() : null));
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org",
		async () => ({ locations: [{ url: "https://oa/a.pdf", license: "cc-by" }] }));
	assert.equal(r.status, "found");
	assert.equal(r.source, "https://oa/a.pdf");
	assert.equal(r.license, "cc-by");
});

test("OpenAlex fallback with no locations leaves the verdict at missing", async () => {
	const fv = fvWith(async () => null);
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org", async () => ({ locations: [] }));
	assert.equal(r.status, "missing");
});

test("OpenAlex links that fail to download -> check", async () => {
	const fv = fvWith(async () => null);
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org",
		async () => ({ locations: [{ url: "https://oa/b.pdf" }] }));
	assert.equal(r.status, "check");
	assert.match(r.reason, /OpenAlex listed 1 PDF link/);
});

test("fallback is skipped when Unpaywall already found a PDF", async () => {
	const fv = fvWith(async () => pdfBytes());
	fv.fetchJSON = async () => ({ status: 200, response: { is_oa: true,
		best_oa_location: { url_for_pdf: "https://host/a.pdf" }, oa_locations: [] } });
	let called = false;
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org", async () => { called = true; return { locations: [] }; });
	assert.equal(r.status, "found");
	assert.equal(called, false);
});

test("openAlexFallback is null when the OpenAlex module is absent", () => {
	const { fv } = load();
	assert.equal(fv.openAlexFallback({}), null);
});

test("OpenAlex-hosted full text is used when links fail", async () => {
	const fv = fvWith(async () => null);
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org", async () => ({
		locations: [{ url: "https://oa/dead.pdf" }],
		hosted: async () => ({ bytes: pdfBytes(), url: "https://content.openalex.org/works/W1.pdf" }),
	}));
	assert.equal(r.status, "found");
	assert.equal(r.source, "https://content.openalex.org/works/W1.pdf");
	assert.ok(r.bytes);
});

test("preferHosted tries the hosted copy before the links", async () => {
	const order = [];
	const fv = fvWith(async (u) => { order.push("link"); return pdfBytes(); });
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org", async () => ({
		locations: [{ url: "https://oa/a.pdf" }],
		preferHosted: true,
		hosted: async () => { order.push("hosted"); return { bytes: pdfBytes(), url: "u" }; },
	}));
	assert.equal(r.status, "found");
	assert.deepEqual(order, ["hosted"]);
});

test("publisher-page step reports the item as attached by Zotero", async () => {
	const fv = fvWith(async () => null);
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org", async () => ({
		locations: [],
		publisher: async () => "https://publisher.example/article",
	}));
	assert.equal(r.status, "found");
	assert.equal(r.attached, true);
	assert.equal(r.source, "https://publisher.example/article");
});

test("a failing OpenAlex step is recorded and the verdict is check", async () => {
	const fv = fvWith(async () => null);
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org", async () => ({
		locations: [],
		hosted: async () => { throw new Error("rate limit"); },
	}));
	assert.equal(r.status, "check");
	assert.match(r.reason, /OpenAlex: rate limit/);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load, makeItem, pdfBytes } = require("./helpers");

// A PDF-looking buffer with extra ASCII (e.g. XMP metadata) after the header
function pdfWith(text) {
	const body = Buffer.from("%PDF-1.7\n" + text + "\n" + "x".repeat(3000));
	return new Uint8Array(body);
}

function engine(over = {}) {
	const h = load(over);
	h.fv.ensureEmail = async () => "e@x.org";
	h.fv.attachPDF = async () => {};
	h.fv.politePause = async () => {};
	return h;
}

//
// verifyPDF
//

test("verifyPDF accepts a PDF that carries the item's DOI", () => {
	const { fv } = load();
	assert.equal(fv.verifyPDF(pdfWith("<prism:doi>10.1/abc</prism:doi>"), "10.1/ABC").ok, true);
	assert.equal(fv.verifyPDF(pdfWith("<prism:doi>doi:10.1/abc</prism:doi>"), "10.1/abc").ok, true);
});

test("verifyPDF rejects a PDF that carries a different DOI", () => {
	const { fv } = load();
	const v = fv.verifyPDF(pdfWith("<prism:doi>10.9999/other</prism:doi>"), "10.1/abc");
	assert.equal(v.ok, false);
	assert.equal(v.found, "10.9999/other");
	assert.equal(fv.verifyPDF(pdfWith("/doi (10.9999/other)"), "10.1/abc").ok, false);
});

test("verifyPDF can't tell without an embedded DOI, so it accepts", () => {
	const { fv } = load();
	assert.equal(fv.verifyPDF(pdfBytes(5000), "10.1/abc").ok, true);
	assert.equal(fv.verifyPDF(pdfWith("<prism:doi>10.9999/other</prism:doi>"), null).ok, true);
});

test("verifyPDF tolerates a preprint DOI inside a published item's PDF", () => {
	const { fv } = load();
	assert.equal(fv.verifyPDF(pdfWith("<prism:doi>10.1101/2020.03.22.002386</prism:doi>"), "10.1038/s41586-020-2286-9").ok, true);
	assert.equal(fv.verifyPDF(pdfWith("<prism:doi>10.48550/arXiv.1706.03762</prism:doi>"), "10.5555/3295222.3295349").ok, true);
});

test("a PDF for a different DOI is not attached and the item is flagged check", async () => {
	const { fv } = engine();
	let attached = 0;
	fv.attachPDF = async () => { attached++; };
	fv.resolveOA = async () => ({ status: "found", bytes: pdfWith("<prism:doi>10.9999/wrong</prism:doi>"), source: "https://x/a.pdf", via: "CORE" });
	const item = makeItem({ DOI: "10.1/right" }, { key: "W", id: 1 });
	await fv.run([item], { alert() {} });
	assert.equal(attached, 0);
	assert.ok(item._tags.has("fulltext:check-needed"));
	const row = fv.lastRun.rows[0];
	assert.match(row.reason, /different DOI \(10\.9999\/wrong\)/);
});

//
// Negative cache, dry run
//

test("a miss is remembered for a day, so a re-run skips the lookup", async () => {
	const { fv } = engine();
	let lookups = 0;
	fv.resolveOA = async () => { lookups++; return { status: "missing", reason: "none" }; };
	const mk = () => makeItem({ DOI: "10.1/cached" }, { key: "C", id: 2 });
	await fv.run([mk()], { alert() {} });
	await fv.run([mk()], { alert() {} });
	assert.equal(lookups, 1);
	assert.match(fv.lastRun.rows[0].reason, /remembered for a day/);
	assert.equal(fv.lastRun.rows[0].status, "missing");
});

test("a 'check' result is never cached, and the cache can be cleared or switched off", async () => {
	const { fv } = engine();
	let lookups = 0;
	fv.resolveOA = async () => { lookups++; return { status: "check", reason: "boom" }; };
	const mk = () => makeItem({ DOI: "10.1/flaky" }, { key: "F", id: 3 });
	await fv.run([mk()], { alert() {} });
	await fv.run([mk()], { alert() {} });
	assert.equal(lookups, 2);

	fv.resolveOA = async () => { lookups++; return { status: "missing", reason: "none" }; };
	await fv.run([mk()], { alert() {} });
	fv.cacheClear();
	const before = lookups;
	await fv.run([mk()], { alert() {} });
	assert.equal(lookups, before + 1);

	const off = engine({ prefs: { "extensions.zotero.zotpdf.useCache": false } });
	let n = 0;
	off.fv.resolveOA = async () => { n++; return { status: "missing", reason: "none" }; };
	await off.fv.run([mk()], { alert() {} });
	await off.fv.run([mk()], { alert() {} });
	assert.equal(n, 2);
});

test("the cache expires after a day", () => {
	const { fv } = load();
	fv.cacheSet("10.1/old");
	fv.cacheLoad()["10.1/old"] = Date.now() - 86400000 - 1000;
	assert.equal(fv.cacheGet("10.1/old"), 0);
	fv.cacheSet("10.1/new");
	assert.ok(fv.cacheGet("10.1/new") > 0);
});

test("a dry run attaches nothing, tags nothing, and says what it would do", async () => {
	const { fv } = engine();
	let attached = 0;
	fv.attachPDF = async () => { attached++; };
	fv.resolveOA = async () => ({ status: "found", bytes: pdfBytes(5000), source: "https://x/a.pdf", via: "CORE" });
	const item = makeItem({ DOI: "10.1/dry" }, { key: "D", id: 4 });
	await fv.run([item], { alert() {} }, { dryRun: true });
	assert.equal(attached, 0);
	assert.equal([...item._tags].length, 0);
	assert.match(fv.lastRun.rows[0].reason, /would attach from CORE \(dry run\)/);
	assert.equal(fv.lastRun.dryRun, true);
});

test("a dry run switches the publisher-page step off", async () => {
	const { fv } = engine();
	let publisherOffered = null;
	fv.openAlexFallback = () => async () => ({ locations: [], publisher: async () => "https://p/x" });
	fv.resolveOA = async (doi, pmid, pmcid, email, fallback) => {
		publisherOffered = (await fallback()).publisher;
		return { status: "missing", reason: "" };
	};
	await fv.run([makeItem({ DOI: "10.1/dry2" }, { key: "D2", id: 5 })], { alert() {} }, { dryRun: true });
	assert.equal(publisherOffered, null);
});

//
// Parallel workers
//

test("pool never runs more than `limit` at once and finishes everything", async () => {
	const { fv } = load();
	let active = 0, peak = 0, done = 0;
	await fv.pool([1, 2, 3, 4, 5, 6, 7], 3, async () => {
		active++; peak = Math.max(peak, active);
		await new Promise(r => setTimeout(r, 5));
		active--; done++;
	});
	assert.equal(done, 7);
	assert.equal(peak, 3);
});

test("a PDF run processes items concurrently, tags each one, and counts the sources used", async () => {
	const { fv } = engine({ prefs: { "extensions.zotero.zotpdf.concurrency": 3 } });
	let active = 0, peak = 0;
	fv.resolveOA = async (doi) => {
		active++; peak = Math.max(peak, active);
		await new Promise(r => setTimeout(r, 5));
		active--;
		return doi.endsWith("a") ? { status: "found", bytes: pdfBytes(5000), source: "u", via: "Unpaywall" }
			: { status: "missing", reason: "none" };
	};
	const items = ["a", "b", "c", "d"].map((x, i) => makeItem({ DOI: "10.1/" + x + (x === "a" ? "" : "z") }, { key: "K" + x, id: 10 + i }));
	items[0] = makeItem({ DOI: "10.1/a" }, { key: "Ka", id: 10 });
	await fv.run(items, { alert() {} });
	assert.ok(peak > 1 && peak <= 3);
	assert.ok(items[0]._tags.has("fulltext:pdf-found"));
	assert.ok(items[1]._tags.has("fulltext:pdf-missing"));
	assert.deepEqual({ ...fv.lastRun.stats }, { Unpaywall: 1 });
	assert.deepEqual({ ...fv.lastRun.counts }, { found: 1, missing: 3, check: 0 });
});

//
// Existing PDFs
//

test("an attachment whose file is gone does not count as a PDF", async () => {
	const att = { attachmentContentType: "application/pdf", fileExists: async () => false };
	const { fv } = load({ itemsById: { 1: att } });
	assert.equal(await fv.hasUsablePDF(makeItem({}, { attachments: [1] })), false);
	att.fileExists = async () => true;
	assert.equal(await fv.hasUsablePDF(makeItem({}, { attachments: [1] })), true);
});

test("an item that already had a PDF loses stale missing/check tags but gains no found tag", async () => {
	const att = { attachmentContentType: "application/pdf", fileExists: async () => true };
	const { fv } = engine({ itemsById: { 1: att } });
	const item = makeItem({ DOI: "10.1/have" }, { key: "H", id: 20, attachments: [1],
		tags: ["fulltext:pdf-missing", "fulltext:check-needed"] });
	await fv.run([item], { alert() {} });
	assert.ok(!item._tags.has("fulltext:pdf-missing"));
	assert.ok(!item._tags.has("fulltext:check-needed"));
	assert.ok(!item._tags.has("fulltext:pdf-found"));
});

//
// DOI write-back, export, status
//

test("a DOI learned from a title match is written back only when the setting is on", async () => {
	for (const on of [false, true]) {
		const { fv } = engine({ prefs: { "extensions.zotero.zotpdf.writeBackDOI": on } });
		const filled = [];
		fv.fillDOI = async (item, doi) => filled.push(doi);
		fv.extraSources = () => Object.assign([], { ctx: { doi: "10.5555/learned" } });
		fv.resolveOA = async () => ({ status: "found", bytes: pdfBytes(5000), source: "u", via: "Crossref" });
		await fv.run([makeItem({ title: "A title only" }, { key: "T", id: 30 })], { alert() {} });
		assert.deepEqual(filled, on ? ["10.5555/learned"] : []);
	}
});

test("buildMissingCSV quotes fields and lists the status, DOI and authors", () => {
	const { fv } = load();
	const item = makeItem({ title: 'A "quoted", title', DOI: "10.1/x", date: "2020-05-01", publicationTitle: "J. Things", url: "https://x" },
		{ tags: ["fulltext:pdf-missing"], creators: [{ lastName: "Doe" }, { lastName: "Roe" }] });
	const csv = fv.buildMissingCSV([item]);
	const [header, line] = csv.trim().split("\n");
	assert.equal(header, "status,title,authors,year,journal,doi,pmid,url");
	assert.match(line, /^"no open-access copy","A ""quoted"", title","Doe; Roe"/);
	assert.match(line, /"10\.1\/x"/);
});

test("statusSummary reads the tags: retracted wins the label", () => {
	const { fv } = load();
	const s = fv.statusSummary(makeItem({}, { tags: ["fulltext:pdf-found", "retraction:retracted", "citation:mismatch"] }));
	assert.equal(s.label, "⚠ Retracted");
	assert.equal(s.pdf, "PDF found");
	assert.equal(s.retraction, "RETRACTED");
	assert.equal(s.citation, "Doesn’t match Crossref");
	assert.equal(fv.statusSummary(makeItem({}, { tags: ["fulltext:pdf-missing"] })).label, "No PDF");
	assert.equal(fv.statusSummary(makeItem({})).label, "");
	assert.equal(fv.statusSummary(makeItem({})).pdf, "Not checked");
});

//
// Retries
//

test("fetch retries once on a network error and once on a 5xx, but not on a 404", async () => {
	for (const [responses, expectCalls, expectStatus] of [
		[[new Error("net"), { status: 200 }], 2, 200],
		[[{ status: 503 }, { status: 200 }], 2, 200],
		[[{ status: 404 }, { status: 200 }], 1, 404],
		[[{ status: 503 }, { status: 502 }], 2, 502],
	]) {
		let calls = 0;
		const { fv } = load({ zotero: { HTTP: { request: async () => {
			const r = responses[calls++];
			if (r instanceof Error) throw r;
			return r;
		} } } });
		fv.politePause = async () => {};
		const xhr = await fv.fetch("https://x", "json");
		assert.equal(calls, expectCalls);
		assert.equal(xhr.status, expectStatus);
	}
});

test("fetch gives up after two network errors", async () => {
	const { fv } = load({ zotero: { HTTP: { request: async () => { throw new Error("down"); } } } });
	fv.politePause = async () => {};
	await assert.rejects(fv.fetch("https://x", "json"), /down/);
});

test("a short real PDF is accepted now that the size floor is 1 KB", () => {
	const { fv } = load();
	assert.equal(fv.sniffPDFBytes(pdfBytes(1500)).ok, true);
	assert.equal(fv.sniffPDFBytes(pdfBytes(900)).ok, false);
});

//
// Cancel
//

test("requestCancel aborts requests in flight and the pending fetch fails as cancelled", async () => {
	let aborted = 0;
	const { fv } = load({ zotero: { HTTP: { request: (method, url, options) => new Promise((resolve, reject) => {
		const xhr = { abort() { aborted++; reject(new Error("aborted")); } };
		options.requestObserver(xhr);
	}) } } });
	fv.politePause = async () => {};
	const pending = fv.fetch("https://x", "json");
	await new Promise(r => setTimeout(r, 5));
	fv.requestCancel();
	await assert.rejects(pending, e => e.cancelled === true);
	assert.equal(aborted, 1);
});

test("after a cancel no new request is made", async () => {
	let calls = 0;
	const { fv } = load({ zotero: { HTTP: { request: async () => { calls++; return { status: 200 }; } } } });
	fv.politePause = async () => {};
	fv.requestCancel();
	await assert.rejects(fv.fetch("https://x", "json"), e => e.cancelled);
	await assert.rejects(fv.downloadPDF("https://x/a.pdf"), e => e.cancelled);
	assert.equal(calls, 0);
});

test("cancelling stops the source chain without trying the remaining sources", async () => {
	const { fv } = engine();
	const tried = [];
	const sources = ["a", "b", "c"].map(id => ({ id, label: id, find: async () => {
		tried.push(id);
		if (id === "a") fv.requestCancel();
		return { locations: [] };
	} }));
	await assert.rejects(fv.resolveOA("10.1/x", null, null, "e@x.org", null, sources), e => e.cancelled);
	assert.deepEqual(tried, ["a"]);
});

test("a source that was cancelled mid-request is not reported as 'unavailable'", async () => {
	const { fv } = engine();
	const sources = [{ id: "a", label: "Alpha", find: async () => { throw fv.cancelledError(); } }];
	await assert.rejects(fv.resolveOA("10.1/x", null, null, "e@x.org", null, sources), e => e.cancelled);
});

test("Cancel mid-run: finished items keep their tags, the in-flight item is untouched, the rest say Cancelled", async () => {
	const { fv } = engine({ prefs: { "extensions.zotero.zotpdf.concurrency": 1 } });
	const ended = [];
	let progressCancelled = false;
	fv.openProgress = () => ({
		get cancelled() { return progressCancelled; },
		begin() {}, summary(t) { ended.summary = t; }, close() {},
		end(item, row) { ended.push([item.key, row.status, row.reason]); },
	});
	let n = 0;
	fv.resolveOA = async () => {
		n++;
		if (n === 1) return { status: "missing", reason: "none" };
		fv.requestCancel();
		progressCancelled = true;
		throw fv.cancelledError();
	};
	const items = [1, 2, 3, 4].map(i => makeItem({ DOI: "10.1/c" + i }, { key: "K" + i, id: 40 + i }));
	await fv.run(items, { alert() {} });
	assert.ok(items[0]._tags.has("fulltext:pdf-missing"));              // finished before the cancel
	for (const it of items.slice(1)) assert.equal(it._tags.size, 0);      // nothing tagged after it
	const byKey = Object.fromEntries(ended.map(([k, s, r]) => [k, r]));
	assert.equal(byKey.K2, "Cancelled");
	assert.equal(byKey.K3, "Cancelled");
	assert.equal(byKey.K4, "Cancelled");
	assert.match(ended.summary, /^Cancelled\./);
	assert.equal(fv.running, false);
	assert.equal(fv._cancel, false); // the flag is reset for the next run
});

test("a cancelled item is not remembered as a miss", async () => {
	const { fv } = engine();
	fv.resolveOA = async () => { throw fv.cancelledError(); };
	await fv.run([makeItem({ DOI: "10.1/nc" }, { key: "N", id: 50 })], { alert() {} });
	assert.equal(fv.cacheGet("10.1/nc"), 0);
});

test("a run after a cancel works normally", async () => {
	const { fv } = engine();
	fv.requestCancel();
	fv.resolveOA = async () => ({ status: "missing", reason: "none" });
	const item = makeItem({ DOI: "10.1/after" }, { key: "A", id: 60 });
	await fv.run([item], { alert() {} });
	assert.ok(item._tags.has("fulltext:pdf-missing"));
});

test("cancelling a retraction run leaves the in-flight item untagged", async () => {
	const { fv } = engine();
	fv.checkRetraction = async () => { fv.requestCancel(); throw fv.cancelledError(); };
	fv.openProgress = () => ({ cancelled: false, begin() {}, end() {}, summary() {}, close() {} });
	const item = makeItem({ DOI: "10.1/r" }, { key: "R", id: 70 });
	await fv.runRetraction([item], { alert() {} });
	assert.equal(item._tags.size, 0);
	assert.equal(fv.running, false);
});

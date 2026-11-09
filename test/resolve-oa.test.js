"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load, pdfBytes } = require("./helpers");

// resolveOA orchestrates network calls; stub them on the instance so we test
// only the open-access decision logic (found / missing / check + reason).
function withStubs(stubs = {}) {
	const { fv } = load();
	fv.politePause = async () => {};
	fv.fetchJSON = stubs.fetchJSON || (async () => ({ status: 404, response: null }));
	fv.fetchText = stubs.fetchText || (async () => ({ status: 404, responseText: "" }));
	fv.downloadPDF = stubs.downloadPDF || (async () => null);
	return fv;
}

test("DOI with no OA copy -> missing", async () => {
	const fv = withStubs({
		fetchJSON: async () => ({ status: 200, response: { is_oa: false, oa_status: "closed" } }),
	});
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org");
	assert.equal(r.status, "missing");
	assert.match(r.reason, /no open-access copy/i);
});

test("DOI with a downloadable OA PDF -> found, with source and license", async () => {
	const fv = withStubs({
		fetchJSON: async () => ({
			status: 200,
			response: {
				is_oa: true, oa_status: "gold",
				best_oa_location: { url_for_pdf: "https://host/a.pdf", license: "cc-by" },
				oa_locations: [],
			},
		}),
		downloadPDF: async (url) => (url === "https://host/a.pdf" ? pdfBytes() : null),
	});
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org");
	assert.equal(r.status, "found");
	assert.equal(r.source, "https://host/a.pdf");
	assert.equal(r.license, "cc-by");
});

test("DOI OA but no direct PDF link -> missing", async () => {
	const fv = withStubs({
		fetchJSON: async () => ({
			status: 200,
			response: { is_oa: true, oa_status: "green", best_oa_location: { url_for_pdf: null }, oa_locations: [{ url_for_pdf: null }] },
		}),
	});
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org");
	assert.equal(r.status, "missing");
	assert.match(r.reason, /no direct PDF link/i);
});

test("DOI listed PDFs that all fail to download -> check (not missing)", async () => {
	const fv = withStubs({
		fetchJSON: async () => ({
			status: 200,
			response: { is_oa: true, best_oa_location: { url_for_pdf: "https://host/a.pdf" }, oa_locations: [] },
		}),
		downloadPDF: async () => null, // every candidate fails to verify
	});
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org");
	assert.equal(r.status, "check");
	assert.match(r.reason, /none downloaded/i);
});

test("Unpaywall server error -> check", async () => {
	const fv = withStubs({
		fetchJSON: async () => ({ status: 500, response: null }),
	});
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org");
	assert.equal(r.status, "check");
	assert.match(r.reason, /Unpaywall error/i);
});

test("DOI unknown to Unpaywall (404), no other id -> missing", async () => {
	const fv = withStubs({
		fetchJSON: async () => ({ status: 404, response: null }),
	});
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org");
	assert.equal(r.status, "missing");
	assert.match(r.reason, /not known to Unpaywall/i);
});

const S3_LIST = '<ListBucketResult><Prefix>PMC123.</Prefix><CommonPrefixes><Prefix>PMC123.1/</Prefix></CommonPrefixes></ListBucketResult>';

test("PMID -> PMCID, PMC cloud dataset PDF downloads -> found", async () => {
	const seen = [];
	const fv = withStubs({
		fetchJSON: async (url) => {
			seen.push(url);
			if (/idconv/.test(url)) return { status: 200, response: { records: [{ pmcid: "PMC123" }] } };
			return { status: 200, response: { pmcid: "PMC123", is_manuscript: false, license_code: "CC BY",
				pdf_url: "s3://pmc-oa-opendata/PMC123.1/PMC123.1.pdf?md5=abc" } };
		},
		fetchText: async () => ({ status: 200, responseText: S3_LIST }),
		downloadPDF: async () => pdfBytes(),
	});
	const r = await fv.resolveOA(null, "999", null, "e@x.org");
	assert.equal(r.status, "found");
	assert.equal(r.license, "CC BY");
	assert.equal(r.source, "https://pmc-oa-opendata.s3.amazonaws.com/PMC123.1/PMC123.1.pdf");
	assert.ok(seen.some(u => /pmc\.ncbi\.nlm\.nih\.gov\/tools\/idconv/.test(u))); // current idconv host
});

test("a DOI-only item gets its PMCID from the ID converter", async () => {
	let idconvQuery = "";
	const fv = withStubs({
		fetchJSON: async (url) => {
			if (/unpaywall/.test(url)) return { status: 200, response: { is_oa: false } };
			if (/idconv/.test(url)) { idconvQuery = url; return { status: 200, response: { records: [{ pmcid: "PMC123" }] } }; }
			return { status: 200, response: { is_manuscript: false, license_code: "CC BY",
				pdf_url: "s3://pmc-oa-opendata/PMC123.1/PMC123.1.pdf?md5=abc" } };
		},
		fetchText: async () => ({ status: 200, responseText: S3_LIST }),
		downloadPDF: async () => pdfBytes(),
	});
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org");
	assert.equal(r.status, "found");
	assert.match(idconvQuery, /ids=10\.1%2Fx/);
});

test("the published version beats the author manuscript", async () => {
	const fv = withStubs({
		fetchJSON: async (url) => ({ status: 200, response: /\.2\.json/.test(url)
			? { is_manuscript: true, license_code: "TDM", pdf_url: "s3://pmc-oa-opendata/PMC123.2/PMC123.2.pdf" }
			: { is_manuscript: false, license_code: "CC BY", pdf_url: "s3://pmc-oa-opendata/PMC123.1/PMC123.1.pdf" } }),
		fetchText: async () => ({ status: 200, responseText:
			'<R><CommonPrefixes><Prefix>PMC123.1/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>PMC123.2/</Prefix></CommonPrefixes></R>' }),
	});
	const oa = await fv.pmcOALookup("PMC123");
	assert.equal(oa.isOA, true);
	assert.match(oa.pdfURL, /PMC123\.1\.pdf$/);
	assert.equal(oa.license, "CC BY");
});

test("a manuscript PDF is used when it is the only one (license TDM)", async () => {
	const fv = withStubs({
		fetchJSON: async () => ({ status: 200, response: { is_manuscript: true, license_code: "TDM",
			pdf_url: "s3://pmc-oa-opendata/PMC123.1/PMC123.1.pdf" } }),
		fetchText: async () => ({ status: 200, responseText: S3_LIST }),
	});
	const oa = await fv.pmcOALookup("PMC123");
	assert.equal(oa.license, "TDM");
	assert.ok(oa.pdfURL);
});

test("PMCID not in the PMC dataset -> missing", async () => {
	const fv = withStubs({
		fetchText: async () => ({ status: 200, responseText: "<ListBucketResult><Prefix>PMC999.</Prefix></ListBucketResult>" }),
	});
	const r = await fv.resolveOA(null, null, "PMC999", "e@x.org");
	assert.equal(r.status, "missing");
	assert.match(r.reason, /not in its open dataset/i);
});

test("PMC dataset errors surface as check, not missing", async () => {
	const fv = withStubs({ fetchText: async () => ({ status: 503, responseText: "" }) });
	const r = await fv.resolveOA(null, null, "PMC999", "e@x.org");
	assert.equal(r.status, "check");
	assert.match(r.reason, /PMC dataset problem/);
});

test("a dead open-access link is retried through the Internet Archive", async () => {
	const urls = [];
	const fv = withStubs({
		fetchJSON: async (url) => {
			if (/unpaywall/.test(url)) return { status: 200, response: { is_oa: true,
				best_oa_location: { url_for_pdf: "https://dead.example/a.pdf" }, oa_locations: [] } };
			if (/wayback\/available/.test(url)) return { status: 200, response: { archived_snapshots: { closest: {
				available: true, url: "http://web.archive.org/web/20250101000000/https://dead.example/a.pdf" } } } };
			return { status: 404, response: null };
		},
		downloadPDF: async (url) => { urls.push(url); return /web\.archive\.org/.test(url) ? pdfBytes() : null; },
	});
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org");
	assert.equal(r.status, "found");
	assert.equal(r.source, "https://dead.example/a.pdf");
	assert.equal(urls[1], "https://web.archive.org/web/20250101000000if_/https://dead.example/a.pdf");
});

test("the Internet Archive retry can be switched off", async () => {
	const { fv } = load({ prefs: { "extensions.zotero.zotpdf.source.wayback": false } });
	fv.politePause = async () => {};
	fv.downloadPDF = async () => null;
	let asked = false;
	fv.fetchJSON = async () => { asked = true; return { status: 404, response: null }; };
	assert.equal(await fv.downloadOA("https://x/a.pdf"), null);
	assert.equal(asked, false);
});

test("Unpaywall landing pages are collected for the page-based step", async () => {
	const landings = [];
	const fv = withStubs({
		fetchJSON: async (url) => /unpaywall/.test(url)
			? { status: 200, response: { is_oa: true, best_oa_location: { url_for_landing_page: "https://pub.example/article", url_for_pdf: null }, oa_locations: [] } }
			: { status: 404, response: null },
	});
	await fv.resolveOA("10.1/x", null, null, "e@x.org", null, [], landings);
	assert.deepEqual(landings, ["https://pub.example/article"]);
});

test("extra sources run in order, the first PDF wins, and later ones are skipped", async () => {
	const order = [];
	const fv = withStubs({ downloadPDF: async (u) => (u === "https://core/x.pdf" ? pdfBytes() : null) });
	const sources = [
		{ id: "a", label: "Alpha", find: async () => { order.push("a"); return { locations: [] }; } },
		{ id: "b", label: "Beta", find: async () => { order.push("b"); return { locations: [{ url: "https://core/x.pdf", license: "cc-by" }] }; } },
		{ id: "c", label: "Gamma", find: async () => { order.push("c"); return { locations: [] }; } },
	];
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org", null, sources);
	assert.equal(r.status, "found");
	assert.equal(r.via, "Beta");
	assert.deepEqual(order, ["a", "b"]);
});

test("one failing extra source does not turn a miss into check", async () => {
	const fv = withStubs();
	const sources = [
		{ id: "a", label: "Alpha", find: async () => { throw new Error("HTTP 429"); } },
		{ id: "b", label: "Beta", find: async () => ({ locations: [] }) },
	];
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org", null, sources);
	assert.equal(r.status, "missing");
	assert.match(r.reason, /Alpha unavailable/);
});

test("every extra source failing is a check, not a miss", async () => {
	const fv = withStubs();
	const sources = [
		{ id: "a", label: "Alpha", find: async () => { throw new Error("offline"); } },
		{ id: "b", label: "Beta", find: async () => { throw new Error("offline"); } },
	];
	const r = await fv.resolveOA("10.1/x", null, null, "e@x.org", null, sources);
	assert.equal(r.status, "check");
});

test("a reliable link that fails to download is check; a guessed one is not", async () => {
	const fv = withStubs();
	const reliable = await fv.resolveOA("10.1/x", null, null, "e@x.org", null,
		[{ id: "a", label: "Alpha", find: async () => ({ locations: [{ url: "https://x/a.pdf" }] }) }]);
	assert.equal(reliable.status, "check");
	const guessed = await fv.resolveOA("10.1/x", null, null, "e@x.org", null,
		[{ id: "a", label: "Alpha", find: async () => ({ locations: [{ url: "https://x/a.pdf", guess: true }] }) }]);
	assert.equal(guessed.status, "missing");
});

test("a URL several sources return is downloaded once", async () => {
	const attempts = [];
	const fv = withStubs({
		fetchJSON: async (url) => /unpaywall/.test(url)
			? { status: 200, response: { is_oa: true, best_oa_location: { url_for_pdf: "https://x/a.pdf" }, oa_locations: [] } }
			: { status: 404, response: null },
		downloadPDF: async (url) => { attempts.push(url); return null; },
	});
	const same = (id) => ({ id, label: id, find: async () => ({ locations: [{ url: "https://x/a.pdf" }] }) });
	await fv.resolveOA("10.1/x", null, null, "e@x.org", async () => ({ locations: [{ url: "https://x/a.pdf" }] }), [same("a"), same("b")]);
	assert.equal(attempts.filter(u => u === "https://x/a.pdf").length, 1);
});

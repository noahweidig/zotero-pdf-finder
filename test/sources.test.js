"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Objects built inside the vm context have another Object prototype; compare as plain data
const plain = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
const eq = (a, b, m) => assert.deepEqual(plain(a), plain(b), m);

const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "sources.js"), "utf8");

function load(prefs = {}) {
	const sandbox = { console, ZotPDF: { getPref: (k) => prefs[k] } };
	vm.createContext(sandbox);
	vm.runInContext(SRC, sandbox);
	return sandbox.ZotPDF.Sources;
}

// ctx whose get() answers from a url-matcher table: [[regex, response], ...]
function ctxWith(table, over = {}) {
	const calls = [];
	return Object.assign({
		doi: null, pmid: null, title: "", year: null, arxiv: null, email: "e@x.org",
		landings: [], preprintDOIs: [], calls,
		get: async (url, headers) => {
			calls.push({ url, headers });
			for (const [re, res] of table) {
				if (re.test(url)) return typeof res === "function" ? res(url) : res;
			}
			return { status: 404, response: null };
		},
	}, over);
}
const ok = (response) => ({ status: 200, response });

test("build() skips sources switched off in settings", () => {
	const S = load({ "source.core": false, "source.doaj": 0 });
	const ids = S.build({ landings: [] }).map(s => s.id);
	assert.ok(!ids.includes("core") && !ids.includes("doaj"));
	eq(ids.slice(0, 3), ["europepmc", "semanticscholar", "crossref"]);
});

test("Europe PMC: free PDFs become locations, free HTML becomes a landing page", async () => {
	const S = load();
	const ctx = ctxWith([[/europepmc/, ok({ resultList: { result: [{ doi: "10.1/x", license: "cc by", pmcid: "PMC1", fullTextUrlList: { fullTextUrl: [
		{ availabilityCode: "OA", documentStyle: "pdf", site: "Europe_PMC", url: "https://europepmc.org/articles/PMC1?pdf=render" },
		{ availabilityCode: "OA", documentStyle: "html", site: "Europe_PMC", url: "https://europepmc.org/articles/PMC1" },
		{ availabilityCode: "S", documentStyle: "pdf", site: "Elsevier", url: "https://paywalled.example/a.pdf" },
		{ availabilityCode: "OA", documentStyle: "doi", site: "Unpaywall", url: "https://doi.org/10.1/x" },
	] } }] } })]], { doi: "10.1/x" });
	const out = await S.europepmc(ctx);
	eq(out.locations, [{ url: "https://europepmc.org/articles/PMC1?pdf=render", license: "cc by" }]);
	eq(ctx.landings, ["https://europepmc.org/articles/PMC1"]);
	assert.match(ctx.calls[0].url, /query=DOI%3A%2210\.1%2Fx%22/);
});

test("Europe PMC title search needs an exact title and learns the DOI", async () => {
	const S = load();
	const rec = (title, year) => ({ doi: "10.9999/learned", title, pubYear: String(year), fullTextUrlList: { fullTextUrl: [] } });
	const good = ctxWith([[/europepmc/, ok({ resultList: { result: [rec("Other paper", 2018), rec("The State of OA!", 2018)] } })]],
		{ title: "the state of oa", year: 2018 });
	await S.europepmc(good);
	assert.equal(good.doi, "10.9999/learned");
	const bad = ctxWith([[/europepmc/, ok({ resultList: { result: [rec("The state of OA", 2010)] } })]],
		{ title: "The state of OA", year: 2018 });
	await S.europepmc(bad);
	assert.equal(bad.doi, null); // year too far apart: not accepted
});

test("Semantic Scholar: direct link is a location; a landing page is not", async () => {
	const S = load({ "semanticScholarKey": "KEY" });
	const direct = ctxWith([[/semanticscholar/, ok({ openAccessPdf: { url: "https://arxiv.org/pdf/1706.03762", license: "CCBY" } })]], { doi: "10.1/x" });
	eq((await S.semanticscholar(direct)).locations, [{ url: "https://arxiv.org/pdf/1706.03762", license: "CCBY" }]);
	assert.equal(direct.calls[0].headers["x-api-key"], "KEY");
	const landing = ctxWith([[/semanticscholar/, ok({ openAccessPdf: { url: "https://doi.org/10.7287/peerj.preprints.3119" } })]], { doi: "10.1/x" });
	eq((await S.semanticscholar(landing)).locations, []);
	eq(landing.landings, ["https://doi.org/10.7287/peerj.preprints.3119"]);
});

test("Semantic Scholar looks up by PMID, arXiv ID, and (strictly) by title", async () => {
	const S = load();
	const pmid = ctxWith([[/PMID:123/, ok({ openAccessPdf: { url: "https://x/a.pdf" } })]], { pmid: "123" });
	assert.equal((await S.semanticscholar(pmid)).locations.length, 1);
	const ax = ctxWith([[/ARXIV:1706\.03762/, ok({ openAccessPdf: { url: "https://x/b.pdf" } })]], { arxiv: "1706.03762" });
	assert.equal((await S.semanticscholar(ax)).locations.length, 1);
	const title = ctxWith([[/search\/match/, ok({ data: [{ title: "Attention is All you Need", year: 2017,
		externalIds: { DOI: "10.5555/3295222" }, openAccessPdf: { url: "https://arxiv.org/pdf/1706.03762" } }] })]],
		{ title: "Attention Is All You Need", year: 2017 });
	assert.equal((await S.semanticscholar(title)).locations.length, 1);
	assert.equal(title.doi, "10.5555/3295222");
	const wrong = ctxWith([[/search\/match/, ok({ data: [{ title: "Something else entirely", year: 2017, openAccessPdf: { url: "https://x/c.pdf" } }] })]],
		{ title: "Attention Is All You Need", year: 2017 });
	eq((await S.semanticscholar(wrong)).locations, []);
});

test("Crossref: publisher PDF links count only with an open license", async () => {
	const S = load();
	const msg = (license) => ok({ message: { license, link: [
		{ URL: "https://peerj.com/articles/4375.pdf", "content-type": "application/pdf" },
		{ URL: "https://peerj.com/articles/4375.xml", "content-type": "application/xml" },
	] } });
	const open = ctxWith([[/api\.crossref\.org\/works\/10/, msg([{ URL: "http://creativecommons.org/licenses/by/4.0/" }])]], { doi: "10.7717/peerj.4375" });
	eq((await S.crossref(open)).locations, [{ url: "https://peerj.com/articles/4375.pdf", license: "http://creativecommons.org/licenses/by/4.0/" }]);
	const closed = ctxWith([[/api\.crossref\.org\/works\/10/, msg([{ URL: "https://www.elsevier.com/tdm/userlicense/1.0/" }])]], { doi: "10.1/x" });
	eq((await S.crossref(closed)).locations, []);
	const none = ctxWith([[/api\.crossref\.org\/works\/10/, msg([])]], { doi: "10.1/x" });
	eq((await S.crossref(none)).locations, []);
});

test("Crossref: linked preprint DOIs are remembered for the preprint step", async () => {
	const S = load();
	const ctx = ctxWith([[/api\.crossref\.org\/works\/10/, ok({ message: { relation: {
		"has-preprint": [{ "id-type": "doi", id: "10.1101/2020.03.22.002386" }] }, license: [], link: [] } })]], { doi: "10.1/pub" });
	await S.crossref(ctx);
	eq(ctx.preprintDOIs, ["10.1101/2020.03.22.002386"]);
});

test("Crossref title search learns a DOI only on an exact title with a close year", async () => {
	const S = load();
	const items = [
		{ DOI: "10.24108/translation", title: ["THE STATE OF OA"], issued: { "date-parts": [[2020]] } },
		{ DOI: "10.7717/peerj.4375", title: ["The state of OA"], issued: { "date-parts": [[2018]] } },
	];
	const ctx = ctxWith([[/query\.title/, ok({ message: { items } })], [/works\/10\.7717/, ok({ message: { license: [], link: [] } })]],
		{ title: "The state of OA", year: 2018 });
	await S.crossref(ctx);
	assert.equal(ctx.doi, "10.7717/peerj.4375");
});

test("CORE: DOI must match exactly; direct download and source links are candidates", async () => {
	const S = load({ coreKey: "K" });
	const ctx = ctxWith([[/core\.ac\.uk/, ok({ results: [
		{ doi: "10.9/other", downloadUrl: "https://core.ac.uk/download/1.pdf" },
		{ doi: "10.7717/PEERJ.4375", downloadUrl: "https://core.ac.uk/download/208668097.pdf",
			sourceFulltextUrls: ["https://core.ac.uk/download/208668097.pdf", "https://peerj.com/articles/4375.pdf", "https://doi.org/10.7717/peerj.4375"] },
	] })]], { doi: "10.7717/peerj.4375" });
	const out = await S.core(ctx);
	eq(out.locations.map(l => l.url), ["https://core.ac.uk/download/208668097.pdf", "https://peerj.com/articles/4375.pdf"]);
	assert.equal(ctx.calls[0].headers.Authorization, "Bearer K");
});

test("OpenAIRE: only products it rates open; direct links vs landing pages", async () => {
	const S = load();
	const product = (code) => ok({ results: [{ bestAccessRight: { code }, instances: [
		{ urls: ["https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1143&context=scholcom"], license: "CC BY" },
		{ urls: ["https://hal.science/hal-05527458v1", "https://doi.org/10.7717/peerj.4375"] },
		{ urls: ["https://pubmed.ncbi.nlm.nih.gov/29456894"] },
	] }] });
	const open = ctxWith([[/openaire/, product("c_abf2")]], { doi: "10.7717/peerj.4375" });
	const out = await S.openaire(open);
	eq(out.locations.map(l => l.url), ["https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1143&context=scholcom"]);
	eq(open.landings, ["https://hal.science/hal-05527458v1"]);
	const closed = ctxWith([[/openaire/, product("c_16ec")]], { doi: "10.1/x" });
	eq((await S.openaire(closed)).locations, []);
});

test("preprints: arXiv DOI and arXiv ID map to the arXiv PDF", async () => {
	const S = load();
	const a = await S.preprints(ctxWith([], { doi: "10.48550/arxiv.1706.03762" }));
	eq(a.locations, [{ url: "https://arxiv.org/pdf/1706.03762", license: "" }]);
	const b = await S.preprints(ctxWith([], { arxiv: "1706.03762v5" }));
	assert.equal(b.locations[0].url, "https://arxiv.org/pdf/1706.03762");
});

test("preprints: bioRxiv/medRxiv use the latest version, flagged as a guess", async () => {
	const S = load();
	const ctx = ctxWith([[/details\/biorxiv/, ok({ collection: [{ version: "1", server: "bioRxiv" }, { version: "2", server: "bioRxiv", license: "cc_by" }] })]],
		{ doi: "10.1101/2020.03.22.002386" });
	const out = await S.preprints(ctx);
	eq(out.locations, [{ url: "https://www.biorxiv.org/content/10.1101/2020.03.22.002386v2.full.pdf", license: "cc_by", guess: true }]);
	const med = ctxWith([[/details\/medrxiv/, ok({ collection: [{ version: "1", server: "medRxiv" }] })]], { doi: "10.1101/2020.03.22.20040758" });
	assert.match((await S.preprints(med)).locations[0].url, /^https:\/\/www\.medrxiv\.org\/content\//);
});

test("preprints: OSF family, PeerJ Preprints, Zenodo (open only, PDFs only), Figshare", async () => {
	const S = load();
	assert.equal((await S.preprints(ctxWith([], { doi: "10.31234/osf.io/abcde" }))).locations[0].url, "https://osf.io/abcde/download");
	assert.equal((await S.preprints(ctxWith([], { doi: "10.7287/peerj.preprints.3119v1" }))).locations[0].url, "https://peerj.com/preprints/3119.pdf");
	const zen = (access) => ctxWith([[/zenodo\.org\/api\/records\/42/, ok({ metadata: { access_right: access, license: { id: "cc-by-4.0" } },
		files: [{ key: "paper.pdf", links: { self: "https://zenodo.org/api/records/42/files/paper.pdf/content" } },
			{ key: "data.zip", links: { self: "https://zenodo.org/api/records/42/files/data.zip/content" } }] })]], { doi: "10.5281/zenodo.42" });
	eq((await S.preprints(zen("open"))).locations, [{ url: "https://zenodo.org/api/records/42/files/paper.pdf/content", license: "cc-by-4.0" }]);
	eq((await S.preprints(zen("restricted"))).locations, []);
	const fig = ctxWith([[/figshare/, ok({ license: { name: "CC BY 4.0" }, files: [
		{ name: "codebook.pdf", download_url: "https://ndownloader.figshare.com/files/6859932", is_link_only: false },
		{ name: "linked.pdf", download_url: "https://elsewhere", is_link_only: true },
		{ name: "data.txt", download_url: "https://ndownloader.figshare.com/files/1", is_link_only: false }] })]], { doi: "10.6084/m9.figshare.3761562.v3" });
	eq((await S.preprints(fig)).locations, [{ url: "https://ndownloader.figshare.com/files/6859932", license: "CC BY 4.0" }]);
});

test("preprints: Crossref-linked preprint DOIs are tried too", async () => {
	const S = load();
	const ctx = ctxWith([[/details\/biorxiv/, ok({ collection: [{ version: "1", server: "bioRxiv" }] })]],
		{ doi: "10.1/published", preprintDOIs: ["10.1101/2020.03.22.002386"] });
	assert.equal((await S.preprints(ctx)).locations.length, 1);
});

test("HAL: main file is a location, record page a landing page; title needs an exact match", async () => {
	const S = load();
	const ctx = ctxWith([[/archives-ouvertes/, ok({ response: { docs: [{ fileMain_s: "https://hal.science/hal-1/document", uri_s: "https://hal.science/hal-1" }] } })]], { doi: "10.1/x" });
	eq((await S.hal(ctx)).locations, [{ url: "https://hal.science/hal-1/document", license: "" }]);
	eq(ctx.landings, ["https://hal.science/hal-1"]);
	const wrong = ctxWith([[/archives-ouvertes/, ok({ response: { docs: [{ title_s: ["A different title"], producedDateY_i: 2018, fileMain_s: "https://hal.science/hal-2/document" }] } })]],
		{ title: "My paper", year: 2018 });
	eq((await S.hal(wrong)).locations, []);
});

test("DOAJ: PDF links are locations, HTML full text is a landing page", async () => {
	const S = load();
	const ctx = ctxWith([[/doaj\.org/, ok({ results: [{ bibjson: { link: [
		{ type: "fulltext", content_type: "PDF", url: "https://peerj.com/articles/4375.pdf" },
		{ type: "fulltext", content_type: "HTML", url: "https://peerj.com/articles/4375/" },
		{ type: "abstract", url: "https://peerj.com/abs" }] } }] })]], { doi: "10.7717/peerj.4375" });
	eq((await S.doaj(ctx)).locations, [{ url: "https://peerj.com/articles/4375.pdf", license: "" }]);
	eq(ctx.landings, ["https://peerj.com/articles/4375/"]);
});

test("sources return nothing, quietly, for an unknown record (HTTP 404)", async () => {
	const S = load();
	for (const id of ["europepmc", "semanticscholar", "crossref", "core", "openaire", "hal", "doaj"]) {
		const out = await S[id](ctxWith([], { doi: "10.1/none" }));
		eq(out.locations, [], id);
	}
});

test("a server error propagates so the engine can report the source as unavailable", async () => {
	const S = load();
	await assert.rejects(S.semanticscholar(ctxWith([[/semanticscholar/, { status: 429, response: null }]], { doi: "10.1/x" })), /HTTP 429/);
});

test("a rate-limited source is skipped for a minute instead of failing every item", async () => {
	const S = load();
	let hits = 0;
	const ctx = () => ctxWith([[/semanticscholar/, () => { hits++; return { status: 429, response: null }; }]], { doi: "10.1/x" });
	const step = S.build(ctx()).find(s => s.id === "semanticscholar");
	await assert.rejects(step.find(), /429/);
	await assert.rejects(S.build(ctx()).find(s => s.id === "semanticscholar").find(), /cooling down/);
	assert.equal(hits, 1); // second item never called the API
});

test("Crossref lists a repeated PDF link once", async () => {
	const S = load();
	const link = { URL: "https://peerj.com/articles/4375.pdf", "content-type": "application/pdf" };
	const ctx = ctxWith([[/api\.crossref\.org\/works\/10/, ok({ message: { license: [{ URL: "http://creativecommons.org/licenses/by/4.0/" }],
		link: [link, Object.assign({}, link, { "content-type": "unspecified" })] } })]], { doi: "10.7717/peerj.4375" });
	assert.equal((await S.crossref(ctx)).locations.length, 1);
});

test("OSTI: the fulltext link of a DOE record is a location", async () => {
	const S = load();
	const ctx = ctxWith([[/osti\.gov/, ok([{ links: [
		{ rel: "citation", href: "https://www.osti.gov/biblio/1234567" },
		{ rel: "fulltext", href: "https://www.osti.gov/servlets/purl/1234567" }] }])]], { doi: "10.2172/1234567" });
	eq((await S.osti(ctx)).locations, [{ url: "https://www.osti.gov/servlets/purl/1234567", license: "US Government work" }]);
	eq((await S.osti(ctxWith([], { doi: "10.1/none" }))).locations, []);
	eq((await S.osti(ctxWith([], {}))).locations, []);
});

test("title match: a dropped subtitle counts only with a long prefix and agreeing years", () => {
	const S = load();
	const ctx = { title: "Deep residual learning for image recognition at scale: a study of depth", year: 2016 };
	assert.equal(S.titleMatches(ctx, "Deep residual learning for image recognition at scale", 2016), true);
	assert.equal(S.titleMatches(ctx, "Deep residual learning for image recognition at scale", 2010), false);
	assert.equal(S.titleMatches(ctx, "Deep residual learning for image recognition at scale", null), false);
	assert.equal(S.titleMatches(ctx, "Deep residual learning", 2016), false); // too short a prefix
	assert.equal(S.titleMatches({ title: "Attention is all you need", year: 2017 }, "Attention is all you need and more", 2017), false);
	assert.equal(S.titleMatches({ title: "A Title", year: 2017 }, "a title", 2018), true); // exact still within one year
});

test("build() includes OSTI and honours its switch", () => {
	assert.ok(load().build({ landings: [] }).some(s => s.id === "osti"));
	assert.ok(!load({ "source.osti": false }).build({ landings: [] }).some(s => s.id === "osti"));
});

/*
 * ZotPDF — extra free, legal PDF sources.
 * Each source answers "where might a free copy of this item be?" with candidate
 * PDF URLs; the engine downloads and sniffs them, so a wrong guess costs one request.
 * Identifier lookups (DOI, PMID, arXiv ID) are exact. Title lookups are accepted
 * only on an exact normalized title with a year within one.
 *
 * Source order: Europe PMC, Semantic Scholar, Crossref, CORE, OpenAIRE, preprint
 * servers and data repositories, HAL, DOAJ, OSTI, Internet Archive Scholar. Each is a Settings checkbox.
 */

ZotPDF.Sources = {
	LIST: [
		{ id: 'europepmc', label: 'Europe PMC' },
		{ id: 'semanticscholar', label: 'Semantic Scholar' },
		{ id: 'crossref', label: 'Crossref' },
		{ id: 'core', label: 'CORE' },
		{ id: 'openaire', label: 'OpenAIRE' },
		{ id: 'preprints', label: 'Preprint servers' },
		{ id: 'hal', label: 'HAL' },
		{ id: 'doaj', label: 'DOAJ' },
		{ id: 'osti', label: 'OSTI' },
		{ id: 'fatcat', label: 'Internet Archive Scholar' }
	],

	// Licenses we accept as "free to read and share" on a publisher-supplied link
	OPEN_LICENSE: /creativecommons\.org|publicdomain|open-government|opendata|\bcc[ -]?(by|0)\b/i,

	// source id -> time before which a rate-limited source is not asked again
	_cooldown: {},
	COOLDOWN_MS: 60000,

	enabled(id) {
		let value = ZotPDF.getPref('source.' + id);
		return value === undefined || value === null ? true : !!value;
	},

	/**
	 * @param {Object} ctx  { doi, pmid, pmcid, title, year, arxiv, email, landings, get }
	 *   get(url, headers) -> Promise<{status, response}> (paced by the engine)
	 *   landings: array the sources push free-to-read landing pages into
	 * @return {{id: String, label: String, find: Function}[]} in the order to try
	 */
	build(ctx) {
		ctx.landings = ctx.landings || [];
		ctx.preprintDOIs = [];
		let steps = [];
		for (let { id, label } of this.LIST) {
			if (this.enabled(id)) {
				steps.push({ id, label, find: () => this.guarded(id, ctx) });
			}
		}
		return steps;
	},

	// After an HTTP 429, leave a source alone for a minute instead of failing every item
	async guarded(id, ctx) {
		if ((this._cooldown[id] || 0) > Date.now()) {
			throw new Error('rate limited, cooling down');
		}
		try {
			return await this[id](ctx);
		}
		catch (e) {
			if (/\b429\b/.test(String(e && e.message))) {
				this._cooldown[id] = Date.now() + this.COOLDOWN_MS;
			}
			throw e;
		}
	},

	//
	// Helpers
	//

	normalizeTitle(title) {
		return String(title || '')
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/&/g, ' and ')
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
	},

	/**
	 * Exact normalized title and a year within one (or either year unknown). A title
	 * that is a long prefix of the other (a subtitle was dropped) also counts, but only
	 * when both years are known and agree.
	 */
	titleMatches(ctx, title, year) {
		if (!ctx.title || !title) {
			return false;
		}
		let a = this.normalizeTitle(title);
		let b = this.normalizeTitle(ctx.title);
		let y = parseInt(year, 10);
		let yearOK = !(ctx.year && y && Math.abs(y - ctx.year) > 1);
		if (a === b) {
			return yearOK;
		}
		let [short, long] = a.length <= b.length ? [a, b] : [b, a];
		return !!(ctx.year && y && yearOK && short.split(' ').length >= 6 && long.startsWith(short + ' '));
	},

	async json(ctx, url, headers) {
		let xhr = await ctx.get(url, headers);
		if (xhr.status === 404) {
			return null;
		}
		if (xhr.status < 200 || xhr.status >= 300) {
			throw new Error('HTTP ' + xhr.status);
		}
		let body = xhr.response;
		return typeof body === 'string' ? JSON.parse(body) : body;
	},

	cleanDOI(doi) {
		let m = String(doi || '').match(/10\.\d{4,9}\/\S+/);
		return m ? m[0].replace(/[.,;)]+$/, '').toLowerCase() : null;
	},

	// Remember a DOI/PMID learned from a trusted title match so later sources can use it
	learn(ctx, doi, pmid) {
		if (!ctx.doi && doi) {
			ctx.doi = this.cleanDOI(doi);
		}
		if (!ctx.pmid && pmid) {
			ctx.pmid = String(pmid);
		}
	},

	isDOILink(url) {
		return /^https?:\/\/(dx\.)?doi\.org\//i.test(url) || /pubmed\.ncbi\.nlm\.nih\.gov/i.test(url);
	},

	looksDirect(url) {
		return /\.pdf($|[?#])|\/pdf\b|\/download\b|viewcontent\.cgi|[?&]pdf=/i.test(url);
	},

	//
	// Sources
	//

	async europepmc(ctx) {
		let query;
		if (ctx.doi) {
			query = `DOI:"${ctx.doi}"`;
		}
		else if (ctx.pmid) {
			query = `EXT_ID:${ctx.pmid} AND SRC:MED`;
		}
		else if (ctx.title) {
			query = `TITLE:"${ctx.title.replace(/["\\]/g, ' ')}"`;
		}
		else {
			return { locations: [] };
		}
		let data = await this.json(ctx, 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query='
			+ encodeURIComponent(query) + '&resultType=core&format=json&pageSize=5');
		let results = (data && data.resultList && data.resultList.result) || [];
		let rec = ctx.doi || ctx.pmid
			? results[0]
			: results.find(r => this.titleMatches(ctx, r.title, r.pubYear));
		if (!rec) {
			return { locations: [] };
		}
		if (!ctx.doi && !ctx.pmid) {
			this.learn(ctx, rec.doi, rec.pmid);
		}
		let locations = [];
		for (let u of (rec.fullTextUrlList && rec.fullTextUrlList.fullTextUrl) || []) {
			// OA = open access, F = free to read
			if (!u.url || !/^(OA|F)$/i.test(u.availabilityCode || '')) {
				continue;
			}
			if (/pdf/i.test(u.documentStyle || '')) {
				locations.push({ url: u.url, license: rec.license || '' });
			}
			else if (/html/i.test(u.documentStyle || '') && !this.isDOILink(u.url)) {
				ctx.landings.push(u.url);
			}
		}
		return { locations };
	},

	async semanticscholar(ctx) {
		let key = (ZotPDF.getPref('semanticScholarKey') || '').trim();
		let headers = key ? { 'x-api-key': key } : undefined;
		let fields = 'title,year,externalIds,openAccessPdf';
		let base = 'https://api.semanticscholar.org/graph/v1/paper/';
		let paper = null;
		if (ctx.doi) {
			paper = await this.json(ctx, base + 'DOI:' + encodeURIComponent(ctx.doi) + '?fields=' + fields, headers);
		}
		else if (ctx.pmid) {
			paper = await this.json(ctx, base + 'PMID:' + ctx.pmid + '?fields=' + fields, headers);
		}
		else if (ctx.arxiv) {
			paper = await this.json(ctx, base + 'ARXIV:' + ctx.arxiv + '?fields=' + fields, headers);
		}
		else if (ctx.title) {
			let data = await this.json(ctx, base + 'search/match?query=' + encodeURIComponent(ctx.title)
				+ '&fields=' + fields, headers);
			let hit = data && data.data && data.data[0];
			if (hit && this.titleMatches(ctx, hit.title, hit.year)) {
				paper = hit;
				this.learn(ctx, hit.externalIds && hit.externalIds.DOI, hit.externalIds && hit.externalIds.PubMed);
			}
		}
		let pdf = paper && paper.openAccessPdf;
		if (!pdf || !pdf.url) {
			return { locations: [] };
		}
		// The link is sometimes a landing page; those go to the page-based step instead
		if (!this.looksDirect(pdf.url)) {
			ctx.landings.push(pdf.url);
			return { locations: [] };
		}
		return { locations: [{ url: pdf.url, license: pdf.license || '' }] };
	},

	async crossref(ctx) {
		let mailto = ctx.email ? '&mailto=' + encodeURIComponent(ctx.email) : '';
		// No DOI yet: learn one from a strict title match so the DOI-based sources can run
		if (!ctx.doi && ctx.title) {
			let data = await this.json(ctx, 'https://api.crossref.org/works?query.title='
				+ encodeURIComponent(ctx.title) + '&rows=3&select=DOI,title,issued' + mailto);
			for (let item of (data && data.message && data.message.items) || []) {
				let year = item.issued && item.issued['date-parts'] && item.issued['date-parts'][0]
					&& item.issued['date-parts'][0][0];
				if (this.titleMatches(ctx, (item.title || [])[0], year)) {
					this.learn(ctx, item.DOI);
					break;
				}
			}
		}
		if (!ctx.doi) {
			return { locations: [] };
		}
		let data = await this.json(ctx, 'https://api.crossref.org/works/' + encodeURIComponent(ctx.doi)
			+ (mailto ? '?' + mailto.slice(1) : ''));
		let msg = data && data.message;
		if (!msg) {
			return { locations: [] };
		}
		// A published article often points at its open preprint
		let relation = msg.relation || {};
		for (let rel of ['has-preprint', 'is-preprint-of']) {
			for (let r of relation[rel] || []) {
				if (r['id-type'] === 'doi' && r.id) {
					ctx.preprintDOIs.push(this.cleanDOI(r.id));
				}
			}
		}
		// Publisher-supplied full-text links count only when the record carries an open license
		let license = (msg.license || []).map(l => l.URL).find(u => this.OPEN_LICENSE.test(u || ''));
		if (!license) {
			return { locations: [] };
		}
		let locations = [];
		for (let link of msg.link || []) {
			let url = link.URL || '';
			if ((/pdf/i.test(link['content-type'] || '') || /\.pdf($|[?#])/i.test(url))
					&& !locations.some(l => l.url === url)) {
				locations.push({ url, license });
			}
		}
		return { locations };
	},

	async core(ctx) {
		let key = (ZotPDF.getPref('coreKey') || '').trim();
		let headers = key ? { Authorization: 'Bearer ' + key } : undefined;
		let q;
		if (ctx.doi) {
			q = `doi:"${ctx.doi}"`;
		}
		else if (ctx.title) {
			q = `title:"${ctx.title.replace(/["\\]/g, ' ')}"`;
		}
		else {
			return { locations: [] };
		}
		let data = await this.json(ctx, 'https://api.core.ac.uk/v3/search/works?limit=5&q=' + encodeURIComponent(q), headers);
		let results = (data && data.results) || [];
		let rec = ctx.doi
			? results.find(r => this.cleanDOI(r.doi) === ctx.doi)
			: results.find(r => this.titleMatches(ctx, r.title, r.yearPublished));
		if (!rec) {
			return { locations: [] };
		}
		if (!ctx.doi) {
			this.learn(ctx, rec.doi);
		}
		let urls = [rec.downloadUrl, ...(rec.sourceFulltextUrls || [])].filter(Boolean);
		let seen = new Set();
		let locations = [];
		for (let url of urls) {
			if (!seen.has(url) && !this.isDOILink(url)) {
				seen.add(url);
				locations.push({ url, license: '' });
			}
		}
		return { locations };
	},

	async openaire(ctx) {
		let url;
		if (ctx.doi) {
			url = 'https://api.openaire.eu/graph/v1/researchProducts?pid=' + encodeURIComponent(ctx.doi) + '&pageSize=3';
		}
		else if (ctx.title) {
			url = 'https://api.openaire.eu/graph/v1/researchProducts?mainTitle=' + encodeURIComponent(ctx.title) + '&pageSize=5';
		}
		else {
			return { locations: [] };
		}
		let data = await this.json(ctx, url);
		let results = (data && data.results) || [];
		let rec = ctx.doi
			? results[0]
			: results.find(r => this.titleMatches(ctx, r.mainTitle, r.publicationDate && r.publicationDate.slice(0, 4)));
		// Only products OpenAIRE itself rates open (COAR access right c_abf2)
		if (!rec || !rec.bestAccessRight || rec.bestAccessRight.code !== 'c_abf2') {
			return { locations: [] };
		}
		if (!ctx.doi) {
			let pid = (rec.pids || []).find(p => p.scheme === 'doi');
			this.learn(ctx, pid && pid.value);
		}
		let seen = new Set();
		let locations = [];
		for (let inst of rec.instances || []) {
			for (let u of inst.urls || []) {
				if (seen.has(u) || this.isDOILink(u) || !/^https?:/i.test(u)) {
					continue;
				}
				seen.add(u);
				if (this.looksDirect(u)) {
					locations.push({ url: u, license: inst.license || '' });
				}
				else {
					ctx.landings.push(u);
				}
			}
		}
		return { locations };
	},

	/**
	 * Preprint servers and data repositories, keyed on the DOI prefix. Also tries the
	 * preprint DOIs Crossref linked and any arXiv ID on the item.
	 */
	async preprints(ctx) {
		let locations = [];
		let dois = [ctx.doi, ...(ctx.preprintDOIs || [])].filter(Boolean);
		let arxiv = ctx.arxiv;
		for (let doi of dois) {
			let m = doi.match(/^10\.48550\/arxiv\.(.+)$/i);
			if (m && !arxiv) {
				arxiv = m[1];
			}
		}
		if (arxiv) {
			locations.push({ url: 'https://arxiv.org/pdf/' + arxiv.replace(/v\d+$/i, ''), license: '' });
		}

		for (let doi of dois) {
			let osf = doi.match(/^10\.(?:31219|31234|31235|31222|31223)\/osf\.io\/([a-z0-9]+)/i);
			if (osf) {
				locations.push({ url: 'https://osf.io/' + osf[1] + '/download', license: '', guess: true });
				continue;
			}
			let peerj = doi.match(/^10\.7287\/peerj\.preprints\.(\d+)/i);
			if (peerj) {
				locations.push({ url: 'https://peerj.com/preprints/' + peerj[1] + '.pdf', license: '', guess: true });
				continue;
			}
			if (/^10\.1101\//.test(doi)) {
				for (let server of ['biorxiv', 'medrxiv']) {
					let data = await this.json(ctx, `https://api.biorxiv.org/details/${server}/${doi}`);
					let entries = (data && data.collection) || [];
					let last = entries[entries.length - 1];
					if (last) {
						let host = String(last.server || server).toLowerCase();
						locations.push({
							url: `https://www.${host}.org/content/${doi}v${last.version || 1}.full.pdf`,
							license: last.license || '',
							guess: true
						});
						break;
					}
				}
				continue;
			}
			let zen = doi.match(/^10\.5281\/zenodo\.(\d+)/i);
			if (zen) {
				let rec = await this.json(ctx, 'https://zenodo.org/api/records/' + zen[1]);
				if (rec && rec.metadata && rec.metadata.access_right === 'open') {
					let license = (rec.metadata.license && rec.metadata.license.id) || '';
					for (let f of rec.files || []) {
						if (/\.pdf$/i.test(f.key || '') && f.links && f.links.self) {
							locations.push({ url: f.links.self, license });
						}
					}
				}
				continue;
			}
			let fig = doi.match(/^10\.6084\/m9\.figshare\.(\d+)/i);
			if (fig) {
				let rec = await this.json(ctx, 'https://api.figshare.com/v2/articles/' + fig[1]);
				if (rec) {
					let license = (rec.license && rec.license.name) || '';
					for (let f of rec.files || []) {
						if (/\.pdf$/i.test(f.name || '') && f.download_url && !f.is_link_only) {
							locations.push({ url: f.download_url, license });
						}
					}
				}
			}
		}
		return { locations };
	},

	async hal(ctx) {
		let q;
		if (ctx.doi) {
			q = `doiId_s:"${ctx.doi}"`;
		}
		else if (ctx.title) {
			q = `title_t:"${ctx.title.replace(/["\\]/g, ' ')}"`;
		}
		else {
			return { locations: [] };
		}
		let data = await this.json(ctx, 'https://api.archives-ouvertes.fr/search/?wt=json&rows=3'
			+ '&fl=fileMain_s,uri_s,title_s,producedDateY_i,doiId_s&q=' + encodeURIComponent(q));
		let docs = (data && data.response && data.response.docs) || [];
		let doc = ctx.doi
			? docs[0]
			: docs.find(d => this.titleMatches(ctx, (d.title_s || [])[0], d.producedDateY_i));
		if (!doc) {
			return { locations: [] };
		}
		if (!ctx.doi) {
			this.learn(ctx, doc.doiId_s);
		}
		if (doc.uri_s) {
			ctx.landings.push(doc.uri_s);
		}
		return { locations: doc.fileMain_s ? [{ url: doc.fileMain_s, license: '' }] : [] };
	},

	async doaj(ctx) {
		if (!ctx.doi) {
			return { locations: [] };
		}
		let data = await this.json(ctx, 'https://doaj.org/api/search/articles/'
			+ encodeURIComponent('doi:' + ctx.doi));
		let locations = [];
		for (let rec of (data && data.results) || []) {
			// Everything in DOAJ is open access by definition
			for (let link of (rec.bibjson && rec.bibjson.link) || []) {
				if (link.type !== 'fulltext' || !link.url) {
					continue;
				}
				if (/pdf/i.test(link.content_type || '') || this.looksDirect(link.url)) {
					locations.push({ url: link.url, license: '' });
				}
				else {
					ctx.landings.push(link.url);
				}
			}
		}
		return { locations };
	},

	async osti(ctx) {
		if (!ctx.doi) {
			return { locations: [] };
		}
		let data = await this.json(ctx, 'https://www.osti.gov/api/v1/records?rows=1&doi=' + encodeURIComponent(ctx.doi),
			{ Accept: 'application/json' });
		let rec = Array.isArray(data) ? data[0] : null;
		let link = rec && (rec.links || []).find(l => l.rel === 'fulltext' && l.href);
		// US Department of Energy research reports are public
		return { locations: link ? [{ url: link.href, license: 'US Government work' }] : [] };
	},

	// Internet Archive Scholar (fatcat): archived copies of papers, looked up by DOI
	async fatcat(ctx) {
		if (!ctx.doi) {
			return { locations: [] };
		}
		let rel = await this.json(ctx, 'https://api.fatcat.wiki/v0/release/lookup?hide=abstracts,refs&expand=files&doi='
			+ encodeURIComponent(ctx.doi));
		let seen = new Set();
		let archived = [];
		let others = [];
		for (let f of (rel && rel.files) || []) {
			if (f.mimetype && !/pdf/i.test(f.mimetype)) {
				continue;
			}
			for (let u of f.urls || []) {
				if (!u.url || seen.has(u.url) || !/^https?:/i.test(u.url)) {
					continue;
				}
				seen.add(u.url);
				(u.rel === 'webarchive' ? archived : others).push({ url: u.url, license: '' });
			}
		}
		// Archive.org copies first: they stay up when the original host drops the file
		return { locations: archived.concat(others) };
	}
};

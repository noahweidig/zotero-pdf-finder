/*
 * ZotPDF — matching items to OpenAlex works and turning them into PDF sources.
 * Based on OpenAlex PDF Finder, Copyright (c) 2026 Littview Inc. — MIT. See LICENSE.
 */

ZotPDF.Finder = {
	// Preferred order when several open-access copies exist
	VERSION_RANK: {
		publishedVersion: 0,
		acceptedVersion: 1,
		submittedVersion: 2
	},

	MAX_RESOLVERS: 8,

	// A second invocation while a run is in flight would see items whose download has
	// not landed yet and attach a duplicate, and would clear the first run's rows
	/**
	 * Everything ZotPDF's pipeline needs from OpenAlex for one item, after Unpaywall
	 * and PubMed Central came up empty:
	 *   locations  open-access PDF links (OpenAlex-marked OA, direct PDF only), best first
	 *   hosted     () => {bytes, url} | null   OpenAlex-hosted full text (needs a key)
	 *   publisher  () => source | null         publisher pages through Zotero's downloader
	 *   preferHosted  try hosted before the links
	 * Lookup errors propagate to the caller.
	 */
	async fallbackFor(item) {
		let work = (await this._matchWorks([item], null)).get(item.id) || this._arXivWork(item);
		if (!work) {
			return { locations: [] };
		}
		if (ZotPDF.getPref('saveWorkIDToExtra')) {
			try {
				await this._saveWorkID(item, work);
			}
			catch (e) {
				Zotero.logError(e);
			}
		}

		let candidates = [work.best_oa_location, ...(work.locations || [])];
		let arXiv = this._arXivWork(item);
		if (arXiv && arXiv !== work) {
			candidates.push(...arXiv.locations);
		}
		let seen = new Set();
		let ranked = [];
		for (let loc of candidates) {
			if (!loc || !loc.is_oa || !loc.pdf_url || seen.has(loc.pdf_url)) {
				continue;
			}
			seen.add(loc.pdf_url);
			let rank = this.VERSION_RANK[loc.version];
			ranked.push({ url: loc.pdf_url, license: loc.license || '', rank: rank === undefined ? 3 : rank });
		}
		ranked.sort((a, b) => a.rank - b.rank);

		let api = ZotPDF.API;
		let canHosted = !!ZotPDF.getPref('useHostedContent') && !!ZotPDF.getAPIKey()
			&& !api.keyRejected && api.hasHostedPDF(work) && !!api.hostedPDFURL(work);

		return {
			locations: ranked.slice(0, this.MAX_RESOLVERS).map(({ url, license }) => ({ url, license })),
			preferHosted: !!ZotPDF.getPref('preferHostedContent'),
			hosted: canHosted ? () => this._downloadHosted(work) : null,
			publisher: ZotPDF.getPref('tryPublisherPages') ? () => this._attachFromPublisher(item, work) : null
		};
	},

	async _downloadHosted(work) {
		let tempDir = (await Zotero.Attachments.createTemporaryStorageDirectory()).path;
		let tempPath = PathUtils.join(tempDir, 'openalex.pdf');
		try {
			let url = await ZotPDF.API.downloadHostedPDF(work, tempPath);
			return { bytes: await IOUtils.read(tempPath), url };
		}
		finally {
			await IOUtils.remove(tempDir, { recursive: true, ignoreAbsent: true });
		}
	},

	/**
	 * Hand the work's links, landing pages included, to Zotero's own downloader. It
	 * uses the browser session and translators, so licensed access through your
	 * institution works. Returns a source label when a file got attached.
	 */
	async _attachFromPublisher(item, work) {
		let resolvers = this._buildURLResolvers(work, this._arXivWork(item));
		if (!resolvers.length) {
			return null;
		}
		let attachment = await Zotero.Attachments.addFileFromURLs(item, resolvers);
		if (!attachment) {
			return null;
		}
		return resolvers[0].url || resolvers[0].pageURL || 'publisher page';
	},

	//
	// Matching items to OpenAlex works
	//

	/**
	 * @return {Promise<Map<Number, Object>>} item ID -> OpenAlex work
	 */
	async _matchWorks(items, progress, rejected = new Set()) {
		let api = ZotPDF.API;
		let matches = new Map();
		let identifiers = new Map();

		for (let item of items) {
			identifiers.set(item.id, this._identifiers(item));
		}

		// DOI first — it is exact, free as a batch, and by far the most common
		let dois = [];
		for (let ids of identifiers.values()) {
			if (ids.doi) {
				dois.push(ids.doi);
			}
		}
		if (dois.length) {
			let byDOI = await api.getWorksByIdentifiers('doi', dois);
			for (let item of items) {
				let doi = identifiers.get(item.id).doi;
				if (doi && byDOI.has(doi)) {
					matches.set(item.id, byDOI.get(doi));
				}
			}
		}

		// PMID for whatever the DOI pass missed
		let pmids = [];
		for (let item of items) {
			let ids = identifiers.get(item.id);
			if (!matches.has(item.id) && ids.pmid) {
				pmids.push(ids.pmid);
			}
		}
		if (pmids.length) {
			let byPMID = await api.getWorksByIdentifiers('pmid', pmids);
			for (let item of items) {
				let ids = identifiers.get(item.id);
				if (!matches.has(item.id) && ids.pmid && byPMID.has(ids.pmid)) {
					matches.set(item.id, byPMID.get(ids.pmid));
				}
			}
		}

		// Title search last: one request per item, and only accepted on an exact match
		if (ZotPDF.getPref('titleSearchFallback')) {
			for (let item of items) {
				if (matches.has(item.id) || (progress && progress.cancelled)) {
					continue;
				}
				let ids = identifiers.get(item.id);
				if (!ids.title) {
					continue;
				}
				let results;
				try {
					results = await api.searchByTitle(ids.title);
				}
				catch (e) {
					// One failed title search should not sink the whole run
					if (e.openAlexCode === 'auth' || e.openAlexCode === 'rate-limit') {
						throw e;
					}
					Zotero.logError(e);
					continue;
				}
				let work = results.find(candidate => this._titleMatches(ids, candidate));
				if (work) {
					matches.set(item.id, work);
				}
				else if (results.some(candidate => this._titleOnlyMatches(ids, candidate))) {
					// Same title, incompatible year: worth telling the user about rather
					// than reporting a flat "not found"
					rejected.add(item.id);
				}
			}
		}

		return matches;
	},

	_identifiers(item) {
		let api = ZotPDF.API;
		let extra = item.getField('extra') || '';

		let doi = api.normalizeDOI(item.getField('DOI') || item.getExtraField('DOI'));

		// arXiv preprints have a predictable DataCite DOI
		let arxiv = this._arXivID(item);
		if (!doi && arxiv) {
			doi = api.normalizeDOI('10.48550/arxiv.' + arxiv);
		}

		let pmidMatch = extra.match(/^\s*PMID\s*:\s*(\d+)/im);

		return {
			doi,
			pmid: pmidMatch ? pmidMatch[1] : null,
			title: item.getField('title') || '',
			normalizedTitle: this._normalizeTitle(item.getField('title') || ''),
			year: this._year(item)
		};
	},

	/** "arXiv: 1706.03762v5" in Extra, or an arxiv.org URL -> "1706.03762" */
	_arXivID(item) {
		let match = (item.getField('extra') || '').match(/^\s*arxiv\s*:\s*(\S+)/im)
			|| (item.getField('url') || '').match(/arxiv\.org\/(?:abs|pdf)\/(\S+?)(?:v\d+)?(?:\.pdf)?$/i);
		return match ? match[1].replace(/v\d+$/i, '') : null;
	},

	/**
	 * Fallback for arXiv items OpenAlex could not match. Older preprints often have no
	 * record under arXiv's DOI, and the title copy may carry a re-registered DOI with
	 * the wrong year. The arXiv ID itself is exact, so arXiv's own PDF is safe to use.
	 * Returns a location-only stand-in for a work, or null.
	 */
	_arXivWork(item) {
		let id = this._arXivID(item);
		if (!id) {
			return null;
		}
		return {
			locations: [{
				pdf_url: 'https://arxiv.org/pdf/' + id,
				landing_page_url: 'https://arxiv.org/abs/' + id,
				is_oa: true,
				version: 'submittedVersion',
				source: { display_name: 'arXiv' }
			}]
		};
	},

	_year(item) {
		let date = item.getField('date');
		if (!date) {
			return null;
		}
		let parsed = Zotero.Date.strToDate(date);
		return parsed && parsed.year ? parseInt(parsed.year, 10) : null;
	},

	/**
	 * Casefold, drop accents and punctuation. Two titles that differ only in
	 * typography normalize to the same string; anything else does not.
	 */
	_normalizeTitle(title) {
		return String(title)
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/&/g, ' and ')
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
	},

	/**
	 * Deliberately strict. A wrong PDF silently attached to the wrong reference is
	 * worse than no PDF at all, so a title match must be exact after normalization
	 * and must not contradict the item's year.
	 */
	_titleMatches(ids, work) {
		if (!this._titleOnlyMatches(ids, work)) {
			return false;
		}
		if (ids.year && work.publication_year && Math.abs(work.publication_year - ids.year) > 1) {
			return false;
		}
		return true;
	},

	_titleOnlyMatches(ids, work) {
		let candidateTitle = work.title || work.display_name || '';
		if (!candidateTitle || !ids.normalizedTitle) {
			return false;
		}
		return this._normalizeTitle(candidateTitle) === ids.normalizedTitle;
	},

	/**
	 * Turn a work's locations into resolvers for Zotero's downloader, best first.
	 *
	 * Direct PDF links come before landing pages, published versions before
	 * preprints, open access before paywalled. Paywalled landing pages are kept at
	 * the end because Zotero uses the browser's cookies and may well get through.
	 */
	_buildURLResolvers(work, arXivWork = null) {
		let entries = [];
		let seen = new Set();

		let locations = [work.best_oa_location, ...(work.locations || []), work.primary_location];
		if (arXivWork && arXivWork !== work) {
			locations.push(...arXivWork.locations);
		}
		if (work.open_access && work.open_access.oa_url) {
			locations.push({
				pdf_url: work.open_access.oa_url,
				is_oa: true,
				version: work.best_oa_location && work.best_oa_location.version
			});
		}

		for (let location of locations) {
			if (!location) {
				continue;
			}
			let sourceName = (location.source && location.source.display_name) || 'OpenAlex';
			let rank = (location.is_oa ? 0 : 100)
				+ (this.VERSION_RANK[location.version] !== undefined
					? this.VERSION_RANK[location.version]
					: 3) * 10;

			if (location.pdf_url && !seen.has(location.pdf_url)) {
				seen.add(location.pdf_url);
				entries.push({
					rank,
					url: location.pdf_url,
					pageURL: location.landing_page_url || undefined,
					accessMethod: sourceName,
					articleVersion: location.version
				});
			}
			else if (location.landing_page_url && !seen.has(location.landing_page_url)) {
				seen.add(location.landing_page_url);
				// No direct PDF: hand Zotero the page and let its translators look
				entries.push({
					rank: rank + 5,
					pageURL: location.landing_page_url,
					accessMethod: sourceName,
					articleVersion: location.version
				});
			}
		}

		entries.sort((a, b) => a.rank - b.rank);
		return entries.slice(0, this.MAX_RESOLVERS).map(entry => ({
			url: entry.url,
			pageURL: entry.pageURL,
			accessMethod: entry.accessMethod,
			articleVersion: entry.articleVersion
		}));
	},

	async _saveWorkID(item, work) {
		let id = ZotPDF.API.shortWorkID(work);
		if (!id) {
			return;
		}
		let extra = item.getField('extra') || '';
		if (new RegExp('^\\s*OpenAlex\\s*:\\s*' + id + '\\s*$', 'im').test(extra)) {
			return;
		}
		// Replace any stale OpenAlex line rather than stacking them up
		let lines = extra.split('\n').filter(line => !/^\s*OpenAlex\s*:/i.test(line));
		lines.push('OpenAlex: ' + id);
		item.setField('extra', lines.join('\n').trim());
		await item.saveTx();
	}
};

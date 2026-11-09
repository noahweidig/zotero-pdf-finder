/*
 * ZotPDF — preference pane script.
 * Based on OpenAlex PDF Finder, Copyright (c) 2026 Littview Inc. — MIT. See LICENSE.
 *
 * Runs in the preferences window, which has Zotero but not the plugin sandbox, so the
 * key check is implemented here. The write-back and batch buttons are wired by the
 * engine (Zotero.ZotPDF.Engine.prefsInit), which lives in the stable plugin scope.
 */

var ZotPDFPrefs = {
	KEY_PAGE: 'https://openalex.org/settings/api',
	RATE_LIMIT_URL: 'https://api.openalex.org/rate-limit',
	PREF_API_KEY: 'extensions.zotero.zotpdf.apiKey',

	openKeyPage() {
		Zotero.launchURL(this.KEY_PAGE);
	},

	// Hands the live pane root to the engine, which fills the token field and binds
	// the buttons against that document (the pane's scope is rebuilt on every open).
	init(root) {
		try {
			let engine = Zotero.ZotPDF && Zotero.ZotPDF.Engine;
			if (engine && engine.prefsInit) {
				engine.prefsInit(root);
			}
		}
		catch (e) {
			Zotero.debug('ZotPDF prefs: ' + e);
		}
	},

	_setStatus(id, args) {
		let elem = document.getElementById('zotpdf-apikey-status');
		if (elem) {
			document.l10n.setAttributes(elem, id, args);
		}
	},

	async testKey() {
		// Read the field rather than the pref: the pref is only written on "change", so a
		// key pasted and tested straight away would otherwise test the old value
		let input = document.getElementById('zotpdf-apikey');
		let key = ((input ? input.value : Zotero.Prefs.get(this.PREF_API_KEY, true)) || '').trim();
		if (!key) {
			this._setStatus('zotpdf-prefs-apikey-empty');
			return;
		}

		this._setStatus('zotpdf-prefs-apikey-testing');

		let xhr;
		try {
			xhr = await Zotero.HTTP.request('GET', this.RATE_LIMIT_URL, {
				headers: { Authorization: 'Bearer ' + key },
				responseType: 'json',
				successCodes: false,
				timeout: 20000,
				errorDelayMax: 0
			});
		}
		catch (e) {
			Zotero.logError(e);
			this._setStatus('zotpdf-prefs-apikey-error');
			return;
		}

		if (xhr.status === 401 || xhr.status === 403) {
			this._setStatus('zotpdf-prefs-apikey-invalid');
			return;
		}
		if (xhr.status < 200 || xhr.status >= 300) {
			this._setStatus('zotpdf-prefs-apikey-error');
			return;
		}

		// Every OpenAlex response carries the balance; the body shape may vary
		let remaining = xhr.getResponseHeader('X-RateLimit-Remaining');
		if (remaining === null && xhr.response) {
			let body = typeof xhr.response === 'string' ? JSON.parse(xhr.response) : xhr.response;
			remaining = body.remaining
				|| body.credits_remaining
				|| (body.rate_limit && body.rate_limit.remaining);
		}

		if (remaining === null || remaining === undefined || remaining === '') {
			this._setStatus('zotpdf-prefs-apikey-valid-nocredits');
		}
		else {
			this._setStatus('zotpdf-prefs-apikey-valid', {
				remaining: Number(remaining).toLocaleString()
			});
		}
	}
};

// Pane scripts are loaded into a sandbox whose prototype is the preferences window, so
// a bare `var` here is invisible to the inline oncommand handlers in the XHTML -- those
// are compiled against the window itself. Publish the object explicitly.
window.ZotPDFPrefs = ZotPDFPrefs;

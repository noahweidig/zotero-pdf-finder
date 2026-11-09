/*
 * ZotPDF — plugin lifecycle, menus, preferences and progress UI.
 * Portions derived from MIT- and Apache-2.0-licensed works; see LICENSE, LICENSE-APACHE and NOTICE.
 */

var ZotPDF = {
	id: null,
	version: null,
	rootURI: null,

	FTL_FILE: 'zotpdf.ftl',
	PREF_BRANCH: 'zotpdf.',
	QUEUE_ID: 'zotpdf',
	API_KEY_URL: 'https://openalex.org/settings/api',

	_l10n: null,
	_prefPaneID: null,
	_menuIDs: [],
	// Zotero 7 has no MenuManager, so there the menus are added to each window by hand.
	// Window -> { elements, listeners } for removal.
	_legacyMenus: null,
	_ownStringsWork: false,
	_columnKey: null,
	_sectionID: null,
	// progress kind -> { queue, onCancel }
	_queues: {},

	async init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;

		this._l10n = new Localization([this.FTL_FILE], true);

		// Zotero.getString() is used internally by the progress-queue dialog, so our
		// strings have to be reachable from it too.
		try {
			Zotero.ftl.addResourceIds([this.FTL_FILE]);
			Zotero.getString('zotpdf-progress-title-find');
			this._ownStringsWork = true;
		}
		catch (e) {
			this.log('Falling back to built-in strings for the progress dialog: ' + e);
		}

		await this.registerPreferencePane();
		this.registerMenus();
		this.registerItemUI();

		// Exposed for the preferences pane and for Tools -> Developer -> Run JavaScript
		Zotero.ZotPDF = this;

		for (let win of Zotero.getMainWindows()) {
			if (win.ZoteroPane) {
				this.onMainWindowLoad(win);
			}
		}

		this.log('Initialized version ' + version);
	},

	shutdown() {
		for (let win of Zotero.getMainWindows()) {
			this._removeLegacyMenus(win);
		}
		this._legacyMenus = null;

		for (let menuID of this._menuIDs) {
			try {
				Zotero.MenuManager.unregisterMenu(menuID);
			}
			catch (e) {
				this.log(e);
			}
		}
		this._menuIDs = [];

		this.unregisterItemUI();

		if (this._prefPaneID) {
			try {
				Zotero.PreferencePanes.unregister(this._prefPaneID);
			}
			catch (e) {
				this.log(e);
			}
			this._prefPaneID = null;
		}

		try {
			Zotero.ftl.removeResourceIds([this.FTL_FILE]);
		}
		catch (e) {
			// Not fatal — the strings just stay registered until restart
		}

		if (Zotero.ZotPDF === this) {
			delete Zotero.ZotPDF;
		}

		for (let { queue, onCancel } of Object.values(this._queues)) {
			try {
				queue.removeListener('cancel', onCancel);
				delete queue._zotpdfCancelListener;
			}
			catch (e) {
				// The queue outlives us either way
			}
		}
		this._queues = {};
		this._l10n = null;
	},

	onMainWindowLoad(window) {
		// Menu labels are Fluent IDs, so the window needs our .ftl loaded
		try {
			window.MozXULElement.insertFTLIfNeeded(this.FTL_FILE);
		}
		catch (e) {
			this.log(e);
		}
		if (this._legacyMenus) {
			this._addLegacyMenus(window);
		}
	},

	onMainWindowUnload(window) {
		this._removeLegacyMenus(window);
	},

	//
	// Preferences
	//

	getPref(name) {
		return Zotero.Prefs.get(this.PREF_BRANCH + name);
	},

	setPref(name, value) {
		return Zotero.Prefs.set(this.PREF_BRANCH + name, value);
	},

	getAPIKey() {
		return (this.getPref('apiKey') || '').trim();
	},

	async registerPreferencePane() {
		this._prefPaneID = await Zotero.PreferencePanes.register({
			pluginID: this.id,
			src: 'preferences.xhtml',
			scripts: ['preferences.js'],
			label: this.getString('zotpdf-prefs-title'),
			image: 'icons/zotpdf-48.svg',
			helpURL: 'https://noahweidig.github.io/zotpdf/settings/'
		});
	},

	openPreferences() {
		Zotero.Utilities.Internal.openPreferences(this._prefPaneID);
	},

	//
	// Localization
	//

	getString(key, args) {
		try {
			let value = this._l10n.formatValueSync(key, args);
			if (value) {
				return value;
			}
		}
		catch (e) {
			this.log(e);
		}
		return key;
	},

	//
	// Commands
	//

	selectedItems(win) {
		return (win && win.ZoteroPane ? win.ZoteroPane.getSelectedItems() : [])
			.filter(item => item && item.isRegularItem() && item.isTopLevelItem());
	},

	/** PDFs, then retractions, then metadata, for the same selection. */
	async fullCheck(win) {
		let items = this.selectedItems(win);
		if (!items.length) {
			this.alert(win, this.getString('zotpdf-progress-title-find'), this.getString('zotpdf-no-items'));
			return;
		}
		await this.Engine.run(items, win);
		await this.Engine.runRetraction(items, win);
		await this.Engine.runCitationCheck(items, win);
	},

	/**
	 * One list drives both the MenuManager menus and the Zotero 7 fallback.
	 * `scope` is 'item' (right-click menu, acts on the selection) or 'tools'.
	 */
	_menuSpec(scope) {
		let E = () => this.Engine;
		if (scope === 'item') {
			return [
				{ l10nID: 'zotpdf-menu-find', command: win => E().runForSelected(win) },
				{ l10nID: 'zotpdf-menu-dryrun', command: win => E().runDryForSelected(win) },
				{ l10nID: 'zotpdf-menu-retractions', command: win => E().runRetractionForSelected(win) },
				{ l10nID: 'zotpdf-menu-citations', command: win => E().runCitationCheckForSelected(win) },
				{ separator: true },
				{ l10nID: 'zotpdf-menu-full', command: win => this.fullCheck(win) }
			];
		}
		return [
			{ l10nID: 'zotpdf-menu-find-tagged', command: win => E().runForTag(win) },
			{ l10nID: 'zotpdf-menu-retractions-tagged', command: win => E().runRetractionForTag(win) },
			{ l10nID: 'zotpdf-menu-citations-tagged', command: win => E().runCitationCheckForTag(win) },
			{ l10nID: 'zotpdf-menu-export', command: win => E().exportMissing(win) },
			{ separator: true },
			{ l10nID: 'zotpdf-menu-settings', command: () => this.openPreferences() },
			{ l10nID: 'zotpdf-menu-audit', command: win => E().showAuditLog(win) }
		];
	},

	_run(promise, win) {
		// Errors here would otherwise be swallowed by the menu command handler
		Promise.resolve(promise).catch((e) => {
			Zotero.logError(e);
			this.alert(win, this.getString('zotpdf-error-unexpected'), String(e));
		});
	},

	//
	// Menus
	//

	registerMenus() {
		if (!Zotero.MenuManager) {
			this._legacyMenus = new Map();
			return;
		}

		let icon = this.rootURI + 'icons/zotpdf-16.svg';
		let toMenus = scope => this._menuSpec(scope).map(entry => (entry.separator
			? { menuType: 'separator' }
			: {
				menuType: 'menuitem',
				l10nID: entry.l10nID,
				onCommand: (event) => {
					let win = event.target.ownerGlobal;
					this._run(entry.command(win), win);
				}
			}));

		let itemMenuID = Zotero.MenuManager.registerMenu({
			menuID: 'zotpdf-item-menu',
			pluginID: this.id,
			target: 'main/library/item',
			menus: [{
				menuType: 'submenu',
				l10nID: 'zotpdf-menu',
				icon,
				onShowing: (event, ctx) => {
					let items = (ctx.items || []).filter(item => item && item.isRegularItem());
					ctx.setVisible(items.length > 0);
				},
				menus: toMenus('item')
			}]
		});
		if (itemMenuID) {
			this._menuIDs.push(itemMenuID);
		}

		let toolsMenuID = Zotero.MenuManager.registerMenu({
			menuID: 'zotpdf-tools-menu',
			pluginID: this.id,
			target: 'main/menubar/tools',
			menus: [{
				menuType: 'submenu',
				l10nID: 'zotpdf-menu',
				icon,
				menus: toMenus('tools')
			}]
		});
		if (toolsMenuID) {
			this._menuIDs.push(toolsMenuID);
		}
	},

	/**
	 * Zotero 7: the same two submenus as registerMenus(), added straight to the
	 * window's item context menu and Tools menu.
	 */
	_addLegacyMenus(win) {
		let doc = win.document;
		if (this._legacyMenus.has(win)) {
			return;
		}
		let entry = { elements: [], listeners: [] };
		this._legacyMenus.set(win, entry);

		let icon = `url("${this.rootURI}icons/zotpdf-16.svg")`;
		let add = (popupID, menuID, scope, onShowing) => {
			let popup = doc.getElementById(popupID);
			if (!popup) {
				this.log('Menu not found: ' + popupID);
				return;
			}
			let menu = doc.createXULElement('menu');
			menu.id = menuID;
			menu.classList.add('menu-iconic');
			menu.setAttribute('data-l10n-id', 'zotpdf-menu');
			menu.style.listStyleImage = icon;
			let sub = doc.createXULElement('menupopup');
			menu.appendChild(sub);

			for (let spec of this._menuSpec(scope)) {
				if (spec.separator) {
					sub.appendChild(doc.createXULElement('menuseparator'));
					continue;
				}
				let menuitem = doc.createXULElement('menuitem');
				menuitem.setAttribute('data-l10n-id', spec.l10nID);
				menuitem.addEventListener('command', () => this._run(spec.command(win), win));
				sub.appendChild(menuitem);
			}
			popup.appendChild(menu);
			entry.elements.push(menu);

			let listener = (event) => {
				if (event.target === popup) {
					onShowing(menu);
				}
			};
			popup.addEventListener('popupshowing', listener);
			entry.listeners.push([popup, listener]);
		};

		add('zotero-itemmenu', 'zotpdf-itemmenu', 'item', (menu) => {
			menu.hidden = !(win.ZoteroPane ? win.ZoteroPane.getSelectedItems() : [])
				.some(item => item && (item.isRegularItem() || item.parentItem));
		});
		add('menu_ToolsPopup', 'zotpdf-toolsmenu', 'tools', () => {});
	},

	_removeLegacyMenus(win) {
		let entry = this._legacyMenus && this._legacyMenus.get(win);
		if (!entry) {
			return;
		}
		for (let [popup, listener] of entry.listeners) {
			popup.removeEventListener('popupshowing', listener);
		}
		for (let element of entry.elements) {
			element.remove();
		}
		this._legacyMenus.delete(win);
	},

	//
	// Dialogs
	//

	alert(win, title, text) {
		Services.prompt.alert(win || Zotero.getMainWindow(), title, text);
	},

	//
	// Progress UI
	//

	/**
	 * A thin wrapper over Zotero's progress-queue dialog: a table of items with a
	 * per-row status, a cancel button, and double-click to reveal the item. One queue
	 * per kind of run ('find', 'retraction', 'citation').
	 */
	createProgress(kind) {
		let id = this.QUEUE_ID + '-' + kind;
		let entry = this._queues[kind];
		let queue = entry ? entry.queue : Zotero.ProgressQueues.get(id);
		if (!queue) {
			queue = Zotero.ProgressQueues.create({
				id,
				title: this._ownStringsWork
					? 'zotpdf-progress-title-' + kind
					: 'pane.items.menu.findAvailableFile',
				columns: this._ownStringsWork
					? ['zotpdf-progress-column-item', 'zotpdf-progress-column-status']
					: ['general.item', 'attachment.fullText']
			});
		}

		// Zotero keeps progress queues for the whole session and has no way to delete
		// one, so after an in-place update or a disable/enable the queue still carries
		// the previous plugin instance's cancel listener. Replace it with ours.
		let previous = queue._zotpdfCancelListener;
		if (previous) {
			queue.removeListener('cancel', previous);
		}
		let state = { cancelled: false, callbacks: [] };
		let onCancel = () => {
			state.cancelled = true;
			for (let callback of state.callbacks) {
				try {
					callback();
				}
				catch (e) {
					Zotero.logError(e);
				}
			}
		};
		queue.addListener('cancel', onCancel);
		queue._zotpdfCancelListener = onCancel;
		this._queues[kind] = { queue, onCancel };

		// Start from a clean table on every run
		for (let row of queue.getRows().slice()) {
			queue.deleteRow(row.id);
		}

		let dialog = queue.getDialog();
		// Let the window be minimized so a long run stays out of the way
		dialog.showMinimizeButton(true);
		dialog.open();

		return {
			get cancelled() {
				return state.cancelled;
			},
			onCancel(callback) {
				state.callbacks.push(callback);
			},
			add(item) {
				queue.addRow(item);
			},
			processing(item, message) {
				queue.updateRow(item.id, Zotero.ProgressQueue.ROW_PROCESSING, message || '');
			},
			succeeded(item, message) {
				queue.updateRow(item.id, Zotero.ProgressQueue.ROW_SUCCEEDED, message || '');
			},
			failed(item, message) {
				queue.updateRow(item.id, Zotero.ProgressQueue.ROW_FAILED, message || '');
			},
			setStatus(message) {
				dialog.setStatus(message);
			}
		};
	},

	/** Corner popup, used for the one-line result when a run finishes. */
	popup(headline, message) {
		let progressWindow = new Zotero.ProgressWindow();
		progressWindow.changeHeadline(headline);
		let itemProgress = new progressWindow.ItemProgress('attachmentPDF', message);
		progressWindow.show();
		itemProgress.setProgress(100);
		progressWindow.startCloseTimer(7000);
	},

	//
	// Item list column and item pane section (Zotero versions that offer the APIs)
	//

	registerItemUI() {
		let engine = () => this.Engine;
		try {
			if (Zotero.ItemTreeManager && Zotero.ItemTreeManager.registerColumns) {
				this._columnKey = Zotero.ItemTreeManager.registerColumns({
					dataKey: 'zotpdf-status',
					label: 'ZotPDF',
					pluginID: this.id,
					dataProvider: item => (engine() ? engine().statusLabel(item) : '')
				}) || null;
			}
		}
		catch (e) {
			this.log('Column not registered: ' + e);
		}

		try {
			if (Zotero.ItemPaneManager && Zotero.ItemPaneManager.registerSection) {
				let icon = this.rootURI + 'icons/zotpdf-16.svg';
				this._sectionID = Zotero.ItemPaneManager.registerSection({
					paneID: 'zotpdf',
					pluginID: this.id,
					header: { l10nID: 'zotpdf-section-header', icon },
					sidenav: { l10nID: 'zotpdf-section-sidenav', icon },
					onItemChange: ({ item, setEnabled }) => {
						setEnabled(!!item && item.isRegularItem());
					},
					onRender: ({ body, item, setSectionSummary }) => this._renderSection(body, item, setSectionSummary)
				}) || null;
			}
		}
		catch (e) {
			this.log('Item pane section not registered: ' + e);
		}
	},

	unregisterItemUI() {
		try {
			if (this._columnKey) {
				Zotero.ItemTreeManager.unregisterColumns(this._columnKey);
			}
		}
		catch (e) {
			this.log(e);
		}
		this._columnKey = null;
		try {
			if (this._sectionID) {
				Zotero.ItemPaneManager.unregisterSection(this._sectionID);
			}
		}
		catch (e) {
			this.log(e);
		}
		this._sectionID = null;
	},

	_renderSection(body, item, setSectionSummary) {
		let engine = this.Engine;
		if (!engine || !item) {
			return;
		}
		let doc = body.ownerDocument;
		let win = doc.defaultView;
		let summary = engine.statusSummary(item);
		try {
			setSectionSummary(summary.label);
		}
		catch (e) {
			// The summary is decoration
		}

		let wrap = doc.createElement('div');
		wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px 0';
		let line = (name, value) => {
			let row = doc.createElement('div');
			row.style.cssText = 'display:flex;gap:8px';
			let k = doc.createElement('span');
			k.style.cssText = 'min-width:6.5em;opacity:.7';
			k.textContent = name;
			let v = doc.createElement('span');
			v.textContent = value;
			row.append(k, v);
			wrap.append(row);
		};
		line('PDF', summary.pdf);
		line('Retraction', summary.retraction);
		line('Metadata', summary.citation);

		let buttons = doc.createElement('div');
		buttons.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:4px';
		let add = (label, fn) => {
			let button = doc.createElement('button');
			button.textContent = label;
			button.addEventListener('click', () => this._run(fn(), win));
			buttons.append(button);
		};
		add('Find PDF', () => engine.run([item], win));
		add('Check retraction', () => engine.runRetraction([item], win));
		add('Check metadata', () => engine.runCitationCheck([item], win));
		wrap.append(buttons);

		body.replaceChildren(wrap);
	},

	log(message) {
		Zotero.debug('[ZotPDF] ' + message);
	}
};

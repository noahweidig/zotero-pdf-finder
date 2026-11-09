/*
 * ZotPDF — OpenAlex PDF Finder + FullVahti.
 * OpenAlex PDF Finder: Copyright (c) 2026 Littview Inc. — MIT. See LICENSE.
 * FullVahti: Copyright 2026 Heidi Andersén / Vahtian — Apache-2.0. See LICENSE-FULLVAHTI.
 *
 * Bootstrap entry points. Zotero loads this file into a privileged sandbox that
 * already provides Zotero, Services, Localization, IOUtils, PathUtils, fetch and
 * the REASONS constants (APP_SHUTDOWN etc.) as globals.
 */

var ZoteroOpenAlex;
var FullVahti;

function install() {}

function uninstall() {}

async function startup({ id, version, rootURI }) {
	Services.scriptloader.loadSubScript(rootURI + 'src/plugin.js');
	Services.scriptloader.loadSubScript(rootURI + 'src/openalex-client.js');
	Services.scriptloader.loadSubScript(rootURI + 'src/finder.js');
	await ZoteroOpenAlex.init({ id, version, rootURI });

	// FullVahti is optional: a failure here must not take the OpenAlex finder down
	try {
		Zotero.PreferencePanes.register({
			pluginID: id,
			src: rootURI + 'preferences-fullvahti.xhtml',
			scripts: [rootURI + 'preferences-fullvahti.js'],
			label: 'FullVahti',
			image: rootURI + 'icons/fullvahti.svg'
		});
		Services.scriptloader.loadSubScript(rootURI + 'src/fullvahti.js');
		FullVahti.init({ id, version, rootURI });
		// The preference pane runs in a separate scope and reaches FullVahti through this
		Zotero.FullVahti = FullVahti;
		FullVahti.addToAllWindows();
		FullVahti.registerEndpoints();
	}
	catch (e) {
		Zotero.logError(e);
	}
}

function shutdown(_data, reason) {
	// Nothing to tear down if the whole app is going away
	if (reason === APP_SHUTDOWN) {
		return;
	}
	if (FullVahti) {
		try {
			FullVahti.unregisterEndpoints();
			FullVahti.removeFromAllWindows();
		}
		catch (e) {
			Zotero.logError(e);
		}
		try {
			delete Zotero.FullVahti;
		}
		catch (e) {
			Zotero.FullVahti = undefined;
		}
		FullVahti = undefined;
	}
	if (ZoteroOpenAlex) {
		ZoteroOpenAlex.shutdown();
		ZoteroOpenAlex = undefined;
	}
}

function onMainWindowLoad({ window }) {
	if (ZoteroOpenAlex) {
		ZoteroOpenAlex.onMainWindowLoad(window);
	}
	if (FullVahti) {
		FullVahti.addToWindow(window);
	}
}

function onMainWindowUnload({ window }) {
	if (ZoteroOpenAlex) {
		ZoteroOpenAlex.onMainWindowUnload(window);
	}
	if (FullVahti) {
		FullVahti.removeFromWindow(window);
	}
}

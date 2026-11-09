/*
 * ZotPDF — find open-access PDFs, check retractions and citation metadata.
 * Portions derived from MIT- and Apache-2.0-licensed works; see LICENSE,
 * LICENSE-APACHE and NOTICE.
 *
 * Bootstrap entry points. Zotero loads this file into a privileged sandbox that
 * already provides Zotero, Services, Localization, IOUtils, PathUtils, fetch and
 * the REASONS constants (APP_SHUTDOWN etc.) as globals.
 */

var ZotPDF;

function install() {}

function uninstall() {}

async function startup({ id, version, rootURI }) {
	Services.scriptloader.loadSubScript(rootURI + 'src/plugin.js');
	Services.scriptloader.loadSubScript(rootURI + 'src/openalex-client.js');
	Services.scriptloader.loadSubScript(rootURI + 'src/finder.js');
	Services.scriptloader.loadSubScript(rootURI + 'src/sources.js');
	Services.scriptloader.loadSubScript(rootURI + 'src/engine.js');

	ZotPDF.Engine.init({ id, version, rootURI });
	await ZotPDF.init({ id, version, rootURI });
	ZotPDF.Engine.registerEndpoints();
}

function shutdown(_data, reason) {
	// Nothing to tear down if the whole app is going away
	if (reason === APP_SHUTDOWN) {
		return;
	}
	if (ZotPDF) {
		try {
			ZotPDF.Engine.unregisterEndpoints();
		}
		catch (e) {
			Zotero.logError(e);
		}
		ZotPDF.shutdown();
		ZotPDF = undefined;
	}
}

function onMainWindowLoad({ window }) {
	if (ZotPDF) {
		ZotPDF.onMainWindowLoad(window);
	}
}

function onMainWindowUnload({ window }) {
	if (ZotPDF) {
		ZotPDF.onMainWindowUnload(window);
	}
}

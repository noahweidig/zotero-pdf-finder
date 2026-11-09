/*
 * ZotPDF — find open-access PDFs, check retractions and citation metadata.
 * Based on OpenAlex PDF Finder (Littview Inc., MIT; see LICENSE) and FullVahti
 * (Heidi Andersén / Vahtian, Apache-2.0; see LICENSE-FULLVAHTI).
 *
 * Bootstrap entry points. Zotero loads this file into a privileged sandbox that
 * already provides Zotero, Services, Localization, IOUtils, PathUtils, fetch and
 * the REASONS constants (APP_SHUTDOWN etc.) as globals.
 */

var ZotPDF;
var FullVahti;

function install() {}

function uninstall() {}

async function startup({ id, version, rootURI }) {
	Services.scriptloader.loadSubScript(rootURI + 'src/plugin.js');
	Services.scriptloader.loadSubScript(rootURI + 'src/openalex-client.js');
	Services.scriptloader.loadSubScript(rootURI + 'src/finder.js');
	Services.scriptloader.loadSubScript(rootURI + 'src/fullvahti.js');

	FullVahti.init({ id, version, rootURI });
	ZotPDF.Engine = FullVahti;
	await ZotPDF.init({ id, version, rootURI });
	FullVahti.registerEndpoints();
}

function shutdown(_data, reason) {
	// Nothing to tear down if the whole app is going away
	if (reason === APP_SHUTDOWN) {
		return;
	}
	if (FullVahti) {
		try {
			FullVahti.unregisterEndpoints();
		}
		catch (e) {
			Zotero.logError(e);
		}
		FullVahti = undefined;
	}
	if (ZotPDF) {
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

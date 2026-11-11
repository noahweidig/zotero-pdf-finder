// Default preferences for ZotPDF.
// Read via Zotero.Prefs.get('zotpdf.<name>'), i.e. extensions.zotero.zotpdf.<name>.

// Contact email: sent to Unpaywall, NCBI, Europe PMC, Crossref and as OpenAlex's
// `mailto` ("polite pool"). Asked for once on the first run.
pref("extensions.zotero.zotpdf.email", "");

// OpenAlex API key. Free at https://openalex.org/settings/api
// Needed only for OpenAlex-hosted PDF downloads and higher metadata limits.
pref("extensions.zotero.zotpdf.apiKey", "");

// Download PDFs that OpenAlex hosts itself (needs a key; ~$0.01/file, ~100/day free).
pref("extensions.zotero.zotpdf.useHostedContent", true);

// Try the OpenAlex-hosted copy before open-access links. Off: the free route costs no credits.
pref("extensions.zotero.zotpdf.preferHostedContent", false);

// As a last step, hand publisher pages to Zotero's own downloader (uses your institutional access).
pref("extensions.zotero.zotpdf.tryPublisherPages", true);

// Items without DOI/PMID/arXiv ID: look the work up by exact normalized title plus a year check.
pref("extensions.zotero.zotpdf.titleSearchFallback", true);

// Record the matched OpenAlex work ID in the item's Extra field.
pref("extensions.zotero.zotpdf.saveWorkIDToExtra", false);

// Tag that selects the batch for the Tools-menu runs.
pref("extensions.zotero.zotpdf.triggerTag", "zotpdf");

// After retraction and metadata checks, also save one report note. (PDF runs never write notes.)
pref("extensions.zotero.zotpdf.reportNote", false);

// Milliseconds to pause between items and requests.
pref("extensions.zotero.zotpdf.delayMs", 400);

// Local write-back API for external tools (advanced; off by default).
pref("extensions.zotero.zotpdf.writebackEnabled", false);
pref("extensions.zotero.zotpdf.writebackToken", "");
pref("extensions.zotero.zotpdf.auditLog", "");

// Extra free sources (see src/sources.js). Each can be switched off.
pref("extensions.zotero.zotpdf.source.europepmc", true);
pref("extensions.zotero.zotpdf.source.semanticscholar", true);
pref("extensions.zotero.zotpdf.source.crossref", true);
pref("extensions.zotero.zotpdf.source.core", true);
pref("extensions.zotero.zotpdf.source.openaire", true);
pref("extensions.zotero.zotpdf.source.preprints", true);
pref("extensions.zotero.zotpdf.source.hal", true);
pref("extensions.zotero.zotpdf.source.doaj", true);
pref("extensions.zotero.zotpdf.source.osti", true);
pref("extensions.zotero.zotpdf.source.fatcat", true);
// Retry dead open-access links through the Internet Archive's copies.
pref("extensions.zotero.zotpdf.source.wayback", true);
// Optional keys: raise rate limits.
pref("extensions.zotero.zotpdf.coreKey", "");
pref("extensions.zotero.zotpdf.semanticScholarKey", "");

// Parallel workers for a PDF run, and a dry-run mode that attaches nothing.
pref("extensions.zotero.zotpdf.concurrency", 3);
pref("extensions.zotero.zotpdf.dryRun", false);
// Remember "no open-access copy" for a day so re-runs skip the lookups.
pref("extensions.zotero.zotpdf.useCache", true);
pref("extensions.zotero.zotpdf.cache", "");
// Fill an empty DOI field when a title match finds the DOI.
pref("extensions.zotero.zotpdf.writeBackDOI", false);

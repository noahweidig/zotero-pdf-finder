---
icon: lucide/life-buoy
tags:
  - Help
  - PDFs
---

# Troubleshooting

??? question "The ZotPDF menu is missing"

    Open Tools → Plugins. ZotPDF should be listed and enabled. If it says it's incompatible with your Zotero version, [install the latest release](https://github.com/noahweidig/zotpdf/releases/latest). The right-click submenu hides when only notes are selected.

??? question "Duplicate menus"

    Another PDF-finder plugin is installed alongside ZotPDF. Uninstall it in Tools → Plugins.

??? question "\"OpenAlex rate limit reached\""

    The free daily allowance is used up (it resets at midnight UTC). Wait, or add a free API key.

??? question "\"OpenAlex rejected the API key\""

    Check the key in Settings → ZotPDF and press *Test*. Metadata lookups continue anonymously; only hosted downloads stop.

??? question "A source shows \"unavailable\""

    Most often a rate limit (Semantic Scholar and CORE without a key). ZotPDF skips that source for a minute and carries on. A free key in Settings avoids it.

??? question "Cancel seems slow"

    Cancel aborts requests in flight, so it should stop within a second. If a publisher-page download was already handed to Zotero's own downloader, that single download finishes first; nothing after it starts.

??? question "A PDF was rejected as \"a different DOI\""

    The file embeds a DOI that is not the item's. Check the item's DOI field; a wrong DOI is the usual cause. Fix it and run again.

??? question "Everything comes back \"check needed\""

    Usually a network problem or a blocked host. Make sure `api.unpaywall.org`, `eutils.ncbi.nlm.nih.gov`, `pmc-oa-opendata.s3.amazonaws.com`, `api.openalex.org` and `api.crossref.org` are reachable.

??? question "A publisher returned a page instead of a PDF"

    That link is rejected automatically and the next source is tried. Publishers that block automated downloads show as "listed a PDF link but it didn't download".

## Report a bug

Turn on **Help → Debug Output Logging**, run the command again, then **View Output**. Lines starting with `[ZotPDF]` are ours. [Open an issue](https://github.com/noahweidig/zotpdf/issues) with them.

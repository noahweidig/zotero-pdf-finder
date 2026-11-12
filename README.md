# ZotPDF

**Select references in Zotero, right-click, and get free legal PDFs attached, retractions flagged, and bad citation metadata reported.**

ZotPDF looks for each PDF in one pass through Unpaywall, PubMed Central and OpenAlex, and
adds retraction and metadata checks on top. Made for literature reviews: you've just
imported 300 references and need the PDFs behind them, and a clean reference list.

<p align="center">
  <a href="https://github.com/noahweidig/zotpdf/releases/latest/download/zotpdf.xpi"><b>⬇ Download zotpdf.xpi</b></a>
  &nbsp;·&nbsp; <a href="https://noahweidig.github.io/zotpdf/"><b>Documentation</b></a>
  &nbsp;·&nbsp; Zotero 7+ &nbsp;·&nbsp; Free and open source
</p>

## What it does

- **Find PDFs.** Per item, the first of 15 free sources to return a real PDF wins:
  Unpaywall, PubMed Central, Europe PMC, Semantic Scholar, Crossref (open-licensed links
  and linked preprints), CORE, OpenAIRE, preprint servers and repositories (arXiv, bioRxiv,
  medRxiv, OSF, PeerJ, Zenodo, Figshare), HAL, DOAJ, OSTI, OpenAlex (links and optional hosted
  full text), then free-to-read pages through Zotero's downloader. Dead links are retried
  through the Internet Archive. Matches by DOI, PMID, arXiv ID or exact title; the result
  column names the source that worked. Every source has a checkbox. Each item is tagged
  `fulltext:pdf-found`, `fulltext:pdf-missing` or `fulltext:check-needed`.
  **No notes are created.**
- **Check retractions.** PubMed plus Crossref (which carries the Retraction Watch
  database). Tags `retraction:retracted`, `retraction:none` or `retraction:check-needed`.
- **Check citation metadata.** Compares each record with Crossref and flags missing
  fields and mismatches, which often mean the wrong DOI. Read-only.
- **One menu.** Right-click → **ZotPDF**: Find PDFs, Check for retractions, Check
  citation metadata, or Full check. For a tagged batch use **Tools → ZotPDF**.
- **One progress table** per run, with a result for every item and a Cancel button.

## Install

1. Download [`zotpdf.xpi`](https://github.com/noahweidig/zotpdf/releases/latest/download/zotpdf.xpi).
   (Firefox: right-click → **Save Link As…**.)
2. In Zotero: **Tools → Plugins**, drag the file in (or ⚙ → **Install Plugin From File…**).

No account, no API key, no restart. If another PDF-finder plugin is installed,
uninstall it first to avoid duplicate menus.

## Docs

Everything is on the documentation site: [install](https://noahweidig.github.io/zotpdf/install/),
[usage](https://noahweidig.github.io/zotpdf/usage/),
[how the PDF chain works](https://noahweidig.github.io/zotpdf/how-it-works/),
[checks](https://noahweidig.github.io/zotpdf/checks/),
[settings](https://noahweidig.github.io/zotpdf/settings/),
[privacy](https://noahweidig.github.io/zotpdf/privacy/) and
[troubleshooting](https://noahweidig.github.io/zotpdf/troubleshooting/).

## Privacy

DOIs, PMIDs, arXiv IDs and titles of the items you select go to the services above, with
your contact email where an API asks for one. Nothing is stored elsewhere; no accounts,
no analytics. See [privacy](https://noahweidig.github.io/zotpdf/privacy/).

## Licenses

ZotPDF includes code under the MIT and Apache-2.0 licenses a Zotero icon (AGPL-3.0, see NOTICE) and Lucide docs icons (ISC):
[`LICENSE`](LICENSE), [`LICENSE-APACHE`](LICENSE-APACHE), [`NOTICE`](NOTICE),
[`LICENSE-LUCIDE`](LICENSE-LUCIDE). Developers: see [CONTRIBUTING.md](CONTRIBUTING.md).

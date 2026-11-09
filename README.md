# ZotPDF

**Select references in Zotero, right-click, and get free legal PDFs attached, retractions flagged, and bad citation metadata reported.**

ZotPDF looks for each PDF in one pass through Unpaywall, PubMed Central and OpenAlex, and
adds retraction and metadata checks on top. Made for literature reviews: you've just
imported 300 references and need the PDFs behind them, and a clean reference list.

<p align="center">
  <a href="https://github.com/noahweidig/ZotPDF/releases/latest/download/zotpdf.xpi"><b>⬇ Download zotpdf.xpi</b></a>
  &nbsp;·&nbsp; <a href="https://noahweidig.github.io/ZotPDF/"><b>Documentation</b></a>
  &nbsp;·&nbsp; Zotero 7+ &nbsp;·&nbsp; Free and open source
</p>

## What it does

- **Find PDFs.** Per item, the first source that returns a real PDF wins:
  Unpaywall, PubMed Central (OA subset), OpenAlex open-access links, OpenAlex-hosted
  full text (optional, needs a free key), then publisher pages through Zotero's own
  downloader (optional). Matches by DOI, PMID, arXiv ID or exact title.
  Each item is tagged `fulltext:pdf-found`, `fulltext:pdf-missing` or
  `fulltext:check-needed`. **No notes are created.**
- **Check retractions.** PubMed plus Crossref (which carries the Retraction Watch
  database). Tags `retraction:retracted`, `retraction:none` or `retraction:check-needed`.
- **Check citation metadata.** Compares each record with Crossref and flags missing
  fields and mismatches, which often mean the wrong DOI. Read-only.
- **One menu.** Right-click → **ZotPDF**: Find PDFs, Check for retractions, Check
  citation metadata, or Full check. For a tagged batch use **Tools → ZotPDF**.
- **One progress table** per run, with a result for every item and a Cancel button.

## Install

1. Download [`zotpdf.xpi`](https://github.com/noahweidig/ZotPDF/releases/latest/download/zotpdf.xpi).
   (Firefox: right-click → **Save Link As…**.)
2. In Zotero: **Tools → Plugins**, drag the file in (or ⚙ → **Install Plugin From File…**).

No account, no API key, no restart. If you had OpenAlex PDF Finder or FullVahti
installed, uninstall them first: ZotPDF replaces both.

## Docs

Everything is on the documentation site: [install](https://noahweidig.github.io/ZotPDF/install.html),
[usage](https://noahweidig.github.io/ZotPDF/usage.html),
[how the PDF chain works](https://noahweidig.github.io/ZotPDF/how-it-works.html),
[checks](https://noahweidig.github.io/ZotPDF/checks.html),
[settings](https://noahweidig.github.io/ZotPDF/settings.html),
[privacy](https://noahweidig.github.io/ZotPDF/privacy.html) and
[troubleshooting](https://noahweidig.github.io/ZotPDF/troubleshooting.html).

## Privacy

DOIs, PMIDs, arXiv IDs and titles of the items you select go to the services above, with
your contact email where an API asks for one. Nothing is stored elsewhere; no accounts,
no analytics. See [privacy](https://noahweidig.github.io/ZotPDF/privacy.html).

## Credits and licenses

ZotPDF combines [OpenAlex PDF Finder](https://github.com/Littview/zotero-openalex-pdf)
by Littview Inc. (MIT) and [FullVahti](https://github.com/heidihelena/fullvahti) by
Heidi Andersén / Vahtian (Apache-2.0), with a [Lucide](https://lucide.dev) icon (ISC).
Licenses: [`LICENSE`](LICENSE), [`LICENSE-FULLVAHTI`](LICENSE-FULLVAHTI),
[`LICENSE-LUCIDE`](LICENSE-LUCIDE), [`NOTICE`](NOTICE).

Data comes from [OpenAlex](https://openalex.org), Unpaywall, PubMed Central, Europe PMC
and Crossref. Developers: see [CONTRIBUTING.md](CONTRIBUTING.md).

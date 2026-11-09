---
icon: lucide/settings
tags:
  - Settings
  - Sources
---

# Settings

Zotero → Settings → **ZotPDF** (Windows and Linux: Edit → Settings). Every setting has a sensible default.

| Setting | Default | What it does |
| --- | --- | --- |
| **Contact email** | asked once | Sent to Unpaywall, NCBI, Europe PMC, Crossref and OpenAlex (its "polite pool"). Never to us. |
| **OpenAlex API key** | none | Free at [openalex.org/settings/api](https://openalex.org/settings/api). Needed only for hosted downloads. *Test* shows remaining credits. |
| **Europe PMC, Semantic Scholar, Crossref, CORE, OpenAIRE, preprint servers, HAL, DOAJ, OSTI** | on | One checkbox each. Unpaywall, PubMed Central and OpenAlex links are always on. See [How it works](how-it-works.md). |
| **Retry dead links through the Internet Archive** | on | Looks up the Archive's copy of any open-access link that fails. |
| **CORE key, Semantic Scholar key** | none | Optional. Only raise rate limits; both services answer without one for small batches. |
| **Use OpenAlex-hosted full text** | on | Works only with an OpenAlex key. |
| **Try hosted copy before links** | off | Spends your daily allowance first. Off keeps it for items that need it. |
| **Publisher pages as a last resort** | on | Hands free-to-read pages and remaining links to Zotero's downloader. Turn off for strictly open access. |
| **Look up items without a DOI or PMID by title** | on | Exact title and a year within one. A title that is a long prefix of the other (a dropped subtitle) also counts when both years agree. |
| **Fill in an empty DOI field** | off | When a title match finds the DOI, write it to the item. |
| **Record OpenAlex work ID in Extra** | off | Writes `OpenAlex: W123…` to the item. |
| **Batch tag** | `zotpdf` | Selects the items for the Tools-menu runs and the Batch buttons. |
| **Report note after checks** | off | One note per retraction or metadata run. Never for PDF runs. |
| **Preview only** | off | Show where each PDF would come from; attach nothing and change no tags. |
| **Remember misses for a day** | on | Skip the lookups for items that had no open-access copy. *Forget cached misses* clears it. |
| **Export missing PDFs** | | Button: CSV of items still tagged missing or needing a look. |
| **Local write-back API** | off | See [Write-back API](writeback.md). |

## Hidden preferences

In **Settings → Advanced → Config Editor**, as `extensions.zotero.zotpdf.*`:

| Preference | Default | Meaning |
| --- | --- | --- |
| `delayMs` | 400 | Pause between items and requests, in milliseconds. |
| `concurrency` | 3 | Items looked up in parallel for a PDF run (1 to 6). |

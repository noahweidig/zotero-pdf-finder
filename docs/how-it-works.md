---
icon: lucide/workflow
---

# How it works

## The PDF chain

For each item ZotPDF extracts a DOI, PMID, PMCID and arXiv ID, then tries sources in order and stops at the first real PDF. Every source is free and legal. Each can be switched off in [Settings](settings.md).

| # | Source | Looks up by | Notes |
| --- | --- | --- | --- |
| 0 | Existing attachment | nothing | The item is tagged found and skipped. |
| 1 | Unpaywall | DOI | Every open-access location with a direct PDF link, best first. Landing-page-only locations are kept for step 14. |
| 2 | PubMed Central | PMCID, PMID or DOI | The PMC cloud dataset: published version first, author manuscript (license `TDM`) otherwise. DOI and PMID are converted to a PMCID first. |
| 3 | Europe PMC | DOI, PMID or title | Free and open-access PDFs from its full-text list, which includes author manuscripts. |
| 4 | Semantic Scholar | DOI, PMID, arXiv ID or title | Its `openAccessPdf` link. Optional key raises rate limits. |
| 5 | Crossref | DOI (or title) | Publisher PDF links, only when the record carries an open license. Also follows links to preprints. |
| 6 | CORE | DOI or title | Institutional-repository copies. Optional key. |
| 7 | OpenAIRE | DOI or title | Only products OpenAIRE itself rates open. |
| 8 | Preprint servers and repositories | DOI prefix, arXiv ID | arXiv, bioRxiv, medRxiv, OSF Preprints (and PsyArXiv, SocArXiv, MetaArXiv, EarthArXiv), PeerJ Preprints, Zenodo (open records, PDF files), Figshare. |
| 9 | HAL | DOI or title | The French national open archive. |
| 10 | DOAJ | DOI | Full-text links of open-access journals. |
| 11 | OpenAlex links | DOI, PMID, arXiv ID or title | Locations OpenAlex marks open access with a direct PDF URL. Published before accepted before submitted. |
| 12 | OpenAlex hosted | needs an API key | Optional. About $0.01 a file, roughly 100 a day free. Tried before step 11 if you turn on "prefer hosted". |
| 13 | Internet Archive | any dead link above | If a link from steps 1 to 11 fails, ZotPDF retries the Archive's copy of the same URL. |
| 14 | Free-to-read pages | landing pages collected above | Optional, on by default. Zotero's own downloader and translators, using your browser session and institutional access. |

Every download is checked: the bytes must start with `%PDF-` and be between 10 KB and 100 MB. Error pages and login stubs are rejected. The result column names the source that worked, for example *PDF attached (CORE)*.

### Learning a DOI from a title

If an item has only a title, Europe PMC, Semantic Scholar, Crossref, CORE, OpenAIRE and HAL can each match it by exact title (casefolded, accents and punctuation removed) with a year within one. The first match supplies a DOI that the sources after it use. A near-match is never accepted.

### If a source is down

A source that errors or rate-limits is skipped and named in the result ("CORE unavailable"). After an HTTP 429 it rests for a minute so a big batch does not hammer it; a free key for Semantic Scholar or CORE avoids most of this. The item is tagged `check-needed` only when every extra source failed, which points at a network problem, or when a source listed a PDF link that would not download.

## Matching items to OpenAlex

| Item has | Lookup | Accepted when |
| --- | --- | --- |
| DOI (field or `DOI:` in Extra) | `filter=doi:…` | Always |
| arXiv ID in Extra or URL | Converted to `10.48550/arxiv.<id>` | Always; arXiv's own PDF is also used |
| `PMID:` in Extra | `filter=pmid:…` | Always |
| None of those | `filter=title.search:…` | Normalized titles are identical and years differ by at most 1 |

A wrong PDF on the wrong reference is worse than none, so near-matches are reported, never attached.

## Duplicates and politeness

Items sharing a DOI, PMID or PMCID in one run are fetched once; the others are tagged to match. Every outgoing request is preceded by a short pause (400 ms by default), within NCBI's limit of 3 requests a second without a key. A 429 from OpenAlex triggers a bounded retry. A URL several sources return is downloaded once.

## Cost model

OpenAlex meters its API by credit with a free daily allowance that resets at midnight UTC. Metadata lookups are cheap (a 1,000-reference review uses about 20 requests). Only the optional hosted download costs real credits, and a rejected key degrades to anonymous metadata access instead of failing.

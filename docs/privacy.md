---
icon: lucide/lock
tags:
  - Privacy
  - Sources
---

# Privacy and data

Zotero metadata is read locally. Nothing from your library is stored anywhere else, there are no accounts and no analytics.

| Service | Receives | For |
| --- | --- | --- |
| Unpaywall | DOI, contact email | Open-access PDF locations |
| NCBI (PubMed, PMC) | DOI or PMID, contact email | PMC IDs, PMC cloud dataset, retraction status |
| Europe PMC | DOI, PMID or title | Free full-text links |
| Semantic Scholar | DOI, PMID, arXiv ID or title; key if set | Open-access PDF link |
| CORE | DOI or title; key if set | Repository copies |
| OpenAIRE, HAL, DOAJ, OSTI | DOI or title | Open copies |
| arXiv, bioRxiv, medRxiv, OSF, PeerJ, Zenodo, Figshare | DOI or arXiv ID | Preprints and repository files |
| Internet Archive | The URL of a dead open-access link | Archived copy of that PDF |
| OpenAlex | DOI, PMID, arXiv ID or title; contact email; API key if set | Matching and PDF links |
| Crossref | DOI or title, contact email | Open-license links, preprint links, Retraction Watch data, metadata comparison |
| PDF host sites | The PDF URL only. No email. | Downloading |

- The contact email goes only to the services above, which ask for one so they can reach heavy users.
- The OpenAlex key is sent as an Authorization header, never in a URL, and is never saved on an attachment.
- The write-back endpoint is off by default and listens only on your computer.

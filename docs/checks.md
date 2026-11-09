---
icon: lucide/shield-alert
---

# Retraction and metadata checks

## Retractions

A retracted paper should not stay in a review. ZotPDF checks two sources for each reference:

- **PubMed**: the "Retracted Publication" publication type. Precise.
- **Crossref**: carries the Retraction Watch database, which catches mass retractions PubMed never indexed.

For a DOI it checks PubMed first, then Crossref. For a DOI-only item it resolves a PMID through PubMed search before falling back. ZotPDF reads the status; it never decides retraction itself.

| Tag | Meaning |
| --- | --- |
| `retraction:retracted` | PubMed or Crossref/Retraction Watch records it as retracted. The report says which. |
| `retraction:none` | Neither source records a retraction. |
| `retraction:check-needed` | No record found or a lookup failed. Look by hand. |

## Citation metadata

Records imported from databases often have missing or wrong fields, and a wrong field can mean the wrong DOI is attached. ZotPDF compares title, year, journal, volume, issue, pages and first author with Crossref and reports what is off.

| Tag | Meaning |
| --- | --- |
| `citation:ok` | Fields agree with Crossref. |
| `citation:incomplete` | Fields are missing that Crossref has. |
| `citation:mismatch` | Fields disagree. Often the wrong DOI. |
| `citation:check-needed` | No DOI, or Crossref could not be reached. |

!!! info "Read-only"

    The metadata check changes no field. It lists discrepancies for you to resolve.

## Report notes

After a retraction or metadata check, ZotPDF can save one standalone note (tagged `zotpdf:report`) listing the problems. Turn this off in [Settings](settings.md). Finding PDFs never writes a note.

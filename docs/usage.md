---
icon: lucide/mouse-pointer-click
tags:
  - Getting started
  - PDFs
  - Retractions
  - Metadata
---

# Use it

## A few references

1. Select one or more items (++cmd+a++ / ++ctrl+a++ selects the whole collection).
2. Right-click → **ZotPDF** → **Find PDFs**, **Check for retractions**, **Check citation metadata**, or **Full check**.
3. A window lists every item with its result. Keep working while it runs; **Cancel** stops after the current item.

The first run asks for a contact email once. The free services behind ZotPDF ask for one.

## A whole screening set

1. Tag your references, for example `zotpdf`. The tag name is set in [Settings](settings.md).
2. **Tools → ZotPDF → Find PDFs for tagged items**. The same menu has the retraction and metadata checks.
3. Filter by the result tags to see what needs attention.

Batches are polite: one item at a time with a pause between requests. Runs over 60 items ask before starting.

## See the results in Zotero

- **Item list column.** Right-click the column header and add **ZotPDF**. It shows `PDF`, `No PDF`, `Check` or `⚠ Retracted` for every item, and you can sort by it.
- **Item pane section.** Select an item and open the **ZotPDF** section: PDF, retraction and metadata status, plus buttons to run each check on that one item.
- **Minimize the progress window** with its minimize button and keep working; **Cancel** stops the run immediately.
- A corner popup reports how many PDFs were attached when a run finishes.

## Preview and export

- **Preview sources (no download)** in the right-click menu shows which source would supply each PDF and attaches nothing.
- **Tools → ZotPDF → Export missing PDFs (CSV)…** saves every item tagged `pdf-missing` or `check-needed` (or just your selection) as CSV: status, title, authors, year, journal, DOI, PMID, URL. Take it to your library for interlibrary loan.

## What you get

| Run | Tags | Notes |
| --- | --- | --- |
| Find PDFs | `fulltext:pdf-found`, `fulltext:pdf-missing`, `fulltext:check-needed` | The PDF is attached. **No note is created.** The result column explains every miss. |
| Retractions | `retraction:retracted`, `retraction:none`, `retraction:check-needed` | One report note if enabled, with the source of each flag. |
| Metadata | `citation:ok`, `citation:incomplete`, `citation:mismatch`, `citation:check-needed` | One report note if enabled. Read-only. |

## Reading the result column

| Result | Meaning |
| --- | --- |
| PDF attached (CORE) | Done. The name in brackets is the source that worked; its URL is saved on the attachment. |
| Already had a PDF attachment | Left alone. Stale `pdf-missing` and `check-needed` tags are cleared. |
| no open-access copy on 11/9/2026 (remembered for a day) | Looked up recently with no result; skipped. |
| the PDF from CORE is for a different DOI (10.…) | The file says it is another paper, so it was not attached. |
| Cancelled | You pressed Cancel before this item finished. It was not tagged. |
| No open-access copy known | Every source says it's paywalled. Request it through your library. |
| … listed a PDF link but it didn't download | A link exists but returned an error page or a non-PDF. Tagged `check-needed`. |
| … unavailable | A source was down or rate-limited and was skipped. |
| no DOI, PMID, or PMCID on the item | Title matching found nothing it trusts. Add an identifier and rerun. |
| duplicate of an item already processed | Same paper as an earlier row; tagged to match without a second lookup. |

## Developer console

```javascript
// Tools → Developer → Run JavaScript
await Zotero.ZotPDF.Engine.run(ZoteroPane.getSelectedItems(), window)
```

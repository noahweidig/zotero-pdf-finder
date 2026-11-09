---
icon: lucide/mouse-pointer-click
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
| Already had a PDF attachment | Skipped and tagged `pdf-found`. |
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

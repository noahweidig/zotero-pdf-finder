---
icon: lucide/plug
---

# Local write-back API

Advanced, off by default. Lets another program on your computer add or remove tags in your library through a token-guarded endpoint on Zotero's local server. Every write is previewable, audited and undoable.

## Safety rules

- **Local only.** The endpoint lives on Zotero's local server (127.0.0.1) and needs the token you generate.
- **Allowlisted tags.** Only these prefixes can be written: `zotpdf:`, `fulltext:`, `retraction:`, `citation:`, `GRADE:`, `RoB2:`, `ROBINS-I:`, `Quality:`. Anything else is refused, even with a valid token.
- **Previewable.** A dry run shows the change before it happens.
- **Audited.** Every applied write is recorded in a bounded local log (newest 500).
- **Undoable.** Each write can be reversed.

## Set up

1. In Zotero's Advanced settings, enable *Allow other applications on this computer to communicate with Zotero*.
2. Settings → ZotPDF → **Allow external tools to write tags**.
3. **Generate** a token, **Copy** it, and give it to the tool.
4. **Test connection** confirms the endpoint, the switch and the token.

## Endpoints

| Path | Purpose |
| --- | --- |
| `/zotpdf/ping` | Reports that write-back exists and which safety features it supports. |
| `/zotpdf/tag` | Add or remove allowlisted tags; supports `dryRun`. |
| `/zotpdf/audit` | Read the audit log. |
| `/zotpdf/undo` | Reverse a recorded write. |

Browse the log from **Tools → ZotPDF → Write-back audit log**, which also offers to clear it. Clearing deletes history only; it changes no tags.

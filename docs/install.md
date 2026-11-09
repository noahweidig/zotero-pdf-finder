---
icon: lucide/download
---

# Install

1. **Download** [`zotpdf.xpi`](https://github.com/noahweidig/zotpdf/releases/latest/download/zotpdf.xpi) from the [latest release](https://github.com/noahweidig/zotpdf/releases/latest).

    !!! tip "Firefox"

        Right-click the link and choose **Save Link As…**. A plain click makes Firefox try to install it as a Firefox add-on.

2. In Zotero, open **Tools → Plugins**.
3. **Drag the .xpi into that window**, or click the gear :lucide-settings: → **Install Plugin From File…** and pick it.

No restart is needed. ZotPDF appears under Tools → Plugins and as a **ZotPDF** submenu in the item right-click menu and the Tools menu. Zotero checks for new versions automatically.

!!! note

    If another PDF-finder plugin is installed, uninstall it first to avoid duplicate menus.

## Build from source

```bash
git clone https://github.com/noahweidig/zotpdf.git
cd zotpdf
npm run lint && npm test
npm run build      # writes build/zotpdf-<version>.xpi and build/zotpdf.xpi
```

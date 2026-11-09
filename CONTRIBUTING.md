# Contributing

Bug reports, translations and pull requests are welcome. This file covers building,
testing and releasing; the user guide is in [README.md](README.md).

## Build

```bash
git clone https://github.com/noahweidig/zotpdf.git
cd zotpdf
npm run lint     # parses every source file, checks Fluent IDs and versions
npm run build    # writes build/zotpdf-<version>.xpi
```

There is no bundler and no runtime dependency. The `.xpi` is a zip of the source tree.

## Layout

```
manifest.json          plugin metadata, Zotero version range, update URL
bootstrap.js           startup/shutdown entry points
prefs.js               default preference values (extensions.zotero.zotpdf.*)
src/plugin.js          lifecycle, ZotPDF submenus, preference pane, progress UI
src/openalex-client.js OpenAlex HTTP client: batching, auth, rate limits
src/finder.js          item matching and the OpenAlex source (links, hosted, publisher pages)
src/engine.js          engine: PDF chain, retraction and metadata checks, tags, write-back
src/sources.js         extra free sources (Europe PMC, Semantic Scholar, CORE, ...)
preferences.xhtml/.js  settings pane
locale/en-US/*.ftl     menu, progress and error strings
test/                  node --test unit tests for the engine and the OpenAlex fallback
docs/, zensical.toml   documentation site (Zensical)
update.json            update manifest Zotero polls (written by the release workflow)
```

`src/engine.js` contains Apache-2.0 licensed code (see `LICENSE-APACHE` and `NOTICE`); keep those
files and the file header when you change it.

## How the PDF chain works

`ZotPDF.Engine.run()` handles each item: extract DOI/PMID/PMCID, then `resolveOA()` tries
Unpaywall, PubMed Central (OA subset, Europe PMC fallback), and finally the OpenAlex
fallback from `ZotPDF.Finder.fallbackFor(item)`. That returns open-access links, an
optional OpenAlex-hosted download, and an optional publisher-page step through Zotero's
downloader. Finding PDFs writes tags only; it never creates a note.

### Matching items to OpenAlex

| Item has | Lookup | Accepted when |
| --- | --- | --- |
| DOI (field or `DOI:` in Extra) | `filter=doi:…` | Always. DOIs are exact |
| arXiv ID in Extra or URL, no DOI | Converted to `10.48550/arxiv.<id>` | Always |
| `PMID:` in Extra, no DOI match | `filter=pmid:…` | Always |
| Neither | `filter=title.search:…` | Normalized titles are identical **and** years differ by at most 1 |

Items with an arXiv ID also get arXiv's own PDF as a source.

### OpenAlex cost model

Since February 2026 OpenAlex meters its API by credit, with a daily free allowance
($0.10/day without a key, $1/day with one) that resets at midnight UTC:

| What the plugin does | Endpoint | Cost |
| --- | --- | --- |
| Look up works by DOI or PMID, 50 per request | `api.openalex.org/works?filter=…` | $0.0001 per request |
| Look up a work by title | `api.openalex.org/works?filter=title.search:…` | $0.001 per request |
| Download an OpenAlex-hosted PDF | `content.openalex.org/works/W….pdf` | $0.01 per file |

Responses carry `X-RateLimit-*` headers; **Test Key** in the settings reports the balance.

The API key lives in the Zotero profile's preferences
(`extensions.zotero.zotpdf.apiKey`), never in the library, and is sent as an
`Authorization: Bearer` header so it can't end up in a stored URL or a debug log. If
OpenAlex rejects it, metadata lookups continue anonymously and only hosted downloads are
switched off.

One hidden preference has no UI: `extensions.zotero.zotpdf.delayMs` (default `400`) is
the pause in milliseconds between items and requests.

## Developing against a live Zotero

Point Zotero at your working copy instead of installing the `.xpi`:

```bash
echo -n "/absolute/path/to/zotpdf" \
  > "<zotero profile>/extensions/zotpdf@noahweidig"
```

Restart Zotero, then **enable the plugin in Tools → Plugins**. Zotero ships with
`extensions.autoDisableScopes = 15`, so a plugin dropped into the profile arrives
disabled. Setting that pref to `0` in a development profile skips the step.

To test against a throwaway library instead of your own, run a second Zotero on a
scratch profile and data directory:

```bash
mkdir -p /tmp/zdev/profile/extensions /tmp/zdev/data
cp build/zotpdf-*.xpi "/tmp/zdev/profile/extensions/zotpdf@noahweidig.xpi"
cat > /tmp/zdev/profile/prefs.js <<'PREFS'
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.zotero.debug.log", true);
user_pref("app.update.url", "http://127.0.0.1:1/no-update.xml");
user_pref("extensions.zotero.httpServer.port", 23129);
PREFS

MOZ_NO_REMOTE=1 /Applications/Zotero.app/Contents/MacOS/zotero \
  -profile /tmp/zdev/profile -datadir /tmp/zdev/data -ZoteroDebugText
```

The dead `app.update.url` matters: without it the second instance runs the application
updater and can restart your main Zotero. The port change avoids a clash with the
connector server of a Zotero that's already running.

Any helper plugin you install in that profile needs an `https` `update_url` in its
manifest. With an `http` one, the add-on manager quietly marks it `appDisabled`.

**Help → Debug Output Logging** shows the plugin's messages, all prefixed with
`[ZotPDF]`.

### Scripting it

The plugin publishes itself as `Zotero.ZotPDF`, with the engine at `Zotero.ZotPDF.Engine`,
so it can be driven from **Tools → Developer → Run JavaScript**:

```javascript
await Zotero.ZotPDF.Engine.run(ZoteroPane.getSelectedItems(), window);
```

## Documentation site

The docs are built with [Zensical](https://zensical.org): `zensical.toml` is the config and
`docs/*.md` the pages (icons are the bundled Lucide set, e.g. `:lucide-file-down:`).

```bash
pip install --only-binary :all: -r docs/requirements.txt
zensical serve          # live preview at http://localhost:8000
zensical build --clean  # writes site/
```

The **Docs** workflow publishes to GitHub Pages on every change under `docs/` or
`zensical.toml`; enable it once under Settings → Pages → Source: GitHub Actions.

## Translations

Copy `locale/en-US/zotpdf.ftl` to `locale/<your-locale>/zotpdf.ftl`,
translate the values (not the IDs), and open a pull request.

## Releasing

1. Bump `version` in both `manifest.json` and `package.json` (`npm run lint` checks
   they match). `strict_max_version` is `*` on purpose, so a new Zotero major release
   doesn't disable the plugin. Test against it anyway when one comes out.
2. Merge to `main`. The **Release** workflow notices the `manifest.json` change, and if
   `v<version>` doesn't exist it builds the `.xpi`, creates the tag and a GitHub release
   with `zotpdf-<version>.xpi` and a stable-name `zotpdf.xpi` (what the download link
   points at), and commits a fresh `update.json` to `main`. Pull afterwards.
3. You can also run the workflow by hand from the Actions tab, or push a `v*` tag that
   matches the manifest version.

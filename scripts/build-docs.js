/*
 * Build the documentation site into _site/ (served by GitHub Pages).
 * No dependencies: wraps each docs/src/<page>.html fragment in the shared layout.
 * Usage: node scripts/build-docs.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, '_site');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const repo = manifest.homepage_url.replace(/\/$/, '');

// file, nav label, page title
const PAGES = [
	['index', 'Overview', 'ZotPDF'],
	['install', 'Install', 'Install'],
	['usage', 'Use it', 'Use it'],
	['how-it-works', 'How it works', 'How it works'],
	['checks', 'Checks', 'Retraction and metadata checks'],
	['settings', 'Settings', 'Settings'],
	['writeback', 'Write-back', 'Local write-back API'],
	['privacy', 'Privacy', 'Privacy and data'],
	['troubleshooting', 'Help', 'Troubleshooting'],
	['about', 'About', 'Credits and licenses']
];

const vars = {
	version: manifest.version,
	repo,
	xpi: `${repo}/releases/latest/download/zotpdf.xpi`,
	releases: `${repo}/releases/latest`,
	issues: `${repo}/issues`
};
const fill = (text, extra = {}) => text.replace(/\{\{(\w+)\}\}/g, (m, key) => {
	let all = Object.assign({}, vars, extra);
	if (!(key in all)) {
		throw new Error(`Unknown placeholder {{${key}}}`);
	}
	return all[key];
});

const layout = fs.readFileSync(path.join(root, 'docs', 'layout.html'), 'utf8');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const [file, label, title] of PAGES) {
	const src = path.join(root, 'docs', 'src', file + '.html');
	if (!fs.existsSync(src)) {
		throw new Error(`Missing docs/src/${file}.html`);
	}
	const nav = PAGES.map(([f, l]) => `<a href="${f === 'index' ? './' : f + '.html'}"${f === file ? ' aria-current="page"' : ''}>${l}</a>`).join('\n');
	const content = fill(fs.readFileSync(src, 'utf8'));
	const html = fill(layout, {
		title: file === 'index' ? 'ZotPDF: find PDFs, check retractions, audit citations in Zotero' : `${title} · ZotPDF`,
		nav,
		content
	});
	fs.writeFileSync(path.join(out, file + '.html'), html);
}

fs.copyFileSync(path.join(root, 'docs', 'assets', 'style.css'), path.join(out, 'style.css'));
fs.copyFileSync(path.join(root, 'icons', 'zotpdf-96.svg'), path.join(out, 'icon.svg'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Built ${PAGES.length} pages into _site/`);

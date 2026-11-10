// Build the web client into a private directory for the localization tooling, so that
// screenshots and coverage runs do not race with other builds of apps/web/dist.
//   node scripts/i18n-build-client.mjs [outDir]      (default ../../.toolchain/i18n-dist)
// While other parts of the tree are mid-edit a stylesheet import may point at a file that
// does not exist yet; such imports are replaced by an empty stylesheet (and listed) instead of
// failing the build. Missing script modules still fail.
import { build } from 'vite';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] ?? join(web, '..', '..', '.toolchain', 'i18n-dist'));
const stubbed = [];
const stubMissingCss = {
  name: 'i18n-stub-missing-css',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.') || !source.endsWith('.css')) return null;
    const file = resolve(dirname(importer), source);
    if (existsSync(file)) return null;
    stubbed.push(`${source} (imported by ${importer.replace(web + '/', '')})`);
    return '\0i18n-empty.css';
  },
  load(id) {
    return id === '\0i18n-empty.css' ? '' : null;
  },
};
await build({ root: web, logLevel: 'warn', plugins: [stubMissingCss], build: { outDir, emptyOutDir: true } });
if (stubbed.length) console.log('stubbed missing stylesheets:\n  ' + stubbed.join('\n  '));
console.log('client built into ' + outDir);

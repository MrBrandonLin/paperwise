// Copies what pdf.js needs at runtime into public/pdfjs/, so the PDF viewer loads everything from
// the extension itself (no CDN): the worker, the CMaps (Asian text), the standard fonts (forms
// that don't embed theirs), the wasm decoders (JPEG 2000 images, color profiles) and ICC profiles.
// Runs on postinstall; the folder is gitignored (rebuilt from node_modules).
import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pdfjs = dirname(require.resolve('pdfjs-dist/package.json'));
const out = join(root, 'public', 'pdfjs');
mkdirSync(out, { recursive: true });
cpSync(join(pdfjs, 'build', 'pdf.worker.min.mjs'), join(out, 'pdf.worker.min.mjs'));
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) cpSync(join(pdfjs, dir), join(out, dir), { recursive: true });
console.log('pdf.js assets copied to public/pdfjs/');

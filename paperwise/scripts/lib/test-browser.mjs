// Shared by test-fill.mjs and scan-test-forms.mjs: find a Chromium browser, serve the test
// pages, and bundle the real content-script modules for injection into a page.
import * as esbuild from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, never new URL(...).pathname: that gives "/C:/..." on Windows (read as C:\C:\...).
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'server/public');

export function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error('No Chromium browser found. Set CHROME_PATH=/path/to/chrome');
    process.exit(2);
  }
  return found;
}

/** Serve server/public on a random local port. Returns { base, close }. */
export async function serveTestPages() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC, path);
    if (!file.startsWith(PUBLIC) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

/** IIFE bundle of scripts/test-fill-entry.ts: exposes window.__pw with the real modules. */
export async function bundleContentModules() {
  const alias = {
    name: 'alias',
    setup(b) {
      b.onResolve({ filter: /^@\// }, (a) => ({ path: join(ROOT, 'src', a.path.slice(2)) + '.ts' }));
    },
  };
  const { outputFiles } = await esbuild.build({
    entryPoints: [join(ROOT, 'scripts/test-fill-entry.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    plugins: [alias],
  });
  return outputFiles[0].text;
}

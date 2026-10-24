// pnpm scan:test-forms — runs the REAL scanner on the test forms in headless Chromium and saves
// the ScanResults to server/test-pages/scans/*.json. The form-map printer uses these, so you can
// iterate on the Gemini prompt without opening a browser.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { bundleContentModules, findBrowser, ROOT, serveTestPages } from './lib/test-browser.mjs';

const OUT = join(ROOT, 'server/test-pages/scans');
const { base, close } = await serveTestPages();
const bundle = await bundleContentModules();
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true });

// Saved with a stable URL, so cache keys don't depend on the random port.
const PUBLIC_BASE = 'http://localhost:8787';

async function scan(path, prepare) {
  const page = await browser.newPage();
  await page.goto(base + path, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#rental');
  await page.addScriptTag({ content: bundle });
  if (prepare) await page.evaluate(prepare);
  const result = await page.evaluate(() => window.__pw.scanPage());
  await page.close();
  return { ...result, url: result.url.replace(base, PUBLIC_BASE) };
}

try {
  const scans = {
    rental: await scan('/test/rental.html'),
    'rental-react': await scan('/test/rental-react.html'),
    // React form after "Employed" + "pets: yes": the conditional fields exist.
    'rental-react-expanded': await scan('/test/rental-react.html', async () => {
      window.__pw.handle({ type: 'FILL', id: 'pw-status', value: 'employed' });
      window.__pw.handle({ type: 'FILL', id: 'pw-pets', value: 'yes' });
      await new Promise((r) => setTimeout(r, 200));
      // Values in this scan don't matter: the server drops them before Gemini.
    }),
  };
  for (const [name, result] of Object.entries(scans)) {
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
    console.log(`saved ${name}.json (${result.fields.length} fields)`);
  }
} finally {
  await browser.close();
  close();
}

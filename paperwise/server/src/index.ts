import { serve } from '@hono/node-server';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Language, ScanResult } from '../../src/shared/contract.ts';
import { app } from './app.ts';
import { env } from './env.ts';
import { streamFormMap } from './form-map.ts';
import { geminiConfigured, warmUpGemini } from './gemini.ts';
import { paths } from './paths.ts';
import { toLanguage } from '../../src/shared/languages.ts';

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`Paperwise backend on http://localhost:${info.port}`);
  console.log(`Test form:          http://localhost:${info.port}/test/rental.html`);
  console.log(`React test form:    http://localhost:${info.port}/test/rental-react.html`);
  console.log(`PDF test forms:     http://localhost:${info.port}/test/pdf/  (IRS W-9, rental application, error cases)`);
  void warmUp();
});

/**
 * Speed: open the connection to Gemini now (TLS handshake off the first user request), then
 * pre-build the demo forms' maps in both languages. Already cached (disk) = no call at all.
 * Set PREWARM=0 to skip the pre-build.
 */
async function warmUp() {
  if (!geminiConfigured()) return;
  await warmUpGemini();
  if (process.env.PREWARM === '0') return;
  for (const file of readdirSync(paths.scans).filter((f) => f.endsWith('.json'))) {
    const scan = JSON.parse(readFileSync(join(paths.scans, file), 'utf8')) as ScanResult;
    // One map per form, in the form's own language: the agent speaks the user's language.
    for (const language of [toLanguage(scan.pageLanguage) ?? 'en'] as Language[]) {
      // One form at a time: stay far from rate limits while users may be arriving.
      // Background priority: only spare request budget, users always go first.
      await streamFormMap(scan, language, undefined, { priority: 'background' }).catch((err) =>
        console.warn(`[prewarm] ${file} ${language}: ${String(err)}`),
      );
    }
  }
  console.log('[prewarm] demo form maps ready');
}

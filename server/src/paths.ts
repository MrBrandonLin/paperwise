import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every file the server reads or writes, built from where this module lives.
 *
 * Always fileURLToPath + path.join, never `new URL(..., import.meta.url).pathname`: on Windows
 * that gives "/C:/Users/…", which Node then turns into "C:\C:\Users\…" (server/.env not found,
 * cache not saved), and it keeps "%20" for spaces in folder names.
 *
 * `moduleUrl` and `windows` exist for the test (server/scripts/test-paths.ts): it runs this exact
 * code on a Windows-style file URL from any machine.
 */
export function serverPaths(moduleUrl: string = import.meta.url, windows = process.platform === 'win32') {
  const p = windows ? path.win32 : path.posix;
  const server = p.join(p.dirname(fileURLToPath(moduleUrl, { windows })), '..');
  return {
    server,
    env: p.join(server, '.env'),
    cacheFile: p.join(server, '.cache', 'form-maps.json'),
    scans: p.join(server, 'test-pages', 'scans'),
    public: p.join(server, 'public'),
  };
}

export const paths = serverPaths();

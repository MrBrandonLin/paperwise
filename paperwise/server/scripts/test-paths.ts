// pnpm --dir server test:paths
// Runs the server's real path code on Windows-style file URLs (from any OS), and fails if any
// script builds a file path from `new URL(..., import.meta.url)` again.
// Why: on Windows, new URL(...).pathname = "/C:/Users/…", which Node reads as "C:\C:\Users\…":
// server/.env not found, cache not saved (seen on a teammate's machine, 2026-10-24).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths, serverPaths } from '../src/paths.ts';

let failed = 0;
function check(ok: boolean, label: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}

console.log('=== Windows: the paths the server uses');
const win = serverPaths('file:///C:/Users/Ana/website-ui-starter/paperwise/server/src/paths.ts', true);
check(win.env === 'C:\\Users\\Ana\\website-ui-starter\\paperwise\\server\\.env', `server/.env → ${win.env}`);
check(win.cacheFile === 'C:\\Users\\Ana\\website-ui-starter\\paperwise\\server\\.cache\\form-maps.json', `cache → ${win.cacheFile}`);
check(win.scans === 'C:\\Users\\Ana\\website-ui-starter\\paperwise\\server\\test-pages\\scans', `saved scans → ${win.scans}`);
check(win.public === 'C:\\Users\\Ana\\website-ui-starter\\paperwise\\server\\public', `test pages → ${win.public}`);
// The bug's mechanism: Node resolves a path against the current directory. A real absolute path stays as is.
for (const [name, p] of Object.entries(win)) {
  const resolved = path.win32.resolve('D:\\somewhere\\else', p);
  check(resolved === p && !/[A-Z]:\\[A-Z]:/i.test(resolved), `${name}: absolute, no doubled drive letter`);
}

const spaced = serverPaths('file:///C:/Users/Ana%20Maria/My%20Projects/paperwise/server/src/paths.ts', true);
check(spaced.env === 'C:\\Users\\Ana Maria\\My Projects\\paperwise\\server\\.env', `folder names with spaces → ${spaced.env}`);

const other = serverPaths('file:///D:/code/paperwise/server/src/paths.ts', true);
check(other.cacheFile === 'D:\\code\\paperwise\\server\\.cache\\form-maps.json', `another drive → ${other.cacheFile}`);

// Proof the check can fail: the old code, run on the same URL, gives the doubled drive letter.
const oldStyle = path.win32.resolve('C:\\Users\\Ana', new URL('../.env', 'file:///C:/Users/Ana/website-ui-starter/paperwise/server/src/env.ts').pathname);
check(oldStyle.startsWith('C:\\C:\\'), `(the old code really gave ${oldStyle})`);

console.log('\n=== macOS / Linux: same code');
const posix = serverPaths('file:///Users/ana/paperwise/server/src/paths.ts', false);
check(posix.env === '/Users/ana/paperwise/server/.env', `server/.env → ${posix.env}`);
check(posix.cacheFile === '/Users/ana/paperwise/server/.cache/form-maps.json', `cache → ${posix.cacheFile}`);

console.log('\n=== This machine');
check(existsSync(path.join(paths.server, 'package.json')) && existsSync(paths.scans) && existsSync(paths.public), `paths point at the real server folder (${paths.server})`);

console.log('\n=== No file path built from new URL(..., import.meta.url) anywhere');
const repo = path.join(paths.server, '..');
const dirs = ['server/src', 'server/scripts', 'scripts', 'src'].map((d) => path.join(repo, d));
const offenders: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (file === fileURLToPath(import.meta.url)) continue; // this test names the pattern
    if (statSync(file).isDirectory()) walk(file);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*')) return; // comments explaining the rule
        if (/new URL\([^;]*import\.meta\.url/.test(code) || /import\.meta\.url\)?\.pathname/.test(code)) {
          offenders.push(`${path.relative(repo, file)}:${i + 1}  ${code}`);
        }
      });
    }
  }
};
dirs.forEach(walk);
check(offenders.length === 0, offenders.length ? `found:\n      ${offenders.join('\n      ')}` : `none in ${dirs.map((d) => path.relative(repo, d)).join(', ')}`);

// The root scripts (plain .mjs, can't import TS) use the same formula: check it once on Windows too.
const scriptRoot = path.win32.join(path.win32.dirname(fileURLToPath('file:///C:/Users/Ana/paperwise/scripts/lib/test-browser.mjs', { windows: true })), '..', '..');
check(scriptRoot === 'C:\\Users\\Ana\\paperwise', `root scripts' formula on Windows → ${scriptRoot}`);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);

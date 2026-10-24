// Bundles the React test page (with React itself) into server/public/test, so demo pages
// work with no internet. The output is committed; rerun after editing server/test-pages/.
import * as esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, never new URL(...).pathname: that gives "/C:/..." on Windows (read as C:\C:\...).
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['server/test-pages/rental-react.jsx'],
  outfile: 'server/public/test/rental-react.js',
  bundle: true,
  format: 'esm',
  minify: true,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

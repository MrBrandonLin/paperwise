// Bundles the React test page (with React itself) into server/public/test, so demo pages
// work with no internet. The output is committed; rerun after editing server/test-pages/.
import * as esbuild from 'esbuild';

const root = new URL('..', import.meta.url).pathname;

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

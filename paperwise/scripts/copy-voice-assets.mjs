// Copies the ElevenLabs SDK audio worklets (and the resampler it would load from a CDN) into
// public/elevenlabs/, so the side panel can load them from the extension itself: extension
// pages block the blob:/data: workers and remote scripts the SDK uses by default.
// Runs on postinstall; the files are committed too.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'public/elevenlabs');
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
// Both packages' exports maps hide package.json, so resolve the files they do export.
for (const f of ['rawAudioProcessor.js', 'audioConcatProcessor.js']) {
  copyFileSync(require.resolve(`@elevenlabs/client/worklets/${f}`), join(out, f));
}
const pkgDir = (p) => {
  let dir = dirname(p);
  while (!dir.endsWith('libsamplerate-js')) dir = dirname(dir);
  return dir;
};
const sr = pkgDir(require.resolve('@alexanderolsen/libsamplerate-js'));
copyFileSync(join(sr, 'dist/libsamplerate.worklet.js'), join(out, 'libsamplerate.worklet.js'));
console.log('voice assets copied to public/elevenlabs/');

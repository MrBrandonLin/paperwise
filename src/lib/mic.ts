/**
 * Microphone helpers: permission state + a live volume meter (Web Audio AnalyserNode).
 *
 * Side panels can't show Chrome's mic permission prompt. getUserMedia there fails with
 * NotAllowedError while the permission is still "prompt". The fix: grant it once from a
 * normal extension tab (mic-permission.html). The grant covers the whole extension origin,
 * so the side panel works afterwards.
 */

export type MicPermission = 'granted' | 'prompt' | 'denied' | 'unknown';

export async function getMicPermission(): Promise<MicPermission> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

export interface MicMeter {
  /** Name of the microphone in use, e.g. "MacBook Pro Microphone". */
  deviceLabel: string;
  stop(): void;
}

/** Why the mic could not start. */
export type MicErrorKind =
  | 'needs-permission-page' // side panel couldn't show the prompt
  | 'blocked' // user or Chrome blocked the mic for this extension
  | 'no-device' // no microphone found
  | 'busy' // another app holds the mic
  | 'other';

export class MicError extends Error {
  constructor(
    readonly kind: MicErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Open the mic and call onLevel(0..1) about 60 times a second.
 * Throws MicError if the mic can't be opened.
 */
export async function startMicMeter(onLevel: (level: number) => void): Promise<MicMeter> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    throw await toMicError(err);
  }

  const ctx = new AudioContext();
  await ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  let frame = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const rms = Math.sqrt(sum / samples.length);
    // Map -60 dB … 0 dB to 0 … 1 so normal speech sits around the middle.
    const db = 20 * Math.log10(Math.max(rms, 1e-8));
    onLevel(Math.min(1, Math.max(0, (db + 60) / 60)));
    frame = requestAnimationFrame(tick);
  };
  tick();

  return {
    deviceLabel: stream.getAudioTracks()[0]?.label || 'Microphone',
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      onLevel(0);
    },
  };
}

async function toMicError(err: unknown): Promise<MicError> {
  const name = err instanceof DOMException ? err.name : '';
  const detail = err instanceof Error ? err.message : String(err);
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    const permission = await getMicPermission();
    return permission === 'denied'
      ? new MicError('blocked', `Microphone is blocked for this extension (${detail}).`)
      : new MicError('needs-permission-page', `The side panel could not ask for the microphone (${detail}).`);
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new MicError('no-device', 'No microphone found. Plug one in or check your system settings.');
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return new MicError('busy', 'The microphone is being used by another app, or the system blocked it.');
  }
  return new MicError('other', detail);
}

import { useEffect, useRef, useState } from 'react';
import { getMicPermission, MicError, startMicMeter, type MicMeter, type MicPermission } from '@/lib/mic';
import type { ExtensionEvent } from '@/shared/messages';

/** DEBUG mic test: start the mic in the side panel and show a live volume meter. */
export default function MicTest() {
  const [permission, setPermission] = useState<MicPermission>('unknown');
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [device, setDevice] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorKind, setErrorKind] = useState<MicError['kind'] | null>(null);
  const meter = useRef<MicMeter | null>(null);

  const refreshPermission = () => getMicPermission().then(setPermission);

  useEffect(() => {
    refreshPermission();
    // The permission tab tells us when the user allowed the mic.
    const onEvent = (msg: ExtensionEvent) => {
      if (msg?.type === 'EVENT_MIC_GRANTED') {
        refreshPermission();
        setErrorKind(null);
        setMessage('Microphone allowed. Press "Start mic test" again.');
      }
    };
    browser.runtime.onMessage.addListener(onEvent);
    return () => {
      browser.runtime.onMessage.removeListener(onEvent);
      meter.current?.stop();
    };
  }, []);

  async function start() {
    setMessage('Starting microphone…');
    setErrorKind(null);
    try {
      meter.current = await startMicMeter((l) => {
        setLevel(l);
        setPeak((p) => Math.max(l, p * 0.97));
      });
      setDevice(meter.current.deviceLabel);
      setMessage('Listening. Say something: the bar should move.');
    } catch (err) {
      const kind = err instanceof MicError ? err.kind : 'other';
      setErrorKind(kind);
      setMessage(String(err instanceof Error ? err.message : err));
      // Standard workaround: ask for the mic once from a normal extension tab.
      if (kind === 'needs-permission-page') openPermissionPage();
    }
    refreshPermission();
  }

  function stop() {
    meter.current?.stop();
    meter.current = null;
    setDevice(null);
    setPeak(0);
    setMessage('Stopped.');
  }

  function openPermissionPage() {
    browser.tabs.create({ url: browser.runtime.getURL('/mic-permission.html') });
  }

  function openChromeSettings() {
    const site = encodeURIComponent(`chrome-extension://${browser.runtime.id}`);
    browser.tabs.create({ url: `chrome://settings/content/siteDetails?site=${site}` });
  }

  const running = device !== null;
  const pct = Math.round(level * 100);

  return (
    <section style={{ border: '1px solid #ccc', padding: 8, marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>Mic test</h2>
      <p style={{ margin: '0 0 6px' }}>
        Permission: <b>{permission}</b>
        {device && <> · Device: {device}</>}
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {running ? (
          <button onClick={stop}>Stop mic test</button>
        ) : (
          <button onClick={start}>Start mic test</button>
        )}
        <button onClick={openPermissionPage}>Open permission page</button>
      </div>

      <div
        role="meter"
        aria-label="Microphone volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        style={{ position: 'relative', height: 18, background: '#eee', border: '1px solid #bbb' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? '#d33' : '#2a2' }} />
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${Math.round(peak * 100)}%`,
            width: 2,
            background: '#333',
          }}
        />
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 12 }}>Level: {pct}%</p>

      {message && (
        <p role="status" aria-live="polite" style={{ margin: '6px 0 0' }}>
          {message}
        </p>
      )}
      {errorKind === 'needs-permission-page' && (
        <p style={{ margin: '6px 0 0' }}>
          A tab opened to ask for the microphone. Click "Allow microphone" there, accept Chrome's
          prompt, then come back here.
        </p>
      )}
      {errorKind === 'blocked' && (
        <p style={{ margin: '6px 0 0' }}>
          Unblock it in Chrome settings: <button onClick={openChromeSettings}>Open settings</button>,
          set Microphone to "Allow", then press Start again.
        </p>
      )}
    </section>
  );
}

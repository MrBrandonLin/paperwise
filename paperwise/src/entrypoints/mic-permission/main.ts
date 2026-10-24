// Side panels can't show Chrome's mic permission prompt, so we request it once
// from a normal extension tab. The grant then applies to the whole extension origin.
import type { ExtensionEvent } from '@/shared/messages';

const status = document.getElementById('status')!;
const button = document.getElementById('grant') as HTMLButtonElement;

async function grant() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = 'Microphone allowed. This tab will close; go back to the side panel.';
    button.disabled = true;

    // Tell the side panel. No listener (panel closed) is fine.
    const event: ExtensionEvent = { type: 'EVENT_MIC_GRANTED' };
    browser.runtime.sendMessage(event).catch(() => {});

    setTimeout(async () => {
      const tab = await browser.tabs.getCurrent();
      if (tab?.id !== undefined) browser.tabs.remove(tab.id);
    }, 2000);
  } catch (err) {
    status.textContent = `Microphone blocked: ${String(err)}. Open Chrome settings → Privacy and security → Site settings → Microphone, allow Paperwise, then try again.`;
  }
}

button.addEventListener('click', grant);

// Already allowed? Say so right away.
navigator.permissions
  .query({ name: 'microphone' as PermissionName })
  .then((p) => {
    if (p.state === 'granted') status.textContent = 'The microphone is already allowed. You can close this tab.';
  })
  .catch(() => {});

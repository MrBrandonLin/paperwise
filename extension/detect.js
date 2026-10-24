// Runs on every page: if it finds a real form, the little Paperwise guy offers to help.
(() => {
  if (window.top !== window || window.__paperwiseDetect) return;
  window.__paperwiseDetect = true;
  const SKIP = ['hidden', 'submit', 'button', 'reset', 'image', 'file', 'search'];
  const key = 'paperwise-prompt-dismissed:' + location.host + location.pathname;

  const countFields = () => [...document.querySelectorAll('input, textarea, select')].filter(el => {
    const t = (el.getAttribute('type') || '').toLowerCase();
    return !SKIP.includes(t) && el.name !== 'q' && el.offsetParent !== null && !el.disabled && !el.closest('#paperwise-panel, #paperwise-prompt');
  }).length;

  const show = count => {
    if (document.getElementById('paperwise-prompt') || document.getElementById('paperwise-panel')) return;
    const box = document.createElement('div');
    box.id = 'paperwise-prompt';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Paperwise');
    box.innerHTML = `<div class="pw-guy" aria-hidden="true"><div class="pw-guy-head"><span class="pw-guy-mouth"></span></div><div class="pw-guy-body"></div></div>
      <div class="pw-card"><button class="pw-x" aria-label="Dismiss">×</button>
        <div class="pw-tag">Form detected · ${count} fields</div>
        <div class="pw-title">Want help filling this out?</div>
        <div class="pw-actions"><button class="pw-yes">Help me fill this</button><button class="pw-no">Not now</button></div></div>`;
    document.documentElement.appendChild(box);
    const close = () => { box.remove(); try { sessionStorage.setItem(key, '1'); } catch {} };
    box.querySelector('.pw-x').onclick = close;
    box.querySelector('.pw-no').onclick = close;
    box.querySelector('.pw-yes').onclick = () => { box.remove(); chrome.runtime.sendMessage({ type: 'paperwise-open' }); };
    setTimeout(() => box.querySelector('.pw-guy')?.classList.add('pw-quiet'), 2600);
  };

  const check = () => {
    try { if (sessionStorage.getItem(key)) return; } catch {}
    const count = countFields();
    if (count >= 2) { show(count); observer.disconnect(); }
  };
  let timer;
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(check, 600); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(check, 800);
})();

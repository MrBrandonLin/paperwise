(() => {
  if (globalThis.__paperwiseInstalled) return;
  globalThis.__paperwiseInstalled = true;
  let fields = new Map();
  const supported = el => !el.disabled && !el.readOnly && el.getAttribute('aria-hidden') !== 'true' && !el.closest('[hidden], [aria-hidden="true"]') && !['hidden', 'password', 'file', 'submit', 'button', 'reset', 'image'].includes(el.type) && el.getClientRects().length > 0;
  const label = el => Array.from(el.labels || []).map(item => item.textContent.trim()).join(' ') || el.getAttribute('aria-label') || el.placeholder || el.name || 'Untitled field';
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === 'scan') {
      fields = new Map();
      const result = Array.from(document.querySelectorAll('input, select, textarea')).filter(supported).map((el, i) => {
        const id = String(i);
        fields.set(id, el);
        return { id, label: label(el), type: el.type, required: el.required, value: ['checkbox', 'radio'].includes(el.type) ? el.checked : el.value, options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => ({ label: o.textContent, value: o.value })) : undefined };
      });
      respond({ fields: result, title: document.title });
    }
    if (message.type === 'fill') {
      const el = fields.get(message.id);
      if (!el?.isConnected || !supported(el)) { respond({ error: 'The form changed. Scan it again.' }); return; }
      if (['checkbox', 'radio'].includes(el.type)) {
        if (typeof message.value !== 'boolean') { respond({ error: 'Please explicitly choose yes or no.' }); return; }
        if (el.checked !== message.value) el.click();
      } else {
        if (el.tagName === 'SELECT' && !Array.from(el.options).some(o => o.value === message.value)) { respond({ error: 'Choose an available option.' }); return; }
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(el, String(message.value));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      respond({ ok: true, value: ['checkbox', 'radio'].includes(el.type) ? el.checked : el.value });
    }
  });
})();

(() => {
  const existing = document.getElementById('paperwise-panel');
  if (existing) { existing.remove(); document.querySelectorAll('.paperwise-guided').forEach(e => e.classList.remove('paperwise-guided')); return; }
  const fields = [...document.querySelectorAll('input, textarea, select')].filter(el => {
    const t = (el.getAttribute('type') || '').toLowerCase();
    return !['hidden', 'submit', 'button', 'reset', 'image', 'file', 'checkbox', 'radio'].includes(t) && el.offsetParent !== null && !el.closest('#paperwise-panel');
  });
  const labelOf = el => {
    const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    return (byFor?.textContent || el.closest('label')?.textContent || el.getAttribute('aria-label') || el.placeholder || el.name || 'this field').trim().replace(/\s+/g, ' ').slice(0, 80);
  };
  const panel = document.createElement('aside');
  panel.id = 'paperwise-panel';
  panel.innerHTML = `<header><span style="display:flex;align-items:center;gap:8px"><img src="${chrome.runtime.getURL('icon.png')}" width="28" height="28" alt="">Paperwise</span><button aria-label="Close">×</button></header><div class="pw-bubble"><div class="pw-label"></div><div class="pw-text"></div></div><div class="pw-progress"></div><button class="pw-skip" type="button">Skip this field</button><form><input placeholder="Type your answer…" aria-label="Your answer"><button>Send</button></form>`;
  document.body.appendChild(panel);
  const label = panel.querySelector('.pw-label'), text = panel.querySelector('.pw-text'), progress = panel.querySelector('.pw-progress'), input = panel.querySelector('form input');
  let index = 0;
  const show = () => {
    document.querySelectorAll('.paperwise-guided').forEach(e => e.classList.remove('paperwise-guided'));
    if (!fields.length) { label.textContent = 'No form found'; text.textContent = 'I couldn’t find any form fields on this page.'; return; }
    if (index >= fields.length) { label.textContent = 'All done'; text.textContent = 'That’s every field. Check your answers before you submit.'; progress.textContent = ''; return; }
    const el = fields[index];
    el.classList.add('paperwise-guided');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    label.textContent = `Field ${index + 1} of ${fields.length}`;
    text.textContent = `What should I put for “${labelOf(el)}”?`;
    progress.textContent = `${index} of ${fields.length} answered`;
    input.value = el.value || '';
    input.focus();
  };
  panel.querySelector('header button').onclick = () => { panel.remove(); document.querySelectorAll('.paperwise-guided').forEach(e => e.classList.remove('paperwise-guided')); };
  panel.querySelector('.pw-skip').onclick = () => { index++; show(); };
  panel.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const el = fields[index]; if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    setter ? setter.call(el, input.value) : (el.value = input.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    index++; show();
  };
  show();
})();

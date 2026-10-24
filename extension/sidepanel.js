const $ = id => document.getElementById(id);
let fields = [], index = 0, answers = [];
const send = async message => {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || response.error) throw new Error(response?.error || 'Unable to connect. Click Paperwise on this tab and try again.');
  return response;
};
const render = () => {
  $('guide').hidden = index >= fields.length;
  $('complete').hidden = index < fields.length;
  if (index >= fields.length) return;
  const field = fields[index];
  $('count').textContent = `${index + 1} / ${fields.length}`;
  $('progress').max = fields.length; $('progress').value = index;
  $('question').textContent = field.label;
  $('hint').textContent = field.type === 'checkbox' || field.type === 'radio' ? 'Only choose yes if you agree. Paperwise never gives consent for you.' : `${field.required ? 'Required field. ' : ''}Enter your answer, then place it in the form.`;
  const container = $('answer-container'); container.replaceChildren();
  let input;
  if (field.options || ['checkbox', 'radio'].includes(field.type)) {
    input = document.createElement('select');
    const options = field.options || [{ value: '', label: 'Choose an answer' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];
    for (const option of options) { const el = document.createElement('option'); el.value = option.value; el.textContent = option.label; input.append(el); }
    input.value = field.options ? field.value : '';
  } else {
    input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
    if (input.tagName === 'INPUT') input.type = ['email','tel','number','date','url','time','month','week','datetime-local'].includes(field.type) ? field.type : 'text';
    input.value = field.value || '';
  }
  input.id = 'answer'; input.setAttribute('aria-label', field.label); input.required = true;
  container.append(input);
};
$('scan').onclick = async () => {
  $('notice').textContent = ''; $('scan').disabled = true;
  try { const response = await send({ type: 'scan' }); fields = response.fields; index = 0; answers = []; $('site').textContent = response.title; $('guide').hidden = true; $('complete').hidden = true; if (fields.length) render(); else $('notice').textContent = 'No supported fields found. Embedded frames, custom widgets, and protected pages may not be accessible.'; }
  catch (error) { $('notice').textContent = error.message; }
  finally { $('scan').disabled = false; }
};
$('answer-form').onsubmit = async event => {
  event.preventDefault(); $('notice').textContent = '';
  const field = fields[index]; if (!field) return;
  const raw = $('answer').value;
  const value = ['checkbox','radio'].includes(field.type) ? raw === 'true' : raw;
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try { await send({ type: 'fill', id: field.id, value }); answers.push({ field: field.label, value }); index++; render(); }
  catch (error) { $('notice').textContent = error.message; }
  finally { button.disabled = false; }
};
$('skip').onclick = () => { index++; render(); };
$('download').onclick = () => {
  const blob = new Blob([JSON.stringify(answers, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'paperwise-answers.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

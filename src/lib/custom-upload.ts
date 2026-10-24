import type { DemoField, DemoScenario } from '@/lib/extension-demo';

export const CUSTOM_KEY = 'paperwise-custom-scenario';

const fallbackFields: DemoField[] = [
  { id: 'name', label: 'Full name', section: 'About you', type: 'text', wide: true, placeholder: 'First and last name', question: 'Let’s start with your full name.', explanation: 'Use your name as it appears on your ID.' },
  { id: 'dob', label: 'Date of birth', section: 'About you', type: 'text', placeholder: 'MM/DD/YYYY', question: 'What is your date of birth?', explanation: 'Month, day, and year.' },
  { id: 'phone', label: 'Phone number', section: 'About you', type: 'tel', placeholder: '(555) 000-0000', question: 'What is your phone number?', explanation: 'Include your area code.' },
  { id: 'address', label: 'Address', section: 'Contact', type: 'text', wide: true, placeholder: 'Street, city, state, ZIP', question: 'What is your home address?', explanation: 'Where you currently live.' },
  { id: 'signature', label: 'Signature name', section: 'Confirm', type: 'text', wide: true, placeholder: 'Type your name', question: 'Finally, type your name to sign.', explanation: 'Typing your name here acts as your signature on this copy.' },
];

function toField(raw: string, index: number): DemoField {
  const label = raw.replace(/[_:*.]+$/g, '').replace(/[_\s]+/g, ' ').trim().slice(0, 60) || `Field ${index + 1}`;
  const lower = label.toLowerCase();
  const type: DemoField['type'] = lower.includes('email') ? 'email' : /phone|tel/.test(lower) ? 'tel' : /amount|income|number of|salary|\$/.test(lower) ? 'number' : 'text';
  return {
    id: `f${index}`, label, type, section: 'Your form', wide: label.length > 24,
    placeholder: type === 'email' ? 'you@example.com' : `Enter ${lower}`,
    question: `What should I put for “${label}”?`,
    explanation: `This field asks for your ${lower}. If you’re not sure, ask me and I’ll explain.`,
  };
}

async function fieldsFromPdf(file: File) {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  return pdf.getForm().getFields().map(f => f.getName().split('.').pop() || '').filter(Boolean);
}

function fieldsFromText(text: string) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => /[:_]{1,}\s*$|_{3,}/.test(line) && line.length < 80).map(line => line.split(/_{3,}/)[0]!.trim());
}

/** Turns an uploaded form into a demo scenario. Everything happens in the browser. */
export async function scenarioFromFile(file: File): Promise<{ scenario: DemoScenario; detected: boolean }> {
  let labels: string[] = [];
  try {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) labels = await fieldsFromPdf(file);
    else if (file.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(file.name)) labels = fieldsFromText(await file.text());
  } catch { labels = []; }
  const unique = [...new Set(labels)].slice(0, 12);
  const detected = unique.length > 0;
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Your form';
  return {
    detected,
    scenario: {
      id: 'custom', context: 'Your upload', brand: 'Your', brandSuffix: ' document', tagline: file.name, icon: 'home',
      breadcrumb: ['Uploads'], eyebrow: detected ? 'Fields found in your file' : 'Practice form', title: name,
      intro: detected ? `Paperwise found ${unique.length} fields in ${file.name}. It will walk you through each one.` : `We couldn’t read fields from ${file.name}, so here is a general practice form. Fillable PDFs and text forms work best.`,
      summary: 'A form built from your own uploaded file.', submitLabel: 'Review form', doneTitle: 'Form reviewed', doneNote: 'This is a demo. Your file never left your browser.',
      fileName: 'paperwise-your-form.pdf', fields: detected ? unique.map(toField) : fallbackFields,
    },
  };
}

export type DemoField = {
  id: string;
  label: string;
  section: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'date';
  placeholder: string;
  question: string;
  explanation: string;
  wide?: boolean;
  hint?: string;
};

export type DemoScenario = {
  id: string;
  context: string;
  brand: string;
  brandSuffix: string;
  tagline: string;
  icon: 'home' | 'clinic' | 'briefcase' | 'landmark';
  breadcrumb: string[];
  eyebrow: string;
  title: string;
  intro: string;
  summary: string;
  submitLabel: string;
  doneTitle: string;
  doneNote: string;
  fileName: string;
  fields: DemoField[];
};

const rentalFields: DemoField[] = [
  { id: 'name', label: 'Full legal name', section: 'Personal information', type: 'text', wide: true, placeholder: 'As it appears on your ID', question: 'Let’s start with your full legal name.', explanation: 'Use your first and last name exactly as they appear on your government-issued ID.' },
  { id: 'email', label: 'Email address', section: 'Personal information', type: 'email', placeholder: 'you@example.com', question: 'What email address should the property team use?', explanation: 'This is where the property team will send updates about your application.' },
  { id: 'phone', label: 'Phone number', section: 'Personal information', type: 'tel', placeholder: '(555) 000-0000', question: 'What’s the best phone number to reach you?', explanation: 'Include your area code. This should be a number where you can receive calls.' },
  { id: 'address', label: 'Current address', section: 'Residential history', type: 'text', wide: true, placeholder: 'Street, city, state, ZIP code', question: 'Where do you currently live?', explanation: 'Enter your current home address, including the city, state, and ZIP code.' },
  { id: 'employer', label: 'Employer or source of income', section: 'Employment & income', type: 'text', placeholder: 'Company or income source', question: 'Who is your employer, or what is your source of income?', explanation: 'You can enter an employer, self-employment, a pension, or another source of income.' },
  { id: 'income', label: 'Gross monthly income', section: 'Employment & income', type: 'number', placeholder: 'Monthly amount in USD', hint: 'Before taxes and deductions, in USD.', question: 'How much do you earn each month, before taxes?', explanation: 'Gross means before taxes and deductions. If you know your yearly income, divide it by 12.' },
];

export const demoFields = rentalFields;

export const demoScenarios: DemoScenario[] = [
  {
    id: 'rental', context: 'Housing', brand: 'Northline', brandSuffix: ' residences', tagline: 'A place to call yours', icon: 'home',
    breadcrumb: ['Residences', 'Apply'], eyebrow: 'Your next chapter', title: 'Rental application',
    intro: 'Tell us a little about yourself. We’ll use this information to review your application for a new home.',
    summary: 'Apply for an apartment with help on income, address history, and contact details.',
    submitLabel: 'Review application', doneTitle: 'Application reviewed', doneNote: 'This is a demo. Nothing has been sent to a property team.',
    fileName: 'paperwise-rental-application.pdf', fields: rentalFields,
  },
  {
    id: 'clinic', context: 'Healthcare', brand: 'Harbor', brandSuffix: ' health clinic', tagline: 'Care close to home', icon: 'clinic',
    breadcrumb: ['Patients', 'New visit'], eyebrow: 'Before your visit', title: 'New patient intake',
    intro: 'Help your care team get to know you. Share only what you’re comfortable with — you can ask about anything.',
    summary: 'Check in as a new patient, with plain-language help on insurance and medical terms.',
    submitLabel: 'Review intake', doneTitle: 'Intake reviewed', doneNote: 'This is a demo. Nothing has been sent to a clinic.',
    fileName: 'paperwise-patient-intake.pdf',
    fields: [
      { id: 'name', label: 'Patient full name', section: 'About you', type: 'text', wide: true, placeholder: 'First and last name', question: 'Let’s start with the patient’s full name.', explanation: 'Use the name that appears on your insurance card, if you have one.' },
      { id: 'dob', label: 'Date of birth', section: 'About you', type: 'date', placeholder: 'MM/DD/YYYY', question: 'What is your date of birth?', explanation: 'The clinic uses this to match you with the right records.' },
      { id: 'phone', label: 'Phone number', section: 'About you', type: 'tel', placeholder: '(555) 000-0000', question: 'What number can the clinic call you at?', explanation: 'They may call to confirm or reschedule your appointment.' },
      { id: 'insurer', label: 'Insurance provider', section: 'Insurance', type: 'text', placeholder: 'Company name, or “none”', question: 'Who is your health insurance provider?', explanation: 'It’s the company name printed on your insurance card. If you don’t have insurance, say “none”.' },
      { id: 'member', label: 'Member ID', section: 'Insurance', type: 'text', placeholder: 'On the front of your card', question: 'What is the member ID on your insurance card?', explanation: 'A member ID is the personal number on your card that identifies you to the insurer.' },
      { id: 'reason', label: 'Reason for visit', section: 'Your visit', type: 'text', wide: true, placeholder: 'In your own words', question: 'In your own words, what brings you in today?', explanation: 'A short description is fine — for example, “a cough for two weeks”.' },
    ],
  },
  {
    id: 'grant', context: 'Small business', brand: 'Civic', brandSuffix: ' commerce fund', tagline: 'Growing local business', icon: 'briefcase',
    breadcrumb: ['Programs', 'Grants'], eyebrow: 'Main street grant', title: 'Small business grant',
    intro: 'Tell us about your business. Grants support local owners investing in their community.',
    summary: 'Apply for funding with guidance on business IDs, revenue, and how money will be used.',
    submitLabel: 'Review grant application', doneTitle: 'Grant application reviewed', doneNote: 'This is a demo. Nothing has been sent to a funder.',
    fileName: 'paperwise-grant-application.pdf',
    fields: [
      { id: 'business', label: 'Legal business name', section: 'Business details', type: 'text', wide: true, placeholder: 'As registered with your state', question: 'What is the legal name of your business?', explanation: 'This is the name on your registration papers, which may differ from your shop sign.' },
      { id: 'ein', label: 'Employer ID number (EIN)', section: 'Business details', type: 'text', placeholder: '12-3456789', question: 'What is your business’s EIN?', explanation: 'An EIN is a nine-digit tax number the IRS gives businesses. It appears on tax letters from the IRS.' },
      { id: 'owner', label: 'Owner name', section: 'Business details', type: 'text', placeholder: 'Primary owner', question: 'Who is the primary owner?', explanation: 'The person who owns the largest share of the business.' },
      { id: 'revenue', label: 'Annual revenue', section: 'Finances', type: 'number', placeholder: 'Last year, in USD', hint: 'Total sales before expenses, in USD.', question: 'About how much did the business bring in last year?', explanation: 'Revenue means all money from sales, before you subtract any costs.' },
      { id: 'employees', label: 'Number of employees', section: 'Finances', type: 'number', placeholder: 'Including yourself', question: 'How many people work for the business, including you?', explanation: 'Count both full-time and part-time workers.' },
      { id: 'use', label: 'Planned use of funds', section: 'Your plan', type: 'text', wide: true, placeholder: 'e.g. new equipment', question: 'How would you use the grant money?', explanation: 'A sentence or two is enough, like “buy a new oven to double our output”.' },
    ],
  },
  {
    id: 'license', context: 'Government', brand: 'State', brandSuffix: ' motor services', tagline: 'Official state services', icon: 'landmark',
    breadcrumb: ['Licenses', 'Renew'], eyebrow: 'Online renewal', title: 'Driver’s license renewal',
    intro: 'Renew your license online. Have your current license nearby before you begin.',
    summary: 'Renew an ID with help understanding residency status and official wording.',
    submitLabel: 'Review renewal', doneTitle: 'Renewal reviewed', doneNote: 'This is a demo. Nothing has been sent to a government office.',
    fileName: 'paperwise-license-renewal.pdf',
    fields: [
      { id: 'name', label: 'Full legal name', section: 'Identity', type: 'text', wide: true, placeholder: 'As shown on your license', question: 'What is your full legal name?', explanation: 'Use your name exactly as printed on your current license.' },
      { id: 'license', label: 'Current license number', section: 'Identity', type: 'text', placeholder: 'e.g. D1234567', question: 'What is your current license number?', explanation: 'It’s usually labeled “DL” or “License no.” on the front of your card.' },
      { id: 'dob', label: 'Date of birth', section: 'Identity', type: 'date', placeholder: 'MM/DD/YYYY', question: 'What is your date of birth?', explanation: 'It must match the date on your current license.' },
      { id: 'address', label: 'Residential address', section: 'Residency', type: 'text', wide: true, placeholder: 'Where you live, not a PO box', question: 'What is your home address?', explanation: 'This must be where you actually live. A PO box can’t be used here.' },
      { id: 'status', label: 'Residency status', section: 'Residency', type: 'text', wide: true, placeholder: 'e.g. U.S. citizen, permanent resident', question: 'What is your residency status?', explanation: 'This asks whether you are a citizen, a permanent resident, or here on another visa. Answer what is true for you.' },
    ],
  },
];

export function getScenario(id: string) {
  return demoScenarios.find(scenario => scenario.id === id);
}

export type DemoValues = Record<string, string>;
export function nextEmptyField(values: DemoValues, fields: DemoField[] = demoFields) {
  return fields.findIndex(field => !values[field.id]?.trim());
}

export function sectionsOf(fields: DemoField[]) {
  return [...new Set(fields.map(field => field.section))];
}

export async function downloadDemoPdf(values: DemoValues, scenario: DemoScenario = demoScenarios[0]!) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const documentPdf = await PDFDocument.create();
  const page = documentPdf.addPage([612, 792]);
  const font = await documentPdf.embedFont(StandardFonts.Helvetica);
  const bold = await documentPdf.embedFont(StandardFonts.HelveticaBold);
  const printable = (value: string) => value.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  page.drawText(printable(`${scenario.title} - Demo copy`), { x: 48, y: 736, size: 20, font: bold });
  scenario.fields.forEach((field, index) => {
    const y = 680 - index * 80;
    page.drawText(printable(field.label), { x: 48, y, size: 11, font: bold });
    page.drawText(printable(values[field.id] || 'Not provided'), { x: 48, y: y - 23, size: 12, font, maxWidth: 500 });
  });
  const bytes = await documentPdf.save();
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = scenario.fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

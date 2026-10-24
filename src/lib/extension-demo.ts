export const demoFields = [
  { id: 'name', label: 'Full legal name', section: 'Personal information', type: 'text', placeholder: 'As it appears on your ID', question: 'Let’s start with your full legal name.', explanation: 'Use your first and last name exactly as they appear on your government-issued ID.' },
  { id: 'email', label: 'Email address', section: 'Personal information', type: 'email', placeholder: 'you@example.com', question: 'What email address should the property team use?', explanation: 'This is where the property team will send updates about your application.' },
  { id: 'phone', label: 'Phone number', section: 'Personal information', type: 'tel', placeholder: '(555) 000-0000', question: 'What’s the best phone number to reach you?', explanation: 'Include your area code. This should be a number where you can receive calls.' },
  { id: 'address', label: 'Current address', section: 'Residential history', type: 'text', placeholder: 'Street, city, state, ZIP code', question: 'Where do you currently live?', explanation: 'Enter your current home address, including the city, state, and ZIP code.' },
  { id: 'employer', label: 'Employer or source of income', section: 'Employment & income', type: 'text', placeholder: 'Company or income source', question: 'Who is your employer, or what is your source of income?', explanation: 'You can enter an employer, self-employment, a pension, or another source of income.' },
  { id: 'income', label: 'Gross monthly income', section: 'Employment & income', type: 'number', placeholder: 'Monthly amount in USD', question: 'How much do you earn each month, before taxes?', explanation: 'Gross means before taxes and deductions. If you know your yearly income, divide it by 12.' },
] as const;

export type DemoValues = Record<string, string>;
export function nextEmptyField(values: DemoValues) {
  return demoFields.findIndex(field => !values[field.id]?.trim());
}

export async function downloadDemoPdf(values: DemoValues) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const documentPdf = await PDFDocument.create();
  const page = documentPdf.addPage([612, 792]);
  const font = await documentPdf.embedFont(StandardFonts.Helvetica);
  const bold = await documentPdf.embedFont(StandardFonts.HelveticaBold);
  const printable = (value: string) => value.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  page.drawText('Rental application - Demo copy', { x: 48, y: 736, size: 20, font: bold });
  demoFields.forEach((field, index) => {
    const y = 680 - index * 80;
    page.drawText(field.label, { x: 48, y, size: 11, font: bold });
    page.drawText(printable(values[field.id] || 'Not provided'), { x: 48, y: y - 23, size: 12, font, maxWidth: 500 });
  });
  const bytes = await documentPdf.save();
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = 'paperwise-rental-application.pdf';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
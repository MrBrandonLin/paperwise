import type { ScannedField } from '@/shared/contract';

/**
 * A plausible test value for a field, for the debug "fill test value" buttons.
 * Selects and radios use the option LABEL (not the value) to exercise label matching.
 */
export function testValueFor(field: ScannedField): string {
  const text = `${field.label} ${field.name ?? ''} ${field.autocomplete ?? ''}`.toLowerCase();
  const firstRealOption = field.options?.find((o) => o.value !== '');

  switch (field.kind) {
    case 'checkbox':
      return 'true';
    case 'radio':
    case 'select':
      return firstRealOption?.label ?? '';
    case 'date':
      return /birth|dob|naissance/.test(text) ? '1958-03-04' : '2026-12-01';
    case 'number':
      return '1,800';
    case 'email':
      return 'marie.dubois@example.com';
    case 'tel':
      return '555-0142';
    case 'textarea':
      return 'One cat, 4 years old';
    case 'password':
      return 'Test-password-1';
  }

  if (/ssn|social security/.test(text)) return '123-45-6789';
  if (/given-name|first/.test(text)) return 'Marie';
  if (/family-name|last/.test(text)) return 'Dubois';
  if (/employer|company/.test(text)) return 'Maple Bakery';
  if (/co-?signer|guarantor/.test(text)) return 'Jean Dubois';
  if (/name/.test(text)) return 'Marie Dubois';
  if (/zip|postal/.test(text)) return '02139';
  if (/city/.test(text)) return 'Boston';
  if (/address|street/.test(text)) return '12 Maple Street';
  return 'Test value';
}

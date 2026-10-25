import type { ScanResult, ScannedField } from './contract';

/**
 * Is this page a form worth offering help with? The launcher must never pop up on a page
 * that only has a search box (YouTube, news sites) or a two-field login.
 *
 * Counts visible fields that aren't search boxes, then asks for either 3 of them, or 2 with
 * at least one real choice or long answer (select, radio, checkbox, textarea, date).
 */
const SEARCH = /\b(search|query|buscar|búsqueda|rechercher|recherche|pesquisar|suche|搜索|поиск)\b/i;
const SEARCH_NAMES = new Set(['q', 's', 'query', 'search', 'search_query', 'keyword', 'keywords', 'k']);

export function isSearchField(f: ScannedField): boolean {
  if (SEARCH_NAMES.has((f.name ?? '').toLowerCase())) return true;
  return SEARCH.test(`${f.label} ${f.placeholder ?? ''} ${f.autocomplete ?? ''} ${f.name ?? ''}`);
}

export function formFields(scan: ScanResult): ScannedField[] {
  return scan.fields.filter((f) => f.visible && !isSearchField(f));
}

export function looksLikeAForm(scan: ScanResult): boolean {
  const fields = formFields(scan);
  if (fields.length >= 3) {
    // email/username + password (+ "remember me") is a login, not a form to fill.
    const login = fields.every((f) => f.kind === 'password' || f.kind === 'email' || f.kind === 'checkbox' || /user|login|e-?mail|identifiant|usuario/i.test(`${f.name ?? ''} ${f.label}`));
    return !(login && fields.some((f) => f.kind === 'password'));
  }
  if (fields.length === 2) return fields.some((f) => ['select', 'radio', 'checkbox', 'textarea', 'date'].includes(f.kind)) && !fields.some((f) => f.kind === 'password');
  return false;
}

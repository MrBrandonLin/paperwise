import { PDFDocument, PDFName, PDFString, PDFHexString, type PDFDict } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfText, PdfWidget, PdfWidgetKind } from './labels';

/**
 * What the label builder needs from a PDF, read with pdf.js: every form widget (page, box,
 * kind, export value) and every text item with its position. Shared by the viewer and the
 * Node scripts (pdf:labels), so both see the same thing.
 */
export async function extractPdf(doc: PDFDocumentProxy, tooltips: Map<string, string>) {
  const widgets: PdfWidget[] = [];
  const texts: PdfText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const [annotations, content] = await Promise.all([page.getAnnotations({ intent: 'display' }), page.getTextContent()]);
    for (const a of annotations as PdfJsAnnotation[]) {
      const kind = widgetKind(a);
      if (!kind || !a.fieldName) continue;
      widgets.push({
        annotationId: a.id,
        fieldName: a.fieldName,
        kind,
        page: n,
        rect: a.rect as PdfWidget['rect'],
        tooltip: a.alternativeText || tooltips.get(a.fieldName) || undefined,
        exportValue: kind === 'checkbox' ? a.exportValue : kind === 'radio' ? a.buttonValue : undefined,
      });
    }
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const [, b, c, d, x, y] = item.transform as number[];
      if (Math.abs(b!) > 0.01 || Math.abs(c!) > 0.01) continue; // rotated text (margin notes)
      texts.push({ page: n, str: item.str, x: x!, y: y!, width: item.width, height: item.height || Math.abs(d!) });
    }
  }
  return { widgets, texts };
}

/** The pdf.js annotation fields we read (pdf.js types annotations as `any`). */
interface PdfJsAnnotation {
  id: string;
  subtype: string;
  fieldType?: string;
  fieldName?: string;
  rect: number[];
  alternativeText?: string;
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
  exportValue?: string;
  buttonValue?: string;
  readOnly?: boolean;
  hidden?: boolean;
}

function widgetKind(a: PdfJsAnnotation): PdfWidgetKind | null {
  if (a.subtype !== 'Widget' || a.hidden) return null;
  if (a.fieldType === 'Tx') return 'text';
  if (a.fieldType === 'Ch') return 'select';
  if (a.fieldType === 'Btn') return a.checkBox ? 'checkbox' : a.radioButton ? 'radio' : null;
  return null; // signatures, push buttons
}

/**
 * Tooltips (TU) by full field name. pdf.js only reads TU on the widget itself; most PDFs keep it
 * on the field (the widget's parent), so we read the field tree with pdf-lib too.
 * Encrypted PDFs: strings are encrypted, so no tooltips (labels come from the page text).
 */
export async function readTooltips(bytes: Uint8Array): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    if (doc.isEncrypted) return out;
    for (const field of doc.getForm().getFields()) {
      const dicts: PDFDict[] = [field.acroField.dict, ...field.acroField.getWidgets().map((w) => w.dict)];
      for (const dict of dicts) {
        const tu = dict.lookup(PDFName.of('TU'));
        if (tu instanceof PDFString || tu instanceof PDFHexString) {
          out.set(field.getName(), tu.decodeText());
          break;
        }
      }
    }
  } catch {
    // Unusual form structure: labels come from the page text.
  }
  return out;
}

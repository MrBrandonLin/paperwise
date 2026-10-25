import type { Language } from '@/shared/contract';
import type { PdfErrorCode } from '@/shared/messages';

export type { PdfErrorCode };

export interface PdfCopy {
  openPdf: string;
  openPdfHint: string;
  dropHere: string;
  pdfTab: string;
  fillThisPdf: string;
  opening: string;
  loading: string;
  download: string;
  downloadLocked: string;
  downloading: string;
  saveFailed: string;
  savedSome: (n: number) => string;
  zoomIn: string;
  zoomOut: string;
  zoom: string;
  fitWidth: string;
  page: (n: number, total: number) => string;
  confirmTitle: string;
  confirmText: string;
  confirmYes: string;
  confirmNo: string;
  errors: Record<PdfErrorCode, string>;
}

export const PDF_COPY: { en: PdfCopy } & Partial<Record<Language, PdfCopy>> = {
  en: {
    openPdf: 'Open a PDF',
    openPdfHint: 'Have a fillable PDF? Open it here, or drop it on this panel.',
    dropHere: 'Drop your PDF here',
    pdfTab: 'This tab is a PDF.',
    fillThisPdf: 'Fill this PDF with Paperwise',
    opening: 'Opening the PDF…',
    loading: 'Opening the PDF…',
    download: 'Download filled PDF',
    downloadLocked: 'Available once the review is done',
    downloading: 'Saving…',
    saveFailed: 'Paperwise couldn’t save the filled PDF. Your answers are still in the form.',
    savedSome: (n) => `Saved. ${n} answer${n === 1 ? '' : 's'} couldn’t be written into the PDF: please check them.`,
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoom: 'Zoom',
    fitWidth: 'Fit width',
    page: (n, total) => `Page ${n} of ${total}`,
    confirmTitle: 'Open the PDF now?',
    confirmText: 'This conversation ends. Everything already filled stays on this page.',
    confirmYes: 'Open the PDF',
    confirmNo: 'Not now',
    errors: {
      noFields: 'This PDF has no fillable fields. Paperwise works with fillable PDFs for now.',
      xfa: 'This PDF uses an XFA form, which Paperwise doesn’t support yet. Ask for a version of the form that opens in any PDF reader.',
      password: 'This PDF is protected with a password. Paperwise can’t open protected PDFs yet.',
      corrupted: 'This file looks damaged, or it isn’t really a PDF. Try downloading it again.',
      fileAccess: 'Chrome doesn’t let Paperwise read files on your computer from this tab. Drag the PDF onto the Paperwise panel instead.',
      expired: 'This PDF isn’t available here any more. Open it again from the Paperwise panel.',
      unreadable: 'Paperwise couldn’t read this PDF. Download it, then drag the file onto the Paperwise panel.',
      notPdf: 'That file isn’t a PDF. Paperwise can open PDF files.',
    },
  },
  es: {
    openPdf: 'Abrir un PDF',
    openPdfHint: '¿Tiene un PDF para llenar? Ábralo aquí o suéltelo en este panel.',
    dropHere: 'Suelte su PDF aquí',
    pdfTab: 'Esta pestaña es un PDF.',
    fillThisPdf: 'Llenar este PDF con Paperwise',
    opening: 'Abriendo el PDF…',
    loading: 'Abriendo el PDF…',
    download: 'Descargar el PDF lleno',
    downloadLocked: 'Disponible cuando termine la revisión',
    downloading: 'Guardando…',
    saveFailed: 'Paperwise no pudo guardar el PDF lleno. Sus respuestas siguen en el formulario.',
    savedSome: (n) => `Guardado. ${n} respuesta${n === 1 ? '' : 's'} no se pudo escribir en el PDF: revíselas.`,
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    zoom: 'Zoom',
    fitWidth: 'Ajustar al ancho',
    page: (n, total) => `Página ${n} de ${total}`,
    confirmTitle: '¿Abrir el PDF ahora?',
    confirmText: 'Esta conversación termina. Todo lo que ya se llenó se queda en esta página.',
    confirmYes: 'Abrir el PDF',
    confirmNo: 'Ahora no',
    errors: {
      noFields: 'Este PDF no tiene campos para llenar. Por ahora Paperwise funciona con PDF rellenables.',
      xfa: 'Este PDF usa un formulario XFA, que Paperwise aún no admite. Pida una versión del formulario que se abra en cualquier lector de PDF.',
      password: 'Este PDF está protegido con contraseña. Paperwise todavía no puede abrir PDF protegidos.',
      corrupted: 'Este archivo parece dañado, o no es realmente un PDF. Intente descargarlo de nuevo.',
      fileAccess: 'Chrome no deja que Paperwise lea archivos de su computadora desde esta pestaña. Arrastre el PDF al panel de Paperwise.',
      expired: 'Este PDF ya no está disponible aquí. Ábralo de nuevo desde el panel de Paperwise.',
      unreadable: 'Paperwise no pudo leer este PDF. Descárguelo y luego arrastre el archivo al panel de Paperwise.',
      notPdf: 'Ese archivo no es un PDF. Paperwise abre archivos PDF.',
    },
  },
  ar: {
    openPdf: 'فتح ملف PDF',
    openPdfHint: 'هل لديك ملف PDF قابل للتعبئة؟ افتحه هنا أو اسحبه إلى هذه اللوحة.',
    dropHere: 'أفلت ملف PDF هنا',
    pdfTab: 'هذه الصفحة ملف PDF.',
    fillThisPdf: 'املأ ملف PDF هذا مع Paperwise',
    opening: 'جارٍ فتح ملف PDF…',
    loading: 'جارٍ فتح ملف PDF…',
    download: 'تنزيل ملف PDF المعبأ',
    downloadLocked: 'متاح بعد انتهاء المراجعة',
    downloading: 'جارٍ الحفظ…',
    saveFailed: 'تعذّر على Paperwise حفظ ملف PDF المعبأ. إجاباتك ما زالت في النموذج.',
    savedSome: (n) => `تم الحفظ. تعذّرت كتابة ${n} من الإجابات في ملف PDF، يُرجى التحقق منها.`,
    zoomIn: 'تكبير',
    zoomOut: 'تصغير',
    zoom: 'التكبير',
    fitWidth: 'ملاءمة العرض',
    page: (n, total) => `الصفحة ${n} من ${total}`,
    confirmTitle: 'هل تفتح ملف PDF الآن؟',
    confirmText: 'ستنتهي هذه المحادثة. كل ما تم ملؤه يبقى في هذه الصفحة.',
    confirmYes: 'افتح ملف PDF',
    confirmNo: 'ليس الآن',
    errors: {
      noFields: 'لا يحتوي ملف PDF هذا على حقول قابلة للتعبئة. يعمل Paperwise حاليًا مع ملفات PDF القابلة للتعبئة.',
      xfa: 'يستخدم ملف PDF هذا نموذج XFA، وهو غير مدعوم بعد. اطلب نسخة من النموذج تفتح في أي قارئ PDF.',
      password: 'ملف PDF هذا محمي بكلمة مرور. لا يستطيع Paperwise فتح الملفات المحمية بعد.',
      corrupted: 'يبدو أن هذا الملف تالف أو ليس ملف PDF حقيقيًا. حاول تنزيله مرة أخرى.',
      fileAccess: 'لا يسمح Chrome لـ Paperwise بقراءة الملفات من جهازك من هذه الصفحة. اسحب ملف PDF إلى لوحة Paperwise بدلًا من ذلك.',
      expired: 'لم يعد ملف PDF هذا متاحًا هنا. افتحه مرة أخرى من لوحة Paperwise.',
      unreadable: 'تعذّر على Paperwise قراءة ملف PDF هذا. نزّله ثم اسحب الملف إلى لوحة Paperwise.',
      notPdf: 'هذا الملف ليس PDF. يفتح Paperwise ملفات PDF.',
    },
  },
  fr: {
    openPdf: 'Ouvrir un PDF',
    openPdfHint: 'Vous avez un PDF à remplir ? Ouvrez-le ici, ou déposez-le sur ce panneau.',
    dropHere: 'Déposez votre PDF ici',
    pdfTab: 'Cet onglet est un PDF.',
    fillThisPdf: 'Remplir ce PDF avec Paperwise',
    opening: 'Ouverture du PDF…',
    loading: 'Ouverture du PDF…',
    download: 'Télécharger le PDF rempli',
    downloadLocked: 'Disponible une fois la relecture terminée',
    downloading: 'Enregistrement…',
    saveFailed: 'Paperwise n’a pas pu enregistrer le PDF rempli. Vos réponses sont toujours dans le formulaire.',
    savedSome: (n) => `Enregistré. ${n} réponse${n === 1 ? '' : 's'} n’${n === 1 ? 'a' : 'ont'} pas pu être écrite${n === 1 ? '' : 's'} dans le PDF : vérifiez-les.`,
    zoomIn: 'Agrandir',
    zoomOut: 'Réduire',
    zoom: 'Zoom',
    fitWidth: 'Pleine largeur',
    page: (n, total) => `Page ${n} sur ${total}`,
    confirmTitle: 'Ouvrir le PDF maintenant ?',
    confirmText: 'Cette conversation se termine. Tout ce qui est déjà rempli reste sur cette page.',
    confirmYes: 'Ouvrir le PDF',
    confirmNo: 'Pas maintenant',
    errors: {
      noFields: 'Ce PDF n’a aucun champ à remplir. Paperwise fonctionne pour l’instant avec les PDF à remplir.',
      xfa: 'Ce PDF utilise un formulaire XFA, que Paperwise ne prend pas encore en charge. Demandez une version du formulaire qui s’ouvre dans n’importe quel lecteur PDF.',
      password: 'Ce PDF est protégé par un mot de passe. Paperwise ne peut pas encore ouvrir les PDF protégés.',
      corrupted: 'Ce fichier semble abîmé, ou ce n’est pas vraiment un PDF. Essayez de le télécharger à nouveau.',
      fileAccess: 'Chrome ne permet pas à Paperwise de lire les fichiers de votre ordinateur depuis cet onglet. Faites plutôt glisser le PDF sur le panneau Paperwise.',
      expired: 'Ce PDF n’est plus disponible ici. Rouvrez-le depuis le panneau Paperwise.',
      unreadable: 'Paperwise n’a pas pu lire ce PDF. Téléchargez-le, puis faites glisser le fichier sur le panneau Paperwise.',
      notPdf: 'Ce fichier n’est pas un PDF. Paperwise ouvre les fichiers PDF.',
    },
  },
};

/** The PDF words in this language, else English. */
export function pdfCopy(language: Language): PdfCopy {
  return PDF_COPY[language] ?? PDF_COPY.en;
}

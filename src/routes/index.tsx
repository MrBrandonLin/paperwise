import { createFileRoute } from '@tanstack/react-router';
import { ExtensionDemo } from '@/components/extension-demo';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Paperwise — Form companion extension demo' },
      { name: 'description', content: 'Try Paperwise beside a sample rental application. Get plain-language guidance, fill fields, and download your answers.' },
      { property: 'og:title', content: 'Paperwise — Form companion extension demo' },
      { property: 'og:description', content: 'A helpful side panel that walks you through website forms, one question at a time.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: ExtensionDemo,
});
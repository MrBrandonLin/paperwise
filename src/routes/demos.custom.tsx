import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ExtensionDemo } from '@/components/extension-demo';
import { CUSTOM_KEY } from '@/lib/custom-upload';
import type { DemoScenario } from '@/lib/extension-demo';

export const Route = createFileRoute('/demos/custom')({
  head: () => ({
    meta: [
      { title: 'Paperwise demo — Your own form' },
      { name: 'description', content: 'Try Paperwise on a form you uploaded. Your file stays in your browser.' },
      { property: 'og:title', content: 'Paperwise demo — Your own form' },
      { property: 'og:description', content: 'Upload a form and let Paperwise guide you through it.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: CustomDemo,
});

function CustomDemo() {
  const [scenario, setScenario] = useState<DemoScenario | null | undefined>(undefined);
  useEffect(() => {
    try { setScenario(JSON.parse(sessionStorage.getItem(CUSTOM_KEY) || 'null')); } catch { setScenario(null); }
  }, []);
  if (scenario === undefined) return <div className="min-h-screen bg-background" />;
  if (!scenario) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center font-sans"><p className="font-display text-2xl">No uploaded form yet</p><Link to="/" className="font-bold text-primary hover:underline">Go back and upload a file</Link></div>;
  return <ExtensionDemo scenario={scenario} />;
}

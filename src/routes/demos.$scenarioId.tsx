import { createFileRoute, notFound } from '@tanstack/react-router';
import { ExtensionDemo } from '@/components/extension-demo';
import { getScenario } from '@/lib/extension-demo';

export const Route = createFileRoute('/demos/$scenarioId')({
  loader: ({ params }) => {
    const scenario = getScenario(params.scenarioId);
    if (!scenario) throw notFound();
    return { scenarioId: scenario.id, title: scenario.title, summary: scenario.summary };
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `Paperwise demo — ${loaderData.title}` : 'Paperwise demo — Unavailable';
    const description = loaderData?.summary ?? 'This Paperwise demo could not be found.';
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
    };
  },
  component: DemoPage,
});

function DemoPage() {
  const { scenarioId } = Route.useLoaderData();
  const scenario = getScenario(scenarioId)!;
  return <ExtensionDemo key={scenario.id} scenario={scenario} />;
}

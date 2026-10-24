import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, Briefcase, Building2, Ear, Landmark, Mic, ShieldCheck, Sparkles, Stethoscope } from 'lucide-react';
import { demoScenarios } from '@/lib/extension-demo';
import office from '@/assets/office-arch.jpg';

const icons = { home: Building2, clinic: Stethoscope, briefcase: Briefcase, landmark: Landmark };

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Paperwise — Demo gallery for the form companion' },
      { name: 'description', content: 'Explore Paperwise guiding people through rental, healthcare, small business, and government forms.' },
      { property: 'og:title', content: 'Paperwise — Demo gallery for the form companion' },
      { property: 'og:description', content: 'Pick a website and watch Paperwise walk you through its form, one question at a time.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: DemoHub,
});

function DemoHub() {
  return <div className="relative min-h-screen overflow-hidden font-sans">
    <img src={office} alt="" aria-hidden className="fixed inset-0 -z-20 size-full scale-105 object-cover opacity-60 blur-sm" />
    <div className="fixed inset-0 -z-10 bg-background/75" />

    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <div className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /><span className="font-display text-2xl">Paperwise</span></div>
      <span className="glass-light rounded-full px-3 py-1 text-xs text-muted-foreground">Extension demos</span>
    </header>

    <main className="mx-auto max-w-6xl px-6 pb-16">
      <section className="glass-light mt-6 grid gap-8 rounded-3xl p-8 sm:p-12 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-primary">One companion, any form</p>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">See Paperwise help on real-world websites.</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">Pick a sample website below. Paperwise slides in from the side, highlights each field, and explains anything confusing in plain language.</p>
        </div>
        <ul className="grid gap-3 text-sm">
          {[[Mic, 'Always-on voice — just speak'], [Ear, 'Ask anything, anytime'], [ShieldCheck, 'Demo only — nothing is sent']].map(([Icon, text]) => {
            const I = Icon as typeof Mic;
            return <li key={text as string} className="glass-light flex items-center gap-3 rounded-xl px-4 py-3"><I className="size-4 text-primary" />{text as string}</li>;
          })}
        </ul>
      </section>

      <h2 className="mb-5 mt-14 font-display text-2xl">Choose a demo</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        {demoScenarios.map(scenario => {
          const Icon = icons[scenario.icon];
          return <Link key={scenario.id} to="/demos/$scenarioId" params={{ scenarioId: scenario.id }} className="glass-light group flex flex-col rounded-2xl p-6 transition hover:-translate-y-0.5 hover:shadow-paper">
            <div className="flex items-start justify-between">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-6" /></div>
              <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{scenario.context}</span>
            </div>
            <h3 className="mt-5 text-xl font-bold">{scenario.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{scenario.brand}{scenario.brandSuffix} · {scenario.fields.length} fields</p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{scenario.summary}</p>
            <span className="mt-5 flex items-center gap-1.5 text-sm font-bold text-primary">Launch demo <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
          </Link>;
        })}
      </div>
    </main>
  </div>;
}

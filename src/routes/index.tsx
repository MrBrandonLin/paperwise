import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Briefcase, Building2, Download, Ear, FileUp, Landmark, Mic, Puzzle, ShieldCheck, Stethoscope, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { demoScenarios } from '@/lib/extension-demo';
import { CUSTOM_KEY, scenarioFromFile } from '@/lib/custom-upload';
import office from '@/assets/office-arch.jpg';
import logo from '@/assets/paperwise-logo.png.asset.json';

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
      <div className="flex items-center gap-2"><img src={logo.url} alt="Paperwise logo" className="size-11 drop-shadow-md" /><span className="font-display text-2xl">Paperwise</span></div>
      <span className="glass-light rounded-full px-3 py-1 text-xs text-muted-foreground">Extension demos</span>
    </header>

    <main className="mx-auto max-w-6xl px-6 pb-16">
      <section className="glass-light mt-6 grid gap-8 rounded-3xl p-8 sm:p-12 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <img src={logo.url} alt="" className="mb-5 size-24 drop-shadow-lg md:hidden" />
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-primary">One companion, any form</p>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">See Paperwise help on real-world websites.</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">Pick a sample website below. Paperwise slides in from the side, highlights each field, and explains anything confusing in plain language.</p>
        </div>
        <div className="grid gap-5">
        <img src={logo.url} alt="" className="mx-auto hidden size-40 drop-shadow-xl md:block" />
        <ul className="grid gap-3 text-sm">
          {[[Mic, 'Always-on voice — just speak'], [Ear, 'Ask anything, anytime'], [ShieldCheck, 'Demo only — nothing is sent']].map(([Icon, text]) => {
            const I = Icon as typeof Mic;
            return <li key={text as string} className="glass-light flex items-center gap-3 rounded-xl px-4 py-3"><I className="size-4 text-primary" />{text as string}</li>;
          })}
        </ul>
        </div>
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

      <div className="mt-14 grid gap-5 md:grid-cols-2">
        <UploadCard />
        <ExtensionCard />
      </div>
    </main>
  </div>;
}

function UploadCard() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function handle(file?: File) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const { scenario } = await scenarioFromFile(file);
      sessionStorage.setItem(CUSTOM_KEY, JSON.stringify(scenario));
      await navigate({ to: '/demos/custom' });
    } catch {
      setError('That file could not be opened. Please try another.');
      setBusy(false);
    }
  }
  return <section className="glass-light flex flex-col rounded-2xl p-6">
    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Upload className="size-6" /></div>
    <h2 className="mt-5 text-xl font-bold">Test your own form</h2>
    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">Upload a fillable PDF or a text form. Paperwise finds the fields and guides you through them. Your file stays in your browser.</p>
    <label className={`mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 px-4 py-5 text-sm font-bold text-primary transition hover:bg-primary/5 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      <FileUp className="size-4" />{busy ? 'Reading your file…' : 'Choose a file'}
      <input type="file" accept=".pdf,.txt,.md,.csv,image/*" className="sr-only" onChange={event => handle(event.target.files?.[0])} />
    </label>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </section>;
}

function ExtensionCard() {
  const [error, setError] = useState('');
  function download() {
    setError('');
    fetch('/paperwise-extension.zip')
      .then(res => { if (!res.ok) throw new Error(); return res.blob(); })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'paperwise-extension.zip';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      })
      .catch(() => setError('The download failed. Please try again.'));
  }
  return <section className="glass-light flex flex-col rounded-2xl p-6">
    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Puzzle className="size-6" /></div>
    <h2 className="mt-5 text-xl font-bold">Get the browser extension</h2>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">An early preview for Chrome, Edge, and Brave. Click the Paperwise icon on any page with a form.</p>
    <ol className="mt-3 flex-1 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
      <li>Download and unzip the file.</li>
      <li>Open <span className="font-bold text-foreground">chrome://extensions</span> and turn on Developer mode.</li>
      <li>Click <span className="font-bold text-foreground">Load unpacked</span> and pick the unzipped folder.</li>
    </ol>
    <Button onClick={download} className="mt-5 gap-2"><Download className="size-4" /> Download extension</Button>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </section>;
}

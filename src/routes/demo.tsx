import { createFileRoute, Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, Download, FileText, PanelRight, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import reception from '@/assets/reception-aero-door.jpg';

export const Route = createFileRoute('/demo')({
  head: () => ({ meta: [
    { title: 'Northline rental application — Paperwise extension demo' },
    { name: 'description', content: 'Complete a sample rental application with Paperwise beside you. Try the companion and download the browser extension.' },
    { property: 'og:title', content: 'Northline rental application — Paperwise extension demo' },
    { property: 'og:description', content: 'A separate form website with a guided Paperwise side-panel companion.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: Demo,
});

const questions = [
  { id: 'fullName', label: 'Full name', type: 'text', hint: 'Use the name you want on your application.' },
  { id: 'email', label: 'Email address', type: 'email', hint: 'Where would you like to receive updates?' },
  { id: 'phone', label: 'Phone number', type: 'tel', hint: 'What is the best number to reach you?' },
  { id: 'moveDate', label: 'Preferred move-in date', type: 'date', hint: 'When would you like to move in?' },
  { id: 'income', label: 'Monthly income before tax', type: 'number', hint: 'Your monthly earnings before taxes are taken out.' },
  { id: 'notes', label: 'Anything else to add?', type: 'text', hint: 'Optional: add any questions or preferences.' },
];

function Demo() {
  const [panel, setPanel] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const question = questions[step];
  const completed = questions.filter(q => values[q.id]?.trim()).length;
  const download = async () => {
    try {
      setDownloadError('');
      const response = await fetch('/paperwise-extension.zip');
      if (!response.ok) throw new Error('Download unavailable. Please try again.');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a'); a.href = url; a.download = 'paperwise-extension.zip'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setDownloadError(error instanceof Error ? error.message : 'Download failed.'); }
  };
  const fill = (event: React.FormEvent) => {
    event.preventDefault(); if (!question) return;
    setValues(previous => ({ ...previous, [question.id]: answer }));
    const field = formRef.current?.elements.namedItem(question.id);
    if (field instanceof HTMLElement) { field.focus({ preventScroll: true }); field.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    setStep(previous => previous + 1); setAnswer('');
  };
  return <div className="min-h-screen bg-background font-sans">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-primary px-5 py-3 text-primary-foreground">
      <Link to="/" className="flex items-center gap-2 text-sm"><ArrowLeft size={16} /> Paperwise</Link>
      <span className="text-xs">Extension playground · Sample website</span>
      <Dialog><DialogTrigger asChild><Button variant="secondary" size="sm"><Download /> Get the extension</Button></DialogTrigger>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Bring Paperwise to your browser</DialogTitle></DialogHeader>
          <ol className="list-decimal space-y-3 pl-5 text-sm"><li>Download and unzip the extension.</li><li>Open <strong>chrome://extensions</strong> in Chrome or Edge.</li><li>Turn on <strong>Developer mode</strong>.</li><li>Choose <strong>Load unpacked</strong> and select the unzipped folder.</li><li>Visit a website with a form, click the Paperwise browser icon, then select <strong>Scan this page</strong>.</li></ol>
          <p className="text-sm text-muted-foreground">Works with ordinary HTML forms. Browser-protected pages, embedded frames, and custom widgets may not be accessible. AI and voice aren’t connected yet; answers stay on your device.</p>
          <Button onClick={download}><Download /> Download extension ZIP</Button>{downloadError && <p role="alert" className="text-sm text-destructive">{downloadError}</p>}
        </DialogContent></Dialog>
    </div>
    <div className={`grid min-h-[calc(100vh-60px)] ${panel ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-border bg-card px-5 py-6 sm:px-10">
          <div className="flex items-center gap-3"><Building2 className="h-8 w-8 text-primary" /><span className="text-xl font-bold">Northline<span className="block text-[10px] font-normal text-muted-foreground">RESIDENT SERVICES</span></span></div>
          <span className="text-xs text-muted-foreground">Rental application</span>
        </header>
        <main className="mx-auto max-w-3xl px-5 py-10 sm:px-10">
          <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"><FileText size={14} /> APPLICATION / YOUR DETAILS</div>
          <h1 className="font-display text-4xl">A place to call home.</h1>
          <p className="mt-3 max-w-lg text-muted-foreground">Tell us a little about yourself. We’ll use these details to get your rental application started.</p>
          <div className="my-8 flex items-center gap-3 border-y border-border py-4 text-sm"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">1</span><span>Your details</span><span className="ml-auto text-muted-foreground">{completed} of 6 answered</span></div>
          {submitted ? <section className="py-12 text-center" role="status"><Check className="mx-auto mb-4 h-12 w-12 text-primary" /><h2 className="font-display text-3xl">Application received.</h2><p className="mt-3 text-muted-foreground">This is a demonstration. Nothing was sent to a landlord.</p><Button variant="outline" className="mt-6" onClick={() => setSubmitted(false)}>Back to my details</Button></section> :
            <form ref={formRef} onSubmit={event => { event.preventDefault(); setSubmitted(true); }}>
              <h2 className="mb-6 text-lg font-bold">Personal information</h2>
              <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2">{questions.map((q, i) => <div key={q.id} className={i === 0 || i === 5 ? 'sm:col-span-2' : ''}>
                <label htmlFor={q.id} className="mb-2 block text-sm font-bold">{q.label}{i < 5 && <span className="ml-1 text-muted-foreground">*</span>}</label>
                <Input id={q.id} name={q.id} type={q.type} min={q.id === 'income' ? 0 : undefined} required={i < 5} value={values[q.id] || ''} onChange={event => setValues(previous => ({ ...previous, [q.id]: event.target.value }))} className={`h-12 rounded-lg ${values[q.id] ? 'border-primary/40 bg-filled/30' : 'bg-card'}`} />
                {q.id === 'income' && <p className="mt-2 text-xs text-muted-foreground">Gross monthly earnings in USD.</p>}
              </div>)}</div>
              <label className="mt-7 flex items-start gap-3 text-sm"><input name="consent" type="checkbox" required className="mt-1 accent-primary" /><span>I agree to share these details for this rental application.</span></label>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"><span className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={16} /> Sample form · No data is sent</span><Button type="submit" size="lg">Submit application <ArrowRight /></Button></div>
            </form>}
          <p className="mt-10 text-center text-xs text-muted-foreground">Northline is a fictional company created for this demonstration.</p>
        </main>
        {!panel && <Button onClick={() => setPanel(true)} className="fixed bottom-6 right-6 shadow-paper"><PanelRight /> Open Paperwise</Button>}
      </div>
      {panel && <aside aria-label="Paperwise companion" className="flex min-w-0 flex-col border-l border-border bg-card lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <header className="flex items-center gap-3 border-b border-border p-5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-display text-xl text-primary-foreground">P</span><strong>Paperwise</strong><span className="ml-auto text-[10px] text-muted-foreground">PREVIEW</span><Button variant="ghost" size="icon" title="Close Paperwise" aria-label="Close Paperwise" onClick={() => setPanel(false)}><X /></Button></header>
        <div className="relative h-48 shrink-0 overflow-hidden"><img src={reception} alt="The Paperwise receptionist in an aqua office" className="h-full w-full object-cover object-[35%_center]" /><p className="absolute bottom-3 left-3 right-3 rounded-lg bg-card/95 p-3 text-sm shadow-paper">Let’s take it one field at a time.</p></div>
        <div className="flex-1 p-6"><p className="text-[10px] font-bold text-primary">YOUR FORM COMPANION</p><h2 className="mt-2 font-display text-2xl">You’re in good company.</h2><p className="mt-2 text-sm text-muted-foreground">Northline · Rental application</p>
          {question ? <><div className="mt-7 flex items-center gap-3"><span className="whitespace-nowrap text-xs text-muted-foreground">{step + 1} / 6</span><progress aria-label="Guided form progress" max={6} value={step} className="h-1.5 w-full accent-primary" /></div>
            <h3 className="mt-6 text-xl font-bold">{question.label}</h3><p className="mt-2 text-sm text-muted-foreground">{question.hint}</p>
            <form onSubmit={fill} className="mt-5"><label htmlFor="companion-answer" className="sr-only">Your answer</label><Input id="companion-answer" type={question.type} min={question.id === 'income' ? 0 : undefined} value={answer} onChange={event => setAnswer(event.target.value)} required className="h-12 bg-background" /><Button type="submit" className="mt-3 h-11 w-full">Fill this field <ArrowRight /></Button></form>
            <Button variant="ghost" className="mt-2 w-full text-muted-foreground" onClick={() => { setStep(s => s + 1); setAnswer(''); }}>Skip for now</Button>
          </> : <div className="py-8"><div className="mb-4 text-5xl text-primary stamp-pop">✉</div><h3 className="text-xl font-bold">Your answers are in place.</h3><p className="mt-3 text-sm text-muted-foreground">Review your details and the consent checkbox on the form before submitting.</p><Button variant="outline" className="mt-5 w-full" onClick={() => { const blob = new Blob([JSON.stringify(values, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'paperwise-answers.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download /> Download my answers</Button><Button variant="ghost" className="mt-2 w-full" onClick={() => { setStep(0); setAnswer(''); }}>Review again</Button></div>}
        </div><footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">On-device guidance · You stay in control</footer>
      </aside>}
    </div>
  </div>;
}
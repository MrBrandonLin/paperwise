import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Building2, Check, CircleHelp, Ear, Globe2, LockKeyhole, Mail, Mic, PanelRightClose, Send, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { demoFields, downloadDemoPdf, nextEmptyField, type DemoValues } from '@/lib/extension-demo';
import office from '@/assets/office-arch.jpg';

type Message = { role: 'assistant' | 'user'; text: string };

export function ExtensionDemo() {
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<DemoValues>({});
  const [active, setActive] = useState(0);
  const [answer, setAnswer] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [settings, setSettings] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [seal, setSeal] = useState<'idle' | 'sealing' | 'ready'>('idle');
  const [downloadError, setDownloadError] = useState('');
  const [bubbleReply, setBubbleReply] = useState('');
  const [speaking, setSpeaking] = useState(true);
  const [listening, setListening] = useState(false);
  const panelBody = useRef<HTMLDivElement>(null);
  const field = demoFields[active];
  const completed = demoFields.filter(item => values[item.id]?.trim()).length;
  const finished = completed === demoFields.length;
  const bubbleText = bubbleReply || (finished
    ? 'That’s everything. Nicely done! Check your answers, then save your copy below.'
    : `${completed === 0 && active === 0 ? 'Hi, I’m Paperwise. Let’s take this one question at a time. ' : ''}${field?.question || ''}`);
  const activity = listening ? 'listening' : speaking ? 'speaking' : 'idle';

  useEffect(() => {
    setSpeaking(true);
    const timer = window.setTimeout(() => setSpeaking(false), Math.min(6500, Math.max(2200, bubbleText.length * 40)));
    return () => window.clearTimeout(timer);
  }, [bubbleText]);

  function respond(event: FormEvent) {
    event.preventDefault();
    const text = answer.trim();
    if (!text || !field) return;
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      setListening(false);
      setBubbleReply('Please enter a complete email address, like name@example.com.');
      return;
    }
    if (field.type === 'number' && (!Number.isFinite(Number(text)) || Number(text) < 0)) {
      setListening(false);
      setBubbleReply('Please enter your monthly income as a positive number.');
      return;
    }
    const updated = { ...values, [field.id]: text };
    setValues(updated);
    setMessages(previous => [...previous, { role: 'user', text }]);
    setAnswer('');
    setVoiceMessage('');
    setSeal('idle');
    const next = nextEmptyField(updated);
    setListening(false);
    setBubbleReply(next >= 0 ? `Added to ${field.label.toLowerCase()}. ${demoFields[next]?.question}` : 'That’s everything. Nicely done! Check your answers, then save your copy below.');
    if (next >= 0) setActive(next);
    setTimeout(() => panelBody.current?.scrollTo({ top: panelBody.current.scrollHeight, behavior: 'smooth' }), 100);
  }

  async function download() {
    setDownloadError('');
    setSeal('sealing');
    try {
      await new Promise(resolve => setTimeout(resolve, 1700));
      await downloadDemoPdf(values);
      setSeal('ready');
    } catch {
      setSeal('idle');
      setDownloadError('Your copy could not be created. Please try again.');
    }
  }

  return <div className={`extension-demo min-h-screen font-sans ${open ? 'panel-is-open' : ''}`}>
    <div className="demo-site min-h-screen bg-background">
      <div className="flex items-center justify-between border-b border-border bg-secondary px-5 py-2 text-xs text-muted-foreground sm:px-10"><span className="flex items-center gap-2"><Globe2 className="size-3.5" /> Sample website</span><span>Paperwise extension demo</span></div>
      <header className="flex h-22 items-center justify-between border-b border-border bg-paper px-6 sm:px-12">
        <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-md bg-host text-host-foreground"><Building2 className="size-6" /></div><div><p className="text-lg font-bold">Northline<span className="font-normal"> residences</span></p><p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">A place to call yours</p></div></div>
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><LockKeyhole className="size-3.5" /> Secure application</span>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-9 sm:px-12 sm:py-12">
        <div className="mb-7 flex items-center gap-2 text-xs text-muted-foreground"><span>Residences</span><span>/</span><span>Apply</span><span>/</span><span className="text-foreground">Rental application</span></div>
        <div className="flex items-start justify-between gap-4"><div><p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-host">YOUR NEXT CHAPTER</p><h1 className="font-display text-4xl leading-tight">Rental application</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">Tell us a little about yourself. We’ll use this information to review your application for a new home.</p></div><span className="mt-1 shrink-0 rounded border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Demo</span></div>
        <div className="my-8 flex items-center gap-3 border-y border-border py-4 text-xs"><span className="flex size-6 items-center justify-center rounded-full bg-host text-host-foreground">1</span><span className="font-bold">Applicant details</span><div className="h-px flex-1 bg-border" /><span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">2</span><span className="text-muted-foreground">Review</span></div>
        {submitted ? <div className="py-16 text-center"><ShieldCheck className="mx-auto size-12 text-host" /><h2 className="mt-5 font-display text-3xl">Application reviewed</h2><p className="mt-3 text-sm text-muted-foreground">This is a demo. Nothing has been sent to a property team.</p><Button variant="outline" className="mt-6" onClick={() => setSubmitted(false)}><ArrowLeft /> Back to application</Button></div> : <form onSubmit={event => { event.preventDefault(); setSubmitted(true); }}>
          {['Personal information', 'Residential history', 'Employment & income'].map((section, sectionIndex) => <section key={section} className="mb-8">
            <h2 className="mb-5 flex items-center gap-3 text-base font-bold"><span className="text-xs font-normal text-muted-foreground">0{sectionIndex + 1}</span>{section}</h2>
            <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">{demoFields.map((item, index) => item.section === section && <div key={item.id} className={`${item.id === 'name' || item.id === 'address' ? 'sm:col-span-2' : ''} ${open && active === index && !finished ? 'guided-field' : ''}`}>
              <label htmlFor={`form-${item.id}`} className="mb-2 flex items-center justify-between text-xs font-bold">{item.label}<span>{values[item.id]?.trim() ? <Check className="size-3.5 text-host" /> : <span className="font-normal text-muted-foreground">Required</span>}</span></label>
              <Input id={`form-${item.id}`} type={item.type} min={item.type === 'number' ? 0 : undefined} required value={values[item.id] || ''} placeholder={item.placeholder} onFocus={() => { setActive(index); setAnswer(''); setBubbleReply(''); setListening(false); }} onChange={event => { setValues(previous => ({ ...previous, [item.id]: event.target.value })); setSeal('idle'); }} className="h-11 rounded bg-paper text-sm shadow-none" />
              {item.id === 'income' && <p className="mt-2 text-[11px] text-muted-foreground">Before taxes and deductions, in USD.</p>}
            </div>)}</div>
          </section>)}
          <div className="border-t border-border pt-6"><p className="mb-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />Your information stays in this demo page. No application is submitted.</p><div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{completed} of {demoFields.length} fields completed</span><Button type="submit" className="bg-host text-host-foreground hover:bg-host/90">Review application <ArrowRight /></Button></div></div>
        </form>}
        <footer className="mt-12 border-t border-border pt-5 text-[11px] text-muted-foreground">© Northline residences · Fictional property website</footer>
      </main>
    </div>

    {!open && <Button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-30 h-12 gap-2 rounded-full px-5 shadow-paper"><Sparkles /> Paperwise <span className="rounded-full bg-primary-foreground/15 px-2 py-0.5 text-xs">{completed}/{demoFields.length}</span></Button>}
    {open && <aside aria-label="Paperwise assistant" className={`paperwise-panel fixed inset-y-0 right-0 z-40 flex flex-col border-l border-border bg-card shadow-paper ${largeText ? 'text-lg' : 'text-sm'}`}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><span className="font-display text-lg">Paperwise</span><span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">Demo</span></div><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Settings" title="Settings" onClick={() => setSettings(!settings)}><Settings2 /></Button><Button variant="ghost" size="icon" aria-label="Close Paperwise" title="Close panel" onClick={() => setOpen(false)}><PanelRightClose /></Button></div></header>
      <div className="reception-scene relative shrink-0 overflow-hidden"><img src={office} alt="A quiet office through an arched doorway" className="absolute inset-0 size-full object-cover object-[50%_42%]" /><div className="absolute inset-0 bg-primary/10" /><div className="absolute bottom-0 inset-x-0 h-12 bg-secondary/90 border-t border-border backdrop-blur-sm" /><div className={`receptionist receptionist-${activity} absolute bottom-8 right-6`} role="img" aria-label={`Paperwise ${activity}`}><div className="receptionist-head">{activity === 'speaking' && <span className="receptionist-mouth" />}{activity === 'listening' && <Ear className="receptionist-ear" />}</div><div className="receptionist-body" /></div><div className="reception-bubble absolute rounded-lg bg-paper shadow-paper"><div className="reception-bubble-content px-4 py-3" role="status" aria-live="polite"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-primary">{finished ? 'Ready to review' : `Field ${active + 1} · ${field?.label}`}</span><p className={`leading-relaxed ${largeText ? 'text-lg' : 'text-sm'}`}>{bubbleText}</p></div></div><span className="absolute bottom-3 left-5 font-display text-sm text-primary">Paperwise</span><span className="absolute bottom-3 right-5 text-[10px] text-muted-foreground">{activity === 'listening' ? 'Listening' : activity === 'speaking' ? 'Speaking' : 'Ready'}</span></div>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3 text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-1.5 rounded-full bg-host" /> Connected to this form</span><span className="font-bold text-primary">{completed}/{demoFields.length} complete</span></div>
      {settings && <div className="border-b border-border bg-secondary px-5 py-4"><div className="mb-3 flex items-center justify-between font-bold">Preferences<Button variant="ghost" size="icon" aria-label="Close settings" onClick={() => setSettings(false)}><X /></Button></div><label className="flex items-center justify-between">Larger assistant text<input type="checkbox" checked={largeText} onChange={event => setLargeText(event.target.checked)} className="size-4 accent-primary" /></label><p className="mt-3 text-xs text-muted-foreground">Language: English</p></div>}
      <div ref={panelBody} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {!finished && <Button variant="ghost" className="mb-4 h-auto whitespace-normal px-0 py-2 text-xs text-primary hover:bg-transparent" onClick={() => { setListening(false); setBubbleReply(field?.explanation || ''); }}><CircleHelp /> What does this mean?</Button>}
        {messages.length > 0 && <p className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">Your answers</p>}
        {messages.map((message, index) => <div key={index} className="mb-3 ml-9 break-words rounded-lg bg-secondary px-3 py-2">{message.text}</div>)}
      </div>
      <div className="shrink-0 border-t border-border p-4">
        {!finished && <form onSubmit={respond} className="rounded-lg border border-border bg-paper p-2"><label htmlFor="assistant-answer" className="sr-only">Your answer to Paperwise</label><Input id="assistant-answer" value={answer} onFocus={() => setListening(true)} onChange={event => { setAnswer(event.target.value); setListening(true); }} onBlur={() => setListening(false)} placeholder="Type your answer…" className="h-10 border-0 text-sm shadow-none focus-visible:ring-0" /><div className="flex items-center justify-between"><Button type="button" variant="ghost" size="icon" aria-label={listening ? 'Stop listening' : 'Voice input'} aria-pressed={listening} title="Preview listening animation (voice is not connected)" onClick={() => { setListening(!listening); setVoiceMessage(listening ? '' : 'Listening preview only. Voice is not connected; please type your answer.'); }}><Mic /></Button><span className="text-[10px] text-muted-foreground">Your words, the right field</span><Button type="submit" size="icon" aria-label="Send answer" disabled={!answer.trim()}><Send /></Button></div></form>}
        {voiceMessage && <p role="status" className="mt-2 text-xs text-warning-foreground">{voiceMessage}</p>}
        <div className={`mt-3 flex items-center gap-3 rounded-lg border p-3 ${finished ? 'border-primary/30 bg-filled/50' : 'border-border bg-secondary/40'}`}><div className={`relative flex size-10 shrink-0 items-center justify-center text-primary ${seal === 'sealing' ? 'demo-envelope-seal' : ''}`}>{seal === 'ready' ? <Check className="size-6" /> : <Mail className="size-6" />}{seal === 'sealing' && <span className="demo-envelope-sheet" />}</div><div className="min-w-0 flex-1"><p className="text-xs font-bold">{seal === 'sealing' ? 'Sealing your envelope…' : seal === 'ready' ? 'Your copy is downloaded' : 'Take your form with you'}</p><p className="mt-1 text-[10px] text-muted-foreground">{finished ? 'Your answers, saved as a PDF' : 'Available when all fields are filled'}</p></div><Button variant="ghost" size="icon" aria-label="Download form PDF" title="Download form PDF" disabled={!finished || seal === 'sealing'} onClick={download}><ArrowDownToLine /></Button></div>
        {downloadError && <p role="alert" className="mt-2 text-xs text-destructive">{downloadError}</p>}
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground"><ShieldCheck className="size-3" /> Demo only · No data leaves this page</p>
      </div>
    </aside>}
  </div>;
}
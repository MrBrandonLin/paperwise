import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, FileUp, Mic, Languages, ShieldAlert, Eye } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Paperwise — Get through any form, by voice" },
      { name: "description", content: "Paperwise reads your form, explains it in plain words, and fills it in as you talk — in your language." },
      { property: "og:title", content: "Paperwise — Get through any form, by voice" },
      { property: "og:description", content: "An AI that sits next to you and walks you through any form, in your language." },
    ],
  }),
  component: Index,
});

const powers = [
  { icon: Eye, title: "Understands the form", text: "Every field, what it really asks, and which ones only apply sometimes." },
  { icon: ShieldAlert, title: "Explains anything", text: "Ask “what does this mean?” and get plain words — with high-stakes boxes flagged." },
  { icon: Languages, title: "Translates both ways", text: "Speak your language. Answers land on the form in its language, side by side." },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl">Paperwise</span>
        <button className="rounded-full border border-border px-4 py-2 text-sm">Large text · Aa</button>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-12 py-12 md:grid-cols-2 md:py-20">
          <div>
            <h1 className="font-display text-5xl leading-[1.05] md:text-6xl">
              Any form.<br />Your language.<br /><span className="text-primary">Just talk.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              Snap a photo of your paperwork. Paperwise reads it, explains it, and fills it in while you watch.
            </p>
          </div>

          <div className="rounded-3xl border-2 border-dashed border-border bg-card p-8 text-center shadow-paper">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <FileUp className="h-7 w-7" />
            </div>
            <p className="mt-4 font-display text-2xl">Bring your form</p>
            <p className="mt-1 text-muted-foreground">Photo or PDF — even a paper one.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link to="/session" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-primary-foreground">
                <Camera className="h-5 w-5" /> Take a photo
              </Link>
              <Link to="/session" className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-6 py-3">
                <FileUp className="h-5 w-5" /> Upload file
              </Link>
            </div>
            <Link to="/session" className="mt-5 inline-block text-sm text-primary underline underline-offset-4">
              Try a sample rental application
            </Link>
          </div>
        </section>

        <section className="grid gap-6 pb-24 md:grid-cols-3">
          {powers.map((p) => (
            <div key={p.title} className="rounded-2xl bg-secondary p-6">
              <p.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-display text-xl">{p.title}</h3>
              <p className="mt-2 text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="flex items-center justify-center gap-2 pb-10 text-sm text-muted-foreground">
        <Mic className="h-4 w-4" /> Voice-first, never voice-only. Captions always on.
      </footer>
    </div>
  );
}

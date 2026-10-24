import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, FileUp, Mic, Languages, ShieldAlert, Eye } from "lucide-react";
import officeArch from "@/assets/office-arch.jpg";
import woodenTable from "@/assets/wooden-table.jpg";

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
    <div className="relative min-h-screen bg-background">
      {/* Soft office room behind everything */}
      <div aria-hidden className="fixed inset-0 bg-cover bg-center opacity-25 blur-[2px]" style={{ backgroundImage: `url(${officeArch})` }} />
      <div aria-hidden className="fixed inset-0 bg-background/60" />

      <div className="relative flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
          <span className="font-display text-2xl">Paperwise</span>
          <button className="rounded-full border border-border bg-card/70 px-4 py-2 text-sm backdrop-blur-sm">Large text · Aa</button>
        </header>

        <main className="mx-auto w-full max-w-7xl px-6">
          <section className="grid gap-8 py-6 md:py-10 lg:grid-cols-[1.1fr_1fr]">
            {/* Walled arch into the office, with the pitch in front */}
            <div className="relative overflow-hidden rounded-[2rem] shadow-paper">
              <img
                src={officeArch}
                alt="An arched doorway opening into a quiet office"
                width={1024}
                height={1536}
                className="h-[32rem] w-full object-cover md:h-[38rem]"
              />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-8 md:p-10">
                <h1 className="font-display text-5xl leading-[1.05] md:text-6xl">
                  Any form.<br />Your language.<br /><span className="text-primary">Just talk.</span>
                </h1>
                <p className="mt-5 max-w-md text-lg text-muted-foreground">
                  Snap a photo of your paperwork. Paperwise reads it, explains it, and fills it in while you watch.
                </p>
              </div>
            </div>

            {/* Wooden table where the paperwork lands */}
            <div className="relative flex items-center justify-center overflow-hidden rounded-[2rem] bg-cover bg-center p-6 shadow-paper sm:p-10" style={{ backgroundImage: `url(${woodenTable})` }}>
              <div aria-hidden className="absolute inset-0 bg-foreground/10" />
              <div className="relative w-full max-w-md -rotate-1 rounded-2xl bg-paper p-8 text-center shadow-paper transition-transform hover:rotate-0">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <FileUp className="h-7 w-7" />
                </div>
                <p className="mt-4 font-display text-2xl">Bring your form</p>
                <p className="mt-1 text-muted-foreground">Photo or PDF — even a paper one.</p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Link to="/session" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-primary-foreground">
                    <Camera className="h-5 w-5" /> Take a photo
                  </Link>
                  <Link to="/session" className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3">
                    <FileUp className="h-5 w-5" /> Upload file
                  </Link>
                </div>
                <Link to="/session" className="mt-5 inline-block text-sm text-primary underline underline-offset-4">
                  Try a sample rental application
                </Link>
              </div>
            </div>
          </section>

          <section className="grid gap-6 pb-24 md:grid-cols-3">
            {powers.map((p) => (
              <div key={p.title} className="rounded-2xl bg-secondary/90 p-6 shadow-paper backdrop-blur-sm">
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
    </div>
  );
}

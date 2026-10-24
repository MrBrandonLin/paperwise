import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, Mic, Pause, Keyboard, AlertTriangle, Check, Download, Mail } from "lucide-react";
import officeArch from "@/assets/office-arch.jpg";
import woodenTable from "@/assets/wooden-table.jpg";

export const Route = createFileRoute("/session")({
  head: () => ({
    meta: [
      { title: "Your form session — Paperwise" },
      { name: "description", content: "Talk through your form while Paperwise fills it in live." },
      { property: "og:title", content: "Your form session — Paperwise" },
      { property: "og:description", content: "Watch your form fill itself in as you talk." },
    ],
  }),
  component: Session,
});

type Status = "empty" | "filled" | "unclear";
type Field = { label: string; value: string; native?: string; status: Status; stakes?: string };

const initial: Field[] = [
  { label: "Full legal name", value: "Amélie Dubois", native: "Nom complet", status: "filled" },
  { label: "Date of birth", value: "03/14/1988", native: "Date de naissance", status: "filled" },
  { label: "Gross monthly income", value: "$3,200 ?", native: "Revenu mensuel brut", status: "unclear" },
  { label: "Co-signer / Guarantor", value: "", native: "Garant", status: "empty" },
  { label: "Consent to credit check", value: "", native: "Vérification de crédit", status: "empty", stakes: "Lets the landlord check your credit" },
  { label: "Signature", value: "", native: "Signature", status: "empty", stakes: "Legally binding" },
];

const chat = [
  { who: "ai", text: "C'est une demande de location. 4 sections, environ 8 minutes. Deux parties sont importantes avant de signer. On commence ?", en: "This is a rental application…" },
  { who: "me", text: "Oui, allons-y." },
  { who: "ai", text: "Combien gagnez-vous par mois, avant impôts ?" },
  { who: "me", text: "À peu près trois mille deux cents." },
  { who: "ai", text: "J'ai noté 3 200 $. C'est bien avant impôts ?" },
];

const states = ["Listening", "Thinking", "Speaking"] as const;

function Session() {
  const [fields] = useState(initial);
  const [active, setActive] = useState(2);
  const [state, setState] = useState(0);
  const done = fields.filter((f) => f.status === "filled").length;

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* Office room backdrop */}
      <div aria-hidden className="fixed inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${officeArch})` }} />
      <div aria-hidden className="fixed inset-0 bg-background/80" />
      <div aria-hidden className="fixed inset-x-0 bottom-0 h-[38vh] bg-cover bg-top opacity-70" style={{ backgroundImage: `url(${woodenTable})` }} />
      <div aria-hidden className="fixed inset-x-0 bottom-0 h-[38vh] bg-gradient-to-t from-transparent to-background" />
      <div className="relative flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-background/70 px-6 py-4 backdrop-blur-sm">
        <Link to="/" className="flex items-center gap-2 text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Paperwise</Link>
        <div className="text-sm text-muted-foreground">Rental application · Section 2 of 4</div>
        <div className="flex gap-2 text-sm">
          <span className="rounded-full bg-secondary px-3 py-1">Français → English</span>
          <span className="rounded-full bg-secondary px-3 py-1">Speed 1×</span>
        </div>
      </header>

      <div className="grid flex-1 gap-6 p-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Document */}
        <section className="rounded-2xl bg-paper p-8 shadow-paper">
          <div className="mb-6 flex items-baseline justify-between border-b border-border pb-4">
            <h2 className="font-display text-2xl">Residential Rental Application</h2>
            <span className="text-sm text-muted-foreground">{done}/{fields.length} filled</span>
          </div>
          <div className="space-y-4">
            {fields.map((f, i) => (
              <button
                key={f.label}
                onClick={() => setActive(i)}
                className={[
                  "block w-full rounded-xl border-2 p-4 text-left transition",
                  i === active ? "border-primary" : "border-transparent",
                  f.status === "filled" && "bg-filled",
                  f.status === "unclear" && "bg-warning-soft",
                  f.status === "empty" && "bg-muted",
                ].filter(Boolean).join(" ")}
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                  <span>{f.label} <span className="normal-case italic">· {f.native}</span></span>
                  {f.status === "filled" && <Check className="h-4 w-4 text-primary" />}
                  {f.status === "unclear" && <AlertTriangle className="h-4 w-4 text-warning-foreground" />}
                </div>
                <div className="mt-1 min-h-7 font-display text-xl">
                  {f.value && <span className="ink-in inline-block">{f.value}</span>}
                </div>
                {f.stakes && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-foreground">
                    <AlertTriangle className="h-3 w-3" /> {f.stakes}
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Conversation */}
        <section className="flex flex-col rounded-2xl bg-card/90 p-6 shadow-paper backdrop-blur-sm">
          <div className="flex-1 space-y-4 overflow-y-auto">
            {chat.map((m, i) => (
              <div key={i} className={m.who === "me" ? "flex justify-end" : ""}>
                <div className={["max-w-[85%] rounded-2xl px-4 py-3 text-lg", m.who === "me" ? "bg-primary text-primary-foreground" : "bg-secondary"].join(" ")}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl bg-muted p-3 text-center text-sm text-muted-foreground">
            Captions: “J'ai noté 3 200 $. C'est bien avant impôts ?”
          </div>

          <div className="mt-6 flex flex-col items-center gap-3">
            <button onClick={() => setState((state + 1) % 3)} className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label={states[state]}>
              {state === 0 && <span className="orb-pulse absolute inset-0 rounded-full bg-primary" />}
              <Mic className="relative h-9 w-9" />
            </button>
            <p className="font-display text-lg">{states[state]}…</p>
            <div className="flex gap-2">
              <button className="flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm"><Pause className="h-4 w-4" /> Pause</button>
              <button className="flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm"><Keyboard className="h-4 w-4" /> Type instead</button>
            </div>
          </div>
        </section>
      </div>

      {/* Download your finished form */}
      <DownloadSection fields={fields} />
      </div>
    </div>
  );
}

async function buildFormPdf(fields: Field[]): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 740;
  page.drawText("Residential Rental Application", { x: 56, y, size: 20, font: bold, color: rgb(0.16, 0.2, 0.32) });
  y -= 40;
  for (const f of fields) {
    page.drawText(f.label, { x: 56, y, size: 11, font: bold, color: rgb(0.35, 0.38, 0.45) });
    y -= 16;
    page.drawText(f.value || "—", { x: 56, y, size: 13, font, color: rgb(0.16, 0.18, 0.24) });
    y -= 28;
    if (y < 60) break;
  }
  const bytes = await doc.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

type SealPhase = "idle" | "sealing" | "ready";

function DownloadSection({ fields }: { fields: Field[] }) {
  const [phase, setPhase] = useState<SealPhase>("idle");
  const pdfRef = useRef<Blob | null>(null);

  const seal = async () => {
    if (phase !== "idle") return;
    setPhase("sealing");
    // Build the PDF while the envelope animation plays
    pdfRef.current = await buildFormPdf(fields);
    setTimeout(() => setPhase("ready"), 1900);
  };

  return (
    <section className="mx-6 mb-8 flex flex-col items-center gap-5 rounded-2xl bg-card/90 p-8 text-center shadow-paper backdrop-blur-sm">
      <h2 className="font-display text-2xl">All done? Take your form with you.</h2>
      <p className="max-w-md text-muted-foreground">
        We'll seal your finished application into an envelope so you can download it as a PDF and keep a copy.
      </p>

      {/* Envelope stage */}
      <div className="relative h-40 w-64">
        {phase === "idle" ? (
          <div className="flex h-full items-center justify-center">
            <Mail className="h-16 w-16 text-muted-foreground" />
          </div>
        ) : (
          <div className={`relative h-full w-full ${phase === "sealing" || phase === "ready" ? "envelope-seal" : ""}`}>
            {/* Paper sheet sliding in */}
            <div aria-hidden className={`sheet-drop absolute left-1/2 top-2 h-28 w-40 -translate-x-1/2 rounded-sm bg-paper shadow-md`}>
              <div className="space-y-1.5 p-2">
                <div className="h-1.5 w-3/4 rounded bg-muted" />
                <div className="h-1.5 w-full rounded bg-muted" />
                <div className="h-1.5 w-5/6 rounded bg-muted" />
                <div className="h-1.5 w-2/3 rounded bg-filled" />
              </div>
            </div>
            {/* Envelope body */}
            <div className="absolute inset-x-0 bottom-0 h-24 rounded-lg border border-border bg-secondary shadow-paper" />
            {/* Flap */}
            <div
              aria-hidden
              className="flap-close absolute inset-x-0 bottom-24 h-16 origin-top bg-muted"
              style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
            />
            {/* Stamp */}
            {phase === "ready" && (
              <div className="stamp-pop absolute bottom-14 right-3 flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-primary-foreground">
                <Check className="h-5 w-5" />
              </div>
            )}
          </div>
        )}
      </div>

      {phase === "idle" && (
        <button
          onClick={seal}
          className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground"
        >
          <Mail className="h-5 w-5" /> Seal it in an envelope
        </button>
      )}
      {phase === "sealing" && (
        <p className="font-display text-lg text-muted-foreground">Sealing your envelope…</p>
      )}
      {phase === "ready" && (
        <button
          onClick={() => pdfRef.current && downloadBlob(pdfRef.current, "rental-application.pdf")}
          className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground"
        >
          <Download className="h-5 w-5" /> Download your form (PDF)
        </button>
      )}
    </section>
  );
}

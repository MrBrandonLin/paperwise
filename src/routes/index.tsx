import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mic, Send, Settings } from "lucide-react";
import { useState } from "react";
import receptionDesk from "@/assets/reception-desk.jpg";

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

function Index() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  const start = () => navigate({ to: "/session" });

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* The reception room */}
      <img
        src={receptionDesk}
        alt="A receptionist standing behind a curved wooden desk in a wood-panelled office"
        width={1920}
        height={1280}
        className="absolute inset-0 h-full w-full object-cover object-[25%_center] md:object-center"
      />
      <div aria-hidden className="absolute inset-0 bg-foreground/10" />

      <div className="relative flex min-h-screen flex-col justify-between p-4 sm:p-6">
        {/* Top row: nameplate + greeting bubble */}
        <div className="flex flex-wrap items-start gap-4 sm:gap-8">
          <h1 className="rounded-xl bg-secondary/80 px-8 py-4 font-display text-3xl shadow-paper backdrop-blur-sm md:text-4xl">
            Paperwise
          </h1>

          <div className="relative max-w-sm rounded-2xl bg-card/85 p-5 shadow-paper backdrop-blur-sm">
            {/* bubble tail pointing at the receptionist */}
            <div aria-hidden className="absolute -left-3 top-8 h-6 w-6 rotate-45 rounded-bl-md bg-card/85" />
            <p className="relative text-lg md:text-xl">Hi! What can I help you with?</p>
            <p className="relative mt-1 text-sm text-muted-foreground">
              Snap a photo of any form — I'll read it, explain it, and fill it in with you.
            </p>
          </div>
        </div>

        {/* Bottom row: talk to the receptionist */}
        <form
          className="mx-auto flex w-full max-w-5xl items-stretch gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <label className="flex flex-1 items-center gap-3 rounded-2xl bg-card/95 px-5 shadow-paper backdrop-blur-sm">
            <span className="sr-only">Type your question</span>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type here, or tap the mic and just talk…"
              className="h-14 w-full bg-transparent text-lg outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" aria-label="Send" className="text-muted-foreground transition-colors hover:text-primary">
              <Send className="h-5 w-5" />
            </button>
          </label>

          <button
            type="button"
            onClick={start}
            aria-label="Talk by voice"
            className="flex h-14 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-paper transition-transform hover:scale-105 sm:w-20"
          >
            <Mic className="h-6 w-6" />
          </button>

          <button
            type="button"
            aria-label="Settings"
            className="flex h-14 w-16 items-center justify-center rounded-2xl bg-card/95 text-muted-foreground shadow-paper backdrop-blur-sm transition-colors hover:text-foreground sm:w-20"
          >
            <Settings className="h-6 w-6" />
          </button>
        </form>
      </div>
    </div>
  );
}

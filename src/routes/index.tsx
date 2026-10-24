import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mic, Send, Settings } from "lucide-react";
import { useState } from "react";
import receptionAero from "@/assets/reception-aero.jpg";

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
        src={receptionAero}
        alt="A glossy aqua-blue receptionist figure waving behind a curved white desk in a bright glass office with a Paperwise sign on the wall"
        width={1920}
        height={1280}
        className="absolute inset-0 h-full w-full object-cover object-[25%_center] md:object-center"
      />
      <div aria-hidden className="absolute inset-0 bg-foreground/10" />

      <div className="relative flex min-h-screen flex-col justify-between p-4 sm:p-6">
        <h1 className="sr-only">Paperwise</h1>

        {/* Speech bubble, anchored beside the receptionist figure */}
        <div className="absolute left-[4%] top-[6%] max-w-xs md:left-[22%] md:top-[10%] md:max-w-sm lg:left-[30%] lg:top-[20%]">
          <div className="relative rounded-2xl bg-card/70 p-5 shadow-paper backdrop-blur-md">
            {/* bubble tail pointing at the receptionist */}
            <div aria-hidden className="absolute -right-3 top-8 h-6 w-6 rotate-45 rounded-tr-md bg-card/70" />
            <p className="relative text-lg md:text-xl">Hi! What can I help you with?</p>
            <p className="relative mt-1 text-sm text-muted-foreground">
              Snap a photo of any form — I'll read it, explain it, and fill it in with you.
            </p>
          </div>
        </div>
        <div />

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

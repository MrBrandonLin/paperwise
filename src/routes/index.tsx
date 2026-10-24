import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mic, Send, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import receptionAeroDoor from "@/assets/reception-aero-door.jpg";

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

// The glowing door's position inside the 1920x1280 scene, in percent.
const DOOR = { x: 77.8, y: 12.5, w: 16.5, h: 62 };
const IMG_W = 1920;
const IMG_H = 1280;

type Box = { left: number; top: number; width: number; height: number };

function Index() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [doorBox, setDoorBox] = useState<Box | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const start = () => navigate({ to: "/session" });

  const startWithFile = (file?: File | null) => {
    if (file) {
      try {
        sessionStorage.setItem("paperwise-form-name", file.name);
      } catch {
        /* storage unavailable — still start the session */
      }
    }
    navigate({ to: "/session" });
  };

  // Map the door's position in the photo to on-screen pixels, accounting for
  // how object-cover crops the image (25%→70% offset on small screens, center on md+).
  useEffect(() => {
    const compute = () => {
      const el = sceneRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const posX = window.matchMedia("(min-width: 768px)").matches ? 0.5 : 0.7;
      const s = Math.max(r.width / IMG_W, r.height / IMG_H);
      const dw = IMG_W * s;
      const dh = IMG_H * s;
      const x0 = (r.width - dw) * posX;
      const y0 = (r.height - dh) * 0.5;
      setDoorBox({
        left: x0 + (DOOR.x / 100) * dw,
        top: y0 + (DOOR.y / 100) * dh,
        width: (DOOR.w / 100) * dw,
        height: (DOOR.h / 100) * dh,
      });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const labelLeft = doorBox ? Math.min(Math.max(doorBox.left + doorBox.width / 2, 110), (sceneRef.current?.clientWidth ?? 9999) - 110) : 0;

  return (
    <div
      ref={sceneRef}
      className="relative min-h-screen overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        startWithFile(e.dataTransfer.files?.[0]);
      }}
    >
      {/* The reception room, door included */}
      <img
        src={receptionAeroDoor}
        alt="A glossy aqua-blue faceless receptionist behind a curved white desk under a Paperwise wall sign, next to a glowing frosted-glass door"
        width={1920}
        height={1280}
        className="absolute inset-0 h-full w-full object-cover object-[70%_center] md:object-center"
      />
      <div aria-hidden className="absolute inset-0 bg-foreground/10" />

      <div className="relative flex min-h-screen flex-col justify-between p-4 sm:p-6">
        <h1 className="sr-only">Paperwise</h1>

        {/* Speech bubble, anchored beside the receptionist figure */}
        <div className="absolute left-[4%] top-[6%] max-w-xs md:left-[22%] md:top-[10%] md:max-w-sm lg:left-[28%] lg:top-[22%]">
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

        {/* Invisible click zone over the physical door in the scene */}
        {doorBox && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                startWithFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label="Bring your form: upload a file to start"
              style={{ left: doorBox.left, top: doorBox.top, width: doorBox.width, height: doorBox.height }}
              className={`group absolute z-10 rounded-lg outline-none transition-colors duration-300 hover:bg-primary/10 ${
                dragging ? "bg-primary/20 ring-2 ring-inset ring-primary" : ""
              }`}
            >
              {/* soft glow when you hover the door */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-[-10%] rounded-full bg-primary/30 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              />
            </button>
            <span
              style={{ left: labelLeft, top: doorBox.top + doorBox.height + 10 }}
              className="absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-card/85 px-3 py-1 text-xs text-foreground shadow-paper backdrop-blur-sm"
            >
              {dragging ? "Drop your form here" : "Bring your form"}
            </span>
          </>
        )}

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

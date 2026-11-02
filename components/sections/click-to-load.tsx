"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Kart og video fra andre tjenester, lastet først når den besøkende trykker. Før det sendes ingenting
 * dit, og ingen informasjonskapsler kan settes. Samme mønster som innebygd bestilling (booking-embed.tsx).
 */
export function ClickToLoad({
  src,
  title,
  buttonLabel,
  notice,
  aspect,
  allow,
  children,
}: {
  src: string;
  /** Navnet skjermlesere leser opp for rammen. */
  title: string;
  buttonLabel: string;
  /** Hva som skjer når den besøkende trykker, og hvem som får vite det. */
  notice: string;
  aspect: "video" | "kart";
  allow?: string;
  /** Vises under, både før og etter: lenker som virker uten å laste noe inn. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  // Tastatur og skjermleser følger med inn i rammen når den åpnes.
  useEffect(() => {
    if (open) frame.current?.focus();
  }, [open]);
  const box = aspect === "video" ? "aspect-video" : "aspect-[4/3] sm:aspect-[16/9]";

  return (
    <div className="space-y-3">
      {open ? (
        <iframe
          ref={frame}
          src={src}
          title={title}
          className={`${box} w-full rounded-[var(--radius)] border-0 bg-[var(--c-surface)]`}
          referrerPolicy="strict-origin-when-cross-origin"
          allow={allow}
          allowFullScreen={aspect === "video"}
          loading="lazy"
        />
      ) : (
        <div className={`${box} ng-card flex w-full flex-col items-center justify-center gap-4 p-6 text-center`}>
          <button type="button" className="ng-btn" onClick={() => setOpen(true)}>
            {buttonLabel}
          </button>
          <p className="max-w-md text-sm text-[var(--c-muted)]">{notice}</p>
        </div>
      )}
      {children}
    </div>
  );
}

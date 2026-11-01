"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Innebygd bestilling som først lastes når den besøkende trykker. Før det sendes ingenting til bookingsystemet,
 * og det kan ikke sette informasjonskapsler. Lenken til systemet virker alltid, også der det ikke tillater innbygging.
 */
export function BookingEmbed({ url, host, label }: { url: string; host: string; label: string }) {
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  // Tastatur og skjermleser følger med inn i bestillingen når den åpnes.
  useEffect(() => {
    if (open) frame.current?.focus();
  }, [open]);

  const external = (
    <a href={url} target="_blank" rel="noopener" className="underline underline-offset-4">
      Åpne bestillingen hos {host}
      <span className="sr-only"> (åpnes i ny fane)</span>
    </a>
  );

  if (!open) {
    return (
      <div className="space-y-4">
        <p className="mx-auto max-w-xl text-sm text-[var(--c-muted)]">
          Bestillingen hentes fra {host}. Når du åpner den her, kan {host} bruke informasjonskapsler.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <button type="button" className="ng-btn" onClick={() => setOpen(true)}>
            {label}
          </button>
          {external}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <iframe
        ref={frame}
        src={url}
        title={`Bestilling hos ${host}`}
        className="h-[720px] w-full rounded-[var(--radius)] border-0 bg-white"
        referrerPolicy="strict-origin-when-cross-origin"
        // Bestillingen kan ikke sende hele nettstedet videre, men skjema og betaling i nytt vindu virker.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
      <p className="text-sm">Virker ikke bestillingen her? {external}</p>
    </div>
  );
}

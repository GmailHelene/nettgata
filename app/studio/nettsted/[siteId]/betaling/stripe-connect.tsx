"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { StripeView } from "@/lib/payments/config";
import type { ActionState } from "../../../actions";
import { disconnectStripeAction, startStripeAction } from "./actions";

function Status({ connection }: { connection: StripeView | null }) {
  if (!connection) return <span className="rounded-full bg-neutral-200 px-3 py-1 text-sm text-neutral-800">Ikke koblet til</span>;
  if (connection.chargesEnabled) {
    return (
      <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-900">
        Koblet til{connection.environment === "test" ? " (testmiljø)" : ""}
      </span>
    );
  }
  return <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">{connection.detailsSubmitted ? "Stripe sjekker opplysningene" : "Ikke ferdig hos Stripe"}</span>;
}

/**
 * Kort med Stripe. Eieren trykker én knapp og fyller ut skjemaet hos Stripe, så det finnes ingen nøkler å lime inn.
 * Kontoen er butikkens egen, og pengene går rett til butikkens bankkonto.
 */
export function StripeConnect({
  siteId,
  available,
  connection,
  canEdit,
  linkExpired,
}: {
  siteId: string;
  available: boolean;
  connection: StripeView | null;
  canEdit: boolean;
  linkExpired: boolean;
}) {
  const [state, setState] = useState<ActionState>(linkExpired ? { ok: false, message: "Lenken til Stripe gikk ut. Trykk på knappen for å fortsette der du slapp." } : null);
  const [pending, startTransition] = useTransition();

  const open = () =>
    startTransition(async () => {
      const result = await startStripeAction(siteId);
      setState(result);
      if (result.url) window.location.assign(result.url);
    });

  const remove = () => {
    if (!confirm("Ta kort ut av kassen? Stripe-kontoen din blir stående, men ordre som er betalt med kort, kan ikke trekkes eller refunderes herfra før du kobler til igjen.")) return;
    startTransition(async () => setState(await disconnectStripeAction(siteId)));
  };

  const label = !connection ? "Koble til Stripe" : connection.detailsSubmitted ? "Se hva Stripe mangler" : "Fortsett hos Stripe";

  return (
    <section aria-labelledby="stripe-tittel" className="space-y-4 rounded-lg border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="stripe-tittel" className="text-lg font-semibold">
          Kort
        </h2>
        <Status connection={connection} />
      </div>
      <p className="text-sm text-neutral-700">
        Kunden betaler med kort på betalingssiden til Stripe. Du fyller ut skjemaet hos Stripe én gang, med opplysninger om bedriften og kontonummeret. Pengene går rett til
        bankkontoen din. Stripe tar sitt eget gebyr per kjøp, og Nettgata tar ingenting.
      </p>

      {!available && <p className="rounded-md bg-neutral-100 p-3 text-sm text-neutral-800">Kort er ikke slått på ennå. Bruk Vipps eller Kustom så lenge.</p>}

      {connection && !connection.chargesEnabled && (
        <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          {connection.detailsSubmitted
            ? "Stripe sjekker opplysningene dine. Kort vises i kassen når Stripe har godkjent kontoen."
            : "Du er ikke ferdig hos Stripe ennå. Kort vises i kassen når skjemaet er fylt ut og Stripe har godkjent kontoen."}
        </p>
      )}
      {connection?.chargesEnabled && connection.environment === "test" && (
        <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">Stripe står i testmiljøet. Kassen viser at ingen ekte penger trekkes.</p>
      )}
      {connection?.chargesEnabled && (
        <p className="text-sm text-neutral-700">
          Kort vises i kassen. Utbetalinger, gebyrer og kvitteringer finner du på{" "}
          <a href="https://dashboard.stripe.com" className="underline" target="_blank" rel="noreferrer">
            dashboard.stripe.com
          </a>
          . Merk at reservasjonen på kortet varer i omtrent sju dager, så ordren må sendes innen den tid.
        </p>
      )}

      {canEdit && available && (
        <div className="flex flex-wrap gap-3">
          {!connection?.chargesEnabled && (
            <button type="button" disabled={pending} onClick={open} className="rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {pending ? "Vent litt..." : label}
            </button>
          )}
          {connection && (
            <button type="button" disabled={pending} onClick={remove} className="rounded-md border border-red-800 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-60">
              Ta ut av kassen
            </button>
          )}
        </div>
      )}
      <FormStatus state={state} />
    </section>
  );
}

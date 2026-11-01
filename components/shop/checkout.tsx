"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getCheckoutData, getPickupPoints, placeOrder } from "@/app/actions/shop";
import { bringShippingCode } from "@/lib/bring/products";
import { onlinePaymentInfo, placeOrderWithOnlinePayment } from "@/lib/payments/checkout-action";
import type { ReadyProviders } from "@/lib/payments/state";
import { formatNok } from "@/lib/shop/money";
import { isOnlinePayment, type PaymentMethod } from "@/lib/shop/settings";
import { useCart, writeCart } from "./cart-store";

type Data = NonNullable<Awaited<ReturnType<typeof getCheckoutData>>>;
type PickupPoint = Awaited<ReturnType<typeof getPickupPoints>>[number];

const input = "w-full rounded-[var(--radius)] border border-[var(--c-muted)] bg-[var(--c-bg)] px-3 py-2";

/** Kort forklaring under betalingsmåten i kassen. */
const paymentNotes: Partial<Record<PaymentMethod, string>> = {
  klarna: "Kort, faktura eller delbetaling",
};

/**
 * Ordren som venter på Vipps eller Klarna. Handlekurven tømmes først når kvitteringssiden viser at akkurat den
 * ordren er betalt, så kunden ikke mister kurven hvis betalingen avbrytes.
 */
const pendingKey = (siteId: string) => `betaling:${siteId}`;

/** Tømmer handlekurven når betalingen for ordren kunden nettopp sendte til Vipps eller Klarna, er bekreftet. */
export function ForgetCartAfterPayment({ siteId, orderId }: { siteId: string; orderId: string }) {
  useEffect(() => {
    try {
      if (localStorage.getItem(pendingKey(siteId)) !== orderId) return;
      localStorage.removeItem(pendingKey(siteId));
    } catch {
      return;
    }
    writeCart(siteId, []);
  }, [siteId, orderId]);
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

export function Checkout({ siteId, basePath, preview }: { siteId: string; basePath: string; preview: boolean }) {
  const router = useRouter();
  const items = useCart(siteId);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [shippingCode, setShippingCode] = useState<string>("");
  const [payment, setPayment] = useState<PaymentMethod | "">("");
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [online, setOnline] = useState<ReadyProviders>({});
  const [redirecting, setRedirecting] = useState(false);
  const [submitting, startSubmit] = useTransition();
  // Postnummeret styrer fraktprisen fra Bring. Prisen hentes på nytt bare når det er fire siffer.
  const [postalCode, setPostalCode] = useState("");
  const quotePostalCode = /^\d{4}$/.test(postalCode) ? postalCode : "";
  // Økes etter en bestilling som ble avvist, så kassen viser oppdaterte priser.
  const [refresh, setRefresh] = useState(0);

  // Kommer kunden tilbake med tilbakeknappen fra Vipps eller Klarna, kan nettleseren vise siden fra minnet. Da skal knappen virke igjen.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setRedirecting(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  // Om Vipps og Klarna står i testmiljøet, så kassen kan si fra om at ingen ekte penger trekkes.
  useEffect(() => {
    let cancelled = false;
    onlinePaymentInfo(siteId)
      .then((info) => {
        if (!cancelled) setOnline(info);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  useEffect(() => {
    let cancelled = false;
    getCheckoutData(siteId, items, shippingCode || undefined, appliedCode || undefined, quotePostalCode || undefined).then((result) => {
      if (cancelled) return;
      setData(result);
      setLoading(false);
      if (!result) return;
      // En kode som ikke (lenger) gjelder, for eksempel fordi kurven ble mindre, tas bort med en forklaring.
      if (result.discountError) {
        setCodeError(result.discountError);
        setAppliedCode("");
      }
      // Et fraktvalg som ikke lenger finnes (for eksempel for tung pakke for Pakke i postkassen), byttes med det serveren valgte.
      setShippingCode((current) => (result.shippingOptions.some((o) => o.code === current) ? current : result.shippingCode));
      setPayment((current) => current || result.paymentMethods[0]?.code || "");
      // Varer som ikke lenger finnes, eller antall over det som er på lager, rettes i kurven.
      const valid = new Map(result.lines.map((l) => [l.variantId, l.maxQuantity]));
      const cleaned = items
        .filter((i) => valid.has(i.variantId) && (valid.get(i.variantId) ?? 0) > 0)
        .map((i) => ({ ...i, quantity: Math.min(i.quantity, valid.get(i.variantId) ?? i.quantity) }));
      if (JSON.stringify(cleaned) !== JSON.stringify(items)) writeCart(siteId, cleaned);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, items, shippingCode, appliedCode, quotePostalCode, refresh]);

  // Pakke til hentested: kunden velger blant de nærmeste hentestedene når postnummeret er skrevet. Svarer ikke Bring,
  // vises ingen velger, og pakken går til nærmeste hentested.
  const pickupWanted = shippingCode === bringShippingCode("5800") && quotePostalCode !== "";
  const [pickup, setPickup] = useState<{ postalCode: string; points: PickupPoint[] } | null>(null);
  const [chosenPickupId, setChosenPickupId] = useState("");
  useEffect(() => {
    if (!pickupWanted) return;
    let cancelled = false;
    getPickupPoints(siteId, quotePostalCode)
      .then((points) => {
        if (!cancelled) setPickup({ postalCode: quotePostalCode, points });
      })
      .catch(() => {
        if (!cancelled) setPickup({ postalCode: quotePostalCode, points: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, pickupWanted, quotePostalCode]);
  const pickupLoading = pickupWanted && pickup?.postalCode !== quotePostalCode;
  const pickupPoints = pickupWanted && !pickupLoading ? (pickup?.points ?? []) : [];
  // Nærmeste hentested er forhåndsvalgt, og et valg fra et annet postnummer gjelder ikke lenger.
  const pickupId = pickupPoints.find((p) => p.id === chosenPickupId)?.id ?? pickupPoints[0]?.id ?? "";

  const setQuantity = (variantId: string, quantity: number) =>
    writeCart(siteId, quantity <= 0 ? items.filter((i) => i.variantId !== variantId) : items.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)));

  if (loading) return <p>Henter handlekurven...</p>;
  if (!data) return <p>Butikken er ikke tilgjengelig akkurat nå.</p>;
  if (items.length === 0 || data.lines.length === 0) {
    return (
      <p>
        Handlekurven er tom.{" "}
        <Link href={`${basePath}/produkter`} className="font-semibold underline">
          Se alle varer
        </Link>
      </p>
    );
  }

  const shipping = data.shippingOptions.find((o) => o.code === shippingCode);

  const applyCode = () => {
    setCodeError(null);
    setAppliedCode(codeInput.trim());
  };

  const onlineLabel = isOnlinePayment(payment) ? data.paymentMethods.find((m) => m.code === payment)?.label : undefined;

  const submit = (form: FormData) =>
    startSubmit(async () => {
      setError(null);
      // Fraktprisen fra Bring må være regnet ut før kunden bestiller, så knappen aldri viser feil beløp.
      if (data.shippingPending || data.shippingCode !== shippingCode) {
        setError("Fraktprisen regnes ut. Sjekk totalen og trykk Bestill igjen.");
        setRefresh((n) => n + 1);
        return;
      }
      const text = (key: string) => String(form.get(key) ?? "");
      const order = {
        lines: items,
        name: text("name"),
        email: text("email"),
        phone: text("phone"),
        shippingCode,
        address: shipping?.requiresAddress ? { street: text("street"), postalCode: text("postalCode"), city: text("city") } : null,
        paymentMethod: payment as PaymentMethod,
        // Typen krever true; serveren avviser bestillingen hvis vilkårene ikke er godtatt.
        acceptedTerms: (form.get("terms") === "on") as true,
        note: text("note"),
        discountCode: data.discount?.code ?? "",
        // Bare til kontroll: serveren regner ut frakten selv og stopper bestillingen hvis den er en annen enn kunden så.
        seenShippingOre: data.shippingOre,
        pickupPointId: pickupId || undefined,
      };

      if (isOnlinePayment(payment)) {
        const result = await placeOrderWithOnlinePayment(siteId, order);
        if (!result.ok) {
          setError(result.message);
          setRefresh((n) => n + 1);
          return;
        }
        try {
          localStorage.setItem(pendingKey(siteId), result.orderId);
        } catch {
          // Privat modus: kurven tømmes ikke av seg selv, men betalingen virker som vanlig.
        }
        // Handlekurven står til kvitteringssiden viser at betalingen er bekreftet.
        setRedirecting(true);
        window.location.assign(result.redirectUrl);
        return;
      }

      const result = await placeOrder(siteId, order);
      if (!result.ok) {
        setError(result.message);
        setRefresh((n) => n + 1);
        return;
      }
      writeCart(siteId, []);
      router.push(`${basePath}/ordre/${result.orderId}?t=${result.token}`);
    });

  const busy = submitting || redirecting;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_24rem]">
      {/* onSubmit i stedet for action: React tømmer skjemaet etter en action, også når bestillingen feiler. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(new FormData(e.currentTarget));
        }}
        className="space-y-8"
      >
        <p className="rounded-[var(--radius)] bg-[var(--c-surface)] p-4 text-sm">{data.legal.start}</p>
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Kontaktinformasjon</h2>
          <Field label="Navn">
            <input name="name" required autoComplete="name" className={input} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="E-post">
              <input name="email" type="email" required autoComplete="email" className={input} />
            </Field>
            <Field label="Telefon (valgfritt)">
              <input name="phone" type="tel" autoComplete="tel" className={input} />
            </Field>
          </div>
          <p className="text-sm text-[var(--c-muted)]">
            {data.legal.personvern.replace(/ Les mer i personvernerklæringen\.$/, "")}{" "}
            <Link href={`${basePath}${data.legal.lenker.personvern}`} target="_blank" className="underline">
              Les mer i personvernerklæringen
            </Link>
            .
          </p>
        </section>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xl font-semibold">Levering</legend>
          {data.shippingOptions.map((o) => (
            <label key={o.code} className="flex cursor-pointer items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--c-muted)]/40 p-4 has-[:checked]:border-[var(--c-primary)]">
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="shipping"
                  value={o.code}
                  checked={shippingCode === o.code}
                  aria-describedby={o.deliveryDays !== null ? `frakt-${o.code}` : undefined}
                  onChange={() => {
                    setShippingCode(o.code);
                    // Sendes varene, kan de ikke betales ved henting. Velg neste betalingsmåte i stedet.
                    if (o.requiresAddress && payment === "ved-henting") setPayment(data.paymentMethods.find((m) => m.code !== "ved-henting")?.code ?? "");
                  }}
                />
                <span>
                  {o.name}
                  {o.deliveryDays !== null && (
                    <span id={`frakt-${o.code}`} className="block text-sm text-[var(--c-muted)]">
                      Bring regner med {o.deliveryDays} {o.deliveryDays === 1 ? "virkedag" : "virkedager"}
                    </span>
                  )}
                </span>
              </span>
              <span className="text-right">{o.pricePending ? "Pris etter postnummer" : o.priceOre === 0 ? "Gratis" : formatNok(o.priceOre)}</span>
            </label>
          ))}
          {data.freeShippingOverOre !== null && data.subtotalOre < data.freeShippingOverOre && (
            <p className="text-sm text-[var(--c-muted)]">Gratis frakt ved kjøp over {formatNok(data.freeShippingOverOre)}.</p>
          )}
        </fieldset>

        {shipping?.requiresAddress && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Leveringsadresse</h2>
            <Field label="Gateadresse">
              <input name="street" required autoComplete="street-address" className={input} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Field label="Postnr.">
                <input
                  name="postalCode"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  title="Fire siffer"
                  maxLength={4}
                  autoComplete="postal-code"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  aria-describedby={shipping.pricePending ? "postnummer-frakt" : undefined}
                  className={input}
                />
              </Field>
              <Field label="Poststed">
                <input name="city" required autoComplete="address-level2" className={input} />
              </Field>
            </div>
            {shipping.pricePending && (
              <p id="postnummer-frakt" className="text-sm text-[var(--c-muted)]">
                Fraktprisen regnes ut når du har skrevet postnummeret.
              </p>
            )}
            {pickupWanted && (
              <fieldset className="space-y-2" aria-describedby="hentested-status">
                <legend className="mb-1 font-medium">Velg hentested</legend>
                {/* Alltid på siden, så skjermlesere melder når listen er lastet. */}
                <p id="hentested-status" role="status" aria-live="polite" className="text-sm text-[var(--c-muted)]">
                  {pickupLoading
                    ? "Henter hentesteder i nærheten..."
                    : pickupPoints.length > 0
                      ? `${pickupPoints.length} ${pickupPoints.length === 1 ? "hentested" : "hentesteder"} i nærheten av ${quotePostalCode}. Nærmeste er valgt.`
                      : "Vi fant ingen hentesteder å velge mellom akkurat nå. Pakken sendes til nærmeste hentested."}
                </p>
                {pickupPoints.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-[var(--c-muted)]/40 p-4 has-[:checked]:border-[var(--c-primary)]"
                  >
                    <input type="radio" name="hentested" value={p.id} checked={pickupId === p.id} onChange={() => setChosenPickupId(p.id)} className="mt-1" />
                    <span>
                      {p.name}
                      <span className="block text-sm text-[var(--c-muted)]">
                        {[p.address, [p.postalCode, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                        {p.distanceKm !== null && `. ${p.distanceKm.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} km unna`}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </section>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xl font-semibold">Betaling</legend>
          {data.paymentMethods.length === 0 && (
            <p role="alert" className="font-medium">
              Butikken tar ikke imot betaling akkurat nå. Prøv igjen senere.
            </p>
          )}
          {data.paymentMethods.filter((m) => !(shipping?.requiresAddress && m.code === "ved-henting")).map((m) => {
            const testMode = isOnlinePayment(m.code) && online[m.code]?.environment === "test";
            const note = [paymentNotes[m.code], testMode && "Testmiljø, ingen ekte penger trekkes"].filter(Boolean).join(". ");
            return (
              <label key={m.code} className="flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border border-[var(--c-muted)]/40 p-4 has-[:checked]:border-[var(--c-primary)]">
                <input
                  type="radio"
                  name="payment"
                  value={m.code}
                  checked={payment === m.code}
                  onChange={() => setPayment(m.code)}
                  aria-describedby={note ? `betaling-${m.code}` : undefined}
                />
                <span>
                  {m.label}
                  {note && (
                    <span id={`betaling-${m.code}`} className="block text-sm text-[var(--c-muted)]">
                      {note}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>

        <Field label="Melding til butikken (valgfritt)">
          <textarea name="note" rows={3} className={input} />
        </Field>

        <label className="flex items-start gap-3">
          <input type="checkbox" name="terms" required className="mt-1" />
          <span>
            Jeg har lest og godtar{" "}
            <Link href={`${basePath}${data.termsPath}`} target="_blank" className="underline">
              kjøpsvilkårene
            </Link>{" "}
            og{" "}
            <Link href={`${basePath}${data.legal.lenker.angrerett}`} target="_blank" className="underline">
              informasjonen om angrerett
            </Link>
            .
          </span>
        </label>
        <p className="text-sm">{data.legal.forKnappen}</p>

        {error && (
          <p role="alert" className="rounded-[var(--radius)] border-2 border-[var(--c-text)] p-4 font-medium">
            {error}
          </p>
        )}
        <button
          disabled={busy || preview || data.paymentMethods.length === 0}
          aria-describedby={onlineLabel ? "betaling-videre" : undefined}
          className="w-full rounded-[var(--radius)] bg-[var(--c-primary)] px-6 py-4 text-lg font-semibold text-[var(--c-on-primary)] disabled:opacity-60"
        >
          {busy
            ? onlineLabel
              ? `Sender deg til ${onlineLabel}...`
              : "Sender bestillingen..."
            : data.shippingPending
              ? "Bestill med plikt til å betale"
              : `Bestill med plikt til å betale ${formatNok(data.totalOre)}`}
        </button>
        {onlineLabel && (
          <p id="betaling-videre" className="text-sm text-[var(--c-muted)]">
            Du sendes videre til {onlineLabel} for å betale. Bestillingen er ikke betalt før {onlineLabel} har bekreftet betalingen.
          </p>
        )}
      </form>

      <aside className="h-fit space-y-4 rounded-[var(--radius)] bg-[var(--c-surface)] p-6 lg:sticky lg:top-6">
        <h2 className="text-xl font-semibold">Handlekurv</h2>
        <ul className="divide-y divide-[var(--c-muted)]/30">
          {data.lines.map((l) => (
            <li key={l.variantId} className="py-3">
              <div className="flex justify-between gap-3">
                <span>
                  {l.name}
                  {l.variantLabel && <span className="block text-sm text-[var(--c-muted)]">{l.variantLabel}</span>}
                </span>
                <span>{formatNok(l.totalOre)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <button type="button" aria-label={`Ett færre ${l.name}`} onClick={() => setQuantity(l.variantId, l.quantity - 1)} className="h-8 w-8 rounded-[var(--radius)] border border-[var(--c-muted)]">
                  −
                </button>
                <span aria-live="polite">{l.quantity}</span>
                <button
                  type="button"
                  aria-label={`Ett til av ${l.name}`}
                  disabled={l.quantity >= l.maxQuantity}
                  onClick={() => setQuantity(l.variantId, l.quantity + 1)}
                  className="h-8 w-8 rounded-[var(--radius)] border border-[var(--c-muted)] disabled:opacity-40"
                >
                  +
                </button>
                <button type="button" onClick={() => setQuantity(l.variantId, 0)} className="ml-auto underline">
                  Fjern
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-[var(--c-muted)]/30 pt-4">
          {data.discount ? (
            <p className="flex items-start justify-between gap-3 text-sm">
              <span>
                <strong>{data.discount.code}</strong>
                <span className="block text-[var(--c-muted)]">{data.discount.label}</span>
              </span>
              <button type="button" onClick={() => setAppliedCode("")} className="underline">
                Fjern
              </button>
            </p>
          ) : (
            <div>
              <label htmlFor="rabattkode" className="mb-1 block text-sm font-medium">
                Rabattkode
              </label>
              <div className="flex gap-2">
                <input
                  id="rabattkode"
                  value={codeInput}
                  autoComplete="off"
                  onChange={(e) => setCodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    applyCode();
                  }}
                  className={`${input} uppercase`}
                />
                <button
                  type="button"
                  onClick={applyCode}
                  disabled={!codeInput.trim()}
                  className="rounded-[var(--radius)] border border-[var(--c-text)] px-4 font-semibold disabled:opacity-40"
                >
                  Bruk
                </button>
              </div>
              {codeError && (
                <p role="alert" className="mt-2 text-sm font-medium">
                  {codeError}
                </p>
              )}
            </div>
          )}
        </div>
        <dl className="space-y-1 border-t border-[var(--c-muted)]/30 pt-4">
          <div className="flex justify-between">
            <dt>Varer</dt>
            <dd>{formatNok(data.subtotalOre)}</dd>
          </div>
          {data.discount && data.discount.amountOre > 0 && (
            <div className="flex justify-between">
              <dt>Rabatt</dt>
              <dd>−{formatNok(data.discount.amountOre)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Frakt</dt>
            {/* Prisen fra Bring kommer etter at kunden har skrevet postnummeret, og leses opp når den endres. */}
            <dd aria-live="polite">{data.shippingPending ? "Etter postnummer" : data.shippingOre === 0 ? "Gratis" : formatNok(data.shippingOre)}</dd>
          </div>
          <div className="flex justify-between text-lg font-semibold">
            <dt>{data.shippingPending ? "Totalt før frakt" : "Totalt"}</dt>
            <dd>{formatNok(data.totalOre)}</dd>
          </div>
          <div className="flex justify-between text-sm text-[var(--c-muted)]">
            <dt>Herav MVA</dt>
            <dd>{formatNok(data.vatOre)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

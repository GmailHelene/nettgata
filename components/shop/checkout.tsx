"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getCheckoutData, placeOrder } from "@/app/actions/shop";
import { formatNok } from "@/lib/shop/money";
import type { PaymentMethod } from "@/lib/shop/settings";
import { useCart, writeCart } from "./cart-store";

type Data = NonNullable<Awaited<ReturnType<typeof getCheckoutData>>>;

const input = "w-full rounded-[var(--radius)] border border-[var(--c-muted)] bg-[var(--c-bg)] px-3 py-2";

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
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getCheckoutData(siteId, items, shippingCode || undefined, appliedCode || undefined).then((result) => {
      if (cancelled) return;
      setData(result);
      setLoading(false);
      if (!result) return;
      // En kode som ikke (lenger) gjelder, for eksempel fordi kurven ble mindre, tas bort med en forklaring.
      if (result.discountError) {
        setCodeError(result.discountError);
        setAppliedCode("");
      }
      setShippingCode((current) => current || result.shippingOptions[0]?.code || "");
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
  }, [siteId, items, shippingCode, appliedCode]);

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

  const submit = (form: FormData) =>
    startSubmit(async () => {
      setError(null);
      const text = (key: string) => String(form.get(key) ?? "");
      const result = await placeOrder(siteId, {
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
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      writeCart(siteId, []);
      router.push(`${basePath}/ordre/${result.orderId}?t=${result.token}`);
    });

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_24rem]">
      <form action={submit} className="space-y-8">
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
        </section>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xl font-semibold">Levering</legend>
          {data.shippingOptions.map((o) => (
            <label key={o.code} className="flex cursor-pointer items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--c-muted)]/40 p-4 has-[:checked]:border-[var(--c-primary)]">
              <span className="flex items-center gap-3">
                <input type="radio" name="shipping" value={o.code} checked={shippingCode === o.code} onChange={() => setShippingCode(o.code)} />
                {o.name}
              </span>
              <span>{o.priceOre === 0 ? "Gratis" : formatNok(o.priceOre)}</span>
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
                <input name="postalCode" required inputMode="numeric" maxLength={4} autoComplete="postal-code" className={input} />
              </Field>
              <Field label="Poststed">
                <input name="city" required autoComplete="address-level2" className={input} />
              </Field>
            </div>
          </section>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xl font-semibold">Betaling</legend>
          {data.paymentMethods.map((m) => (
            <label key={m.code} className="flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border border-[var(--c-muted)]/40 p-4 has-[:checked]:border-[var(--c-primary)]">
              <input type="radio" name="payment" value={m.code} checked={payment === m.code} onChange={() => setPayment(m.code)} />
              {m.label}
            </label>
          ))}
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
            </Link>
            , inkludert angreretten.
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-[var(--radius)] border-2 border-[var(--c-text)] p-4 font-medium">
            {error}
          </p>
        )}
        <button
          disabled={submitting || preview}
          className="w-full rounded-[var(--radius)] bg-[var(--c-primary)] px-6 py-4 text-lg font-semibold text-[var(--c-on-primary)] disabled:opacity-60"
        >
          {submitting ? "Sender bestillingen..." : `Bestill med plikt til å betale ${formatNok(data.totalOre)}`}
        </button>
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
            <dd>{data.shippingOre === 0 ? "Gratis" : formatNok(data.shippingOre)}</dd>
          </div>
          <div className="flex justify-between text-lg font-semibold">
            <dt>Totalt</dt>
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

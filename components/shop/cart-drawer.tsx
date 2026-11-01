"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "@/components/site/use-modal";
import { getCheckoutData } from "@/app/actions/shop";
import { formatNok } from "@/lib/shop/money";
import { useCart, writeCart } from "./cart-store";

type Data = NonNullable<Awaited<ReturnType<typeof getCheckoutData>>>;

/**
 * Handlekurv som skuff fra høyre, som i de fleste store nettbutikker. Viser hvor mye som
 * mangler til fri frakt, fordi det er det som oftest får kunden til å legge til én vare til.
 */
export function CartDrawer({ siteId, basePath }: { siteId: string; basePath: string }) {
  const items = useCart(siteId);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModal(open, dialogRef, buttonRef);
  // Temaets CSS-variabler må følge med ut av siden når skuffen flyttes til <body>.
  const [styleVars, setStyleVars] = useState<React.CSSProperties>();
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const computed = getComputedStyle(buttonRef.current);
    const vars = ["--c-primary", "--c-on-primary", "--c-bg", "--c-surface", "--c-text", "--c-muted", "--f-heading", "--f-body", "--radius"];
    setStyleVars(Object.fromEntries(vars.map((v) => [v, computed.getPropertyValue(v)])) as React.CSSProperties);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCheckoutData(siteId, items).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
  }, [open, siteId, items]);

  // Åpne skuffen når noe legges i kurven fra en vareside.
  useEffect(() => {
    const onAdded = () => setOpen(true);
    window.addEventListener("kurv-lagt-til", onAdded);
    return () => window.removeEventListener("kurv-lagt-til", onAdded);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const setQuantity = (variantId: string, quantity: number) =>
    writeCart(
      siteId,
      quantity <= 0
        ? items.filter((i) => i.variantId !== variantId)
        : items.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)),
    );

  const free = data?.freeShippingOverOre ?? null;
  const missing = free !== null && data ? Math.max(0, free - data.subtotalOre) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-2 p-2 font-semibold"
        aria-label={`Handlekurv, ${count} ${count === 1 ? "vare" : "varer"}`}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 7h12l-1 13H7L6 7z" />
          <path d="M9 7a3 3 0 0 1 6 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--c-primary)] px-1 text-xs text-[var(--c-on-primary)]">
            {count}
          </span>
        )}
      </button>
      {open &&
        // Portal til <body>: toppmenyen har backdrop-filter, som ellers låser «fixed» til menyens høyde.
        createPortal(
          <div
            ref={dialogRef}
            style={styleVars}
            className="fixed inset-0 z-50 font-[family-name:var(--f-body)] text-[var(--c-text)]"
            role="dialog"
            aria-modal="true"
            aria-label="Handlekurv"
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-[var(--c-bg)] shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--c-muted)]/20 p-5">
                <h2 className="font-[family-name:var(--f-heading)] text-xl font-bold">Handlekurv ({count})</h2>
                <button ref={closeRef} type="button" aria-label="Lukk handlekurven" onClick={() => setOpen(false)} className="p-2">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              {missing !== null && count > 0 && (
                <div className="border-b border-[var(--c-muted)]/20 p-5 text-sm">
                  <p>{missing === 0 ? "Du har fri frakt!" : `Du mangler ${formatNok(missing)} for fri frakt`}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--c-surface)]" aria-hidden="true">
                    <div
                      className="h-full bg-[var(--c-primary)] transition-all"
                      style={{ width: `${Math.min(100, ((data!.subtotalOre || 0) / (free || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-5">
                {count === 0 ? (
                  <p className="text-[var(--c-muted)]">Handlekurven er tom.</p>
                ) : !data ? (
                  <p>Henter handlekurven...</p>
                ) : (
                  <ul className="divide-y divide-[var(--c-muted)]/20">
                    {data.lines.map((l) => (
                      <li key={l.variantId} className="py-4">
                        <div className="flex justify-between gap-3">
                          <span className="font-medium">
                            {l.name}
                            {l.variantLabel && <span className="block text-sm font-normal text-[var(--c-muted)]">{l.variantLabel}</span>}
                          </span>
                          <span>{formatNok(l.totalOre)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-sm">
                          <button
                            type="button"
                            aria-label={`Ett færre ${l.name}`}
                            onClick={() => setQuantity(l.variantId, l.quantity - 1)}
                            className="h-8 w-8 rounded-[var(--radius)] border border-[var(--c-muted)]/50"
                          >
                            −
                          </button>
                          <span aria-live="polite" className="w-6 text-center">
                            {l.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Ett til av ${l.name}`}
                            disabled={l.quantity >= l.maxQuantity}
                            onClick={() => setQuantity(l.variantId, l.quantity + 1)}
                            className="h-8 w-8 rounded-[var(--radius)] border border-[var(--c-muted)]/50 disabled:opacity-40"
                          >
                            +
                          </button>
                          <button type="button" aria-label={`Fjern ${l.name}`} onClick={() => setQuantity(l.variantId, 0)} className="ml-auto underline">
                            Fjern
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {count > 0 && data && (
                <div className="border-t border-[var(--c-muted)]/20 p-5">
                  <div className="mb-4 flex justify-between text-lg font-semibold">
                    <span>Sum varer</span>
                    <span>{formatNok(data.subtotalOre)}</span>
                  </div>
                  <Link
                    href={`${basePath}/handlekurv`}
                    onClick={() => setOpen(false)}
                    className="block rounded-[var(--radius)] bg-[var(--c-primary)] px-6 py-4 text-center font-semibold text-[var(--c-on-primary)]"
                  >
                    Til kassen
                  </Link>
                  <p className="mt-3 text-center text-xs text-[var(--c-muted)]">Frakt velges i kassen</p>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

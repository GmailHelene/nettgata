"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CatalogProduct } from "@/lib/shop/catalog";
import { addToCart } from "./cart-store";
import { VARIANT_IMAGE_EVENT } from "./gallery";
import { Price } from "./price";

export function AddToCart({ siteId, product, cartHref }: { siteId: string; product: CatalogProduct; cartHref: string }) {
  const firstAvailable = product.variants.find((v) => v.stock === null || v.stock > 0) ?? product.variants[0];
  const [selected, setSelected] = useState<string[]>(firstAvailable.optionValues);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [buttonHidden, setButtonHidden] = useState(false);

  // Fast kjøpslinje på mobil når den vanlige knappen er rullet ut av syne.
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setButtonHidden(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Har det valgte alternativet eget bilde, bytter galleriet til det.
  useEffect(() => {
    const image = product.options.map((o, i) => o.media?.[selected[i]]?.image).find(Boolean);
    if (image) window.dispatchEvent(new CustomEvent(VARIANT_IMAGE_EVENT, { detail: image }));
  }, [product.options, selected]);

  const variant = product.variants.find((v) => v.optionValues.every((value, i) => value === selected[i]));
  const soldOut = !variant || (variant.stock !== null && variant.stock <= 0);
  const add = () => {
    if (!variant) return;
    // Bildet til det valgte alternativet hvis det har eget, ellers varens første bilde.
    const image = product.options.map((o, i) => o.media?.[selected[i]]?.image).find(Boolean) ?? product.images[0]?.src;
    addToCart(siteId, variant.id, quantity, { name: product.name, label: variant.label || undefined, priceOre: variant.priceOre, image });
    setAdded(true);
  };
  const max = variant?.stock === null || variant?.stock === undefined ? 99 : Math.max(1, Math.min(99, variant.stock));

  return (
    <div className="space-y-5">
      {/* Når kunden velger en variant med annen pris, leses den nye prisen opp av skjermleseren. */}
      <p className="text-2xl" aria-live="polite" aria-atomic="true">{variant ? <Price priceOre={variant.priceOre} beforePriceOre={variant.beforePriceOre} /> : "Ikke tilgjengelig"}</p>

      {product.options.map((option, i) => (
        <fieldset key={option.name}>
          <legend className="mb-2 font-medium">{option.name}</legend>
          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => {
              const candidate = product.variants.find((v) => v.optionValues.every((x, j) => (j === i ? x === value : x === selected[j])));
              const unavailable = !candidate || (candidate.stock !== null && candidate.stock <= 0);
              const color = option.media?.[value]?.color;
              return (
                <label
                  key={value}
                  className={`cursor-pointer rounded-[var(--radius)] border-2 px-4 py-2 has-[:checked]:border-[var(--c-primary)] has-[:focus-visible]:outline-2 ${unavailable ? "text-[var(--c-muted)] line-through" : ""} border-[var(--c-muted)]/40`}
                >
                  <input
                    type="radio"
                    name={option.name}
                    value={value}
                    checked={selected[i] === value}
                    onChange={() => {
                      setSelected(selected.map((s, j) => (j === i ? value : s)));
                      setAdded(false);
                    }}
                    className="sr-only"
                  />
                  {/* Fargen vises i tillegg til navnet, så valget ikke avhenger av å se forskjell på farger. */}
                  {color && <span aria-hidden="true" className="mr-2 inline-block h-4 w-4 rounded-full align-[-2px] ring-1 ring-black/25" style={{ backgroundColor: color }} />}
                  {value}
                  {unavailable && <span className="sr-only"> (utsolgt)</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {variant && variant.stock !== null && variant.stock > 0 && variant.stock <= 5 && (
        <p className="text-sm">Bare {variant.stock} igjen</p>
      )}

      <div ref={buttonRef} className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Antall</span>
          <input
            type="number"
            min={1}
            max={max}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
            className="w-20 rounded-[var(--radius)] border border-[var(--c-muted)] bg-[var(--c-bg)] px-3 py-3"
          />
        </label>
        <button
          disabled={soldOut}
          onClick={add}
          className="flex-1 rounded-[var(--radius)] bg-[var(--c-primary)] px-6 py-3 font-semibold text-[var(--c-on-primary)] disabled:opacity-50 sm:flex-none"
        >
          {soldOut ? "Utsolgt" : "Legg i handlekurven"}
        </button>
      </div>

      {buttonHidden && !soldOut && variant && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-4 border-t border-[var(--c-muted)]/25 bg-[var(--c-bg)] p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:hidden">
          <span className="flex-1 truncate text-sm">
            <span className="block truncate font-medium">{product.name}</span>
            <Price priceOre={variant.priceOre} beforePriceOre={variant.beforePriceOre} />
          </span>
          <button onClick={add} className="rounded-[var(--radius)] bg-[var(--c-primary)] px-5 py-3 font-semibold text-[var(--c-on-primary)]">
            Legg i kurven
          </button>
        </div>
      )}

      {added && (
        <p role="status" className="rounded-[var(--radius)] bg-[var(--c-surface)] p-4">
          Lagt i handlekurven.{" "}
          <Link href={cartHref} className="font-semibold underline">
            Gå til handlekurven
          </Link>
        </p>
      )}
    </div>
  );
}

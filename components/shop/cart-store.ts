"use client";

import { useSyncExternalStore } from "react";

/**
 * Handlekurven ligger i nettleseren (localStorage), én per nettsted. Den inneholder variant-ID og antall, og et
 * øyeblikksbilde av navn og pris fra varesiden (seen), så kurven kan vises med en gang mens serveren svarer.
 * Pris, navn og lager som gjelder, hentes alltid fra serveren, og ordren regnes alltid ut der.
 */
export type CartSeen = { name: string; label?: string; priceOre: number };
export type CartItem = { variantId: string; quantity: number; seen?: CartSeen };

function cleanSeen(raw: unknown): CartSeen | undefined {
  const s = raw as Partial<CartSeen> | null;
  if (!s || typeof s.name !== "string" || !Number.isInteger(s.priceOre)) return undefined;
  return { name: s.name.slice(0, 120), label: typeof s.label === "string" ? s.label.slice(0, 120) : undefined, priceOre: s.priceOre as number };
}

const EVENT = "kurv-endret";
const key = (siteId: string) => `kurv:${siteId}`;
const EMPTY: CartItem[] = [];
const cache = new Map<string, { raw: string | null; items: CartItem[] }>();

export function readCart(siteId: string): CartItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(siteId));
  } catch {
    return EMPTY;
  }
  const cached = cache.get(siteId);
  if (cached && cached.raw === raw) return cached.items;
  let items: CartItem[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      items = parsed
        .filter((i): i is CartItem => typeof i?.variantId === "string" && Number.isInteger(i?.quantity) && i.quantity > 0 && i.quantity <= 99)
        .map((i) => ({ variantId: i.variantId, quantity: i.quantity, seen: cleanSeen(i.seen) }));
    }
  } catch {
    items = EMPTY;
  }
  cache.set(siteId, { raw, items });
  return items;
}

export function writeCart(siteId: string, items: CartItem[]) {
  try {
    if (items.length) localStorage.setItem(key(siteId), JSON.stringify(items));
    else localStorage.removeItem(key(siteId));
  } catch {
    // Privat modus eller blokkert lagring: kurven lever da bare til siden lastes på nytt.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(siteId: string, variantId: string, quantity: number, seen?: CartSeen) {
  const items = readCart(siteId);
  const existing = items.find((i) => i.variantId === variantId);
  const next = existing
    ? items.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(99, i.quantity + quantity), seen: seen ?? i.seen } : i))
    : [...items, { variantId, quantity, seen }];
  writeCart(siteId, next);
  window.dispatchEvent(new Event("kurv-lagt-til"));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useCart(siteId: string): CartItem[] {
  return useSyncExternalStore(subscribe, () => readCart(siteId), () => EMPTY);
}

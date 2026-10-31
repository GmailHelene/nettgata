"use client";

import { useSyncExternalStore } from "react";

/**
 * Handlekurven ligger i nettleseren (localStorage), én per nettsted. Den inneholder bare
 * variant-ID og antall; pris, navn og lager hentes alltid fra serveren.
 */
export type CartItem = { variantId: string; quantity: number };

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
      items = parsed.filter(
        (i): i is CartItem => typeof i?.variantId === "string" && Number.isInteger(i?.quantity) && i.quantity > 0 && i.quantity <= 99,
      );
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

export function addToCart(siteId: string, variantId: string, quantity: number) {
  const items = readCart(siteId);
  const existing = items.find((i) => i.variantId === variantId);
  const next = existing
    ? items.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(99, i.quantity + quantity) } : i))
    : [...items, { variantId, quantity }];
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

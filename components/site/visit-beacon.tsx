"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Første side i besøket har med hvor besøkende kom fra. Sidebytter etterpå gjør ikke det. */
let entry = true;
/** Stopper dobbel melding når React kjører effekten to ganger under utvikling. */
let lastPath: string | null = null;

/**
 * Melder fra til /api/besok når en side vises, også når besøkende bytter side uten ny sidelasting.
 * Ingen informasjonskapsler og ingenting lagret i nettleseren. Bare stien, og hvor besøket kom fra.
 * Se lib/statistikk.ts.
 */
export function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname === lastPath || navigator.webdriver || typeof navigator.sendBeacon !== "function") return;
    lastPath = pathname;
    const body = JSON.stringify({ p: pathname, r: entry ? document.referrer : "", e: entry ? 1 : 0 });
    entry = false;
    navigator.sendBeacon("/api/besok", new Blob([body], { type: "text/plain" }));
  }, [pathname]);
  return null;
}

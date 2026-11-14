"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { saveStartValg } from "@/lib/startvalg";

/** Lenke til registrering som husker bransjen og temaet den besøkende valgte. */
export function StartLink({ pack, theme, className, children }: { pack?: string; theme?: string; className?: string; children: ReactNode }) {
  return (
    <Link href="/studio/registrer" className={className} onClick={() => saveStartValg({ pack, theme })}>
      {children}
    </Link>
  );
}

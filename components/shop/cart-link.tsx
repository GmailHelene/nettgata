"use client";

import Link from "next/link";
import { useCart } from "./cart-store";

export function CartLink({ siteId, href }: { siteId: string; href: string }) {
  const count = useCart(siteId).reduce((sum, i) => sum + i.quantity, 0);
  return (
    <Link href={href} className="font-semibold">
      Handlekurv
      {count > 0 && (
        <span className="ml-2 rounded-full bg-[var(--c-primary)] px-2 py-0.5 text-sm text-[var(--c-on-primary)]">
          {count}
          <span className="sr-only"> {count === 1 ? "vare" : "varer"}</span>
        </span>
      )}
    </Link>
  );
}

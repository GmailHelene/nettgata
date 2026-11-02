import Link from "next/link";
import { logout } from "@/app/studio/actions";
import { signType, StreetSign } from "@/components/brand";

/**
 * Toppfeltet i studioet, i asfalt som bunnen av nettgata.no. På mobil vises ikke e-postadressen,
 * så feltet aldri blir bredere enn skjermen. Skjermlesere får den likevel med på «Logg ut».
 */
export function StudioTopBar({ email, active }: { email: string; active?: "nettsteder" | "konto" | "hjelp" }) {
  const item = "rounded-md px-2.5 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white aria-[current=page]:bg-white/15 aria-[current=page]:text-white";
  return (
    <header className="bg-[#1b232b] text-white [&_:focus-visible]:!outline-white">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/studio" className="flex shrink-0 items-center gap-2.5 rounded-md">
          <StreetSign />
          <span className={`${signType} text-[0.8rem] text-white/75`}>Studio</span>
          <span className="sr-only">, alle nettstedene dine</span>
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <span className="mr-2 hidden min-w-0 truncate text-sm text-white/70 md:block" title={email}>
            {email}
          </span>
          <nav aria-label="Studio" className="flex items-center gap-1">
            <Link href="/studio" aria-current={active === "nettsteder" ? "page" : undefined} className={`${item} hidden sm:block`}>
              Nettsteder
            </Link>
            <Link href="/studio/hjelp" aria-current={active === "hjelp" ? "page" : undefined} className={item}>
              Hjelp
            </Link>
            <Link href="/studio/konto" aria-current={active === "konto" ? "page" : undefined} className={item}>
              Konto
            </Link>
          </nav>
          <form action={logout}>
            <button className={item}>
              Logg ut<span className="sr-only"> ({email})</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

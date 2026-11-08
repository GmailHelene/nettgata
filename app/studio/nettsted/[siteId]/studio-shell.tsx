"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { logout } from "@/app/studio/actions";
import { signType, StreetSign } from "@/components/brand";
import { activeHref, type NavBadgeKey, type NavGroup, type NavItem } from "./nav-items";

type Props = {
  siteId: string;
  siteName: string;
  shop: boolean;
  email: string;
  siteUrl: string;
  groups: NavGroup[];
  addable: NavItem[];
  badges: Partial<Record<NavBadgeKey, string>>;
  children: React.ReactNode;
};

const badgeClass: Record<NavBadgeKey, string> = {
  ordre: "bg-[#173b6c] text-white",
  henvendelser: "bg-[#a13a2c] text-white",
  "ai-teamet": "bg-[#2f5a47] text-white",
};

/**
 * Rammen rundt alle sidene for ett nettsted: toppstripe, venstremeny på PC, skuff og bunnmeny på mobil.
 * Ligger i layout.tsx, så menyen ikke lastes på nytt for hvert klikk. Byggereglene står i rapporten fra
 * gjennomgangen (kapittel 4): skip-link, vanlige lenker i nav, aria-current, skuff med fokus og Esc.
 */
export function StudioShell({ siteId, siteName, shop, email, siteUrl, groups, addable, badges, children }: Props) {
  const base = `/studio/nettsted/${siteId}`;
  const pathname = usePathname() ?? base;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/$/, "") : "";
  const current = activeHref(groups, rest);
  // Skuffen huskes sammen med siden den ble åpnet på, så den lukkes av seg selv når brukeren går til en annen side.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean | ((was: boolean) => boolean)) =>
    setOpenOn((prev) => ((typeof next === "function" ? next(prev === pathname) : next) ? pathname : null));
  const drawerId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const aside = useRef<HTMLElement>(null);

  // Undermenyen til Innstillinger ligger nederst. Det aktive punktet rulles fram, så brukeren ser hvor de er.
  useEffect(() => {
    aside.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    drawer.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const bar = "rounded-md px-2.5 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white";
  const bottom: { label: string; href: string; badge?: NavBadgeKey }[] = shop
    ? [
        { label: "Hjem", href: "" },
        { label: "Ordre", href: "/ordre", badge: "ordre" },
        { label: "Henvendelser", href: "/henvendelser", badge: "henvendelser" },
        { label: "Sider", href: "/sider" },
      ]
    : [
        { label: "Hjem", href: "" },
        { label: "Henvendelser", href: "/henvendelser", badge: "henvendelser" },
        { label: "Sider", href: "/sider" },
        { label: "Design", href: "/design" },
      ];

  return (
    <div className="min-h-screen">
      <a
        href="#innhold"
        className="sr-only z-[70] rounded-md bg-white px-4 py-3 font-semibold text-[#173b6c] focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Hopp til innhold
      </a>

      <header className="sticky top-0 z-40 bg-[#1b232b] text-white print:hidden [&_:focus-visible]:!outline-white">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
          <button
            ref={menuButton}
            type="button"
            className={`${bar} lg:hidden`}
            aria-expanded={open}
            aria-controls={drawerId}
            onClick={() => setOpen((v) => !v)}
          >
            Meny
          </button>
          <Link href="/studio" className="flex shrink-0 items-center gap-2.5 rounded-md">
            <StreetSign />
            <span className={`${signType} hidden text-[0.8rem] text-white/75 sm:inline`}>Alle nettsteder</span>
            <span className="sr-only sm:hidden">Alle nettsteder</span>
          </Link>
          <span aria-hidden className="hidden text-white/30 sm:inline">
            /
          </span>
          <span className="min-w-0 truncate font-semibold">{siteName}</span>
          <div className="ml-auto flex items-center gap-1">
            <a href={siteUrl} target="_blank" rel="noreferrer" className={`${bar} whitespace-nowrap`}>
              <span className="sm:hidden">Se siden</span>
              <span className="hidden sm:inline">Se nettstedet</span>
              <span aria-hidden> ↗</span>
              <span className="sr-only"> (åpnes i ny fane)</span>
            </a>
            <Link href="/studio/hjelp" className={`${bar} hidden sm:block`}>
              Hjelp
            </Link>
            <Link href="/studio/konto" className={`${bar} hidden md:block`}>
              Konto
            </Link>
            <form action={logout} className="hidden md:block">
              <button className={bar}>
                Logg ut<span className="sr-only"> ({email})</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Venstremeny på PC. */}
      <aside ref={aside} className="fixed bottom-0 left-0 top-14 z-30 hidden w-60 overflow-y-auto border-r border-[#d5dbe0] bg-white print:hidden lg:block">
        <SideNav base={base} groups={groups} addable={addable} current={current} badges={badges} />
      </aside>

      {/* Skuff på mobil og nettbrett. */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <button type="button" aria-label="Lukk menyen" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div
            ref={drawer}
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Meny"
            className="absolute bottom-0 left-0 top-0 flex w-[min(20rem,88vw)] flex-col overflow-y-auto bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#d5dbe0] px-4 py-3">
              <span className="font-semibold">{siteName}</span>
              <button
                type="button"
                className="rounded-md px-3 py-2 text-sm font-medium underline"
                onClick={() => {
                  setOpen(false);
                  menuButton.current?.focus();
                }}
              >
                Lukk
              </button>
            </div>
            <SideNav base={base} groups={groups} addable={addable} current={current} badges={badges} />
            <div className="mt-auto border-t border-[#d5dbe0] p-4 text-sm">
              <Link href="/studio/hjelp" className="block py-2 underline">
                Hjelp
              </Link>
              <Link href="/studio/konto" className="block py-2 underline">
                Konto
              </Link>
              <form action={logout}>
                <button className="py-2 underline">Logg ut</button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div id="innhold" tabIndex={-1} className="pb-20 outline-none lg:pb-0 lg:pl-60 print:p-0">
        {children}
      </div>

      {/* Bunnmeny på mobil: de fire vanligste målene og «Mer». */}
      <nav aria-label="Snarveier" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d5dbe0] bg-white print:hidden lg:hidden">
        <ul className="grid grid-cols-5">
          {bottom.map((b) => {
            const active = current === b.href;
            return (
              <li key={b.href}>
                <Link
                  href={`${base}${b.href}`}
                  aria-current={active ? "page" : undefined}
                  className="relative flex min-h-14 flex-col items-center justify-center px-1 text-xs font-medium text-[#47525c] aria-[current=page]:font-semibold aria-[current=page]:text-[#173b6c]"
                >
                  {active && <span aria-hidden className="absolute inset-x-3 top-0 h-[3px] rounded-b bg-[#173b6c]" />}
                  {b.label}
                  {b.badge && badges[b.badge] && (
                    <span className={`mt-0.5 rounded-full px-1.5 text-[0.65rem] ${badgeClass[b.badge]}`}>{badges[b.badge]}</span>
                  )}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={drawerId}
              onClick={() => setOpen(true)}
              className="flex min-h-14 w-full flex-col items-center justify-center text-xs font-medium text-[#47525c]"
            >
              Mer
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function SideNav({
  base,
  groups,
  addable,
  current,
  badges,
}: {
  base: string;
  groups: NavGroup[];
  addable: NavItem[];
  current: string | null;
  badges: Partial<Record<NavBadgeKey, string>>;
}) {
  const link =
    "flex min-h-10 items-center justify-between gap-2 rounded-md px-3 py-2 text-[0.95rem] text-[#33404b] hover:bg-[#f2f4f5] aria-[current=page]:bg-[#e8eef6] aria-[current=page]:font-semibold aria-[current=page]:text-[#173b6c] aria-[current=page]:shadow-[inset_3px_0_0_#173b6c]";
  const isIn = (i: NavItem) => i.href === current || (i.children ?? []).some((c) => c.href === current);
  return (
    <nav aria-label="Nettstedet" className="px-3 py-4">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className={gi > 0 ? "mt-5" : ""}>
          {g.label && g.label !== "Innstillinger" && (
            <h2 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-[#5b6873]">{g.label}</h2>
          )}
          {g.label === "Innstillinger" && <div aria-hidden className="mb-3 border-t border-[#d5dbe0]" />}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.href}>
                <Link href={`${base}${item.href}`} aria-current={item.href === current ? "page" : undefined} className={link}>
                  <span>{item.label}</span>
                  {item.badge && badges[item.badge] && (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClass[item.badge]}`}>{badges[item.badge]}</span>
                  )}
                </Link>
                {/* Undernivået vises når brukeren er inne i punktet, så menyen holder seg kort. */}
                {item.children && isIn(item) && (
                  <ul className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-[#d5dbe0] pl-2">
                    {item.children.map((c) => (
                      <li key={c.href}>
                        <Link href={`${base}${c.href}`} aria-current={c.href === current ? "page" : undefined} className={`${link} min-h-9 text-sm`}>
                          {c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {addable.length > 0 && (
        <details className="mt-5 rounded-md border border-dashed border-[#c3ccd3] px-3 py-2 text-sm">
          <summary className="cursor-pointer py-1 font-medium text-[#173b6c]">+ Flere funksjoner</summary>
          <ul className="mt-2 space-y-2">
            {addable.map((a) => (
              <li key={a.href}>
                <Link href={`${base}${a.href}`} className="font-medium underline">
                  {a.label}
                </Link>
                {a.pitch && <p className="text-xs text-[#5b6873]">{a.pitch}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </nav>
  );
}

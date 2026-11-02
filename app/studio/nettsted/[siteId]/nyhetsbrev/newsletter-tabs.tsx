import Link from "next/link";

/** Underfanene i Nyhetsbrev: skrive og sende, og listen over abonnenter. */
export function NewsletterTabs({ siteId, active, counts }: { siteId: string; active: "skriv" | "abonnenter"; counts: { bekreftet: number } }) {
  const base = `/studio/nettsted/${siteId}/nyhetsbrev`;
  const tabs = [
    { key: "skriv", label: "Skriv og send", href: base },
    { key: "abonnenter", label: `Abonnenter (${counts.bekreftet})`, href: `${base}/abonnenter` },
  ] as const;
  return (
    <nav aria-label="Nyhetsbrev" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === active ? "page" : undefined}
              className="block rounded-full border border-[#173b6c] px-4 py-1.5 text-sm font-medium text-[#173b6c] aria-[current=page]:bg-[#173b6c] aria-[current=page]:text-white"
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

import Link from "next/link";

const tabs = [
  { key: "sider", label: "Sider", href: "", shopOnly: false },
  { key: "varer", label: "Varer", href: "/varer", shopOnly: true },
  { key: "ordre", label: "Ordre", href: "/ordre", shopOnly: true },
  { key: "henvendelser", label: "Henvendelser", href: "/henvendelser", shopOnly: false },
  { key: "innstillinger", label: "Innstillinger", href: "/innstillinger", shopOnly: false },
] as const;

export function SiteNav({
  siteId,
  name,
  active,
  shop = false,
  unread = 0,
}: {
  siteId: string;
  name: string;
  active: (typeof tabs)[number]["key"];
  /** Varer og Ordre vises bare for nettbutikker, så en vanlig nettside ikke får faner den ikke trenger. */
  shop?: boolean;
  unread?: number;
}) {
  return (
    <div className="mb-8">
      <Link href="/studio" className="text-sm underline">
        Alle nettsteder
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{name}</h1>
      <nav aria-label="Nettsted" className="mt-4 flex flex-wrap gap-x-6 border-b">
        {tabs
          .filter((t) => shop || !t.shopOnly)
          .map((t) => (
            <Link
              key={t.key}
              href={`/studio/nettsted/${siteId}${t.href}`}
              aria-current={t.key === active ? "page" : undefined}
              className="-mb-px border-b-2 border-transparent pb-2 aria-[current=page]:border-neutral-900 aria-[current=page]:font-semibold"
            >
              {t.label}
              {t.key === "henvendelser" && unread > 0 && (
                <span className="ml-2 rounded-full bg-red-700 px-2 py-0.5 text-xs text-white">{unread} nye</span>
              )}
            </Link>
          ))}
      </nav>
    </div>
  );
}

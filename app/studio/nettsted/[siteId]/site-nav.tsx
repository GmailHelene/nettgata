import Link from "next/link";

const tabs = [
  { key: "sider", label: "Sider", href: "" },
  { key: "henvendelser", label: "Henvendelser", href: "/henvendelser" },
  { key: "innstillinger", label: "Innstillinger", href: "/innstillinger" },
] as const;

export function SiteNav({
  siteId,
  name,
  active,
  unread = 0,
}: {
  siteId: string;
  name: string;
  active: (typeof tabs)[number]["key"];
  unread?: number;
}) {
  return (
    <div className="mb-8">
      <Link href="/studio" className="text-sm underline">
        Alle nettsteder
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{name}</h1>
      <nav aria-label="Nettsted" className="mt-4 flex gap-6 border-b">
        {tabs.map((t) => (
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

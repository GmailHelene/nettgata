import Link from "next/link";

/**
 * Vises i stedet for publiseringsknappen når nettstedet ikke har betalt abonnement ennå (canPublish i
 * lib/billing/state.ts). Serveren stopper publiseringen uansett. Dette er bare forklaringen og veien videre.
 */
export function PublishLockNotice({ siteId, compact = false }: { siteId: string; compact?: boolean }) {
  const href = `/studio/nettsted/${siteId}/abonnement`;
  if (compact) {
    return (
      <Link href={href} className="rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white">
        Velg abonnement for å publisere
      </Link>
    );
  }
  return (
    <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p>
        Du kan publisere når abonnementet er betalt. Til da kan du redigere alt og vise siden fram med «Forhåndsvis».{" "}
        <Link href={href} className="font-semibold underline">
          Gå til Abonnement
        </Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { heading } from "@/components/brand";
import { SignupConversion } from "@/components/platform/consent";
import { StudioTopBar } from "@/components/studio/top-bar";
import { ui } from "@/components/studio/ui";
import { getDb } from "@/db";
import { MAX_UNPAID_SITES, SITE_LIMIT_MESSAGE, unpaidSelfServeSites } from "@/lib/selvbetjening/grenser";
import { requireUser } from "@/lib/session";
import { NewSiteForm } from "./new-site-form";

export default async function NewSitePage({ searchParams }: { searchParams: Promise<{ velkommen?: string }> }) {
  const user = await requireUser();
  // Kunder må ha bekreftet e-posten. Studioet viser hvordan (se /studio).
  if (!user.isPlatformAdmin && !user.emailVerified) redirect("/studio");
  const full = !user.isPlatformAdmin && (await unpaidSelfServeSites(await getDb(), user.id)).length >= MAX_UNPAID_SITES;
  return (
    <>
      <StudioTopBar email={user.email} />
      <main className={`${ui.page} pt-8 sm:pt-12`}>
        <Link href="/studio" className={`text-sm ${ui.link}`}>
          Alle nettsteder
        </Link>
        {(await searchParams).velkommen && (
          <SignupConversion tagId={process.env.GOOGLE_ADS_TAG_ID?.trim() ?? ""} sendTo={process.env.GOOGLE_ADS_SIGNUP_SEND_TO?.trim() ?? ""} id={user.id} />
        )}
        {(await searchParams).velkommen && (
          <p role="status" className={`${ui.success} mt-6 max-w-2xl`}>
            E-posten er bekreftet, og du er logget inn. Velkommen til Nettgata!
          </p>
        )}
        <p className={`${ui.eyebrow} mt-6`}>Ledig tomt</p>
        <h1 className={`${heading} text-[2.4rem] leading-none sm:text-5xl`}>Nytt nettsted</h1>
        <p className={`mb-8 mt-3 max-w-2xl ${ui.muted}`}>
          Start med org.nr., så henter jeg navn og adresse fra Brønnøysundregistrene og foreslår bransje. Deretter velger du design blant
          temaene.
          {!user.isPlatformAdmin && " Du kan bygge og forhåndsvise gratis. Abonnement trenger du først når nettstedet skal publiseres."}
        </p>
        {full ? (
          <div className={`${ui.card} max-w-2xl p-6`}>
            <h2 className={`${heading} text-xl`}>Du har nådd grensen for gratis nettsteder</h2>
            <p className={`mt-2 ${ui.muted}`}>{SITE_LIMIT_MESSAGE}</p>
            <Link href="/studio" className={`${ui.button} mt-5`}>
              Til nettstedene dine
            </Link>
          </div>
        ) : (
          <NewSiteForm />
        )}
      </main>
    </>
  );
}

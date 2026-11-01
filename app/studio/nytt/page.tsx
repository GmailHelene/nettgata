import Link from "next/link";
import { redirect } from "next/navigation";
import { heading } from "@/components/brand";
import { StudioTopBar } from "@/components/studio/top-bar";
import { ui } from "@/components/studio/ui";
import { requireUser } from "@/lib/session";
import { NewSiteForm } from "./new-site-form";

export default async function NewSitePage() {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/studio");
  return (
    <>
      <StudioTopBar email={user.email} />
      <main className={`${ui.page} pt-8 sm:pt-12`}>
        <Link href="/studio" className={`text-sm ${ui.link}`}>
          Alle nettsteder
        </Link>
        <p className={`${ui.eyebrow} mt-6`}>Ledig tomt</p>
        <h1 className={`${heading} text-[2.4rem] leading-none sm:text-5xl`}>Nytt nettsted</h1>
        <p className={`mb-8 mt-3 max-w-2xl ${ui.muted}`}>
          Start med org.nr., så henter jeg navn og adresse fra Brønnøysundregistrene og foreslår bransje. Deretter velger du design blant
          temaene.
        </p>
        <NewSiteForm />
      </main>
    </>
  );
}

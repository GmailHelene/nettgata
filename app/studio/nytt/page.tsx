import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { NewSiteForm } from "./new-site-form";

export default async function NewSitePage() {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/studio");
  return (
    <main className="mx-auto max-w-6xl px-5 pt-12">
      <Link href="/studio" className="text-sm underline">
        Alle nettsteder
      </Link>
      <h1 className="mb-2 mt-4 text-2xl font-bold">Nytt nettsted</h1>
      <p className="mb-8 max-w-3xl text-neutral-700">
        Start med org.nr., så henter jeg navn og adresse fra Brønnøysundregistrene og foreslår bransje. Deretter velger du design blant temaene.
      </p>
      <NewSiteForm />
    </main>
  );
}

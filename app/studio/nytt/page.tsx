import Link from "next/link";
import { redirect } from "next/navigation";
import { packs } from "@/lib/packs";
import { requireUser } from "@/lib/session";
import { NewSiteForm } from "./new-site-form";

export default async function NewSitePage() {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/studio");
  const options = Object.values(packs).map((p) => ({ key: p.key, label: p.label, description: p.description, designs: p.designs }));
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/studio" className="text-sm underline">
        Alle nettsteder
      </Link>
      <h1 className="mb-2 mt-4 text-2xl font-bold">Nytt nettsted</h1>
      <p className="mb-8 text-neutral-700">Start med org.nr., så henter jeg navn og adresse fra Brønnøysundregistrene.</p>
      <NewSiteForm packs={options} />
    </main>
  );
}

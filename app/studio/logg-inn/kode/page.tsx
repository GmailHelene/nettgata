import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, readPendingSecondFactor } from "@/lib/session";
import { CodeForm } from "./code-form";

/** Andre steg av innloggingen. Nås bare rett etter riktig passord, og gjelder i fem minutter. */
export default async function CodePage() {
  if (await getCurrentUser()) redirect("/studio");
  if (!(await readPendingSecondFactor())) redirect("/studio/logg-inn");
  return (
    <main className="mx-auto max-w-sm px-5 py-24">
      <h1 className="mb-3 text-2xl font-bold">Skriv inn koden</h1>
      <p className="mb-8 text-neutral-700">
        Åpne appen du satte opp tofaktorinnlogging i, og skriv inn den sekssifrede koden for Nettgata. Har du ikke telefonen, kan du
        bruke en av reservekodene.
      </p>
      <CodeForm />
      <p className="mt-8 text-sm">
        <Link href="/studio/logg-inn" className="underline">
          Tilbake til innloggingen
        </Link>
      </p>
    </main>
  );
}

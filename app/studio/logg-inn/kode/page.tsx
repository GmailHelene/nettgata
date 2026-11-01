import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/studio/auth-shell";
import { ui } from "@/components/studio/ui";
import { getCurrentUser, readPendingSecondFactor } from "@/lib/session";
import { CodeForm } from "./code-form";

/** Andre steg av innloggingen. Nås bare rett etter riktig passord, og gjelder i fem minutter. */
export default async function CodePage() {
  if (await getCurrentUser()) redirect("/studio");
  if (!(await readPendingSecondFactor())) redirect("/studio/logg-inn");
  return (
    <AuthShell
      title="Skriv inn koden"
      intro={
        <p>
          Åpne appen du satte opp tofaktorinnlogging i, og skriv inn den sekssifrede koden for Nettgata. Har du ikke telefonen, kan du bruke en
          av reservekodene.
        </p>
      }
      footer={
        <p className="mt-10 text-sm">
          <Link href="/studio/logg-inn" className={ui.link}>
            Tilbake til innloggingen
          </Link>
        </p>
      }
    >
      <CodeForm />
    </AuthShell>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountLinks, RegisterForm } from "@/components/studio/account-forms";
import { AuthShell } from "@/components/studio/auth-shell";
import { ui } from "@/components/studio/ui";
import { turnstileSiteKey } from "@/lib/selvbetjening/turnstile";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Prøv Nettgata gratis" };

/** Selvbetjent registrering. Studioet (og dermed denne siden) finnes bare på plattformens egne vertsnavn. */
export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/studio");
  return (
    <AuthShell
      title="Prøv Nettgata gratis"
      intro={
        <p>
          Bygg og forhåndsvis nettstedet uten å betale noe, og uten kort. Du velger abonnement først når nettstedet skal publiseres.
        </p>
      }
      footer={
        <AccountLinks>
          <p>
            Har du allerede konto?{" "}
            <Link href="/studio/logg-inn" className={ui.link}>
              Logg inn
            </Link>
          </p>
          <p>
            Vil du heller at jeg setter opp nettstedet for deg?{" "}
            <Link href="/#kom-i-gang" className={ui.link}>
              Send en forespørsel
            </Link>
          </p>
        </AccountLinks>
      }
    >
      <RegisterForm siteKey={turnstileSiteKey()} />
    </AuthShell>
  );
}

import Link from "next/link";
import { AccountLinks, ResetRequestForm } from "@/components/studio/account-forms";
import { AuthShell } from "@/components/studio/auth-shell";
import { ui } from "@/components/studio/ui";
import { turnstileSiteKey } from "@/lib/selvbetjening/turnstile";

export const metadata = { title: "Glemt passord" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Glemt passord"
      intro={<p>Skriv e-postadressen du logger inn med, så får du en lenke for å lage nytt passord. Lenken virker i én time.</p>}
      footer={
        <AccountLinks>
          <p>
            <Link href="/studio/logg-inn" className={ui.link}>
              Tilbake til innloggingen
            </Link>
          </p>
        </AccountLinks>
      }
    >
      <ResetRequestForm siteKey={turnstileSiteKey()} />
    </AuthShell>
  );
}

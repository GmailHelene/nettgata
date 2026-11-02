import Link from "next/link";
import { AccountLinks, ConfirmEmailForm, ResendForm } from "@/components/studio/account-forms";
import { AuthShell } from "@/components/studio/auth-shell";
import { ui } from "@/components/studio/ui";
import { getDb } from "@/db";
import { readVerifyToken } from "@/lib/selvbetjening/tokens";

export const metadata = { title: "Bekreft e-posten" };

/**
 * Siden bak lenken i bekreftelses-e-posten. Den viser bare en knapp: e-postprogrammer som åpner lenker for å
 * sjekke dem, skal ikke kunne bekrefte kontoen eller bruke opp lenken.
 */
export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await readVerifyToken(await getDb(), decodeURIComponent(token));
  const footer = (
    <AccountLinks>
      <p>
        <Link href="/studio/logg-inn" className={ui.link}>
          Til innloggingen
        </Link>
      </p>
    </AccountLinks>
  );
  if (!user) {
    return (
      <AuthShell
        title="Lenken virker ikke lenger"
        intro={<p>Den kan være brukt, eller eldre enn 48 timer. Er e-posten allerede bekreftet, logger du bare inn. Ellers kan du få en ny lenke.</p>}
        footer={footer}
      >
        <ResendForm />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Bekreft e-posten" intro={<p>Trykk på knappen for å bekrefte {user.email}. Etterpå er du logget inn og kan lage nettstedet.</p>} footer={footer}>
      <ConfirmEmailForm token={decodeURIComponent(token)} />
    </AuthShell>
  );
}

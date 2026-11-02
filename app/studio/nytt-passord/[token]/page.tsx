import Link from "next/link";
import { AccountLinks, NewPasswordForm } from "@/components/studio/account-forms";
import { AuthShell } from "@/components/studio/auth-shell";
import { ui } from "@/components/studio/ui";
import { getDb } from "@/db";
import { readResetToken } from "@/lib/selvbetjening/tokens";

export const metadata = { title: "Nytt passord" };

/** Siden bak lenken i e-posten om nytt passord. Lenken virker i én time og kan brukes én gang. */
export default async function NewPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await params).token);
  const user = await readResetToken(await getDb(), token);
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
      <AuthShell title="Lenken virker ikke lenger" intro={<p>Den kan være brukt, eller eldre enn én time.</p>} footer={footer}>
        <Link href="/studio/glemt-passord" className={`${ui.button} w-full`}>
          Be om en ny lenke
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Lag nytt passord"
      intro={<p>Når passordet er byttet, blir du logget ut overalt, og logger inn på nytt med det nye passordet.</p>}
      footer={footer}
    >
      <NewPasswordForm token={token} />
    </AuthShell>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/studio/auth-shell";
import { ui } from "@/components/studio/ui";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/studio");
  return (
    <AuthShell
      title="Logg inn i studioet"
      intro="Her bygger og driver du nettstedet ditt."
      footer={
        <p className={`mt-10 text-sm ${ui.muted}`}>
          Har du ikke konto ennå?{" "}
          <Link href="/#kom-i-gang" className={ui.link}>
            Kom i gang på nettgata.no
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}

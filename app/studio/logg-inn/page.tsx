import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/studio/auth-shell";
import { ui } from "@/components/studio/ui";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ passord?: string }> }) {
  if (await getCurrentUser()) redirect("/studio");
  const changed = (await searchParams).passord === "byttet";
  return (
    <AuthShell
      title="Logg inn i studioet"
      intro="Her bygger og driver du nettstedet ditt."
      footer={
        <div className={`mt-10 space-y-2 text-sm ${ui.muted}`}>
          <p>
            <Link href="/studio/glemt-passord" className={ui.link}>
              Glemt passord?
            </Link>
          </p>
          <p>
            Har du ikke konto ennå?{" "}
            <Link href="/studio/registrer" className={ui.link}>
              Prøv gratis
            </Link>
          </p>
        </div>
      }
    >
      {changed && (
        <p role="status" className={`${ui.success} mb-5`}>
          Passordet er byttet. Logg inn med det nye passordet.
        </p>
      )}
      <LoginForm />
    </AuthShell>
  );
}

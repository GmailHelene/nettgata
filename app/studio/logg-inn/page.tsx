import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/studio");
  return (
    <main className="mx-auto max-w-sm px-5 py-24">
      <h1 className="mb-8 text-2xl font-bold">Logg inn i studioet</h1>
      <LoginForm />
    </main>
  );
}

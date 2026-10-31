import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { twoFactorStatus } from "@/lib/two-factor";
import { AdminReset, TwoFactorSettings } from "./two-factor-settings";

export const metadata: Metadata = { title: "Konto" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const status = await twoFactorStatus(await getDb(), user.id);
  const usedRecovery = (await searchParams).reservekode === "brukt";

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <Link href="/studio" className="text-sm underline">
        Alle nettsteder
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Konto</h1>
      <p className="mt-1 text-neutral-700">{user.email}</p>

      {usedRecovery && (
        <p role="status" className="mt-6 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Du logget inn med en reservekode, og den kan ikke brukes igjen. Du har {status.recoveryLeft} igjen.
          {status.recoveryLeft <= 3 && " Lag nye reservekoder under, så du ikke går tom."}
        </p>
      )}

      <TwoFactorSettings email={user.email} enabled={status.enabled} recoveryLeft={status.recoveryLeft} />
      {user.isPlatformAdmin && <AdminReset />}
    </main>
  );
}

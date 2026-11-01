import type { Metadata } from "next";
import Link from "next/link";
import { heading } from "@/components/brand";
import { StudioTopBar } from "@/components/studio/top-bar";
import { ui } from "@/components/studio/ui";
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
    <>
      <StudioTopBar email={user.email} active="konto" />
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <Link href="/studio" className={`text-sm ${ui.link}`}>
          Alle nettsteder
        </Link>
        <h1 className={`${heading} mt-4 text-[2.4rem] leading-none sm:text-5xl`}>Konto</h1>
        <p className={`mt-3 ${ui.muted}`}>{user.email}</p>

        {usedRecovery && (
          <p role="status" className="mt-6 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            Du logget inn med en reservekode, og den kan ikke brukes igjen. Du har {status.recoveryLeft} igjen.
            {status.recoveryLeft <= 3 && " Lag nye reservekoder under, så du ikke går tom."}
          </p>
        )}

        <TwoFactorSettings email={user.email} enabled={status.enabled} recoveryLeft={status.recoveryLeft} />
        {user.isPlatformAdmin && <AdminReset />}
      </main>
    </>
  );
}

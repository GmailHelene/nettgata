import Link from "next/link";
import { getDb } from "@/db";
import { findInvitation, roles, type Role } from "@/lib/invitations";
import { getCurrentUser } from "@/lib/session";
import { AcceptForm } from "./accept-form";

/** Lenken i invitasjonen. Åpen for alle, men virker bare med en gyldig lenke. */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findInvitation(await getDb(), token);
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <h1 className="mb-2 text-2xl font-bold">Invitasjon</h1>
      {!found ? (
        <p className="text-neutral-700">Lenken virker ikke lenger. Den kan være brukt eller utløpt. Be den som inviterte deg om å sende en ny.</p>
      ) : (
        <>
          <p className="mb-6 text-neutral-700">
            Du er invitert til <strong>{found.siteName}</strong> som {roles[found.invitation.role as Role].toLowerCase()}.
          </p>
          {user && user.email !== found.invitation.email ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
              Du er logget inn som {user.email}, men invitasjonen gjelder {found.invitation.email}. Logg ut og åpne lenken igjen.
            </p>
          ) : user ? (
            <AcceptForm token={token} mode="existing" email={found.invitation.email} owner={found.invitation.role === "owner"} />
          ) : (
            <>
              <AcceptForm token={token} mode="new" email={found.invitation.email} owner={found.invitation.role === "owner"} />
              <p className="mt-6 text-sm text-neutral-600">
                Har du allerede bruker med {found.invitation.email}?{" "}
                <Link href="/studio/logg-inn" className="underline">
                  Logg inn
                </Link>{" "}
                og åpne lenken igjen.
              </p>
            </>
          )}
        </>
      )}
    </main>
  );
}

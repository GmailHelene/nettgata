import Link from "next/link";

/** Når en side ikke finnes, både på nettgata.no og på kundenes nettsteder. Nøytral, så den passer overalt. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-5 py-16 text-neutral-900">
      <p className="text-sm font-semibold uppercase tracking-wider text-neutral-600">404</p>
      <h1 className="mt-2 text-3xl font-bold">Fant ikke siden</h1>
      <p className="mt-4 text-lg text-neutral-700">Adressen kan være skrevet feil, eller siden kan være flyttet eller slettet.</p>
      <p className="mt-8">
        <Link href="/" className="rounded-md bg-neutral-900 px-5 py-3 font-semibold text-white">
          Til forsiden
        </Link>
      </p>
    </main>
  );
}

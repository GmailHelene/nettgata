/** Forklaring til medarbeidere som ser en side bare eieren kan endre. Sier hvorfor, ikke bare at det er sperret. */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  return <p className="mb-6 rounded-md bg-neutral-100 p-3 text-sm text-neutral-800">{children}</p>;
}

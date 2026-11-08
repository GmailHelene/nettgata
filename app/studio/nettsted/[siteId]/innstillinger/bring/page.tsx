import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Frakt og levering" };

/** Bring-siden heter nå Frakt og levering. Gamle lenker og bokmerker sendes videre. */
export default async function OldBringPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  redirect(`/studio/nettsted/${siteId}/innstillinger/frakt`);
}

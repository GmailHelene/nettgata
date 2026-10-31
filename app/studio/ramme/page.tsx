import type { Metadata } from "next";
import { FrameView } from "./frame-view";

export const metadata: Metadata = { title: "Forhåndsvisning" };

/**
 * Siden som vises inne i forhåndsvisningen i redigereren. Den henter ingen data selv. Alt innhold
 * kommer fra redigereren via postMessage, så siden trenger ingen egen tilgangssjekk. Åpnet alene
 * viser den ingenting.
 */
export default function FramePage() {
  return <FrameView />;
}

import type { Theme } from "@/lib/theme";
import type { RenderContext } from "@/components/sections";
import type { PageContent } from "@/lib/content/types";

/**
 * Forhåndsvisningen i redigereren er en egen side i en iframe. Da får mobilvisningen ekte mobilbredde,
 * så sidens regler for skjermbredde slår inn akkurat som på en telefon.
 */
export const FRAME_PATH = "/studio/ramme";

export type FrameCommand = "undo" | "redo" | "save";

/** Fra redigereren til rammen. */
export type ToFrame =
  | { type: "nettgata:init"; ctx: RenderContext; theme: Theme }
  /** `view`: bare visning (temagalleriet), uten omriss og valg av seksjoner. */
  | { type: "nettgata:update"; content: PageContent; selectedId: string | null; scale: number; view?: boolean }
  | { type: "nettgata:scrollTo"; id: string; seq: number };

/** Fra rammen til redigereren. */
export type FromFrame =
  | { type: "nettgata:ready" }
  | { type: "nettgata:select"; id: string }
  | { type: "nettgata:command"; command: FrameCommand };

/**
 * Godtar bare meldinger fra samme nettsted og fra det vinduet vi venter på. Andre faner og
 * nettsteder kan sende meldinger til et vindu, så begge deler sjekkes hver gang.
 */
export function readMessage<T extends { type: string }>(event: MessageEvent, expected: MessageEventSource | null | undefined): T | null {
  if (event.origin !== window.location.origin || !expected || event.source !== expected) return null;
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null) return null;
  const type = (data as { type?: unknown }).type;
  return typeof type === "string" && type.startsWith("nettgata:") ? (data as T) : null;
}

"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { saveDraftAction, type ActionState } from "@/app/studio/actions";
import type { Doc } from "./editor-history";

/** Så lenge venter vi etter siste endring før kladden lagres. */
const AUTOSAVE_MS = 1500;

/**
 * Lagrer kladden automatisk kort tid etter siste endring. `blocked` er grunnen til at kladden ikke kan
 * lagres akkurat nå (for eksempel tom sidetittel), og vises i stedet for å sende noe til serveren.
 */
export function useAutosave(pageId: string, doc: Doc, blocked: string | null) {
  const snapshot = useMemo(() => JSON.stringify(doc), [doc]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const latest = useRef({ doc, snapshot, blocked });
  const saved = useRef(snapshot);
  const inFlight = useRef<Promise<ActionState> | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    latest.current = { doc, snapshot, blocked };
  });

  const saveNow = async (): Promise<ActionState> => {
    // Én lagring om gangen, så en eldre versjon aldri kan komme fram etter en nyere.
    while (inFlight.current) await inFlight.current;
    const current = latest.current;
    if (current.blocked) return { ok: false, message: `Ikke lagret. ${current.blocked}` };
    if (current.snapshot === saved.current) return null;

    setSaving(true);
    const request = saveDraftAction(pageId, current.doc.title, current.doc.content, { quiet: true }).catch(
      (): ActionState => ({ ok: false, message: "Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen." }),
    );
    inFlight.current = request;
    const result = await request;
    inFlight.current = null;
    setSaving(false);
    if (result?.ok) {
      saved.current = current.snapshot;
      setSavedSnapshot(current.snapshot);
      setSavedAt(new Date());
      setError(null);
    } else {
      setError(result?.message ?? "Noe gikk galt. Prøv igjen.");
    }
    return result;
  };

  const dirty = snapshot !== savedSnapshot;
  const autosave = useEffectEvent(() => void saveNow());
  useEffect(() => {
    if (!dirty || blocked) return;
    const timer = window.setTimeout(() => autosave(), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [snapshot, dirty, blocked]);

  // Advarer før fanen lukkes eller lastes på nytt med endringer som ikke er lagret.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return {
    dirty,
    saving,
    error,
    savedAt,
    saveNow,
    /** Brukes når kladden byttes ut på serveren og siden lastes på nytt med vilje. */
    allowLeave: () => {
      leaving.current = true;
    },
  };
}

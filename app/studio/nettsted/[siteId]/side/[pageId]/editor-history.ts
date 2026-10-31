import type { PageContent } from "@/lib/content/types";

export type Doc = { title: string; content: PageContent };

export type History = {
  past: Doc[];
  present: Doc;
  future: Doc[];
  /** Hva forrige endring gjaldt, for eksempel "seksjon:abc". Brukes til å slå sammen tastetrykk. */
  lastKey: string | null;
  lastAt: number;
};

export type HistoryAction =
  | { type: "edit"; doc: Doc; key: string | null; at: number }
  | { type: "undo" }
  | { type: "redo" };

/** Så mange steg kan angres. */
export const HISTORY_LIMIT = 100;
/** Endringer i samme seksjon med kortere pause enn dette blir ett angresteg, ikke ett per tastetrykk. */
export const GROUP_MS = 1000;

export function initHistory(doc: Doc): History {
  return { past: [], present: doc, future: [], lastKey: null, lastAt: 0 };
}

/**
 * Angre og gjør om for hele siden. `key: null` betyr at endringen alltid blir et eget steg
 * (flytte, slette, legge til). Skriving i samme seksjon slås sammen så lenge det ikke er pause.
 */
export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case "edit": {
      const grouped = action.key !== null && action.key === state.lastKey && action.at - state.lastAt < GROUP_MS;
      return {
        past: grouped ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: action.doc,
        future: [],
        lastKey: action.key,
        lastAt: action.at,
      };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], lastKey: null, lastAt: 0 };
    }
    case "redo": {
      const [next, ...future] = state.future;
      if (!next) return state;
      return { past: [...state.past, state.present], present: next, future, lastKey: null, lastAt: 0 };
    }
  }
}

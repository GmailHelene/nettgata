"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PageRenderer, type RenderContext } from "@/components/sections";
import type { PageContent } from "@/lib/content/types";
import type { Theme } from "@/lib/theme";
import { readMessage, type FrameCommand, type FromFrame, type ToFrame } from "./protocol";

/**
 * Omriss og navnelapp på seksjonene. Målene deles på skaleringen, så de er like tydelige når
 * forhåndsvisningen er krympet for å få plass ved siden av skjemaet.
 */
const editorCss = `
[data-section-id] { position: relative; cursor: pointer; scroll-margin-top: 96px; }
[data-section-id]::after { content: ""; position: absolute; inset: 0; z-index: 30; pointer-events: none; }
[data-section-id]:hover::after { box-shadow: inset 0 0 0 calc(2px / var(--ed-scale, 1)) rgb(37 99 235 / 0.6); }
[data-section-id][data-selected]::after { box-shadow: inset 0 0 0 calc(3px / var(--ed-scale, 1)) #2563eb; }
[data-section-id][data-selected]::before {
  content: attr(data-section-label);
  position: absolute;
  z-index: 31;
  pointer-events: none;
  top: calc(8px / var(--ed-scale, 1));
  left: calc(8px / var(--ed-scale, 1));
  padding: calc(2px / var(--ed-scale, 1)) calc(8px / var(--ed-scale, 1));
  border-radius: calc(4px / var(--ed-scale, 1));
  background: #2563eb;
  color: #fff;
  font-family: system-ui, sans-serif;
  font-size: calc(12px / var(--ed-scale, 1));
  font-weight: 600;
  line-height: 1.5;
}
`;

type Setup = { ctx: RenderContext; theme: Theme };
type View = { content: PageContent; selectedId: string | null; scale: number; view?: boolean };

export function FrameView() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ id: string; seq: number } | null>(null);
  const scrolled = useRef(0);

  useEffect(() => {
    // Åpnet alene, utenfor redigereren: da er det ingenting å vise.
    if (window.parent === window) return;
    const post = (message: FromFrame) => window.parent.postMessage(message, window.location.origin);

    const onMessage = (event: MessageEvent) => {
      const message = readMessage<ToFrame>(event, window.parent);
      if (message?.type === "nettgata:init") setSetup({ ctx: message.ctx, theme: message.theme });
      else if (message?.type === "nettgata:update")
        setView({ content: message.content, selectedId: message.selectedId, scale: message.scale, view: message.view });
      else if (message?.type === "nettgata:scrollTo") setScrollTarget({ id: message.id, seq: message.seq });
    };
    // Siden skal vises, ikke brukes. Et klikk velger seksjonen i stedet for å følge lenker eller trykke på knapper.
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const section = event.target instanceof Element ? event.target.closest("[data-section-id]") : null;
      const id = section?.getAttribute("data-section-id");
      if (id) post({ type: "nettgata:select", id });
    };
    const block = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    // Angre, gjør om og lagre virker også når forhåndsvisningen har fokus.
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const command: FrameCommand | null =
        key === "s" ? "save" : key === "y" || (key === "z" && event.shiftKey) ? "redo" : key === "z" ? "undo" : null;
      if (!command) return;
      event.preventDefault();
      post({ type: "nettgata:command", command });
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("click", onClick, true);
    window.addEventListener("auxclick", block, true);
    window.addEventListener("submit", block, true);
    window.addEventListener("keydown", onKey, true);
    post({ type: "nettgata:ready" });
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("auxclick", block, true);
      window.removeEventListener("submit", block, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  // Beskjeden om å rulle kan komme før den nye seksjonen er tegnet. Da prøver vi igjen etter neste oppdatering.
  useEffect(() => {
    if (!scrollTarget || scrolled.current === scrollTarget.seq) return;
    const section = document.querySelector(`[data-section-id="${CSS.escape(scrollTarget.id)}"]`);
    if (!section) return;
    scrolled.current = scrollTarget.seq;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollTarget, view]);

  if (!setup || !view) return null;
  return (
    <div style={{ "--ed-scale": view.scale } as CSSProperties}>
      {!view.view && <style>{editorCss}</style>}
      <PageRenderer content={view.content} theme={setup.theme} ctx={setup.ctx} editor={view.view ? undefined : { selectedId: view.selectedId }} />
    </div>
  );
}

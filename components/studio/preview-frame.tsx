"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { RenderContext } from "@/components/sections";
import type { PageContent } from "@/lib/content/types";
import type { Theme } from "@/lib/theme";
import { FRAME_PATH, readMessage, type FrameCommand, type FromFrame, type ToFrame } from "@/app/studio/ramme/protocol";

export type Device = "datamaskin" | "mobil";

/** Bredden siden tegnes i. Mobil er en vanlig telefon, datamaskin en vanlig bærbar. */
export const deviceWidth: Record<Device, number> = { datamaskin: 1280, mobil: 390 };

function send(frame: HTMLIFrameElement | null, message: ToFrame) {
  frame?.contentWindow?.postMessage(message, window.location.origin);
}

/**
 * Siden tegnes i full bredde inne i en iframe og skaleres ned til plassen den har. Fordi iframen har
 * sin egen bredde, ser mobilvisningen ut akkurat som på en telefon.
 */
export function PreviewFrame({
  ctx,
  theme,
  content,
  selectedId,
  device,
  scrollTo,
  onSelect,
  onCommand,
  editable = true,
  title = "Forhåndsvisning av siden",
}: {
  ctx: RenderContext;
  theme: Theme;
  content: PageContent;
  selectedId: string | null;
  device: Device;
  scrollTo: { id: string; seq: number } | null;
  onSelect: (id: string) => void;
  onCommand: (command: FrameCommand) => void;
  /** Av i temagalleriet: da er siden bare til å se på, uten omriss og valg av seksjoner. */
  editable?: boolean;
  title?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  // Øker hver gang rammen melder at den er klar, også hvis den lastes på nytt.
  const [connection, setConnection] = useState(0);

  const width = deviceWidth[device];
  const scale = box.width ? Math.min(1, box.width / width) : 1;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const receive = useEffectEvent((message: FromFrame) => {
    if (message.type === "nettgata:ready") setConnection((n) => n + 1);
    else if (message.type === "nettgata:select") onSelect(message.id);
    else if (message.type === "nettgata:command") onCommand(message.command);
  });
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = readMessage<FromFrame>(event, frameRef.current?.contentWindow);
      if (message) receive(message);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (connection) send(frameRef.current, { type: "nettgata:init", ctx, theme });
  }, [connection, ctx, theme]);

  useEffect(() => {
    if (connection) send(frameRef.current, { type: "nettgata:update", content, selectedId, scale, view: !editable });
  }, [connection, content, selectedId, scale, editable]);

  useEffect(() => {
    if (connection && scrollTo) send(frameRef.current, { type: "nettgata:scrollTo", id: scrollTo.id, seq: scrollTo.seq });
  }, [connection, scrollTo]);

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden">
      <iframe
        ref={frameRef}
        src={FRAME_PATH}
        title={title}
        // Forhåndsvisningen er et bilde av siden. Tastaturbrukere redigerer i skjemaet ved siden av.
        tabIndex={-1}
        className={`absolute top-0 border-0 bg-white ${device === "mobil" ? "shadow-lg ring-1 ring-black/10" : ""}`}
        style={{
          width,
          height: box.height ? box.height / scale : 0,
          left: Math.max(0, (box.width - width * scale) / 2),
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}

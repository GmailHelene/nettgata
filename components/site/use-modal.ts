"use client";

import { useEffect, type RefObject } from "react";

/**
 * Gjør en dialog som ligger i en portal på <body>, modal for tastatur og skjermleser (WCAG 2.4.3):
 * resten av siden blir inert mens den er åpen, så Tab holder seg inne i dialogen, og fokus går tilbake
 * til knappen som åpnet den når den lukkes.
 */
export function useModal(open: boolean, dialogRef: RefObject<HTMLElement | null>, openerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const others = Array.from(document.body.children).filter((el): el is HTMLElement => el instanceof HTMLElement && !el.contains(dialog));
    const before = others.map((el) => el.inert);
    for (const el of others) el.inert = true;
    const opener = openerRef.current;
    return () => {
      others.forEach((el, i) => (el.inert = before[i]));
      opener?.focus();
    };
  }, [open, dialogRef, openerRef]);
}

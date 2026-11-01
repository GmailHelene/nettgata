"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "./use-modal";

/** Menyskuff for mobil. Lukkes med Esc, ved klikk utenfor og når du velger en side. */
export function MobileMenu({
  items,
  currentPath,
  siteName,
}: {
  items: { path: string; href: string; title: string }[];
  currentPath: string;
  siteName: string;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModal(open, dialogRef, openRef);
  const [styleVars, setStyleVars] = useState<React.CSSProperties>();
  useEffect(() => {
    if (!open || !openRef.current) return;
    const computed = getComputedStyle(openRef.current);
    const vars = ["--c-primary", "--c-on-primary", "--c-bg", "--c-surface", "--c-text", "--c-muted", "--f-heading", "--f-body", "--radius"];
    setStyleVars(Object.fromEntries(vars.map((v) => [v, computed.getPropertyValue(v)])) as React.CSSProperties);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (items.length < 2) return null;
  return (
    <>
      <button
        ref={openRef}
        type="button"
        aria-label="Åpne meny"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="-ml-2 p-2 md:hidden"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={dialogRef}
            style={styleVars}
            className="fixed inset-0 z-50 font-[family-name:var(--f-body)] text-[var(--c-text)] md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Meny"
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <nav className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-[var(--c-bg)] p-6 shadow-xl">
              <div className="mb-8 flex items-center justify-between">
                <span className="font-[family-name:var(--f-heading)] text-lg font-bold">{siteName}</span>
                <button ref={closeRef} type="button" aria-label="Lukk meny" onClick={() => setOpen(false)} className="p-2">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.path}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={item.path === currentPath ? "page" : undefined}
                      className="block rounded-[var(--radius)] px-3 py-3 text-lg aria-[current=page]:bg-[var(--c-surface)] aria-[current=page]:font-semibold"
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}

"use client";

/**
 * Sendeknapp som spør før skjemaet sendes. Til sletting av persondata og annet som ikke kan angres (WCAG 3.3.4).
 * Brukes inne i et vanlig <form action={...}>, så handlingen kjører på serveren som før.
 */
export function ConfirmButton({ question, className, label, children }: { question: string; className?: string; label?: string; children: React.ReactNode }) {
  return (
    <button
      className={className}
      aria-label={label}
      onClick={(e) => {
        if (!confirm(question)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

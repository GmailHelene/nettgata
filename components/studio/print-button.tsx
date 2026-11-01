"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white">
      Skriv ut
    </button>
  );
}

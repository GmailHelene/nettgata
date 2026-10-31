export type CsvCell = string | number | null | undefined;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Tekst som starter med = + - @ kan kjøres som formel når filen åpnes i Excel.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Semikolon som skilletegn og BOM først, så norsk Excel åpner filen med riktige kolonner og æøå. */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

/** Øre som kroner med desimalkomma, slik norsk Excel leser tall: 1299,50. */
export function csvKroner(ore: number): string {
  return (ore / 100).toFixed(2).replace(".", ",");
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename.replace(/[^a-z0-9._-]/gi, "-")}"`,
      "cache-control": "no-store",
    },
  });
}

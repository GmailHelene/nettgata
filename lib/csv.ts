export type CsvCell = string | number | null | undefined;

/** Byte order mark. Uten den tror Excel at filen er Windows-1252, og æøå blir feil. */
const BOM = String.fromCharCode(0xfeff);

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Tekst som starter med = + - @ kan kjøres som formel når filen åpnes i Excel.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Semikolon som skilletegn og BOM først, så norsk Excel åpner filen med riktige kolonner og æøå. */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  return BOM + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
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

/**
 * Leser CSV fra Excel, Numbers eller Google Regneark. Skilletegnet (semikolon eller komma) finnes
 * fra overskriftslinjen. Apostrofen vi setter foran formler ved eksport, fjernes igjen.
 */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith(BOM) ? text.slice(1) : text;
  const lineEnd = input.search(/[\r\n]/);
  const firstLine = lineEnd === -1 ? input : input.slice(0, lineEnd);
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows
    .map((r) => r.map((value) => (/^'[=+\-@]/.test(value) ? value.slice(1) : value)))
    .filter((r) => r.some((value) => value.trim() !== ""));
}

/**
 * Minimal ZIP-skriver for eksporten. Filene lagres ukomprimert (STORE): bildene er komprimert fra før, og tekstfilene
 * er små. Det gjør at ZIP-filen kan bygges i biter over flere kjøringer: hver bit er en rekke ferdige filer, og
 * katalogen (central directory) skrives til slutt fra listen over filer som er lagt inn. Ingen avhengigheter, og
 * aldri mer i minnet enn biten som bygges.
 * Formatet: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT (uten ZIP64, så maks 4 GB og 65 535 filer).
 */

export type ZipEntry = { name: string; crc: number; size: number; offset: number; dosTime: number; dosDate: number };

export const ZIP_MAX_BYTES = 0xffff_ffff;
export const ZIP_MAX_ENTRIES = 0xffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Tidspunktet i norsk tid, slik ZIP lagrer det (uten tidssone). */
export function dosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Oslo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return {
    dosTime: (parts.hour << 11) | (parts.minute << 5) | Math.floor(parts.second / 2),
    dosDate: ((Math.max(parts.year, 1980) - 1980) << 9) | (parts.month << 5) | parts.day,
  };
}

const encoder = new TextEncoder();
/** Bit 11: filnavnet er UTF-8, så æ, ø og å blir riktig i Windows, macOS og Linux. */
const UTF8_FLAG = 0x0800;

/** Hodet foran hver fil, med navn. Dataene følger rett etter. */
export function localHeader(entry: Omit<ZipEntry, "offset">): Uint8Array {
  const name = encoder.encode(entry.name);
  const out = new Uint8Array(30 + name.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(6, UTF8_FLAG, true);
  v.setUint16(8, 0, true); // STORE
  v.setUint16(10, entry.dosTime, true);
  v.setUint16(12, entry.dosDate, true);
  v.setUint32(14, entry.crc, true);
  v.setUint32(18, entry.size, true);
  v.setUint32(22, entry.size, true);
  v.setUint16(26, name.length, true);
  v.setUint16(28, 0, true);
  out.set(name, 30);
  return out;
}

/** Katalogen over alle filene og avslutningen. Det siste som skrives i ZIP-filen. */
export function centralDirectory(entries: ZipEntry[], offset: number): Uint8Array {
  const records = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    const out = new Uint8Array(46 + name.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 0x031e, true); // laget på Unix, versjon 3.0
    v.setUint16(6, 20, true);
    v.setUint16(8, UTF8_FLAG, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, entry.dosTime, true);
    v.setUint16(14, entry.dosDate, true);
    v.setUint32(16, entry.crc, true);
    v.setUint32(20, entry.size, true);
    v.setUint32(24, entry.size, true);
    v.setUint16(28, name.length, true);
    v.setUint16(30, 0, true);
    v.setUint16(32, 0, true);
    v.setUint16(34, 0, true);
    v.setUint16(36, 0, true);
    v.setUint32(38, (0o100644 << 16) >>> 0, true); // vanlig fil, rw-r--r--
    v.setUint32(42, entry.offset, true);
    out.set(name, 46);
    return out;
  });
  const size = records.reduce((sum, r) => sum + r.length, 0);
  const end = new Uint8Array(22);
  const v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, entries.length, true);
  v.setUint16(10, entries.length, true);
  v.setUint32(12, size, true);
  v.setUint32(16, offset, true);
  return concat([...records, end]);
}

export function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Leser en ZIP laget av denne filen. Brukes av testene for å sjekke innholdet. */
export function readZip(data: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("Fant ikke slutten av ZIP-filen");
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error("Ødelagt katalog i ZIP-filen");
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 20, true);
    const nameLength = v.getUint16(at + 28, true);
    const extra = v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
    const offset = v.getUint32(at + 42, true);
    const name = decoder.decode(data.subarray(at + 46, at + 46 + nameLength));
    if (v.getUint32(offset, true) !== 0x04034b50) throw new Error(`Ødelagt filhode for ${name}`);
    const start = offset + 30 + v.getUint16(offset + 26, true) + v.getUint16(offset + 28, true);
    const body = data.subarray(start, start + size);
    if (crc32(body) !== crc) throw new Error(`Feil kontrollsum for ${name}`);
    files.set(name, body);
    at += 46 + nameLength + extra;
  }
  return files;
}

// Lager delingsbildene (1200 x 630) og logoen til nettgata.no i public/nettgata/.
// Kjør på nytt når teksten eller prisene endres: node scripts/lag-og-bilder.mjs
// sharp følger med Next.js, så skriptet trenger ingen egne pakker.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = new URL("../public/nettgata/", import.meta.url);
await mkdir(out, { recursive: true });

const blue = "#173b6c";
const ink = "#1b232b";
const font = "Bahnschrift, 'Segoe UI', Arial, sans-serif";

/** Gateskiltet: hvit kant og hvit skrift på gateblått. */
function sign(x, y, scale = 1) {
  const w = 300 * scale;
  const h = 74 * scale;
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${10 * scale}" fill="${blue}"/>
    <rect x="${x + 7 * scale}" y="${y + 7 * scale}" width="${w - 14 * scale}" height="${h - 14 * scale}" rx="${6 * scale}" fill="none" stroke="#fff" stroke-width="${4 * scale}"/>
    <text x="${x + w / 2}" y="${y + h / 2 + 13 * scale}" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${38 * scale}" letter-spacing="${6 * scale}" fill="#fff">NETTGATA</text>
  </g>`;
}

/** Fem trehus i gata, i samme farger som på forsiden. */
function street() {
  const houses = [
    ["#c9dce6", "saltak", 0],
    ["#e3b04b", "flatt", 30],
    ["#a13a2c", "saltak", 12],
    ["#e6e1d7", "flatt", 40],
    ["#2f5a47", "saltak", 6],
  ];
  const w = 196;
  const gap = 14;
  const base = 630;
  return houses
    .map(([wall, roof, lift], i) => {
      const x = 40 + i * (w + gap);
      const top = 470 - lift;
      const r =
        roof === "saltak"
          ? `<polygon points="${x - 7},${top} ${x + w / 2},${top - 44} ${x + w + 7},${top}" fill="#2b3238"/>`
          : `<rect x="${x - 5}" y="${top - 10}" width="${w + 10}" height="10" rx="2" fill="#2b3238"/>`;
      return `${r}
      <rect x="${x}" y="${top}" width="${w}" height="${base - top}" fill="${wall}"/>
      <rect x="${x + 22}" y="${top + 24}" width="${w - 44}" height="70" rx="4" fill="#fff" opacity="0.92"/>
      <rect x="${x + w / 2 - 20}" y="${base - 56}" width="40" height="56" rx="3" fill="${ink}" opacity="0.85"/>`;
    })
    .join("");
}

function card(title, sub) {
  const lines = title.split("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f2f4f5"/>
  ${sign(60, 54, 0.9)}
  ${lines
    .map(
      (line, i) =>
        `<text x="60" y="${215 + i * 78}" font-family="${font}" font-weight="700" font-size="68" fill="${ink}">${line}</text>`,
    )
    .join("")}
  <text x="62" y="${215 + lines.length * 78 + 6}" font-family="${font}" font-size="32" fill="#47525c">${sub}</text>
  ${street()}
  <rect x="0" y="626" width="1200" height="4" fill="${ink}"/>
</svg>`;
}

const cards = {
  "og-forside.png": card("Nettside og nettbutikk\nfor norske bedrifter", "Fra 199 kr i måneden eks. mva · Domenet står i ditt navn"),
  "og-nettbutikk.png": card("Nettbutikk med\nVipps og kort", "399 kr i måneden eks. mva · Ingen andel av salget"),
  "og-bransjer.png": card("Nettside for din bransje,\nferdig satt opp", "45 bransjepakker · 12 temaer · Fra 199 kr i måneden eks. mva"),
};

for (const [name, svg] of Object.entries(cards)) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(fileURLToPath(new URL(name, out)));
  console.log("Laget", name);
}

const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ffffff"/>
  ${sign(31, 207, 1.5)}
</svg>`;
await sharp(Buffer.from(logo)).png({ compressionLevel: 9, palette: true }).toFile(fileURLToPath(new URL("logo.png", out)));
console.log("Laget logo.png");

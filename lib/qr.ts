/**
 * QR-koder for oppsett av tofaktorinnlogging, uten eksterne biblioteker og uten å sende hemmeligheten
 * til en tjeneste. Byte-modus med feilretting M (QR-standarden ISO/IEC 18004), samme oppbygging som
 * Nayukis referanseimplementasjon. Kontrollert modul for modul mot segno og lest tilbake med OpenCV.
 */

// Feilretting M. Indeks er versjonen (1-40), posisjon 0 brukes ikke.
const ECC_CODEWORDS_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28,
];
const NUM_BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43,
  45, 47, 49,
];
/** Formatbitene for M er 00. */
const FORMAT_BITS_M = 0;

function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (ver: number) => Math.floor(rawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK_M[ver] * NUM_BLOCKS_M[ver];

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

// Reed-Solomon over GF(256) med polynomet 0x11D.
function rsMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= rsMultiply(coef, factor)));
  }
  return result;
}

/** Bare for tester: feilrettingen sjekkes mot kjente svar fra standarden og fra segno. */
export const reedSolomonForTests = { rsDivisor, rsRemainder };

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

/** Modulene som rader av true (mørk) og false (lys), uten stille sone. */
export function qrMatrix(text: string, forcedMask?: number): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  const bitsNeeded = (v: number) => 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
  while (ver <= 40 && bitsNeeded(ver) > dataCodewords(ver) * 8) ver++;
  if (ver > 40) throw new Error("Teksten er for lang for en QR-kode");

  // Databitene: modus 0100 (byte), lengde, innhold, avslutning og fyll.
  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  append(0b0100, 4);
  append(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) append(b, 8);
  const capacity = dataCodewords(ver) * 8;
  append(0, Math.min(4, capacity - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) append(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));

  // Del i blokker, legg til feilretting og fletter blokkene sammen.
  const numBlocks = NUM_BLOCKS_M[ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK_M[ver];
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) codewords.push(block[i]);
    });
  }

  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFunction = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  // Tidsmønster, finnermønstre, justeringsmønstre, format og versjon.
  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  const align = alignmentPositions(ver);
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      const corner = (i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) setFunction(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  const drawFormat = (mask: number) => {
    const formatData = (FORMAT_BITS_M << 3) | mask;
    let rem = formatData;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const formatBits = ((formatData << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFunction(8, i, bit(formatBits, i));
    setFunction(8, 7, bit(formatBits, 6));
    setFunction(8, 8, bit(formatBits, 7));
    setFunction(7, 8, bit(formatBits, 8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(formatBits, i));
    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(formatBits, i));
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(formatBits, i));
    setFunction(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const versionBits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, bit(versionBits, i));
      setFunction(b, a, bit(versionBits, i));
    }
  }

  // Dataene i sikksakk fra nederste høyre hjørne.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < codewords.length * 8) {
          modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }

  const masked = (mask: number) =>
    modules.map((row, y) =>
      row.map((dark, x) => {
        if (isFunction[y][x]) return dark;
        const invert = [
          (x + y) % 2 === 0,
          y % 2 === 0,
          x % 3 === 0,
          (x + y) % 3 === 0,
          (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
          ((x * y) % 2) + ((x * y) % 3) === 0,
          (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
          (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
        ][mask];
        return dark !== invert;
      }),
    );

  /**
   * Straffepoeng etter standarden: lange like rader (N1), 2x2-blokker (N2), mønstre som ligner
   * hjørnemerkene (N3) og skjev fordeling av mørkt og lyst (N4). Uten N3 kan en maske lage striper som
   * enkle lesere og noen mobilkameraer forveksler med hjørnemerkene. Samme regler som Nayuki.
   */
  const penalty = (m: boolean[][]) => {
    let score = 0;
    const addHistory = (run: number, history: number[]) => {
      if (history[0] === 0) run += size; // lys kant før første løp
      history.pop();
      history.unshift(run);
    };
    const countFinderLike = (history: number[]) => {
      const n = history[1];
      const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
      return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
    };
    const lines = [m, m[0].map((_, x) => m.map((row) => row[x]))];
    for (const group of lines) {
      for (const line of group) {
        let runColor = false;
        let run = 0;
        const history = [0, 0, 0, 0, 0, 0, 0];
        for (const dark of line) {
          if (dark === runColor) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score++;
          } else {
            addHistory(run, history);
            if (!runColor) score += countFinderLike(history) * 40;
            runColor = dark;
            run = 1;
          }
        }
        // Avslutt linjen med lys kant, som om symbolet hadde stille sone.
        if (runColor) {
          addHistory(run, history);
          run = 0;
        }
        addHistory(run + size, history);
        score += countFinderLike(history) * 40;
      }
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
      }
    }
    const dark = m.flat().filter(Boolean).length;
    const total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  };

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    if (forcedMask !== undefined && mask !== forcedMask) continue;
    drawFormat(mask);
    const candidate = masked(mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best as boolean[][];
}

/** QR-kode som SVG, med stille sone på fire moduler. Mørke moduler i én sti, så filen blir liten. */
export function qrSvg(text: string, label: string): string {
  const matrix = qrMatrix(text);
  const border = 4;
  const dim = matrix.length + border * 2;
  let path = "";
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x + border} ${y + border}h1v1h-1z`;
    }),
  );
  const safeLabel = label.replace(/[<>&"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="${safeLabel}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

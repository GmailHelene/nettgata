import { ShopError } from "@/lib/shop/catalog";
import { platformUrl } from "@/lib/site-url";
import type { BringProductId } from "./products";
import type { BringEnvironment, BringSender } from "./state";

/**
 * Kall mot Bring. Dokumentasjon og kilder: docs/BRING.md.
 * - Shipping Guide API v2: pris og leveringstid (POST /api/v2/products)
 * - Booking API: bestilling og etikett (POST /booking/api/create)
 * Forespørslene logges aldri, fordi hodene inneholder Mybring-brukeren og API-nøkkelen.
 */
export const BRING_SHIPPING_GUIDE_URL = "https://api.bring.com/shippingguide/api/v2/products";
export const BRING_BOOKING_URL = "https://api.bring.com/booking/api/create";

export type BringCredentials = { uid: string; apiKey: string };
export type PackageCm = { length: number; width: number; height: number };

/**
 * Feil fra Bring, med en melding som kan vises til butikkeieren. Meldingen inneholder aldri nøkler.
 * Den arver ShopError, så studioets handlinger viser den som den er.
 */
export class BringError extends ShopError {
  constructor(
    message: string,
    readonly info: { status?: number; code?: string } = {},
  ) {
    super(message);
    this.name = "BringError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const short = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 200);

type BringResponse = { status: number; ok: boolean; body: unknown };

async function callBring(url: string, init: RequestInit, timeoutMs: number): Promise<BringResponse> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new BringError("Fikk ikke kontakt med Bring. Prøv igjen om litt.", { status: 0 });
  }
  const text = await res.text().catch(() => "");
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = short(text);
    }
  }
  return { status: res.status, ok: res.ok, body };
}

/** Hodene Bring krever i alle kall (developer.bring.com/api, «Authentication»). */
function authHeaders(creds: BringCredentials): Record<string, string> {
  return {
    "X-Mybring-API-Uid": creds.uid,
    "X-Mybring-API-Key": creds.apiKey,
    "X-Bring-Client-URL": platformUrl(),
    Accept: "application/json",
  };
}

/** Feltfeil fra Bring (400 og 500 har fieldErrors). Bare teksten, aldri noe fra forespørselen. */
function fieldError(body: unknown): string | undefined {
  const first = asRecord(asArray(asRecord(body).fieldErrors)[0]);
  const message = asString(first.message);
  return message ? short(message) : typeof body === "string" && body ? short(body) : undefined;
}

function httpError(res: BringResponse, action: string): BringError {
  if (res.status === 401) {
    return new BringError(
      "Bring godtok ikke Mybring-brukeren og API-nøkkelen. Sjekk at du har brukt e-postadressen du logger inn i Mybring med, og API-nøkkelen som hører til den brukeren.",
      { status: 401 },
    );
  }
  if (res.status === 403) {
    return new BringError("Bring sier at Mybring-brukeren ikke har tilgang til dette. Sjekk i Mybring at brukeren har tilgang til kundenummeret.", { status: 403 });
  }
  if (res.status === 429) return new BringError("Bring får for mange forespørsler akkurat nå. Prøv igjen om litt.", { status: 429 });
  if (res.status >= 500) return new BringError(`Bring svarer ikke som det skal akkurat nå (feil ${res.status}). Prøv igjen om litt.`, { status: res.status });
  const detail = fieldError(res.body);
  return new BringError(`Bring avviste ${action} (feil ${res.status}${detail ? `: ${detail}` : ""}).`, { status: res.status });
}

// ---------- Pris og leveringstid (Shipping Guide API v2) ----------

export type QuoteInput = {
  fromPostalCode: string;
  toPostalCode: string;
  weightGrams: number;
  packageCm: PackageCm | null;
  products: BringProductId[];
  customerNumber: string;
  atPostOffice: boolean;
};

/** Én sending med én pakke, og alle tjenestene i samme forespørsel. Vekt i gram, mål i centimeter. */
export function shippingGuideRequest(q: QuoteInput) {
  return {
    language: "NO",
    withPrice: true,
    withExpectedDelivery: true,
    withGuiInformation: false,
    edi: true,
    postingAtPostoffice: q.atPostOffice,
    consignments: [
      {
        id: "1",
        fromCountryCode: "NO",
        fromPostalCode: q.fromPostalCode,
        toCountryCode: "NO",
        toPostalCode: q.toPostalCode,
        packages: [
          {
            id: "1",
            grossWeight: Math.round(q.weightGrams),
            ...(q.packageCm && { length: q.packageCm.length, width: q.packageCm.width, height: q.packageCm.height }),
          },
        ],
        products: q.products.map((id) => ({ id, customerNumber: q.customerNumber })),
      },
    ],
  };
}

export type ProductQuote = {
  /** Pris inkludert MVA i øre, rundet opp til hele kroner. Null når Bring ikke ga pris. */
  priceOre: number | null;
  /** Virkedager Bring regner med for levering. */
  deliveryDays: number | null;
  error: { code: string; message: string } | null;
};

/** Bring oppgir kroner med øre som tekst («148.03»). Kassen viser hele kroner, rundet opp, så butikken aldri tar for lite. */
function wholeKronerOre(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim().replace(",", ".")) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.ceil(Math.round(n * 100) / 100) * 100;
}

/**
 * Leser prisene fra svaret. Butikkens egen avtalepris (netPrice) brukes når Bring gir den, ellers listeprisen.
 * Prisen er med MVA, slik kunden skal se den.
 */
export function readShippingGuideResponse(body: unknown): Record<string, ProductQuote> {
  const result: Record<string, ProductQuote> = {};
  for (const consignment of asArray(asRecord(body).consignments)) {
    for (const raw of asArray(asRecord(consignment).products)) {
      const product = asRecord(raw);
      const id = asString(product.id);
      if (!id) continue;
      const prices = asRecord(product.price);
      const price = asRecord(prices.netPrice ?? prices.listPrice);
      const amount = asRecord(price.priceWithAdditionalServices ?? price.priceWithoutAdditionalServices);
      const days = Number.parseInt(asString(asRecord(product.expectedDelivery).workingDays) ?? "", 10);
      const firstError = asRecord(asArray(product.errors)[0]);
      const code = asString(firstError.errorCode) ?? asString(firstError.code);
      result[id] = {
        priceOre: wholeKronerOre(amount.amountWithVAT),
        deliveryDays: Number.isFinite(days) && days >= 0 ? days : null,
        error: code || asString(firstError.description) ? { code: code ?? "UKJENT", message: short(asString(firstError.description) ?? code ?? "") } : null,
      };
    }
  }
  return result;
}

export async function fetchQuotes(creds: BringCredentials, q: QuoteInput, opts: { timeoutMs?: number } = {}): Promise<Record<string, ProductQuote>> {
  const res = await callBring(
    BRING_SHIPPING_GUIDE_URL,
    { method: "POST", headers: { ...authHeaders(creds), "Content-Type": "application/json" }, body: JSON.stringify(shippingGuideRequest(q)) },
    opts.timeoutMs ?? 10_000,
  );
  if (!res.ok) throw httpError(res, "prisforespørselen");
  return readShippingGuideResponse(res.body);
}

// ---------- Bestilling og etikett (Booking API) ----------

export type BookingInput = {
  orderNumber: number;
  recipient: { name: string; street: string; postalCode: string; city: string; email: string; phone: string | null };
  sender: BringSender & { email?: string | null; phone?: string | null };
  product: BringProductId;
  customerNumber: string;
  weightGrams: number;
  packageCm: PackageCm | null;
  shippingDateTime: Date;
};

/** Bring vil ha telefonnummer med landskode. Norske nummer med åtte siffer får +47. Andre formater sendes ikke. */
export function bringPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[\s().-]/g, "");
  if (/^\d{8}$/.test(digits)) return `+47${digits}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^00\d{8,15}$/.test(digits)) return `+${digits.slice(2)}`;
  return null;
}

const cut = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Bestillingen slik Booking API vil ha den: én sending med én pakke. Navn og adresselinjer kortes til 35 tegn,
 * e-post til 60 (grensene i Bring sitt API-skjema). Vekt i kilo, mål i hele centimeter.
 * Testmodus settes ikke her, men med hodet X-Bring-Test-Indicator (se createBooking).
 */
export function bookingRequest(b: BookingInput) {
  const senderPhone = bringPhone(b.sender.phone);
  const senderEmail = b.sender.email ? cut(b.sender.email, 60) : null;
  const recipientPhone = bringPhone(b.recipient.phone);
  return {
    consignments: [
      {
        correlationId: `ordre-${b.orderNumber}`,
        shippingDateTime: b.shippingDateTime.toISOString(),
        parties: {
          sender: {
            name: cut(b.sender.name, 35),
            addressLine: cut(b.sender.street, 35),
            postalCode: b.sender.postalCode,
            city: cut(b.sender.city, 35),
            countryCode: "NO",
            ...((senderEmail || senderPhone) && {
              contact: { name: cut(b.sender.name, 35), ...(senderEmail && { email: senderEmail }), ...(senderPhone && { phoneNumber: senderPhone }) },
            }),
          },
          recipient: {
            name: cut(b.recipient.name, 35),
            addressLine: cut(b.recipient.street, 35),
            postalCode: b.recipient.postalCode,
            city: cut(b.recipient.city, 35),
            countryCode: "NO",
            reference: cut(`Ordre ${b.orderNumber}`, 35),
            // Hentested og varsel om pakken krever e-post eller telefon hos mottakeren.
            contact: { name: cut(b.recipient.name, 35), email: cut(b.recipient.email, 60), ...(recipientPhone && { phoneNumber: recipientPhone }) },
          },
        },
        product: { id: b.product, customerNumber: b.customerNumber },
        packages: [
          {
            correlationId: `ordre-${b.orderNumber}-1`,
            weightInKg: Math.round(b.weightGrams) / 1000,
            ...(b.packageCm && { dimensions: { lengthInCm: b.packageCm.length, widthInCm: b.packageCm.width, heightInCm: b.packageCm.height } }),
          },
        ],
      },
    ],
  };
}

export type BookingResult = {
  consignmentNumber: string;
  packageNumbers: string[];
  /** Etiketten som base64, hvis Bring sendte den med i svaret. */
  labelBase64: string | null;
  /** Adressen til etiketten hos Bring. Kan gi tilgang uten innlogging, så den skal aldri til nettleseren. */
  labelUrl: string | null;
};

/** Den norske feilmeldingen fra Bring når den finnes, ellers den første. */
function bookingErrorText(error: unknown): { code: string | undefined; text: string } {
  const e = asRecord(error);
  const messages = asArray(e.messages).map(asRecord);
  const chosen = messages.find((m) => /^(no|nb)/i.test(asString(m.lang) ?? "")) ?? messages[0] ?? {};
  const text = asString(chosen.message) ?? asString(chosen.details) ?? asString(e.code) ?? "ukjent feil";
  return { code: asString(e.code), text: short(text) };
}

export function readBookingResponse(body: unknown): BookingResult {
  const consignment = asRecord(asArray(asRecord(body).consignments)[0]);
  const errors = asArray(consignment.errors);
  if (errors.length) {
    const { code, text } = bookingErrorText(errors[0]);
    throw new BringError(`Bring avviste bestillingen: ${text}${code ? ` (${code})` : ""}`, { code });
  }
  const confirmation = asRecord(consignment.confirmation);
  const consignmentNumber = asString(confirmation.consignmentNumber);
  if (!consignmentNumber) throw new BringError("Bring svarte uten sendingsnummer. Sjekk i Mybring om sendingen ble bestilt før du prøver igjen.");
  const labels = asRecord(confirmation.labels);
  const links = asRecord(confirmation.links);
  return {
    consignmentNumber,
    packageNumbers: asArray(confirmation.packages)
      .map((p) => asString(asRecord(p).packageNumber))
      .filter((n): n is string => Boolean(n)),
    labelBase64: asString(labels.base64) ?? null,
    labelUrl: asString(labels.link) ?? asString(links.labels) ?? null,
  };
}

/**
 * Bestiller sendingen hos Bring. I testmiljøet sendes X-Bring-Test-Indicator: true, så Bring verken henter pakken
 * eller fakturerer. Bring har ingen idempotensnøkkel, så den som kaller, må sørge for at samme ordre ikke bestilles to ganger.
 */
export async function createBooking(creds: BringCredentials, environment: BringEnvironment, input: BookingInput): Promise<BookingResult> {
  const res = await callBring(
    BRING_BOOKING_URL,
    {
      method: "POST",
      headers: {
        ...authHeaders(creds),
        "Content-Type": "application/json",
        ...(environment === "test" && { "X-Bring-Test-Indicator": "true" }),
      },
      body: JSON.stringify(bookingRequest(input)),
    },
    30_000,
  );
  // 400 har samme form som et vanlig svar, med feilene på sendingen.
  if (!res.ok && !(res.status === 400 && asArray(asRecord(res.body).consignments).length)) throw httpError(res, "bestillingen");
  return readBookingResponse(res.body);
}

export const isPdf = (bytes: Uint8Array) => bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

/** Bare Bring sine egne adresser får nøklene. */
function isBringHost(host: string): boolean {
  const h = host.toLowerCase();
  return ["bring.com", "mybring.com", "bring.no", "posten.no"].some((d) => h === d || h.endsWith(`.${d}`));
}

export function decodeLabel(base64: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64.replace(/\s/g, "")), (c) => c.charCodeAt(0));
  } catch {
    throw new BringError("Etiketten fra Bring kunne ikke leses.");
  }
  if (!isPdf(bytes)) throw new BringError("Etiketten fra Bring var ikke en PDF.");
  return bytes;
}

/** Henter etiketten som PDF fra adressen Bring ga. Over https, og bare fra Bring sine egne adresser. */
export async function downloadLabel(creds: BringCredentials, url: string): Promise<Uint8Array> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new BringError("Bring svarte med en ugyldig adresse til etiketten.");
  }
  if (target.protocol === "http:") target.protocol = "https:";
  if (target.protocol !== "https:" || !isBringHost(target.hostname)) throw new BringError("Bring svarte med en ukjent adresse til etiketten.");
  let res: Response;
  try {
    res = await fetch(target, { headers: { ...authHeaders(creds), Accept: "application/pdf" }, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new BringError("Fikk ikke hentet etiketten fra Bring. Prøv igjen om litt.", { status: 0 });
  }
  if (!res.ok) throw new BringError(`Bring ga ikke ut etiketten (feil ${res.status}). Prøv igjen om litt.`, { status: res.status });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!isPdf(bytes)) throw new BringError("Etiketten fra Bring var ikke en PDF.");
  return bytes;
}

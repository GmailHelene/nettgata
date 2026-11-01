import { asNumber, asRecord, asString } from "@/lib/payments/common";
import { ShopError } from "@/lib/shop/catalog";
import { accountCodePattern, companySlugPattern, type FikenAccount, type FikenCompanyOption } from "./state";
import type { FikenSale } from "./mapping";

/**
 * Kall mot Fiken API v2 (https://api.fiken.no/api/v2/docs). Nøkkelen sendes som Bearer i Authorization-hodet.
 * Fiken tillater bare ett kall om gangen per bruker, så alt her kalles ett og ett, aldri parallelt.
 * Forespørslene logges aldri, fordi hodene inneholder nøkkelen.
 */

export const FIKEN_API = "https://api.fiken.no/api/v2";
const TIMEOUT_MS = 15_000;

/**
 * Feil fra Fiken, med en melding som kan vises til butikkeieren. Meldingen inneholder aldri nøkkelen.
 * stop: feilen gjelder alle ordre (nøkkel, tilgang, selskap eller for mange kall), så en sending stopper med en gang.
 * uncertain: vi vet ikke om Fiken rakk å lagre salget (tidsavbrudd eller feil hos Fiken). Før neste forsøk sjekkes det i Fiken.
 */
export class FikenError extends ShopError {
  constructor(
    message: string,
    readonly info: { status: number; stop: boolean; uncertain: boolean },
  ) {
    super(message);
    this.name = "FikenError";
  }
}

const knownErrors: Record<number, string> = {
  401: "Fiken godtok ikke API-nøkkelen. Sjekk at hele nøkkelen er limt inn, og at den ikke er slettet i Fiken.",
  403: "Fiken avviste tilgangen. Sjekk at selskapet har API-modulen i Fiken (99 kr i måneden pluss mva), og at brukeren som laget nøkkelen fortsatt har tilgang til selskapet.",
  404: "Fant ikke selskapet i Fiken. Det kan være slettet, eller nøkkelen har ikke tilgang til det lenger. Koble til på nytt og velg selskapet.",
  429: "Fiken har fått for mange forespørsler på kort tid. Vent et par minutter og prøv igjen.",
};

/** Plukker ut en lesbar feilmelding fra svaret. Fiken beskriver ikke formatet, så vi prøver de vanlige feltnavnene. */
function fikenMessage(body: unknown, token: string): string | null {
  const pick = (value: unknown, depth = 0): string | null => {
    if (depth > 3) return null;
    if (typeof value === "string") return value.trim().startsWith("<") ? null : value;
    if (Array.isArray(value)) return value.map((v) => pick(v, depth + 1)).filter(Boolean).join(" ") || null;
    const r = asRecord(value);
    for (const k of ["message", "errorMessage", "error_description", "userMessage", "detail", "title", "errors", "error"]) {
      const found = pick(r[k], depth + 1);
      if (found) return found;
    }
    return null;
  };
  const text = pick(body)?.replace(/\s+/g, " ").split(token).join("[skjult]").trim();
  if (!text) return null;
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function errorFor(status: number, body: unknown, method: string, token: string): FikenError {
  if (knownErrors[status]) return new FikenError(knownErrors[status], { status, stop: true, uncertain: false });
  // Ved feil hos Fiken kan salget likevel være lagret, så det sjekkes før neste forsøk.
  if (status >= 500) return new FikenError(`Fiken svarte med en feil (${status}). Prøv igjen om litt.`, { status, stop: false, uncertain: method === "POST" });
  const detail = status >= 400 ? fikenMessage(body, token) : null;
  return new FikenError(detail ? `Fiken godtok ikke opplysningene. Fiken skrev: ${detail}` : `Fiken svarte uventet (${status}).`, {
    status,
    stop: false,
    uncertain: false,
  });
}

type FikenResponse = { status: number; body: unknown; location: string | null };

async function call(token: string, method: "GET" | "POST", path: string, body?: unknown): Promise<FikenResponse> {
  let res: Response;
  try {
    res = await fetch(`${FIKEN_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        // Fiken anbefaler en unik ID per forespørsel, så de kan finne den igjen hvis noe går galt.
        "X-Request-ID": crypto.randomUUID(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Nøkkelen skal bare til api.fiken.no, aldri følge en omdirigering et annet sted.
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new FikenError("Fikk ikke kontakt med Fiken. Prøv igjen om litt.", { status: 0, stop: false, uncertain: method === "POST" });
  }
  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (res.status >= 200 && res.status < 300) return { status: res.status, body: parsed, location: res.headers.get("location") };
  throw errorFor(res.status, parsed, method, token);
}

const unexpected = (status: number) => new FikenError("Fiken svarte uventet. Prøv igjen om litt.", { status, stop: false, uncertain: false });

function companyPath(slug: string): string {
  if (!companySlugPattern.test(slug)) throw new FikenError("Selskapet i Fiken har en ugyldig adresse. Koble til på nytt.", { status: 0, stop: true, uncertain: false });
  return `/companies/${encodeURIComponent(slug)}`;
}

function companyFrom(value: unknown): FikenCompanyOption | null {
  const r = asRecord(value);
  const slug = asString(r.slug);
  const name = asString(r.name);
  if (!slug || !name || !companySlugPattern.test(slug)) return null;
  return {
    slug,
    name: name.slice(0, 200),
    organizationNumber: asString(r.organizationNumber)?.slice(0, 20) ?? null,
    // vatType er «no» når selskapet ikke er registrert i Merverdiavgiftsregisteret.
    vatRegistered: r.vatType !== "no",
    hasApiAccess: r.hasApiAccess !== false,
    testCompany: r.testCompany === true,
  };
}

/** Alle selskapene brukeren bak nøkkelen har tilgang til. Brukes også til å sjekke at nøkkelen virker. */
export async function listCompanies(token: string): Promise<FikenCompanyOption[]> {
  const res = await call(token, "GET", "/companies?page=0&pageSize=100");
  if (!Array.isArray(res.body)) throw unexpected(res.status);
  return res.body.flatMap((c) => companyFrom(c) ?? []);
}

export async function getCompany(token: string, slug: string): Promise<FikenCompanyOption> {
  const res = await call(token, "GET", companyPath(slug));
  const company = companyFrom(res.body);
  if (!company) throw unexpected(res.status);
  return company;
}

/** Aktive bankkontoer, med kontonummeret Fiken bruker for innbetalinger (for eksempel 1920:10001). */
export async function listBankAccounts(token: string, slug: string): Promise<FikenAccount[]> {
  const res = await call(token, "GET", `${companyPath(slug)}/bankAccounts?page=0&pageSize=100&inactive=false`);
  if (!Array.isArray(res.body)) throw unexpected(res.status);
  return res.body.flatMap((b) => {
    const r = asRecord(b);
    const code = asString(r.accountCode);
    if (!code || !accountCodePattern.test(code) || r.inactive === true) return [];
    return [{ code, name: (asString(r.name) ?? code).slice(0, 200) }];
  });
}

/** Inntektskontoene (3000-serien) i selskapets kontoplan for i år. */
export async function listIncomeAccounts(token: string, slug: string): Promise<FikenAccount[]> {
  const res = await call(token, "GET", `${companyPath(slug)}/accounts?fromAccount=3000&toAccount=3999&page=0&pageSize=100`);
  if (!Array.isArray(res.body)) throw unexpected(res.status);
  return res.body.flatMap((a) => {
    const r = asRecord(a);
    const code = asString(r.code);
    if (!code || !/^3\d{3}$/.test(code)) return [];
    return [{ code, name: (asString(r.name) ?? code).slice(0, 200) }];
  });
}

/** Lagrer salget («Annet salg» i Fiken). Svarer med ID-en til salget, hentet fra Location-hodet. */
export async function createSale(token: string, slug: string, sale: FikenSale): Promise<{ saleId: string | null }> {
  const res = await call(token, "POST", `${companyPath(slug)}/sales`, sale);
  const saleId = res.location ? (/\/sales\/(\d+)\/?$/.exec(res.location)?.[1] ?? null) : null;
  return { saleId };
}

export type FoundSale = { saleId: string | null; date: string | null; grossOre: number };

/** Salg med et bestemt salgsnummer. Brukes før et nytt forsøk, når vi ikke vet om forrige forsøk ble lagret. */
export async function findSalesByNumber(token: string, slug: string, saleNumber: string): Promise<FoundSale[]> {
  const res = await call(token, "GET", `${companyPath(slug)}/sales?saleNumber=${encodeURIComponent(saleNumber)}&page=0&pageSize=25`);
  if (!Array.isArray(res.body)) throw unexpected(res.status);
  return res.body.flatMap((s) => {
    const r = asRecord(s);
    if (asString(r.saleNumber) !== saleNumber) return [];
    const id = asNumber(r.saleId);
    return [{ saleId: id === undefined ? null : String(id), date: asString(r.date) ?? null, grossOre: (asNumber(r.netAmount) ?? 0) + (asNumber(r.vatAmount) ?? 0) }];
  });
}

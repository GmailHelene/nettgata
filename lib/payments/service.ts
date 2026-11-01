import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, orderLines, orders, sites } from "@/db/schema";
import { isPlatformHost, resolveHost } from "@/lib/hosts";
import { ShopError } from "@/lib/shop/catalog";
import { cancelUnpaidOrder, canTransition, markOrderPaid, setOrderStatus, setPaymentRef, type OrderStatus } from "@/lib/shop/orders";
import { isOnlinePayment } from "@/lib/shop/settings";
import { carrierLabel, trackingUrl } from "@/lib/shop/tracking";
import { publicSiteUrl } from "@/lib/site-url";
import { formatPaymentRef, idempotencyUuid, parsePaymentRef, PaymentError, sameToken, type PaymentRef } from "./common";
import { loadCredentials } from "./config";
import { klarnaClient, klarnaOrderBody, type KlarnaClient } from "./klarna";
import { providerNames, readStoredProvider } from "./state";
import { vippsClient, vippsReference, type VippsClient, type VippsPayment } from "./vipps";

type Order = typeof orders.$inferSelect;
type Site = typeof sites.$inferSelect;

/** Hvor lenge en ordre kan vente på betaling før bakgrunnsjobben rydder den bort og legger varene tilbake. */
const LIMITS = {
  /** Ordren ble lagret, men betalingen ble aldri startet (for eksempel brudd midt i kassen). */
  notStartedMs: 15 * 60_000,
  /** Vipps gir kunden ti minutter. Dette er bare en sikkerhetsmargin hvis Vipps aldri melder utløp. */
  vippsMs: 60 * 60_000,
  /** Klarnas betalingsside er åpen i nesten to døgn. Vi stenger den etter en time, så varene ikke er låst så lenge. */
  klarnaMs: 60 * 60_000,
  /** Nøklene er fjernet eller byttet til et annet miljø, så betalingen kan ikke sjekkes. */
  unverifiableTestMs: 60 * 60_000,
  unverifiableProductionMs: 24 * 60 * 60_000,
};

/** Klarna-ordre i disse tilstandene har ingen reservasjon igjen. */
const KLARNA_CLOSED = ["CANCELLED", "EXPIRED", "CLOSED"];

type Clients = Map<string, Promise<AnyClient | null>>;
type AnyClient = { provider: "vipps"; client: VippsClient } | { provider: "klarna"; client: KlarnaClient };

export type PaymentContext = {
  now?: Date;
  /** Bakgrunnsjobben: rydder også bort betalinger som har ventet for lenge. */
  sweep?: boolean;
  /** Gjenbruker klienter (og Vipps-tilgangsnøkler) når mange ordre sjekkes på rad. */
  clients?: Clients;
};

async function audit(db: Db, siteId: string, userId: string | null, action: string, detail: Record<string, unknown>) {
  await db.insert(auditLog).values({ siteId, userId, action, detail });
}

async function loadOrder(db: Db, orderId: string, siteId?: string) {
  const conditions = [eq(orders.id, orderId)];
  if (siteId) conditions.push(eq(orders.siteId, siteId));
  const [row] = await db
    .select({ order: orders, site: sites })
    .from(orders)
    .innerJoin(sites, eq(orders.siteId, sites.id))
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

async function currentStatus(db: Db, orderId: string): Promise<string> {
  const [row] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
  return row?.status ?? "cancelled";
}

/**
 * Klient for betalingen ordren hører til. Null hvis nøklene mangler, ikke kan leses, eller gjelder et annet miljø enn
 * betalingen. En betaling i testmiljøet skal aldri trekkes eller refunderes med produksjonsnøklene, og omvendt.
 */
function clientFor(site: Site, ref: PaymentRef, ctx: PaymentContext): Promise<AnyClient | null> {
  const key = `${site.id}:${ref.provider}:${ref.environment}`;
  const cached = ctx.clients?.get(key);
  if (cached) return cached;
  const created = (async (): Promise<AnyClient | null> => {
    const access = await loadCredentials(site, ref.provider);
    if (!access || access.environment !== ref.environment) return null;
    return access.provider === "vipps"
      ? { provider: "vipps", client: vippsClient(access.environment, access.credentials) }
      : { provider: "klarna", client: klarnaClient(access.environment, access.credentials) };
  })();
  ctx.clients?.set(key, created);
  return created;
}

// ---------- Start ----------

/**
 * Hvor kunden skal tilbake etter betalingen: samme adresse som kassen ble åpnet på, hvis den hører til butikken.
 * Ellers butikkens hovedadresse. Vertsnavnet fra forespørselen brukes bare når det er slått opp mot kjente domener.
 */
export async function paymentOrigin(db: Db, site: { id: string; slug: string }, host: string, proto: string): Promise<string> {
  if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) {
    if (isPlatformHost(host)) return `${proto}://${host}`;
    const match = await resolveHost(db, host);
    if (match?.site.id === site.id && !match.redirectHost) return `${proto}://${host}`;
  }
  return new URL(await publicSiteUrl(db, site)).origin;
}

export const returnUrl = (origin: string, order: { id: string; accessToken: string }) =>
  `${origin}/api/betaling/retur?ordre=${order.id}&t=${order.accessToken}`;

/**
 * Starter betalingen for en ny ordre og gir adressen kunden skal sendes til. Referansen lagres på ordren før kallet,
 * så bakgrunnsjobben finner betalingen selv om svaret aldri kommer fram. Feiler starten, kanselleres ordren og
 * varene legges tilbake, så kunden kan prøve igjen.
 */
export async function startPayment(db: Db, site: Site, order: Order, returnTo: string): Promise<string> {
  if (!isOnlinePayment(order.paymentMethod)) throw new ShopError("Betalingsmåten sendes ikke videre");
  const provider = order.paymentMethod;
  const name = providerNames[provider];
  const failed = () => new PaymentError(`Vi fikk ikke kontakt med ${name}. Ingenting er trukket. Prøv igjen, eller velg en annen betalingsmåte.`);

  const access = readStoredProvider(site.shop, provider)?.testedAt ? await loadCredentials(site, provider) : null;
  if (!access) {
    await cancelUnpaidOrder(db, site.id, order.id, { provider, reason: "not_connected" });
    throw new PaymentError(`${name} er ikke tilgjengelig akkurat nå. Ingenting er trukket. Velg en annen betalingsmåte.`);
  }

  if (access.provider === "vipps") {
    const reference = vippsReference(order);
    const vipps = vippsClient(access.environment, access.credentials);
    await setPaymentRef(db, order.id, formatPaymentRef({ provider: "vipps", environment: access.environment, reference }));
    try {
      const { redirectUrl } = await vipps.createPayment({
        reference,
        amountOre: order.totalOre,
        returnUrl: returnTo,
        description: `Ordre ${order.number} hos ${site.name}`.slice(0, 100),
        idempotencyKey: `create-${order.id}`,
      });
      return redirectUrl;
    } catch (err) {
      // Kom betalingen fram selv om svaret ikke gjorde det, stoppes den, så ingen kan betale en kansellert ordre.
      await vipps.cancel(reference, { transactionOnly: true, idempotencyKey: `stopp-${order.id}` }).catch(() => undefined);
      await cancelUnpaidOrder(db, site.id, order.id, { provider, reason: "start_failed", ...errorInfo(err) });
      logFailure("Vipps-betalingen kunne ikke startes", order.id, err);
      throw failed();
    }
  }

  const klarna = klarnaClient(access.environment, access.credentials);
  try {
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    const session = await klarna.createPaymentSession(klarnaOrderBody(order, lines));
    const hpp = await klarna.createHppSession(session.sessionId, returnTo);
    const saved = await setPaymentRef(db, order.id, formatPaymentRef({ provider: "klarna", environment: access.environment, kind: "hpp", id: hpp.sessionId }));
    if (!saved) {
      await klarna.disableHppSession(hpp.sessionId).catch(() => undefined);
      throw new PaymentError("Ordren ble endret før betalingen startet");
    }
    return hpp.redirectUrl;
  } catch (err) {
    await cancelUnpaidOrder(db, site.id, order.id, { provider, reason: "start_failed", ...errorInfo(err) });
    logFailure("Klarna-betalingen kunne ikke startes", order.id, err);
    throw failed();
  }
}

const errorInfo = (err: unknown) => (err instanceof PaymentError ? { status: err.info.status ?? null, code: err.info.code ?? null } : {});

/** Logger bare meldingen, aldri forespørselen eller nøklene. */
function logFailure(what: string, orderId: string, err: unknown) {
  console.error(what, orderId, err instanceof PaymentError ? err.message : err instanceof Error ? err.name : "ukjent feil");
}

// ---------- Sjekk av status (retur og bakgrunnsjobb) ----------

export type SyncResult = {
  /** Ordrestatusen etter sjekken. */
  status: string;
  /** Denne sjekken merket ordren som betalt. Bare da skal ordrebekreftelsen sendes. */
  paid: boolean;
  /** Denne sjekken kansellerte ordren. */
  cancelled: boolean;
  /** Status hos Vipps eller Klarna, til logg og visning. */
  providerState?: string;
};

/**
 * Henter status fra Vipps eller Klarna og oppdaterer ordren. Brukes når kunden kommer tilbake, av bakgrunnsjobben,
 * og når butikken trykker «Marker som betalt». Stoler aldri på noe fra kundens nettleser.
 */
export async function syncOrderPayment(db: Db, orderId: string, ctx: PaymentContext = {}): Promise<SyncResult> {
  const row = await loadOrder(db, orderId);
  if (!row) throw new ShopError("Fant ikke ordren");
  return syncLoaded(db, row.site, row.order, ctx);
}

async function syncLoaded(db: Db, site: Site, order: Order, ctx: PaymentContext): Promise<SyncResult> {
  const unchanged = (providerState?: string): SyncResult => ({ status: order.status, paid: false, cancelled: false, providerState });
  if (!isOnlinePayment(order.paymentMethod) || order.status !== "pending_payment") return unchanged();
  const provider = order.paymentMethod;
  const age = (ctx.now ?? new Date()).getTime() - order.createdAt.getTime();

  const cancel = async (reason: string, detail: Record<string, unknown> = {}): Promise<SyncResult> => {
    if (await cancelUnpaidOrder(db, site.id, order.id, { provider, reason, ...detail })) {
      return { status: "cancelled", paid: false, cancelled: true, providerState: reason };
    }
    return { status: await currentStatus(db, order.id), paid: false, cancelled: false };
  };

  const ref = parsePaymentRef(order.paymentRef);
  if (!ref || ref.provider !== provider) return ctx.sweep && age > LIMITS.notStartedMs ? cancel("not_started") : unchanged();

  const access = await clientFor(site, ref, ctx);
  if (!access) {
    const limit = ref.environment === "test" ? LIMITS.unverifiableTestMs : LIMITS.unverifiableProductionMs;
    return ctx.sweep && age > limit ? cancel("unverifiable", { environment: ref.environment }) : unchanged("UKJENT");
  }

  try {
    if (access.provider === "vipps" && ref.provider === "vipps") return await syncVipps(db, site, order, ref, access.client, ctx, age, cancel);
    if (access.provider === "klarna" && ref.provider === "klarna") return await syncKlarna(db, site, order, ref, access.client, ctx, age, cancel);
  } catch (err) {
    // Finnes ikke betalingen hos løsningen med dagens nøkler, kan den aldri bli betalt. Den ryddes bort etter fristen.
    const limit = ref.environment === "test" ? LIMITS.unverifiableTestMs : LIMITS.unverifiableProductionMs;
    if (ctx.sweep && err instanceof PaymentError && err.info.status === 404 && age > limit) {
      return cancel("not_found", { environment: ref.environment });
    }
    throw err;
  }
  return unchanged();
}

type Cancel = (reason: string, detail?: Record<string, unknown>) => Promise<SyncResult>;

async function syncVipps(
  db: Db,
  site: Site,
  order: Order,
  ref: Extract<PaymentRef, { provider: "vipps" }>,
  vipps: VippsClient,
  ctx: PaymentContext,
  age: number,
  cancel: Cancel,
): Promise<SyncResult> {
  const details = { environment: ref.environment, reference: ref.reference };
  let payment = await vipps.getPayment(ref.reference);

  if (payment.state === "CREATED" && ctx.sweep && age > LIMITS.vippsMs) {
    // Stopper bare en betaling som ikke er godkjent. Godkjente kunden i samme øyeblikk, står reservasjonen.
    await vipps.cancel(ref.reference, { transactionOnly: true, idempotencyKey: `stopp-${order.id}` });
    payment = await vipps.getPayment(ref.reference);
    if (payment.state !== "AUTHORIZED") return cancel("timeout", details);
  }

  switch (payment.state) {
    case "AUTHORIZED":
      return settleVipps(db, site, order, ref, vipps, payment, cancel);
    case "ABORTED":
    case "EXPIRED":
    case "TERMINATED":
      return cancel(payment.state.toLowerCase(), details);
    default:
      return { status: order.status, paid: false, cancelled: false, providerState: payment.state };
  }
}

/** Kunden har godkjent hos Vipps. Ordren blir betalt bare hvis beløpet og valutaen stemmer nøyaktig med ordren. */
async function settleVipps(
  db: Db,
  site: Site,
  order: Order,
  ref: Extract<PaymentRef, { provider: "vipps" }>,
  vipps: VippsClient,
  payment: VippsPayment,
  cancel: Cancel,
): Promise<SyncResult> {
  const total = order.totalOre;
  const details = { provider: "vipps", environment: ref.environment, reference: ref.reference };
  const agg = payment.aggregate;
  if (payment.currency !== "NOK" || payment.amountOre !== total || agg.authorizedOre !== total) {
    await audit(db, site.id, null, "payment.amount_mismatch", {
      orderId: order.id,
      ...details,
      expectedOre: total,
      authorizedOre: agg.authorizedOre,
      currency: payment.currency,
    });
    await releaseVipps(db, site, order, ref, vipps, null);
    return cancel("amount_mismatch", details);
  }
  // Reservasjonen er allerede frigjort, for eksempel i Vipps-portalen. Da er ingenting betalt.
  if (agg.cancelledOre > 0) return cancel("released_at_provider", details);

  if (await markOrderPaid(db, site.id, order.id, { ...details, amountOre: total })) {
    return { status: "paid", paid: true, cancelled: false, providerState: payment.state };
  }
  // Noen andre rakk å oppdatere ordren. Ble den kansellert i mellomtiden, skal ikke pengene stå reservert.
  const status = await currentStatus(db, order.id);
  if (status === "cancelled") await releaseVipps(db, site, order, ref, vipps, null);
  return { status, paid: false, cancelled: false, providerState: payment.state };
}

async function syncKlarna(
  db: Db,
  site: Site,
  order: Order,
  ref: Extract<PaymentRef, { provider: "klarna" }>,
  klarna: KlarnaClient,
  ctx: PaymentContext,
  age: number,
  cancel: Cancel,
): Promise<SyncResult> {
  const details = { environment: ref.environment };
  if (ref.kind === "order") return settleKlarnaOrder(db, site, order, ref, klarna, cancel);

  let session = await klarna.readHppSession(ref.id);
  if (session.status !== "COMPLETED" && session.status !== "CANCELLED" && session.status !== "DISABLED" && ctx.sweep && age > LIMITS.klarnaMs) {
    await klarna.disableHppSession(ref.id);
    // Fullførte kunden i samme øyeblikk, gjelder det.
    session = await klarna.readHppSession(ref.id);
    if (session.status !== "COMPLETED") return cancel("timeout", { ...details, session: ref.id });
  }

  switch (session.status) {
    case "COMPLETED": {
      if (!session.authorizationToken) return { status: order.status, paid: false, cancelled: false, providerState: session.status };
      return placeKlarnaOrder(db, site, order, ref, klarna, session.authorizationToken, cancel);
    }
    case "CANCELLED":
    case "DISABLED":
      return cancel(session.status.toLowerCase(), { ...details, session: ref.id });
    default:
      // WAITING, IN_PROGRESS, BACK, FAILED og ERROR: kunden kan fortsatt fullføre på Klarnas side.
      return { status: order.status, paid: false, cancelled: false, providerState: session.status };
  }
}

/**
 * Lager ordren hos Klarna fra authorization_token. Samme idempotensnøkkel hver gang, så returen og bakgrunnsjobben
 * aldri lager to ordre hos Klarna for samme bestilling.
 */
async function placeKlarnaOrder(
  db: Db,
  site: Site,
  order: Order,
  ref: Extract<PaymentRef, { provider: "klarna" }>,
  klarna: KlarnaClient,
  authorizationToken: string,
  cancel: Cancel,
): Promise<SyncResult> {
  // Har en annen prosess (returen eller bakgrunnsjobben) allerede lagt inn ordren hos Klarna, gjelder den.
  const takenOver = async (): Promise<SyncResult | null> => {
    const fresh = await loadOrder(db, order.id);
    if (!fresh) return null;
    if (fresh.order.status !== "pending_payment") return { status: fresh.order.status, paid: false, cancelled: false };
    const freshRef = parsePaymentRef(fresh.order.paymentRef);
    if (freshRef?.provider === "klarna" && freshRef.kind === "order") return settleKlarnaOrder(db, site, fresh.order, freshRef, klarna, cancel);
    return null;
  };

  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  let placed: { orderId: string; fraudStatus: string };
  try {
    placed = await klarna.createOrder(authorizationToken, klarnaOrderBody(order, lines), await idempotencyUuid(`klarna-order:${order.id}`));
  } catch (err) {
    const other = await takenOver();
    if (other) return other;
    throw err;
  }

  const orderRef = { provider: "klarna" as const, environment: ref.environment, kind: "order" as const, id: placed.orderId };
  if (!(await setPaymentRef(db, order.id, formatPaymentRef(orderRef), order.paymentRef ?? undefined))) {
    if ((await currentStatus(db, order.id)) === "cancelled") {
      // Ordren ble kansellert mens kunden betalte. Da skal ikke Klarna ta pengene.
      await klarna.cancelOrder(placed.orderId).catch((err) => logFailure("Klarna-ordren kunne ikke kanselleres", order.id, err));
      return { status: "cancelled", paid: false, cancelled: false };
    }
    const other = await takenOver();
    if (other) return other;
    return { status: await currentStatus(db, order.id), paid: false, cancelled: false };
  }
  return settleKlarnaOrder(db, site, { ...order, paymentRef: formatPaymentRef(orderRef) }, orderRef, klarna, cancel);
}

/** Ordren finnes hos Klarna. Betalt når Klarna har godkjent den (fraud_status ACCEPTED) og beløpet stemmer. */
async function settleKlarnaOrder(
  db: Db,
  site: Site,
  order: Order,
  ref: Extract<PaymentRef, { provider: "klarna" }>,
  klarna: KlarnaClient,
  cancel: Cancel,
): Promise<SyncResult> {
  const total = order.totalOre;
  const details = { provider: "klarna", environment: ref.environment, reference: ref.id };
  const ko = await klarna.getOrder(ref.id);
  if (ko.fraudStatus === "REJECTED" || KLARNA_CLOSED.includes(ko.status)) return cancel(ko.fraudStatus === "REJECTED" ? "rejected" : ko.status.toLowerCase(), details);
  if (ko.currency !== "NOK" || ko.orderAmountOre !== total || ko.originalOrderAmountOre !== total) {
    await audit(db, site.id, null, "payment.amount_mismatch", { orderId: order.id, ...details, expectedOre: total, authorizedOre: ko.orderAmountOre, currency: ko.currency });
    if (ko.capturedOre === 0) await klarna.cancelOrder(ref.id).catch((err) => logFailure("Klarna-ordren kunne ikke kanselleres", order.id, err));
    return cancel("amount_mismatch", details);
  }
  // PENDING betyr at Klarna kontrollerer kjøpet. Bakgrunnsjobben sjekker igjen til svaret kommer.
  if (ko.fraudStatus !== "ACCEPTED") return { status: order.status, paid: false, cancelled: false, providerState: ko.fraudStatus };

  if (await markOrderPaid(db, site.id, order.id, { ...details, amountOre: total })) {
    return { status: "paid", paid: true, cancelled: false, providerState: ko.status };
  }
  const status = await currentStatus(db, order.id);
  if (status === "cancelled" && ko.capturedOre === 0) {
    await klarna.cancelOrder(ref.id).catch((err) => logFailure("Klarna-ordren kunne ikke kanselleres", order.id, err));
  }
  return { status, paid: false, cancelled: false, providerState: ko.status };
}

// ---------- Trekk, kansellering og refusjon ----------

/** Gir pengene tilbake hos Vipps: refunderer det som er trukket, og frigjør det som bare er reservert. */
async function releaseVipps(
  db: Db,
  site: Site,
  order: Order,
  ref: Extract<PaymentRef, { provider: "vipps" }>,
  vipps: VippsClient,
  userId: string | null,
): Promise<{ refundedOre: number; releasedOre: number }> {
  let payment = await vipps.getPayment(ref.reference);
  if (payment.state === "CREATED") {
    // Ikke godkjent ennå: stopp betalingen, så den ikke kan godkjennes etterpå. Godkjente kunden i samme øyeblikk,
    // står reservasjonen likevel, og da frigjøres den under.
    await vipps.cancel(ref.reference, { transactionOnly: true, idempotencyKey: `stopp-${order.id}` });
    payment = await vipps.getPayment(ref.reference);
  }
  if (payment.state !== "AUTHORIZED") return { refundedOre: 0, releasedOre: 0 };
  const agg = payment.aggregate;
  const details = { orderId: order.id, provider: "vipps", environment: ref.environment, reference: ref.reference };
  const refundable = agg.capturedOre - agg.refundedOre;
  if (refundable > 0) {
    await vipps.refund(ref.reference, refundable, `refund-${order.id}`);
    await audit(db, site.id, userId, "payment.refunded", { ...details, amountOre: refundable });
  }
  const reserved = agg.authorizedOre - agg.capturedOre - agg.cancelledOre;
  if (reserved > 0) {
    await vipps.cancel(ref.reference, { transactionOnly: false, idempotencyKey: `frigjor-${order.id}` });
    await audit(db, site.id, userId, "payment.released", { ...details, amountOre: reserved });
  }
  return { refundedOre: Math.max(refundable, 0), releasedOre: Math.max(reserved, 0) };
}

/** Gir pengene tilbake hos Klarna. Før ordren finnes hos Klarna, stenges betalingssiden i stedet. */
async function releaseKlarna(
  db: Db,
  site: Site,
  order: Order,
  ref: Extract<PaymentRef, { provider: "klarna" }>,
  klarna: KlarnaClient,
  userId: string | null,
): Promise<{ refundedOre: number; releasedOre: number }> {
  if (ref.kind === "hpp") {
    await klarna.disableHppSession(ref.id);
    const session = await klarna.readHppSession(ref.id);
    // Godkjente kunden rett før vi stengte, finnes en godkjenning uten ordre. Den frigjøres.
    if (session.status === "COMPLETED" && session.authorizationToken) await klarna.cancelAuthorization(session.authorizationToken);
    return { refundedOre: 0, releasedOre: 0 };
  }
  const ko = await klarna.getOrder(ref.id);
  const details = { orderId: order.id, provider: "klarna", environment: ref.environment, reference: ref.id };
  const refundable = ko.capturedOre - ko.refundedOre;
  if (refundable > 0) {
    await klarna.refund(ref.id, refundable, await idempotencyUuid(`refund:${order.id}`));
    await audit(db, site.id, userId, "payment.refunded", { ...details, amountOre: refundable });
  }
  const reserved = ko.remainingAuthorizedOre;
  if (reserved > 0 && !KLARNA_CLOSED.includes(ko.status)) {
    if (ko.capturedOre === 0) await klarna.cancelOrder(ref.id);
    else await klarna.releaseRemaining(ref.id);
    await audit(db, site.id, userId, "payment.released", { ...details, amountOre: reserved });
  }
  return { refundedOre: Math.max(refundable, 0), releasedOre: Math.max(reserved, 0) };
}

/**
 * Klient for en ordre som allerede er betalt eller venter. Mangler nøklene, går det an å fortsette bare for
 * betalinger i testmiljøet, der det ikke finnes ekte penger.
 */
async function clientForAction(db: Db, site: Site, order: Order, userId: string | null, action: string) {
  const ref = parsePaymentRef(order.paymentRef);
  const name = isOnlinePayment(order.paymentMethod) ? providerNames[order.paymentMethod] : "betalingsløsningen";
  if (!ref) return null;
  const access = await clientFor(site, ref, {});
  if (access) return { ref, access };
  if (ref.environment === "test") {
    await audit(db, site.id, userId, "payment.skipped", { orderId: order.id, provider: ref.provider, environment: "test", action, reason: "keys_missing" });
    return null;
  }
  throw new PaymentError(
    `${name} er ikke koblet til med produksjonsnøklene lenger, så dette kan ikke gjøres herfra. Koble til igjen under Betaling, eller gjør det i ${name} sin portal.`,
  );
}

/** Trekker beløpet når ordren sendes eller hentes. Det er først nå kunden belastes (fysiske varer). */
async function capturePayment(db: Db, site: Site, order: Order, userId: string | null): Promise<number> {
  const found = await clientForAction(db, site, order, userId, "capture");
  if (!found) {
    if (!parsePaymentRef(order.paymentRef)) throw new PaymentError("Ordren mangler kobling til betalingen, så beløpet kan ikke trekkes.");
    return 0;
  }
  const { ref, access } = found;
  const total = order.totalOre;

  if (access.provider === "vipps" && ref.provider === "vipps") {
    const payment = await access.client.getPayment(ref.reference);
    if (payment.state !== "AUTHORIZED") throw new PaymentError("Vipps-betalingen er ikke godkjent, så beløpet kan ikke trekkes.");
    const agg = payment.aggregate;
    const missing = total - agg.capturedOre;
    if (missing <= 0) return 0;
    if (agg.authorizedOre - agg.capturedOre - agg.cancelledOre < missing) {
      throw new PaymentError("Reservasjonen hos Vipps er frigjort eller utløpt, så beløpet kan ikke trekkes. Ta kontakt med kunden om ny betaling.");
    }
    await access.client.capture(ref.reference, missing, `capture-${order.id}`);
    await audit(db, site.id, userId, "payment.captured", { orderId: order.id, provider: "vipps", environment: ref.environment, reference: ref.reference, amountOre: missing });
    return missing;
  }

  if (access.provider === "klarna" && ref.provider === "klarna") {
    if (ref.kind !== "order") throw new PaymentError("Klarna har ikke bekreftet ordren ennå, så beløpet kan ikke trekkes.");
    const ko = await access.client.getOrder(ref.id);
    if (KLARNA_CLOSED.includes(ko.status)) throw new PaymentError("Ordren er kansellert eller utløpt hos Klarna, så beløpet kan ikke trekkes.");
    if (ko.orderAmountOre !== total) throw new PaymentError("Beløpet hos Klarna stemmer ikke med ordren. Sjekk ordren i Klarna-portalen.");
    const missing = ko.orderAmountOre - ko.capturedOre;
    if (missing <= 0) return 0;
    const shipping = order.trackingNumber
      ? { company: carrierLabel(order.trackingCarrier), trackingNumber: order.trackingNumber, trackingUri: trackingUrl(order.trackingCarrier, order.trackingNumber) }
      : undefined;
    await access.client.capture(ref.id, missing, await idempotencyUuid(`capture:${order.id}`), shipping);
    await audit(db, site.id, userId, "payment.captured", { orderId: order.id, provider: "klarna", environment: ref.environment, reference: ref.id, amountOre: missing });
    return missing;
  }
  return 0;
}

async function releasePayment(db: Db, site: Site, order: Order, userId: string | null, action: string) {
  const found = await clientForAction(db, site, order, userId, action);
  if (!found) return { refundedOre: 0, releasedOre: 0 };
  const { ref, access } = found;
  if (access.provider === "vipps" && ref.provider === "vipps") return releaseVipps(db, site, order, ref, access.client, userId);
  if (access.provider === "klarna" && ref.provider === "klarna") return releaseKlarna(db, site, order, ref, access.client, userId);
  return { refundedOre: 0, releasedOre: 0 };
}

/**
 * Stopper en betaling som ikke er fullført, og kansellerer ordren (varene og rabattkoden frigjøres).
 * Rakk kunden å godkjenne i samme øyeblikk, gis pengene tilbake.
 */
async function abortPendingPayment(db: Db, site: Site, order: Order, userId: string | null, reason: string): Promise<boolean> {
  await releasePayment(db, site, order, userId, "abort");
  return cancelUnpaidOrder(db, site.id, order.id, { provider: order.paymentMethod, reason }, userId);
}

export type StatusChange = {
  message: string;
  /** Ordren ble betalt nå. Da skal ordrebekreftelsen sendes. */
  paid: boolean;
  /** Ordren er betalt med Vipps eller Klarna. */
  online: boolean;
};

/**
 * Statusendring fra studioet. For Vipps og Klarna skjer pengene først: trekk ved «sendt», frigjøring ved kansellering,
 * refusjon ved «refundert». Feiler kallet, endres ikke statusen. «Betalt» kan ikke settes for hånd: da hentes
 * statusen fra Vipps eller Klarna i stedet. Andre betalingsmåter følger de vanlige reglene.
 */
export async function changeOrderStatus(db: Db, siteId: string, orderId: string, next: OrderStatus, userId: string | null): Promise<StatusChange> {
  const row = await loadOrder(db, orderId, siteId);
  if (!row) throw new ShopError("Fant ikke ordren");
  const { order, site } = row;
  if (!isOnlinePayment(order.paymentMethod)) {
    await setOrderStatus(db, siteId, orderId, next, userId);
    return { message: "Status er oppdatert", paid: false, online: false };
  }
  if (!canTransition(order.status, next)) throw new ShopError(`Kan ikke gå fra ${order.status} til ${next}`);
  const name = providerNames[order.paymentMethod];
  const done = (message: string, paid = false): StatusChange => ({ message, paid, online: true });

  switch (next) {
    case "paid": {
      const result = await syncLoaded(db, site, order, {});
      if (result.status === "paid") return done(`${name} har bekreftet betalingen. Ordren er betalt.`, result.paid);
      if (result.status === "cancelled") throw new PaymentError(`Betalingen hos ${name} ble ikke fullført, så ordren er kansellert.`);
      throw new PaymentError(`${name} har ikke bekreftet betalingen ennå. Ordren blir betalt av seg selv når kunden har betalt.`);
    }
    case "fulfilled": {
      const captured = await capturePayment(db, site, order, userId);
      await setOrderStatus(db, siteId, orderId, "fulfilled", userId);
      return done(captured > 0 ? `Beløpet er trukket med ${name}, og ordren er markert som sendt.` : "Ordren er markert som sendt.");
    }
    case "cancelled": {
      if (order.status === "pending_payment") {
        if (await abortPendingPayment(db, site, order, userId, "cancelled_by_shop")) return done(`Ordren er kansellert, og betalingen hos ${name} er stoppet.`);
        throw new PaymentError("Ordren ble endret samtidig, kanskje fordi kunden betalte akkurat nå. Last siden på nytt og se hva som gjelder.");
      }
      await releasePayment(db, site, order, userId, "cancel");
      await setOrderStatus(db, siteId, orderId, "cancelled", userId);
      return done(`Ordren er kansellert, og kunden får pengene tilbake fra ${name}.`);
    }
    case "refunded": {
      await releasePayment(db, site, order, userId, "refund");
      await setOrderStatus(db, siteId, orderId, "refunded", userId);
      return done(`Ordren er refundert, og kunden får pengene tilbake fra ${name}.`);
    }
  }
  throw new ShopError(`Kan ikke gå fra ${order.status} til ${next}`);
}

// ---------- Kunden kommer tilbake ----------

const basePathFor = (site: Site, host: string) => (isPlatformHost(host) ? `/vis/${site.slug}` : "");

async function customerOrder(db: Db, orderId: string, token: string) {
  if (!/^[0-9a-f-]{36}$/.test(orderId) || !/^[0-9a-f]{48}$/.test(token)) return null;
  const row = await loadOrder(db, orderId);
  return row && sameToken(row.order.accessToken, token) ? row : null;
}

export type CustomerRedirect = { location: string; paidOrderId: string | null };

/**
 * Kunden er tilbake fra Vipps eller Klarna. Lenken sier bare hvilken ordre det gjelder (og nøkkelen til kvitteringen);
 * statusen hentes alltid fra Vipps eller Klarna. Uansett utfall vises kvitteringssiden, som forteller hva som skjedde.
 */
export async function handlePaymentReturn(db: Db, input: { orderId: string; token: string; host: string }): Promise<CustomerRedirect | null> {
  const row = await customerOrder(db, input.orderId, input.token);
  if (!row) return null;
  let paid = false;
  try {
    paid = (await syncLoaded(db, row.site, row.order, {})).paid;
  } catch (err) {
    // Svarer ikke Vipps eller Klarna nå, viser vi «venter på bekreftelse». Bakgrunnsjobben sjekker igjen.
    logFailure("Betalingssjekk ved retur feilet", row.order.id, err);
  }
  return { location: `${basePathFor(row.site, input.host)}/ordre/${row.order.id}?t=${row.order.accessToken}`, paidOrderId: paid ? row.order.id : null };
}

/**
 * Kunden vil heller prøve en annen betalingsmåte. Sjekker først om betalingen likevel har gått gjennom.
 * Ellers stoppes den hos Vipps eller Klarna, ordren kanselleres, og kunden sendes tilbake til handlekurven.
 */
export async function handleCustomerCancel(db: Db, input: { orderId: string; token: string; host: string }): Promise<CustomerRedirect | null> {
  const row = await customerOrder(db, input.orderId, input.token);
  if (!row) return null;
  const base = basePathFor(row.site, input.host);
  const orderPage = `${base}/ordre/${row.order.id}?t=${row.order.accessToken}`;
  try {
    const synced = await syncLoaded(db, row.site, row.order, {});
    if (synced.status !== "pending_payment") return { location: synced.status === "cancelled" ? `${base}/handlekurv` : orderPage, paidOrderId: synced.paid ? row.order.id : null };
    if (await abortPendingPayment(db, row.site, row.order, null, "cancelled_by_customer")) return { location: `${base}/handlekurv`, paidOrderId: null };
    // Ordren ble endret i mellomtiden (for eksempel betalt). Kvitteringssiden viser hva som gjelder.
    return { location: orderPage, paidOrderId: null };
  } catch (err) {
    logFailure("Avbrudd av betaling feilet", row.order.id, err);
    return { location: orderPage, paidOrderId: null };
  }
}

// ---------- Bakgrunnsjobben ----------

export type SweepSummary = { checked: number; paid: number; cancelled: number; waiting: number; failed: number };

/**
 * Hvert tiende minutt: sjekker alle ordre som venter på Vipps eller Klarna. Fanger opp kunder som betalte, men aldri
 * kom tilbake til butikken, og rydder bort betalinger som ble avbrutt eller gikk ut på tid, så varene kommer tilbake på lager.
 */
export async function sweepPayments(db: Db, opts: { now?: Date; limit?: number; onPaid?: (orderId: string) => Promise<void> } = {}): Promise<SweepSummary> {
  const rows = await db
    .select({ order: orders, site: sites })
    .from(orders)
    .innerJoin(sites, eq(orders.siteId, sites.id))
    .where(and(eq(orders.status, "pending_payment"), inArray(orders.paymentMethod, ["vipps", "klarna"])))
    .orderBy(asc(orders.createdAt))
    .limit(opts.limit ?? 100);
  const ctx: PaymentContext = { now: opts.now, sweep: true, clients: new Map() };
  const summary: SweepSummary = { checked: 0, paid: 0, cancelled: 0, waiting: 0, failed: 0 };
  for (const { order, site } of rows) {
    summary.checked++;
    try {
      const result = await syncLoaded(db, site, order, ctx);
      if (result.paid) {
        summary.paid++;
        await opts.onPaid?.(order.id).catch((err) => console.error("Ordrebekreftelsen feilet", order.id, err instanceof Error ? err.message : err));
      } else if (result.cancelled) summary.cancelled++;
      else summary.waiting++;
    } catch (err) {
      summary.failed++;
      logFailure("Betalingssjekk feilet", order.id, err);
    }
  }
  return summary;
}

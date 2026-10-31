import { z } from "zod";

/**
 * Transportører med sporingslenke. Helthjem har ingen kjent lenke med nummer,
 * så kunden kommer til sporingssiden og limer inn nummeret selv.
 */
export const carriers = {
  posten: { label: "Posten / Bring", url: (n: string) => `https://sporing.posten.no/sporing/${encodeURIComponent(n)}` },
  postnord: { label: "PostNord", url: (n: string) => `https://www.postnord.no/pakkesporing?shipmentId=${encodeURIComponent(n)}` },
  helthjem: { label: "Helthjem", url: () => "https://helthjem.no/sporing" },
  dhl: { label: "DHL", url: (n: string) => `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${encodeURIComponent(n)}` },
  annen: { label: "Annen", url: null },
} as const;

export type CarrierKey = keyof typeof carriers;
export const carrierKeys = Object.keys(carriers) as CarrierKey[];

export const trackingSchema = z.object({
  carrier: z.enum(carrierKeys as [CarrierKey, ...CarrierKey[]]),
  number: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{4,40}$/, "Sporingsnummeret kan ha 4-40 tegn: bokstaver, tall, mellomrom og bindestrek"),
});

export function trackingUrl(carrier: string | null, number: string | null): string | null {
  if (!carrier || !number || !(carrier in carriers)) return null;
  const c = carriers[carrier as CarrierKey];
  return c.url ? c.url(number.replace(/\s/g, "")) : null;
}

export function carrierLabel(carrier: string | null): string {
  return carrier && carrier in carriers ? carriers[carrier as CarrierKey].label : "Transportør";
}

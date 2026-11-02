import { z } from "zod";
import { isSafeHref } from "@/lib/content/fields";
import { mediaSrcPattern } from "@/lib/media-types";

/*
 * Innholdet i et nyhetsbrev: noen få enkle blokker som blir til e-post i nettstedets farger (lib/nyhetsbrev/email.ts).
 * Filen brukes også i nettleseren, så forhåndsvisningen i studioet bygges av samme kode som e-posten.
 */

export const blockTypes = {
  overskrift: "Overskrift",
  tekst: "Tekst",
  bilde: "Bilde",
  knapp: "Knapp med lenke",
} as const;
export type BlockType = keyof typeof blockTypes;

export const MAX_BLOCKS = 30;
export const MAX_SUBJECT = 120;
export const MAX_PREHEADER = 150;

const linkSchema = z
  .string()
  .trim()
  .max(500, "Lenken er for lang")
  .refine((v) => v === "" || (isSafeHref(v) && !v.startsWith("#")), "Lenken må starte med https:// eller /");

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("overskrift"), tekst: z.string().trim().max(150, "Overskriften er for lang") }),
  z.object({ type: z.literal("tekst"), tekst: z.string().trim().max(5000, "Teksten er for lang") }),
  z.object({
    type: z.literal("bilde"),
    src: z.string().refine((v) => v === "" || mediaSrcPattern.test(v), "Velg bildet fra bildene dine"),
    alt: z.string().trim().max(200, "Bildeteksten er for lang"),
  }),
  z.object({ type: z.literal("knapp"), tekst: z.string().trim().max(60, "Knappeteksten er for lang"), lenke: linkSchema }),
]);
export type NewsletterBlock = z.infer<typeof blockSchema>;

export const newsletterInputSchema = z.object({
  subject: z.string().trim().max(MAX_SUBJECT, `Emnet kan ha maks ${MAX_SUBJECT} tegn`),
  preheader: z.string().trim().max(MAX_PREHEADER, `Forhåndsvisningsteksten kan ha maks ${MAX_PREHEADER} tegn`),
  blocks: z.array(blockSchema).max(MAX_BLOCKS, `Maks ${MAX_BLOCKS} blokker`),
});
export type NewsletterInput = z.infer<typeof newsletterInputSchema>;

export function emptyBlock(type: BlockType): NewsletterBlock {
  switch (type) {
    case "overskrift":
      return { type, tekst: "" };
    case "tekst":
      return { type, tekst: "" };
    case "bilde":
      return { type, src: "", alt: "" };
    case "knapp":
      return { type, tekst: "", lenke: "" };
  }
}

/** Blokker fra databasen. Det som ikke lenger er gyldig, hoppes over i stedet for å velte siden. */
export function readBlocks(raw: unknown): NewsletterBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b) => {
    const parsed = blockSchema.safeParse(b);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Det som må være på plass før nyhetsbrevet kan sendes, også som testutgave. Kladden kan lagres uferdig.
 * Bilder uten beskrivelse stoppes, fordi skjermlesere og e-postprogrammer som ikke viser bilder, trenger teksten.
 */
export function sendProblems(input: NewsletterInput): string[] {
  const problems: string[] = [];
  if (!input.subject) problems.push("Skriv et emne.");
  const filled = input.blocks.filter((b) => (b.type === "bilde" ? b.src !== "" : b.tekst !== ""));
  if (filled.length === 0) problems.push("Skriv noe i nyhetsbrevet.");
  input.blocks.forEach((b, i) => {
    const n = i + 1;
    if (b.type === "bilde" && b.src && !b.alt) problems.push(`Blokk ${n}: skriv hva bildet viser.`);
    if (b.type === "bilde" && !b.src) problems.push(`Blokk ${n}: velg et bilde, eller fjern blokken.`);
    if (b.type === "knapp" && (!b.tekst || !b.lenke)) problems.push(`Blokk ${n}: knappen trenger både tekst og lenke.`);
  });
  return problems;
}

/**
 * Setningen ved påmeldingsknappen. Den lagres sammen med påmeldingen, så det alltid kan vises hva personen sa ja til.
 * Markedsføringsloven § 15 krever forhåndssamtykke til markedsføring på e-post.
 */
export function consentSentence(businessName: string): string {
  return `Ja, jeg vil få nyhetsbrev på e-post fra ${businessName}. Jeg kan melde meg av når som helst med lenken i hvert nyhetsbrev.`;
}

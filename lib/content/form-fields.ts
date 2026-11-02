import { z } from "zod";
import type { Field } from "./fields";
import { isEmail, isPhone } from "./fields";
import { parseOsloDate } from "@/lib/oslo-time";

/**
 * Egne felt i kontaktskjemaet. Kunden legger dem til i kontaktseksjonen, og de lagres i seksjonens innhold.
 * Svarene valideres på serveren mot den publiserte siden, aldri mot det nettleseren sender om feltene.
 */
export const formFieldTypes = [
  { value: "tekst", label: "Kort tekst" },
  { value: "langtekst", label: "Lang tekst" },
  { value: "valg", label: "Valgliste" },
  { value: "avkryssing", label: "Avkrysningsboks" },
  { value: "dato", label: "Dato" },
  { value: "telefon", label: "Telefon" },
  { value: "epost", label: "E-post" },
] as const;
export type FormFieldType = (typeof formFieldTypes)[number]["value"];

export const MAX_FORM_FIELDS = 10;

/** Feltlisten i kontaktseksjonen. Rekkefølgen i listen er rekkefølgen i skjemaet. */
export const formFieldsField: Field = {
  key: "skjemafelt",
  label: "Egne felt i skjemaet",
  type: "list",
  itemLabel: "Felt",
  max: MAX_FORM_FIELDS,
  optional: true,
  variants: ["skjema"],
  fields: [
    { key: "etikett", label: "Spørsmål eller feltnavn", type: "text", max: 80 },
    { key: "felttype", label: "Type", type: "select", options: formFieldTypes.map((t) => ({ value: t.value, label: t.label })) },
    { key: "valg", label: "Valgene, ett per linje (bare for valgliste)", type: "textarea", max: 600, optional: true },
    {
      key: "pakrevd",
      label: "Må fylles ut",
      type: "select",
      options: [
        { value: "nei", label: "Nei, valgfritt" },
        { value: "ja", label: "Ja, må fylles ut" },
      ],
    },
  ],
};

export type FormField = { label: string; type: FormFieldType; required: boolean; options: string[] };

const types = new Set<string>(formFieldTypes.map((t) => t.value));

/** Feltene slik skjemaet bruker dem. Felt uten navn, og valglister uten valg, hoppes over. */
export function readFormFields(props: Record<string, unknown>): FormField[] {
  const raw = Array.isArray(props.skjemafelt) ? props.skjemafelt : [];
  const fields: FormField[] = [];
  for (const item of raw.slice(0, MAX_FORM_FIELDS)) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const label = typeof v.etikett === "string" ? v.etikett.trim() : "";
    const type = typeof v.felttype === "string" && types.has(v.felttype) ? (v.felttype as FormFieldType) : "tekst";
    const options = type === "valg" && typeof v.valg === "string" ? choiceOptions(v.valg) : [];
    if (!label || (type === "valg" && options.length === 0)) continue;
    fields.push({ label, type, required: v.pakrevd === "ja", options });
  }
  return fields;
}

/** Valgene i en valgliste: ett per linje, uten tomme linjer og uten dubletter. */
export function choiceOptions(text: string): string[] {
  return [...new Set(text.split("\n").map((l) => l.trim().slice(0, 100)).filter(Boolean))].slice(0, 30);
}

/** Det som må rettes før skjemaet kan publiseres. Vises på seksjonen i redigereren. */
export function formFieldProblems(props: Record<string, unknown>): string[] {
  const raw = Array.isArray(props.skjemafelt) ? props.skjemafelt : [];
  const problems: string[] = [];
  raw.forEach((item, i) => {
    const v = (item ?? {}) as Record<string, unknown>;
    if (v.felttype === "valg" && (typeof v.valg !== "string" || choiceOptions(v.valg).length === 0)) {
      problems.push(`Felt ${i + 1}: skriv minst ett valg i valglisten`);
    }
  });
  return problems;
}

/** Navnet på feltet i skjemaet. Bygger på plassen i listen, fordi feltene ikke har egen id. */
export const formFieldName = (index: number) => `felt-${index}`;

const MAX_ANSWER: Record<FormFieldType, number> = {
  tekst: 200,
  langtekst: 2000,
  valg: 100,
  avkryssing: 3,
  dato: 10,
  telefon: 30,
  epost: 120,
};

/** Zod-skjema for ett svar. Tom streng betyr ikke svart. */
function answerSchema(field: FormField): z.ZodType<string> {
  const name = `«${field.label}»`;
  const max = MAX_ANSWER[field.type];
  let s: z.ZodType<string> = z.string().trim().max(max, `Svaret på ${name} er for langt`);
  switch (field.type) {
    case "valg":
      s = s.refine((v) => v === "" || field.options.includes(v), `Velg et av valgene i ${name}`);
      break;
    case "avkryssing":
      // En avkrysningsboks sender «ja» når den er krysset av, og ingenting ellers.
      s = s.refine((v) => v === "" || v === "ja", `Ugyldig svar i ${name}`);
      break;
    case "dato":
      s = s.refine((v) => v === "" || parseOsloDate(v) !== null, `Velg en gyldig dato i ${name}`);
      break;
    case "telefon":
      s = s.refine((v) => v === "" || isPhone(v), `Telefonnummeret i ${name} må ha minst åtte siffer`);
      break;
    case "epost":
      s = s.refine((v) => v === "" || isEmail(v), `Sjekk e-postadressen i ${name}`);
      break;
  }
  if (field.required) {
    s = s.refine((v) => v !== "", field.type === "avkryssing" ? `Kryss av for ${name}` : `Fyll ut ${name}`);
  }
  return s;
}

export type FormAnswer = { label: string; value: string };

/**
 * Leser og sjekker svarene fra skjemaet. `values` er feltnavn til tekst, som fra FormData.
 * Ved feil kommer feltnavnet med, så skjemaet kan flytte fokus dit.
 */
export function parseFormAnswers(
  fields: FormField[],
  values: Record<string, string>,
): { ok: true; answers: FormAnswer[] } | { ok: false; message: string; field: string } {
  const answers: FormAnswer[] = [];
  for (const [i, field] of fields.entries()) {
    const name = formFieldName(i);
    const parsed = answerSchema(field).safeParse(values[name] ?? "");
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message, field: name };
    const value = parsed.data;
    if (field.type === "avkryssing") answers.push({ label: field.label, value: value === "ja" ? "Ja" : "Nei" });
    else if (value) answers.push({ label: field.label, value: field.type === "dato" ? norwegianDate(value) : value });
  }
  return { ok: true, answers };
}

/** «2026-12-24» blir «24.12.2026». */
function norwegianDate(value: string): string {
  const [y, m, d] = value.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Meldingen med svarene under, én linje per felt. Svarene lagres for seg i inquiries.answers, og meldingen
 * lagres slik den ble skrevet. Denne brukes der alt må stå som én tekst, som i e-postvarselet i ren tekst.
 * Eldre henvendelser har svarene lagret slik, nederst i meldingen.
 */
export function messageWithAnswers(message: string, answers: FormAnswer[]): string {
  if (!answers.length) return message;
  return [message, "", ...answers.map((a) => `${a.label}: ${a.value.replace(/\s*\n\s*/g, " / ")}`)].join("\n");
}

/** Svarene slik de er lagret i inquiries.answers. Alt som ikke ser riktig ut, hoppes over, så en eldre eller ødelagt verdi aldri feiler. */
export function readAnswers(raw: unknown): FormAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is FormAnswer => Boolean(a) && typeof a === "object" && typeof (a as FormAnswer).label === "string" && typeof (a as FormAnswer).value === "string")
    .map((a) => ({ label: a.label, value: a.value }));
}

/**
 * Roboter som går forbi honningkrukken, fyller ofte feltene med bare en nettadresse (gjerne med kolon rundt).
 * Ingen ekte kunde skriver en nettadresse som bransje, eller bare adresser i både bedrift og melding.
 */
const bareUrl = (value: string) => /^[\s:]*https?:\/\/\S+[\s:]*$/i.test(value);

export function looksLikeLeadSpam(fields: { company?: string; bransje?: string; message?: string }): boolean {
  if (bareUrl(fields.bransje ?? "")) return true;
  return bareUrl(fields.company ?? "") && bareUrl(fields.message ?? "");
}

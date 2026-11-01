import { ui } from "./ui";

/** Kort hjelp for utskrift av fraktetiketter på termoskriver. Samme tekst står i docs/BRING.md. */
export function LabelPrintHelp() {
  return (
    <details className={`${ui.card} p-4 text-sm`}>
      <summary className="cursor-pointer font-semibold">Slik skriver du ut etiketter på termoskriver</summary>
      <div className={`mt-3 space-y-2 ${ui.muted}`}>
        <p>Etikettene fra Bring er A6 (10 x 15 cm). De passer en termoskriver som Zebra GK420d.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Sett etikettstørrelsen i skriverdriveren til 102 x 152 mm.</li>
          <li>Sett skaleringen til 100 %.</li>
          <li>Velg ingen marger i utskriftsvinduet i nettleseren, og la skaleringen stå på standard.</li>
        </ol>
        <p>Da blir strekkoden skarp og etiketten fyller hele arket.</p>
      </div>
    </details>
  );
}

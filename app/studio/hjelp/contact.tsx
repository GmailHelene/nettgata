import { ui } from "@/components/studio/ui";
import { HELP_CONTACT_EMAIL } from "@/lib/hjelp/artikler";

/** Nederst i hjelpen. Bare skriftlig kontakt, så svaret kan sjekkes og deles. */
export function HelpContact({ subject }: { subject?: string }) {
  const href = `mailto:${HELP_CONTACT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
  return (
    <section aria-labelledby="fant-du-ikke" className={`${ui.card} mt-12 p-5`}>
      <h2 id="fant-du-ikke" className="font-semibold">
        Fant du ikke svaret?
      </h2>
      <p className={`mt-1 text-sm ${ui.muted}`}>
        Send en melding til{" "}
        <a href={href} className={ui.link}>
          {HELP_CONTACT_EMAIL}
        </a>
        . Skriv hvilket nettsted det gjelder og hva du prøvde å gjøre. Et skjermbilde hjelper mye.
      </p>
    </section>
  );
}

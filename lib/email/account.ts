import { emailParts, type Rendered } from "@/lib/email/templates";

const { esc, button, paragraph, layout, platformFooter } = emailParts;

/**
 * E-postene om selve kontoen i Nettgata: bekreftelse, «du har allerede en konto», velkommen, nytt passord og
 * varsel før et ubetalt nettsted slettes. Teksten følger skriv-norsk: vanlig norsk, ingen tankestrek.
 */

type Part = { html: string; text: string };

const p = (text: string): Part => ({ html: paragraph(esc(text)), text });
const small = (text: string): Part => ({ html: paragraph(esc(text), "font-size:14px;color:#555555;"), text });
const link = (url: string, label: string): Part => ({ html: button(url, label), text: url });

function render(o: { subject: string; preheader: string; heading: string; parts: Part[]; reason: string }): Rendered {
  return {
    subject: o.subject,
    text: [...o.parts.map((part) => part.text), "", "Hilsen Nettgata"].join("\n\n"),
    html: layout({
      subject: o.subject,
      preheader: o.preheader,
      brand: "Nettgata",
      heading: o.heading,
      body: [...o.parts.map((part) => part.html), paragraph("Hilsen Nettgata")].join(""),
      footer: platformFooter(o.reason),
    }),
  };
}

const notYou = "Du får dette fordi noen registrerte en konto med denne adressen på nettgata.no. Var det ikke deg, kan du se bort fra e-posten.";

export function verifyEmail(o: { name: string; link: string }): Rendered {
  return render({
    subject: "Bekreft e-posten din hos Nettgata",
    preheader: "Ett klikk, så kan du lage nettstedet ditt",
    heading: `Hei, ${o.name}`,
    parts: [
      p("Takk for at du vil prøve Nettgata. Trykk på knappen for å bekrefte e-postadressen, så kan du lage nettstedet ditt med en gang."),
      link(o.link, "Bekreft e-posten"),
      small(`Lenken virker i 48 timer. Virker ikke knappen, kan du lime inn denne adressen i nettleseren: ${o.link}`),
      small("Kontoer som ikke er bekreftet, slettes etter sju dager."),
    ],
    reason: notYou,
  });
}

/** Sendes når noen registrerer seg med en adresse som allerede har konto. Skjemaet svarer det samme som ellers. */
export function alreadyRegisteredEmail(o: { loginLink: string; resetLink: string }): Rendered {
  return render({
    subject: "Du har allerede en konto hos Nettgata",
    preheader: "Logg inn med e-posten din",
    heading: "Du har allerede en konto",
    parts: [
      p("Noen prøvde nettopp å registrere en ny konto hos Nettgata med denne e-postadressen. Adressen har allerede en konto, så det ble ikke laget noen ny."),
      link(o.loginLink, "Logg inn"),
      p(`Husker du ikke passordet, kan du lage et nytt her: ${o.resetLink}`),
    ],
    reason: "Var det ikke deg som prøvde å registrere deg, trenger du ikke gjøre noe. Kontoen din er ikke endret.",
  });
}

export function welcomeEmail(o: { name: string; newSiteLink: string; helpLink: string }): Rendered {
  return render({
    subject: "Velkommen til Nettgata",
    preheader: "Tre ting du kan gjøre nå",
    heading: `Velkommen, ${o.name}`,
    parts: [
      p("E-posten er bekreftet, og kontoen er klar. Du kan bygge og forhåndsvise så mye du vil uten å betale noe. Abonnementet velger du først når nettstedet skal publiseres."),
      p("1. Lag nettstedet. Skriv org.nr., så henter studioet navn og adresse fra Brønnøysundregistrene og foreslår bransje. Velg et tema du liker."),
      p("2. Fyll inn det som er ditt. Sidene kommer med tekstutkast for bransjen. Bytt ut teksten der det står «Skriv ...», og legg inn egne bilder og priser."),
      p("3. Se hvordan det blir. Trykk «Forhåndsvis» for å se siden på mobil og PC, og send forhåndsvisningslenken til noen du stoler på."),
      link(o.newSiteLink, "Lag nettstedet"),
      p(`Står du fast, finner du svar på det meste i hjelpen: ${o.helpLink}`),
      small("Har du spørsmål, svarer du bare på denne e-posten."),
    ],
    reason: "Du får dette fordi du har bekreftet en konto hos Nettgata.",
  });
}

export function resetPasswordEmail(o: { link: string }): Rendered {
  return render({
    subject: "Nytt passord til Nettgata",
    preheader: "Lenken virker i én time",
    heading: "Lag nytt passord",
    parts: [
      p("Noen ba om å få lage nytt passord til kontoen din hos Nettgata. Trykk på knappen for å velge et nytt."),
      link(o.link, "Lag nytt passord"),
      small(`Lenken virker i én time og kan brukes én gang. Virker ikke knappen, kan du lime inn denne adressen i nettleseren: ${o.link}`),
      small("Når passordet er byttet, blir du logget ut overalt der du var logget inn."),
    ],
    reason: "Ba du ikke om nytt passord, kan du se bort fra e-posten. Passordet ditt er ikke endret.",
  });
}

export function inactivityWarningEmail(o: { siteName: string; deleteOn: string; loginLink: string; subscribeLink: string }): Rendered {
  return render({
    subject: `${o.siteName} blir slettet ${o.deleteOn}`,
    preheader: "Logg inn for å beholde nettstedet",
    heading: `Vil du beholde ${o.siteName}?`,
    parts: [
      p(`Ingen har vært innom ${o.siteName} i studioet på 60 dager, og nettstedet har ikke abonnement. Nettsteder uten abonnement som ingen bruker, sletter jeg for å ikke lagre data om deg lenger enn nødvendig.`),
      p(`Nettstedet blir slettet ${o.deleteOn}, med sidene, tekstene og bildene. Vil du beholde det, holder det å logge inn.`),
      link(o.loginLink, "Logg inn og behold nettstedet"),
      p(`Vil du publisere det, kan du velge abonnement her: ${o.subscribeLink}`),
      small("Trenger du det ikke lenger, trenger du ikke gjøre noe."),
    ],
    reason: "Du får dette fordi du er eier av et nettsted i Nettgata.",
  });
}

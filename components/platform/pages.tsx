import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PageRenderer } from "@/components/sections";
import { bransjeLabel, genres, lowerLabel } from "@/lib/genres";
import { packPreview } from "@/lib/pack-preview";
import { getPack } from "@/lib/packs";
import { bransjeHeading, landingBransjer, type PlatformRoute } from "@/lib/platform-routes";
import { buildTheme, getThemeDef, themes } from "@/lib/themes";
import type { Need } from "@/lib/leads";
import { plattformDokument, type PlattformDokument } from "@/lib/legal/plattform";
import { GRONBERG, sideSomTekst } from "@/lib/legal/felles";
import { ConsentBanner, ConsentReset } from "./consent";
import { LeadForm } from "./lead-form";

/*
 * Salgssidene på nettgata.no. Uttrykket er hentet fra en norsk småbygate: emaljeskilt i gateblått, trehusfasader
 * i falurødt, oker og grangrønt, og asfalt. Gata øverst på forsiden er det ene som skal huskes. Resten er rolig.
 *
 * Miniatyrene er ekte sider fra bransjepakkene med temaene på, tegnet på serveren og krympet med CSS zoom.
 * Det kunden ser her, er det hun får.
 */

const heading = "font-[family-name:var(--font-bricolage)] font-extrabold tracking-[-0.025em]";
const signType = "font-[family-name:var(--font-barlow)] font-bold uppercase tracking-[0.14em]";
const muted = "text-[#47525c]";
const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const button =
  "inline-flex items-center justify-center rounded-lg bg-[#173b6c] px-6 py-3.5 font-semibold text-white transition-colors hover:bg-[#0f2c55]";
const buttonGhost =
  "inline-flex items-center justify-center rounded-lg border-2 border-[#173b6c] px-6 py-3 font-semibold text-[#173b6c] transition-colors hover:bg-[#173b6c]/5";
/** Mørke flater (gateblått og asfalt) trenger hvit fokusring. */
const onDark = "text-white [&_:focus-visible]:!outline-white";

export type PlatformEnv = { tagId: string; sendTo: string };

/** Eksempler i temagalleriet. Generiske navn, så ingen forveksles med ekte bedrifter. */
const showcase = [
  { theme: "atelier", pack: "frisor", name: "Salongen" },
  { theme: "verksted", pack: "rorlegger", name: "Rørleggeren" },
  { theme: "bistro", pack: "kafe", name: "Kafeen" },
  { theme: "klinikk", pack: "fysioterapeut", name: "Fysioklinikken" },
  { theme: "kontor", pack: "regnskap", name: "Regnskapskontoret" },
  { theme: "boutique", pack: "klaer", name: "Klesbutikken" },
  { theme: "galleri", pack: "fotograf", name: "Fotografen" },
  { theme: "hytte", pack: "overnatting", name: "Hytta" },
  { theme: "puls", pack: "treningssenter", name: "Treningssenteret" },
  { theme: "leken", pack: "idrettslag", name: "Idrettslaget" },
  { theme: "nordlys", pack: "it", name: "IT-hjelpen" },
  { theme: "fjord", pack: "konsulent", name: "Rådgiveren" },
] as const;

const THUMB = 336;

/** Forsiden til en bransjepakke med et tema på, krympet til et kort. Bare et bilde: kan ikke fokuseres og leses ikke opp. */
function Thumb({ theme, palette, pack, name, width = THUMB }: { theme: string; palette?: string; pack: string; name: string; width?: number }) {
  const p = getPack(pack);
  const t = buildTheme(theme, palette);
  if (!p || !t) return null;
  const { pages, ctx } = packPreview(p, { name, info: {} });
  const front = pages.find((x) => x.path === "/") ?? pages[0];
  return (
    // Smalere skjerm enn miniatyren: den kuttes til høyre i stedet for å gjøre hele siden bredere.
    <div inert aria-hidden="true" className="max-w-full overflow-hidden rounded-[3px] bg-white [&_header]:!static" style={{ width, height: Math.round(width * 0.6875) }}>
      <div style={{ width: 1280, zoom: width / 1280 }}>
        <PageRenderer content={{ ...front.content, sections: front.content.sections.slice(0, 3) }} theme={t} ctx={ctx} embedded />
      </div>
    </div>
  );
}

function Swatches({ themeKey }: { themeKey: string }) {
  const def = getThemeDef(themeKey);
  if (!def) return null;
  return (
    <ul className="flex gap-1.5" aria-label={`Fargevarianter: ${def.palettes.map((p) => p.label).join(", ")}`}>
      {def.palettes.map((p) => (
        <li
          key={p.key}
          title={p.label}
          className="h-5 w-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.18)]"
          style={{ background: `linear-gradient(135deg, ${p.colors.background} 0 50%, ${p.colors.primary} 50% 100%)` }}
        />
      ))}
    </ul>
  );
}

/** Logoen er et emaljert gateskilt: hvit skrift og hvit kant på gateblått. */
function StreetSign({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="inline-flex rounded-[6px] bg-[#173b6c] p-[3px] shadow-[0_1px_0_rgb(0_0_0/0.3)]">
      <span
        className={`${signType} rounded-[4px] border-2 border-white leading-none text-white ${size === "lg" ? "px-3.5 pb-1 pt-1.5 text-xl" : "px-2.5 pb-[3px] pt-[5px] text-[1.05rem]"}`}
      >
        Nettgata
      </span>
    </span>
  );
}

const nav = [
  ["/temaer", "Temaer"],
  ["/bransjer", "Bransjer"],
  ["/nettbutikk", "Nettbutikk"],
  ["/#priser", "Priser"],
] as const;

/** `leadHref`: skjemaet ligger nederst på de fleste sidene. Der det ikke gjør det (vilkår og personvern), går knappen til forsiden. */
export function PlatformChrome({ env, children, leadHref = "#kom-i-gang" }: { env: PlatformEnv; children: ReactNode; leadHref?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-white font-[family-name:var(--font-archivo)] text-[#1b232b] [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-[#173b6c]">
      <a href="#innhold" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3">
        Hopp til innhold
      </a>
      <header className="sticky top-0 z-40 border-b border-[#1b232b]/10 bg-white/90 backdrop-blur">
        <div className={`${container} flex h-16 items-center gap-7`}>
          <Link href="/" className="shrink-0">
            <StreetSign />
          </Link>
          <nav aria-label="Hovedmeny" className="hidden flex-1 md:block">
            <ul className="flex gap-7 text-[0.95rem]">
              {nav.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="underline-offset-8 hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/studio" className="hidden text-[0.95rem] hover:underline sm:inline">
              Logg inn
            </Link>
            <a href={leadHref} className="rounded-lg bg-[#173b6c] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#0f2c55]">
              Få nettside
            </a>
          </div>
        </div>
        <nav aria-label="Hovedmeny for mobil" className="border-t border-[#1b232b]/10 md:hidden">
          <ul className={`${container} flex gap-5 overflow-x-auto py-0.5 text-sm [scrollbar-width:none]`}>
            {nav.map(([href, label]) => (
              <li key={href} className="shrink-0">
                <Link href={href} className="block py-2">
                  {label}
                </Link>
              </li>
            ))}
            <li className="shrink-0">
              <Link href="/studio" className="block py-2">
                Logg inn
              </Link>
            </li>
          </ul>
        </nav>
      </header>
      <main id="innhold" className="flex-1">
        {children}
      </main>
      <footer className={`bg-[#1b232b] ${onDark}`}>
        <div className={`${container} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4`}>
          <div className="space-y-4 lg:col-span-2">
            <StreetSign size="lg" />
            <p className="max-w-sm text-white/85">Nettsider og nettbutikker for norske bedrifter. Laget og drevet av Grønberg Tech Solutions i Modum.</p>
          </div>
          <div>
            <h2 className="mb-3 font-semibold">Nettgata</h2>
            <ul className="space-y-2 text-white/85">
              {nav.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 font-semibold">Kontakt og vilkår</h2>
            <ul className="space-y-2 text-white/85">
              <li>
                <a href="mailto:kontakt@helene.cloud" className="hover:underline">
                  kontakt@helene.cloud
                </a>
              </li>
              <li>
                <Link href="/personvern" className="hover:underline">
                  Personvern
                </Link>
              </li>
              <li>
                <Link href="/vilkar" className="hover:underline">
                  Vilkår
                </Link>
              </li>
              <li>
                <Link href="/databehandleravtale" className="hover:underline">
                  Databehandleravtale
                </Link>
              </li>
              <li>
                <ConsentReset tagId={env.tagId} />
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/15">
          <p className={`${container} py-5 text-sm text-white/75`}>
            © {new Date().getFullYear()} {GRONBERG.navn} · Org.nr. {GRONBERG.orgnr} MVA · {GRONBERG.adresse} ·{" "}
            <a href={`mailto:${GRONBERG.epost}`} className="underline hover:text-white">
              {GRONBERG.epost}
            </a>
          </p>
        </div>
      </footer>
      <ConsentBanner tagId={env.tagId} />
    </div>
  );
}

function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <p className={`mb-3 text-sm font-semibold uppercase tracking-[0.12em] ${dark ? "text-[#a8d5c0]" : "text-[#2f5a47]"}`}>{children}</p>;
}

/* ---------- Gata ---------- */

type Shop = {
  pack: string;
  theme: string;
  name: string;
  sign: string;
  /** Veggen, skiltet og skriften på skiltet. Skriften holder kontrastkravet mot skiltet. */
  wall: string;
  plate: string;
  ink: string;
  roof: "saltak" | "flatt";
  /** Ekstra høyde over skiltet, så takene ikke står på linje. */
  lift: number;
};

/** Fem butikker i gata, i gamle trehusfarger. Vinduet viser forsiden fra bransjepakken i et av temaene. */
const street: Shop[] = [
  { pack: "frisor", theme: "atelier", name: "Salongen", sign: "Frisør", wall: "#c9dce6", plate: "#173b6c", ink: "#ffffff", roof: "saltak", lift: 0 },
  { pack: "rorlegger", theme: "verksted", name: "Rørleggeren", sign: "Rørlegger", wall: "#e3b04b", plate: "#1b232b", ink: "#ffffff", roof: "flatt", lift: 30 },
  { pack: "kafe", theme: "bistro", name: "Kafeen", sign: "Kafé", wall: "#a13a2c", plate: "#f7f3ea", ink: "#1b232b", roof: "saltak", lift: 12 },
  { pack: "regnskap", theme: "kontor", name: "Regnskapskontoret", sign: "Regnskap", wall: "#e6e1d7", plate: "#2f5a47", ink: "#ffffff", roof: "flatt", lift: 42 },
  { pack: "klaer", theme: "boutique", name: "Klesbutikken", sign: "Klær", wall: "#2f5a47", plate: "#f7f3ea", ink: "#1b232b", roof: "saltak", lift: 6 },
];

const shopStreet: Shop[] = [
  { pack: "klaer", theme: "boutique", name: "Klesbutikken", sign: "Klær", wall: "#2f5a47", plate: "#f7f3ea", ink: "#1b232b", roof: "saltak", lift: 8 },
  { pack: "interior", theme: "atelier", name: "Interiørbutikken", sign: "Interiør", wall: "#e3b04b", plate: "#1b232b", ink: "#ffffff", roof: "flatt", lift: 34 },
  { pack: "lokalmat", theme: "hytte", name: "Gårdsbutikken", sign: "Gårdsbutikk", wall: "#a13a2c", plate: "#f7f3ea", ink: "#1b232b", roof: "saltak", lift: 0 },
];

/** Fargene går på rundgang for bransjesidene, så hver bransje får sin egen fasade. */
const facadeColors = [street[0], street[2], street[1], street[4], street[3]];

/**
 * Én fasade. Miniatyren har lenker og knapper inni seg, så lenken til bransjen ligger over fasaden som et
 * søsken i stedet for rundt den. Ellers blir det lenker inni en lenke, og nettleseren knekker oppsettet.
 */
function Facade({ shop, index, width, href, label }: { shop: Shop; index: number; width: number; href?: string; label?: string }) {
  return (
    <div className="gata-facade group relative flex flex-col items-center" style={{ width, "--i": index } as CSSProperties}>
      {shop.roof === "saltak" ? (
        <span aria-hidden="true" className="block h-11 w-[calc(100%+14px)] bg-[#2b3238] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
      ) : (
        <span aria-hidden="true" className="block h-2.5 w-[calc(100%+10px)] rounded-[2px] bg-[#2b3238]" />
      )}
      <div className="gata-panel flex w-full flex-col items-center gap-3 px-[15px]" style={{ backgroundColor: shop.wall, paddingTop: 16 + shop.lift }}>
        <span className={`${signType} rounded-[4px] px-3 pb-[3px] pt-[5px] text-[0.8rem] leading-none shadow-[0_1px_0_rgb(0_0_0/0.25)]`} style={{ background: shop.plate, color: shop.ink }}>
          {shop.sign}
        </span>
        <div className="rounded-[4px] bg-white p-[3px] shadow-[0_6px_18px_-8px_rgb(0_0_0/0.45)] transition-shadow duration-200 group-hover:shadow-[0_12px_26px_-8px_rgb(0_0_0/0.55)]">
          <Thumb theme={shop.theme} pack={shop.pack} name={shop.name} width={width - 36} />
        </div>
        <span aria-hidden="true" className="mt-1 block h-12 w-10 rounded-t-[3px] opacity-90" style={{ background: shop.plate }} />
      </div>
      {href && <Link href={href} aria-label={label} className="absolute inset-0 z-10 rounded-sm" />}
    </div>
  );
}

/** Den tomme tomta i enden av gata går til skjemaet. */
function VacantLot({ index }: { index: number }) {
  return (
    <a
      href="#kom-i-gang"
      className="gata-facade flex w-[160px] flex-col items-center justify-end gap-2 rounded-t-sm border-2 border-b-0 border-dashed border-[#173b6c]/50 px-4 pb-5 pt-6 text-center"
      style={{ "--i": index } as CSSProperties}
    >
      <span className={`${signType} rounded-[4px] border-2 border-[#173b6c] px-3 pb-[3px] pt-[5px] text-[0.8rem] leading-none text-[#173b6c]`}>Ledig</span>
      <span className="font-semibold leading-snug">Plass til bedriften din</span>
      <span className="text-sm text-[#173b6c] underline underline-offset-4">Få nettside</span>
    </a>
  );
}

function Street({ shops, width, vacant = true, inset = true, label }: { shops: Shop[]; width: number; vacant?: boolean; inset?: boolean; label: string }) {
  return (
    <div className="gata-street pb-[23px]">
      <div className="snap-x snap-proximity overflow-x-auto [scrollbar-width:thin]">
        <ul aria-label={label} className={`mx-auto flex w-max items-end gap-2.5 ${inset ? "px-4 sm:px-6" : ""}`}>
          {shops.map((shop, i) => (
            <li key={shop.pack} className="flex snap-start">
              <Facade shop={shop} index={i} width={width} href={`/bransjer/${shop.pack}`} label={`${shop.sign}: se nettsiden for bransjen`} />
            </li>
          ))}
          {vacant && (
            <li className="flex self-stretch">
              <VacantLot index={shops.length} />
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

const facts = "Fra 199 kr i måneden eks. mva · Ingen bindingstid · Svar innen én virkedag";

/** Forsiden: overskrift og gata. */
function StreetHero() {
  return (
    <section className="overflow-hidden pt-12 sm:pt-16 lg:pt-20">
      <div className={container}>
        <Eyebrow>Nettsider og nettbutikker for norske bedrifter</Eyebrow>
        <h1 className={`${heading} max-w-4xl text-[2.55rem] leading-[1.02] text-balance sm:text-6xl lg:text-[4.3rem]`}>
          Nettsiden til frisøren, rørleggeren og kafeen på hjørnet
        </h1>
        <p className={`mt-7 max-w-xl text-lg leading-relaxed ${muted}`}>
          Velg bransje, så får du sidene, tekstene og prislisten ferdig. Du fyller inn det som er ditt, eller lar meg gjøre det for deg. Domenet står
          alltid i ditt navn.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex flex-wrap gap-3">
            <a href="#kom-i-gang" className={button}>
              Få nettside
            </a>
            <Link href="/temaer" className={buttonGhost}>
              Se temaene
            </Link>
          </div>
          <p className={`text-sm ${muted}`}>{facts}</p>
        </div>
      </div>
      <div className="mt-12">
        <Street shops={street} width={196} label="Eksempler fra bransjepakkene, én butikk per bransje" />
      </div>
      <p className={`${container} mt-3 text-sm ${muted}`}>Hvert vindu er forsiden fra en bransjepakke i et av temaene. Trykk på en butikk for å se hele bransjen.</p>
    </section>
  );
}

/** Toppen på de andre salgssidene: tekst til venstre, bilde eller gate til høyre. */
function Hero({ eyebrow, title, text, children }: { eyebrow: string; title: string; text: string; children?: ReactNode }) {
  return (
    <section className="overflow-hidden">
      <div className={`${container} grid items-end gap-12 pb-14 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pb-20 lg:pt-20 [&>*]:min-w-0`}>
        <div className="lg:pb-6">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className={`${heading} text-4xl leading-[1.04] text-balance sm:text-5xl lg:text-[3.5rem]`}>{title}</h1>
          <p className={`mt-6 max-w-xl text-lg leading-relaxed ${muted}`}>{text}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#kom-i-gang" className={button}>
              Få nettside
            </a>
            <Link href="/temaer" className={buttonGhost}>
              Se temaene
            </Link>
          </div>
          <p className={`mt-6 text-sm ${muted}`}>{facts}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function Section({ id, eyebrow, title, intro, children, tone = "plain" }: { id?: string; eyebrow?: string; title: string; intro?: string; children: ReactNode; tone?: "plain" | "kalk" }) {
  return (
    <section id={id} className={`scroll-mt-24 py-16 sm:py-24 ${tone === "kalk" ? "bg-[#f2f4f5]" : ""}`}>
      <div className={container}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className={`${heading} max-w-3xl text-3xl leading-[1.08] text-balance sm:text-[2.6rem]`}>{title}</h2>
        {intro && <p className={`mt-4 max-w-2xl text-lg leading-relaxed ${muted}`}>{intro}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/** Rekkefølgen er ekte (org.nr., så bransje og tema, så innhold), derfor nummerert. */
function Steps() {
  const steps = [
    ["Fortell hvem du er", "Org.nr. er nok. Navn og adresse hentes fra Brønnøysundregistrene, og bransjen blir foreslått ut fra næringskoden."],
    ["Velg bransje og tema", "45 bransjepakker og 12 temaer med fire fargevarianter hver. Du ser din egen side i hvert tema før du velger."],
    ["Fyll inn og publiser", "Sidene er laget og tekstene skrevet. Bytt ut det som skal være ditt, last opp bilder og trykk Publiser."],
  ];
  return (
    <ol className="grid gap-px overflow-hidden rounded-2xl bg-[#1b232b]/10 ring-1 ring-[#1b232b]/10 md:grid-cols-3">
      {steps.map(([title, text], i) => (
        <li key={title} className="bg-white p-7">
          <span aria-hidden="true" className={`${heading} block text-5xl leading-none text-[#a13a2c]`}>
            {i + 1}
          </span>
          <h3 className={`${heading} mt-5 text-xl`}>{title}</h3>
          <p className={`mt-2 leading-relaxed ${muted}`}>{text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Sjangrene som gateskilt. Hvert skilt går til sjangeren på bransjesiden. */
function GenreSigns() {
  return (
    <ul className="flex flex-wrap gap-3">
      {genres.map((g) => (
        <li key={g.key}>
          <Link
            href={`/bransjer#${g.key}`}
            className={`${signType} inline-flex rounded-[5px] bg-[#173b6c] p-[3px] text-[0.85rem] leading-none text-white shadow-[0_1px_0_rgb(0_0_0/0.3)] transition-colors hover:bg-[#0f2c55]`}
          >
            <span className="rounded-[3px] border-[1.5px] border-white/90 px-3 pb-[5px] pt-[7px]">{g.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Showcase({ keys }: { keys?: string[] }) {
  const items = keys ? showcase.filter((s) => keys.includes(s.theme)) : showcase.slice(0, 6);
  return (
    <>
      <ul className="grid grid-cols-1 justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const def = getThemeDef(item.theme)!;
          const pack = getPack(item.pack)!;
          return (
            <li key={item.theme} className="w-full max-w-[360px] overflow-hidden rounded-xl bg-white p-3 ring-1 ring-[#1b232b]/10">
              <Thumb theme={item.theme} pack={item.pack} name={item.name} />
              <div className="flex items-start justify-between gap-3 px-1 pb-1 pt-4">
                <div>
                  <h3 className={`${heading} text-lg`}>{def.label}</h3>
                  <p className={`text-sm ${muted}`}>Eksempel: {lowerLabel(pack.label)}</p>
                </div>
                <Swatches themeKey={def.key} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-8 text-center">
        <Link href="/temaer" className="font-semibold text-[#173b6c] underline underline-offset-4">
          Se alle {themes.length} temaene
        </Link>
      </p>
    </>
  );
}

function Features({ shop = false }: { shop?: boolean }) {
  const all: [string, string][] = [
    ["Bransjepakker", "Frisør, rørlegger, regnskap, kafé og 41 andre. Sidene, tekstene og prislisten passer bransjen fra start."],
    ["Nettbutikk med Vipps og Klarna", "Varer, varianter, lager, rabattkoder og frakt. Betalingen går rett til deg gjennom dine egne avtaler."],
    ["Domenet er ditt", "Domenet registreres alltid i ditt navn. Har du et fra før, kobler vi det til sammen."],
    ["Lover og regler på plass", "Personvernerklæring og vilkår lages ut fra nettstedet ditt. Nettbutikken har angrerettskjema og opplysningene loven krever."],
    ["Universell utforming", "Alle temaene holder kontrastkravene, og knapper og skjemaer virker med tastatur og skjermleser."],
    ["Trygg drift", "Sikkerhetskopi hver natt, tofaktor-innlogging og ingen tillegg du må holde oppdatert. Databasen ligger i Frankfurt."],
    ["Synlig i Google", "Raske sider, riktige titler og strukturerte data for bransjen din. Du får beskjed når noe mangler."],
    ["Kommer: AI-team med Godkjenn", "Et tillegg med forslag til innlegg og forbedringer. Ingenting endres eller publiseres før du trykker Godkjenn."],
  ];
  const list = shop ? [all[1], all[3], all[2], all[5], all[6], all[4]] : all;
  return (
    <ul className="grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
      {list.map(([title, text]) => (
        <li key={title} className="border-t-2 border-[#1b232b] pt-4">
          <h3 className={`${heading} text-lg leading-snug`}>{title}</h3>
          <p className={`mt-1.5 leading-relaxed ${muted}`}>{text}</p>
        </li>
      ))}
    </ul>
  );
}

/** Tillit: hvem som står bak, med navn, sted og hvordan man får tak i henne. */
function Owner() {
  return (
    <section className={`bg-[#173b6c] ${onDark}`}>
      <div className={`${container} grid gap-10 py-16 sm:py-24 lg:grid-cols-[1fr_1.25fr] lg:items-start`}>
        <div>
          <Eyebrow dark>Hvem står bak</Eyebrow>
          <h2 className={`${heading} text-3xl leading-[1.08] text-balance sm:text-[2.6rem]`}>Én person du kan skrive til</h2>
        </div>
        <div className="space-y-4 text-lg leading-relaxed text-white/90">
          <p>
            Jeg heter Helene og lager nettsider og nettbutikker for bedrifter i hele Norge, fra Modum. Nettgata er plattformen jeg ønsket at kundene mine
            hadde: enkel nok til å bruke selv, og trygg nok til at jeg kan stå inne for den.
          </p>
          <p>Du skriver til meg, ikke til et kundesenter, og du får svar innen én virkedag. Vil du heller at jeg setter alt opp, gjør jeg det.</p>
          <p className="text-base text-white/75">Grønberg Tech Solutions · Org.nr. 927 889 404 MVA · Modum</p>
        </div>
      </div>
    </section>
  );
}

function PriceCard({ name, price, yearly, items, highlight }: { name: string; price: string; yearly: string; items: string[]; highlight?: boolean }) {
  return (
    <div className={`flex flex-col rounded-2xl p-7 sm:p-8 ${highlight ? `bg-[#173b6c] ${onDark}` : "bg-white ring-1 ring-[#1b232b]/15"}`}>
      <h3 className={`${signType} text-base`}>{name}</h3>
      <p className="mt-4">
        <span className={`${heading} text-6xl`}>{price}</span> <span className={highlight ? "text-white/85" : muted}>kr/mnd eks. mva</span>
      </p>
      <p className={`mt-1 text-sm ${highlight ? "text-white/85" : muted}`}>{yearly}</p>
      <ul className="mt-6 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <svg className="mt-1 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={highlight ? "#a8d5c0" : "#2f5a47"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {item}
          </li>
        ))}
      </ul>
      <a
        href="#kom-i-gang"
        className={`mt-8 rounded-lg px-5 py-3 text-center font-semibold transition-colors ${highlight ? "bg-white text-[#173b6c] hover:bg-white/90" : "bg-[#173b6c] text-white hover:bg-[#0f2c55]"}`}
      >
        Få {name.toLowerCase()}
      </a>
    </div>
  );
}

function Pricing({ shop = false }: { shop?: boolean }) {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        <PriceCard
          name="Nettside"
          price="199"
          yearly={"169 kr/mnd når du betaler for et år om gangen (2 028 kr)"}
          highlight={!shop}
          items={["Alle temaer og bransjepakker", "Eget domene eller gratis navn.nettgata.no", "Kontaktskjema med innboks", "Personvernerklæring og vilkår", "Sikkerhetskopi hver natt"]}
        />
        <PriceCard
          name="Nettbutikk"
          price="399"
          yearly={"339 kr/mnd når du betaler for et år om gangen (4 068 kr)"}
          highlight={shop}
          items={["Alt i Nettside", "Varer, varianter og lager", "Vipps og Klarna med dine egne avtaler", "Frakt, rabattkoder og ordre", "Angrerett og opplysningsplikt"]}
        />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 ring-1 ring-[#1b232b]/15">
          <h3 className={`${heading} text-lg`}>Vil du at jeg setter alt opp?</h3>
          <p className={`mt-1 ${muted}`}>Oppstart 3 900 kr for nettside og 9 900 kr for nettbutikk, eks. mva. Bygger du selv, koster oppstarten ingenting.</p>
        </div>
        <div className="rounded-2xl bg-white p-6 ring-1 ring-[#1b232b]/15">
          <h3 className={`${heading} text-lg`}>Kommer: AI-team og sosiale medier</h3>
          <p className={`mt-1 ${muted}`}>Et tillegg til 249 kr/mnd eks. mva, med forslag til innlegg og forbedringer hver dag. Ingenting skjer før du trykker Godkjenn. Det er ikke lansert ennå.</p>
        </div>
      </div>
      <p className={`mt-6 text-sm ${muted}`}>Alle priser er eks. mva. Domenet kjøper du selv, og i nettbutikken tar Vipps og Klarna sine egne gebyrer.</p>
    </>
  );
}

function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="max-w-3xl divide-y divide-[#1b232b]/15 border-y border-[#1b232b]/15">
      {items.map(([q, a]) => (
        <details key={q} className="group py-5">
          <summary className={`${heading} cursor-pointer list-none text-lg`}>
            <span className="mr-2 inline-block text-[#a13a2c] transition-transform group-open:rotate-90" aria-hidden="true">
              ›
            </span>
            {q}
          </summary>
          <p className={`mt-3 pl-5 leading-relaxed ${muted}`}>{a}</p>
        </details>
      ))}
    </div>
  );
}

const faq: [string, string][] = [
  ["Hvem eier nettsiden og domenet?", "Du. Domenet registreres i ditt navn, og tekstene og bildene dine er dine. Sier du opp, hjelper jeg deg å få dem med deg videre."],
  ["Kan jeg bruke domenet jeg har fra før?", "Ja. Du endrer to innstillinger hos den som har domenet ditt i dag, og jeg hjelper deg gjerne. Resten, også den sikre tilkoblingen (https), ordnes automatisk."],
  ["Hva koster domenet?", "Domenet kjøper du selv hos en forhandler, for eksempel Domeneshop, slik at det står i ditt navn. En .no-adresse koster vanligvis noen hundrelapper i året, og Nettgata tar ingenting for koblingen."],
  ["Kan jeg flytte fra Wix, Squarespace eller WordPress?", "Ja. Jeg flytter tekstene og bildene sammen med deg, og de gamle adressene sendes videre til de nye, så du ikke mister plasseringen i Google."],
  ["Må jeg kunne kode?", "Nei. Du endrer tekst, bilder, farger og sider i Nettgata-studioet, rett i nettleseren, og ser endringene før du publiserer."],
  ["Er det bindingstid?", "Nei, månedsprisen kan sies opp når som helst. Betaler du for et år, gjelder prisen hele året."],
  ["Hvordan tar jeg betalt i nettbutikken?", "Du inngår avtale direkte med Vipps og Klarna og kobler dem til nettbutikken, og jeg hjelper deg gjerne. Pengene går rett til deg, og Nettgata tar ingen del av salget. Vipps og Klarna tar sine egne gebyrer."],
];

function LeadSection({ env, need, bransje, title, intro }: { env: PlatformEnv; need?: Need; bransje?: string; title?: string; intro?: string }) {
  return (
    <section id="kom-i-gang" className="scroll-mt-24 py-16 sm:py-24">
      <div className={`${container} grid gap-10 lg:grid-cols-[1fr_1.3fr]`}>
        <div>
          <Eyebrow>Kom i gang</Eyebrow>
          <h2 className={`${heading} text-3xl leading-[1.08] text-balance sm:text-[2.6rem]`}>{title ?? "Fortell litt om bedriften, så tar jeg kontakt"}</h2>
          <p className={`mt-4 text-lg leading-relaxed ${muted}`}>
            {intro ?? "Du hører fra meg innen én virkedag, på e-post. Jeg går gjennom hva du trenger sammen med deg, og du får se nettsiden din før du bestemmer deg."}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-[0_24px_60px_-30px_rgb(23_59_108/0.35)] ring-1 ring-[#1b232b]/15 sm:p-8">
          <LeadForm source={`/${bransje ? `bransjer/${bransje}` : need === "nettbutikk" ? "nettbutikk" : ""}`} need={need} bransje={bransje ? bransjeLabel({ pack: bransje, keywords: [] }) : ""} sendTo={env.sendTo} />
        </div>
      </div>
    </section>
  );
}

function Landing({ env }: { env: PlatformEnv }) {
  return (
    <>
      <StreetHero />
      <Section eyebrow="Slik virker det" title="Fra org.nr. til ferdig nettside" tone="kalk">
        <Steps />
      </Section>
      <Section eyebrow="Bransjer" title="Finn bransjen din" intro="Hver bransjepakke har sidene, tekstene og prislisten bransjen trenger. Velg din, så ser du hva som ligger klart.">
        <GenreSigns />
      </Section>
      <Section
        eyebrow="Temaer"
        title="Tolv temaer, med fire fargevarianter hver"
        intro="Fem av dem står i gata øverst. Her er seks til. Hvert tema har egne fonter, knapper, menyer og bildestiler, og bytter du senere, står tekstene og bildene dine urørt."
        tone="kalk"
      >
        <Showcase keys={["klinikk", "galleri", "hytte", "puls", "nordlys", "fjord"]} />
      </Section>
      <Section eyebrow="Inkludert" title="Alt du trenger, uten plugins og tillegg">
        <Features />
      </Section>
      <Owner />
      <Section id="priser" eyebrow="Priser" title="To abonnement. Alt er med." intro="Ingen pakker med skjulte begrensninger. Alle temaer og bransjepakker følger med uansett hva du velger.">
        <Pricing />
      </Section>
      <Section eyebrow="Spørsmål" title="Det folk lurer på" tone="kalk">
        <Faq items={faq} />
      </Section>
      <LeadSection env={env} />
    </>
  );
}

function ShopLanding({ env }: { env: PlatformEnv }) {
  return (
    <>
      <Hero
        eyebrow="Nettbutikk"
        title="Nettbutikk med Vipps og Klarna, klar til å selge"
        text="Varer med varianter og lager, rabattkoder, frakt og ordre på ett sted. Kundene betaler med Vipps eller Klarna, og pengene går rett til deg."
      >
        <Street shops={shopStreet} width={160} vacant={false} inset={false} label="Eksempler på nettbutikker fra bransjepakkene" />
      </Hero>
      <Section eyebrow="Inkludert" title="Det en norsk nettbutikk trenger" tone="kalk">
        <Features shop />
      </Section>
      <Section
        eyebrow="Betaling"
        title="Dine avtaler, dine penger"
        intro="Du inngår avtale direkte med Vipps og Klarna og kobler dem til nettbutikken. Nettgata tar ingen del av salget og ser aldri pengene."
      >
        <ul className="grid gap-6 md:grid-cols-3">
          {[
            ["Vipps", "Kunden betaler i Vipps-appen. Beløpet reserveres ved kjøp og trekkes først når du sender varen."],
            ["Klarna", "Kort, faktura og delbetaling i én løsning. Klarna tar risikoen for fakturaen."],
            ["Henting og faktura", "Vil du heller ta betalt ved henting eller sende faktura selv, kan du slå det på også."],
          ].map(([title, text]) => (
            <li key={title} className="border-t-2 border-[#1b232b] pt-4">
              <h3 className={`${heading} text-lg`}>{title}</h3>
              <p className={`mt-2 leading-relaxed ${muted}`}>{text}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Owner />
      <Section id="priser" eyebrow="Pris" title="399 kr i måneden. Ingen andel av salget.">
        <Pricing shop />
      </Section>
      <LeadSection env={env} need="nettbutikk" title="Klar for nettbutikk?" />
    </>
  );
}

function ThemesPage({ env }: { env: PlatformEnv }) {
  return (
    <>
      <section className={`${container} pb-4 pt-14`}>
        <Eyebrow>Temaer</Eyebrow>
        <h1 className={`${heading} max-w-3xl text-4xl leading-[1.04] text-balance sm:text-5xl`}>Finn utseendet som passer bedriften din</h1>
        <p className={`mt-5 max-w-2xl text-lg leading-relaxed ${muted}`}>
          Tolv temaer med fire fargevarianter hver. Miniatyrene er ekte nettsider fra bransjepakkene. I studioet ser du din egen side i hvert tema, både på
          datamaskin og mobil, før du velger.
        </p>
      </section>
      <section className={`${container} py-10`}>
        <ul className="grid grid-cols-1 justify-items-center gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {showcase.map((item) => {
            const def = getThemeDef(item.theme)!;
            return (
              <li key={item.theme} className="w-full max-w-[360px] rounded-xl bg-white p-3 ring-1 ring-[#1b232b]/10">
                <Thumb theme={item.theme} pack={item.pack} name={item.name} />
                <div className="space-y-2 px-1 pb-2 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className={`${heading} text-xl`}>{def.label}</h2>
                    <Swatches themeKey={def.key} />
                  </div>
                  <p className="leading-relaxed">{def.description}</p>
                  <p className={`text-sm ${muted}`}>{def.bestFor}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <LeadSection env={env} />
    </>
  );
}

function BransjerIndex({ env }: { env: PlatformEnv }) {
  const listed = new Set(landingBransjer().map((m) => m.bransje.pack));
  return (
    <>
      <section className={`${container} pb-4 pt-14`}>
        <Eyebrow>Bransjer</Eyebrow>
        <h1 className={`${heading} max-w-3xl text-4xl leading-[1.04] text-balance sm:text-5xl`}>Ferdige nettsider for din bransje</h1>
        <p className={`mt-5 max-w-2xl text-lg leading-relaxed ${muted}`}>
          Hver bransjepakke har sidene, tekstene og prislisten bransjen trenger. Finner du ikke din, send meg en melding, så finner vi den som passer best.
        </p>
      </section>
      <section className={`${container} py-10`}>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {genres.map((genre) => (
            <div key={genre.key} id={genre.key} className="scroll-mt-28 rounded-xl bg-white p-6 ring-1 ring-[#1b232b]/10">
              <h2 className={`${signType} text-[0.95rem] text-[#173b6c]`}>{genre.label}</h2>
              <ul className="mt-3 space-y-1.5">
                {genre.bransjer
                  .filter((b) => listed.has(b.pack))
                  .map((b) => (
                    <li key={b.pack}>
                      <Link href={`/bransjer/${b.pack}`} className="underline underline-offset-4 hover:no-underline">
                        {bransjeLabel(b)}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <LeadSection env={env} />
    </>
  );
}

const sectionNames: Record<string, string> = {
  hero: "toppfelt med bilde",
  fordeler: "fordeler",
  tjenester: "tjenester",
  bildetekst: "om oss med bilde",
  galleri: "bildegalleri",
  omtaler: "omtaler",
  faq: "spørsmål og svar",
  cta: "kontaktknapp",
  kontakt: "kontaktskjema",
  tekst: "tekst",
  produkter: "varer",
  kategorikort: "kategorier",
};

/** Bookingsystemer kundene i bransjen ofte har fra før. Knappen kan lenke rett dit. */
const bookingExamples: Record<string, string> = {
  "Bestill time": "Timma, Fresha",
  "Bestill bord": "Resos, DinnerBooking",
};

function BransjePage({ route, env }: { route: Extract<PlatformRoute, { kind: "bransje" }>; env: PlatformEnv }) {
  const { match } = route;
  const { pack } = match;
  const shop = pack.kind === "nettbutikk";
  const pages = pack.pages({ name: "Din bedrift", city: "" });
  const recommended = pack.themes.slice(0, 3);
  const title = bransjeHeading(match);
  // Plattformen har ingen innebygd booking ennå, så det må stå rett ut hva «Bestill time» gjør.
  const hero = pages.find((p) => p.path === "/")?.content.sections.find((s) => s.type === "hero");
  const button = String(hero?.props.knappTekst ?? "");
  const bookingSystems = hero?.props.knappLenke === "/kontakt" ? bookingExamples[button] : undefined;
  // Bransjens egen butikk i gata. Fargen velges ut fra navnet, så samme bransje alltid får samme fasade.
  const colors = facadeColors[[...pack.key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % facadeColors.length];
  const facade: Shop = { ...colors, pack: pack.key, theme: recommended[0], name: "Din bedrift", sign: bransjeLabel(match.bransje), lift: 10 };
  return (
    <>
      <Hero
        eyebrow={match.genre.label}
        title={`${title}, ferdig satt opp`}
        text={`${pack.description} Sidene, tekstene og prislisten er klare, så du bare fyller inn det som er ditt. Du velger blant tolv temaer, og domenet står alltid i ditt navn.`}
      >
        <div className="gata-street flex justify-center pb-[23px]">
          <Facade shop={facade} index={0} width={420} />
        </div>
      </Hero>
      <Section eyebrow="Dette får du" title="Sidene som ligger klare" tone="kalk">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <li key={page.path} className="rounded-xl bg-white p-6 ring-1 ring-[#1b232b]/10">
              <h3 className={`${heading} text-lg`}>{page.title}</h3>
              <p className={`mt-1.5 ${muted}`}>
                {[...new Set(page.content.sections.map((s) => (s.type === "tjenester" && s.variant === "liste" ? "prisliste" : sectionNames[s.type] ?? s.type)))].join(", ")}
              </p>
            </li>
          ))}
        </ul>
        {bookingSystems && (
          <p className={`mt-8 max-w-3xl leading-relaxed ${muted}`}>
            Knappen «{button}» går til kontaktskjemaet. Bruker du {bookingSystems} eller et annet bookingsystem, kan den gå rett dit i stedet.
            Du limer bare inn lenken.
          </p>
        )}
      </Section>
      <Section eyebrow="Temaer" title="Temaene som passer best" intro="Du kan bruke alle temaene, men disse er valgt ut for bransjen din. Fargene kan du bytte når du vil.">
        <ul className="grid grid-cols-1 justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {recommended.map((key) => {
            const def = getThemeDef(key);
            if (!def) return null;
            return (
              <li key={key} className="w-full max-w-[360px] rounded-xl bg-white p-3 ring-1 ring-[#1b232b]/10">
                <Thumb theme={key} pack={pack.key} name="Din bedrift" />
                <div className="flex items-center justify-between gap-3 px-1 pb-1 pt-4">
                  <h3 className={`${heading} text-lg`}>{def.label}</h3>
                  <Swatches themeKey={key} />
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
      <Owner />
      <Section id="priser" eyebrow="Pris" title={shop ? "399 kr i måneden for nettbutikk" : "199 kr i måneden for nettside"}>
        <Pricing shop={shop} />
      </Section>
      <LeadSection env={env} need={shop ? "nettbutikk" : "nettside"} bransje={pack.key} title={`Vil du ha ${shop ? "en nettbutikk" : "en nettside"} som denne?`} />
    </>
  );
}

/** Personvern, vilkår og databehandleravtale for nettgata.no, fra lib/legal/plattform.ts. */
function LegalPage({ doc }: { doc: PlattformDokument }) {
  const [first, ...rest] = sideSomTekst(plattformDokument(doc));
  return (
    <article className={`${container} max-w-3xl py-14`}>
      <h1 className={`${heading} text-3xl text-balance break-words hyphens-auto sm:text-4xl`}>{first?.overskrift}</h1>
      <div className={`mt-6 space-y-4 text-lg leading-relaxed ${muted}`}>
        {first?.avsnitt.map((a, i) => (
          <p key={i}>{a}</p>
        ))}
      </div>
      {rest.map((part, i) => (
        <section key={i} className="mt-10">
          {part.overskrift && <h2 className={`${heading} text-2xl`}>{part.overskrift}</h2>}
          <div className="mt-3 space-y-3 leading-relaxed">
            {part.avsnitt.map((a, j) => (
              <p key={j} className="whitespace-pre-line">
                {a}
              </p>
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}

/** Siden for en plattformrute, eller null når ruten ikke finnes (gir 404). */
export function renderPlatformPage(route: PlatformRoute, env: PlatformEnv): ReactNode | null {
  const body =
    route.kind === "landing" ? (
      <Landing env={env} />
    ) : route.kind === "nettbutikk" ? (
      <ShopLanding env={env} />
    ) : route.kind === "temaer" ? (
      <ThemesPage env={env} />
    ) : route.kind === "bransjer" ? (
      <BransjerIndex env={env} />
    ) : route.kind === "bransje" ? (
      <BransjePage route={route} env={env} />
    ) : route.kind === "juridisk" ? (
      <LegalPage doc={route.doc} />
    ) : null;
  return body ? (
    <PlatformChrome env={env} leadHref={route.kind === "juridisk" ? "/#kom-i-gang" : "#kom-i-gang"}>
      {body}
    </PlatformChrome>
  ) : null;
}

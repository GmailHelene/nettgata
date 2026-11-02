import {
  Barlow_Condensed,
  Bricolage_Grotesque,
  Cormorant_Garamond,
  DM_Sans,
  Fraunces,
  Fredoka,
  Instrument_Serif,
  Inter,
  Lora,
  Manrope,
  Nunito,
  Playfair_Display,
  Space_Grotesk,
} from "next/font/google";

/**
 * Fontene lastes ned ved bygging og serveres fra vårt eget domene. Besøkende sender
 * derfor ingenting til Google (personvern). Bare Inter forhåndslastes; de andre hentes
 * først når et nettsted faktisk bruker dem, så mange temaer koster ikke noe for den enkelte siden.
 *
 * Archivo er unntaket. Den er salgssidens font (overskrifter og brødtekst) og skal forhåndslastes der, men ikke
 * på kundesidene, som går gjennom samme rute. next/font forhåndslaster per rute og gir ingen fast filadresse,
 * så Archivo ligger i public/fonts med @font-face i globals.css, og salgssiden ber om forhåndslasting selv.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dmsans", display: "swap", preload: false });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", preload: false });
const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-barlow", display: "swap", preload: false });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument", display: "swap", preload: false });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap", preload: false });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap", preload: false });
const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka", display: "swap", preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-spacegrotesk", display: "swap", preload: false });

export const fontVariables = [
  inter,
  playfair,
  fraunces,
  dmSans,
  cormorant,
  nunito,
  manrope,
  barlow,
  instrument,
  bricolage,
  lora,
  fredoka,
  spaceGrotesk,
]
  .map((f) => f.variable)
  .join(" ");

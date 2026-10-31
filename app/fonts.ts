import { Archivo, Cormorant_Garamond, DM_Sans, Fraunces, Inter, Nunito, Playfair_Display } from "next/font/google";

/**
 * Fontene lastes ned ved bygging og serveres fra vårt eget domene. Besøkende sender
 * derfor ingenting til Google (personvern). Bare Inter forhåndslastes; de andre hentes
 * først når et nettsted faktisk bruker dem.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dmsans", display: "swap", preload: false });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap", preload: false });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap", preload: false });

export const fontVariables = [inter, playfair, fraunces, dmSans, archivo, cormorant, nunito].map((f) => f.variable).join(" ");

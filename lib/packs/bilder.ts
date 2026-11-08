import type { ImageValue } from "@/lib/content/fields";

/**
 * Ferdige bilder i bransjepakkene, så malene ikke ser tomme ut. Filene ligger i public/maler/<pakke>/.
 * Alle er fra Pexels (pexels.com/license tillater bruk i maler som selges, uten kreditering). Kilden til hvert bilde
 * står i docs/BILDEKILDER.md. Ingen viser ansikter, personer eller merkenavn, så bildet ikke kan forveksles med
 * butikkens egne folk. Pakker uten oppføring her bruker eksempelbildet.
 */
export type PackImages = { hero: ImageValue; about: ImageValue; gallery: ImageValue };

const pic = (pack: string, file: number, alt: string): ImageValue => ({ src: `/maler/${pack}/${file}.webp`, alt });
const set = (pack: string, hero: string, about: string, gallery: string): PackImages => ({
  hero: pic(pack, 1, hero),
  about: pic(pack, 2, about),
  gallery: pic(pack, 3, gallery),
});

export const packImages: Record<string, PackImages> = {
  rorlegger: set("rorlegger", "Rørdeler, kran og verktøy på en tegning", "Rørtang på et betonggulv", "Rør langs en vegg"),
  elektriker: set("elektriker", "Åpen koblingsboks med ledninger", "Sikringsskap med rader av sikringer", "Tang og ledninger på et bord"),
  snekker: set("snekker", "Verksted med maskiner og verktøy", "Snekkerverktøy og spon på en arbeidsbenk", "Høvel på en arbeidsbenk"),
  maler: set("maler", "Malerull på et trebord", "Malerull mot en hvit vegg", "Gule malerruller på mørkt treverk"),
  frisor: set("frisor", "Frisørsakser på rekke", "Frisørsakser lagt på et håndkle", "Saks, kam og fargepensler"),
  hudpleie: set("hudpleie", "Hudpleieprodukter på et bord", "Hvite krukker og flasker", "Krem og krukke på en hylle"),
  massasje: set("massasje", "Behandlingsbenk med håndkle", "Sammenrullede håndklær og et tent lys", "Rolig behandlingsrom"),
  kafe: set("kafe", "Kafé med varmt lys", "Disk med kaffeutstyr og bakverk", "Monter med nybakte bakervarer"),
  restaurant: set("restaurant", "Dekket bord med flere retter", "Retter servert på hvite tallerkener", "Anrettet rett på en tallerken"),
  regnskap: set("regnskap", "Regnskapstall, penn og kalkulator", "Kalkulator, briller og permer", "Kalkulator og briller på en rapport"),
  bilverksted: set("bilverksted", "Bilverksted med løftebukker", "Verktøy på en verktøyvegg", "Bremseskive under en bil"),
  renhold: set("renhold", "Vaskemidler i en bøtte", "Mopp og oransje bøtte", "Bøtte og mopp"),
};

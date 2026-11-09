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
  taktekker: set("taktekker", "Røde takstein mot blå himmel", "Tak med takstein i to farger", "Rader med takstein"),
  anlegg: set("anlegg", "Gravemaskin på en byggeplass", "Oransje gravemaskin på en tomt", "Gravemaskin i arbeid"),
  fysioterapeut: set("fysioterapeut", "Treningsrom med apparater", "Lyst behandlingsrom", "Behandlingsbenk i et lyst rom"),
  kiropraktor: set("kiropraktor", "Blå behandlingsbenk", "Behandlingsbenk i et rolig rom", "Lyst behandlingsrom med benk"),
  psykolog: set("psykolog", "Lenestoler i et rolig rom", "Grønn lenestol ved vinduet", "Lampe og bilde på en trevegg"),
  tannlege: set("tannlege", "Blå tannlegestol", "Lyst tannlegekontor", "Tannlegestol med utstyr"),
  bakeri: set("bakeri", "Nybakte bagetter", "Nybakte rundstykker", "Grovt brød på et bord"),
  catering: set("catering", "Brett med bakverk", "Koldtbord med tallerkener", "Varm mat i serveringsfat"),
  konsulent: set("konsulent", "Notatbok og kaffe på et bord", "Papir og notatbok på et hvitt bord", "Briller på en notatbok"),
  advokat: set("advokat", "Bokhyller med lovbøker", "Vekt på et skrivebord", "Justitia-statue foran bokhyller"),
  eiendom: set("eiendom", "Gult trehus", "Rødt hus med hvitt gjerde", "Rødt hus mellom trær"),
  it: set("it", "Bærbar PC med kode", "Kode på en bærbar PC", "Kode på skjermen"),
  kunstner: set("kunstner", "Pensler i en krukke", "Maling og pensler", "Pensler ved et staffeli"),
  fotograf: set("fotograf", "Nærbilde av kameralinse", "Kameralinse i nærbilde", "Rader med gamle kameraer"),
  designer: set("designer", "Fargeprøver på et bord", "Stoffprøver og papir", "Fargekart og notatbøker"),
  musiker: set("musiker", "Gitar og mikrofonstativ", "Gitarforsterker", "Mikrofon i scenelys"),
  pt: set("pt", "Manualer i nærbilde", "Manualer på gulvet", "Vektstang og kettlebell"),
  treningssenter: set("treningssenter", "Treningssenter med apparater", "Styrkeapparater i et treningssenter", "Treningsapparater ved vinduene"),
  yoga: set("yoga", "Yogamatter på en vegg", "Sammenrullet yogamatte", "Yogamatter i nærbilde"),
  kurs: set("kurs", "Stoler og bord i et klasserom", "Klasserom med tavle", "Stoler i et tomt rom"),
  overnatting: set("overnatting", "Soverom i tømmerhytte", "Hyttesoverom med lyslenke", "Rom med trevegger og seng"),
  guide: set("guide", "Fjell med sti", "Fjelltopp mot blå himmel", "Grønne fjellsider og fjord"),
  idrettslag: set("idrettslag", "Fotballbane med tribune", "Fotballbane sett ovenfra", "Tribune ved en fotballbane"),
  lag: set("lag", "Stoler på rad", "Stabler med fargerike stoler", "Rader med stoler"),
  arrangement: set("arrangement", "Scenelys over en scene", "Blått lys på en scene", "Lamper i mørket"),
  flytting: set("flytting", "Flytteesker i et rom", "Flytteesker i stabler", "Pappesker ved en dør"),
  dyr: set("dyr", "Hund på et trimmebord", "Trimmebord med utstyr", "Liten hund i nærbilde"),
  bedrift: set("bedrift", "Kontorbygg i teglstein", "Moderne kontorbygg", "Lyst kontorbygg"),
  handverker: set("handverker", "Verktøy på en arbeidsbenk", "Veggen i et verksted", "Verktøy på en benk"),
  nettbutikk: set("nettbutikk", "Pakker klare til sending", "Pakker på en hylle", "Stablede pakker"),
  klaer: set("klaer", "Kleshengere på et stativ", "Svarte kleshengere", "Hvite kleshengere"),
  interior: set("interior", "Lyst rom med sofa", "Sofa og vegglampe", "Stue med sofa"),
  lokalmat: set("lokalmat", "Grønnsaker på et marked", "Nyhøstede rødbeter", "Grønnsaker i nærbilde"),
};

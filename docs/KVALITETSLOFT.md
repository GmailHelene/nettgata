# Kvalitetsløft: butikk og admin på nivå med de beste

Mål: en kunde skal kunne lage en nettbutikk som ser ut og fungerer som LuxusHair, Kid Interiør, Holzweiler eller en god Shopify-butikk med Prestige- eller Dawn-tema, men raskere og enklere å bygge. I tillegg skal det finnes et adminpanel på nivå med Shopify Admin.

Status 31.10.2026: motoren er på plass (varer, varianter, lager, førpris, MVA, kasse, ordre, lovkrav). Det kunden ser og jobber i, er fortsatt enkelt. Dette dokumentet er listen over hva som mangler, i rekkefølgen det bør bygges.

Referanser: LuxusHair (luxushair.com), Shopify Dawn og Prestige, Kid Interiør, Bohus, Norrøna, Holzweiler, Livid Jeans, Webflow- og Framer-maler.

---

## A. Butikken kunden ser

### A1. Ramme og navigasjon

| Funksjon | Referanse | Prioritet |
|---|---|---|
| Toppstripe med budskap og lenker (fri frakt over X, kundeservice) | LuxusHair, Norrøna | 1 |
| Kampanjebanner som kan slås av og på, med lenke | LuxusHair | 1 |
| Logo som bilde, ikke bare tekst | Alle | 1 |
| Meny med undermeny og megameny med bilder | Bohus, Norrøna | 2 |
| Mobilmeny som skuff | Alle | 1 |
| Søk med forslag mens du skriver | Kid, Komplett | 2 |
| Handlekurv som skuff med fri frakt-måler og kryssalg | Dawn, LuxusHair | 1 |
| Konto og ønskeliste i menyen | LuxusHair | 3 |
| Bunntekst med kolonner, nyhetsbrev, betalingsikoner, sosiale lenker | Alle | 1 |
| Språkvalg (norsk/engelsk) | LuxusHair | 3 |
| Brødsmuler på kategori- og varesider | Bohus | 2 |

### A2. Seksjoner som gjør forsiden levende

| Seksjon | Referanse | Prioritet |
|---|---|---|
| Trygghetsstripe (3-4 korte punkter med ikon) | LuxusHair | 1 |
| Varekarusell (bestselgere, nyheter, på salg, på lager, valgt kategori) | LuxusHair, Dawn | 1 |
| Kategorikort med bilde | LuxusHair, Kid | 1 |
| Kampanjeseksjon med førpris og tydelig budskap | LuxusHair | 1 |
| Bilde med tekst over (full bredde), delt hero | Prestige | 1 |
| Kundeomtaler med bilde og stjerner | LuxusHair | 2 |
| Veiviser eller quiz («Finn din farge») | LuxusHair | 3 |
| Logoer, presse, «kjent fra» | Mange | 2 |
| Video | Prestige | 2 |
| Nyhetsbrevpåmelding | Alle | 2 |
| Instagram-feed | Mange | 3 |

### A3. Kategoriside

| Funksjon | Prioritet |
|---|---|
| Sortering (pris, nyeste, populære) | 1 |
| Filtre på valg (farge, størrelse, lengde), pris og lager | 1 |
| «Vis flere» eller sider | 1 |
| Kategoribeskrivelse og banner | 2 |
| Rask titt («quick view») | 3 |

### A4. Vareside

| Funksjon | Referanse | Prioritet |
|---|---|---|
| Bildegalleri med miniatyrer, sveip på mobil og zoom | Alle | 1 |
| Bilde per variant (velg farge, bildet bytter) | Dawn | 1 |
| Fargeprøver (swatches) og knapper for valg | LuxusHair | 1 |
| Lagerstatus per lager og leveringsestimat («Sendes i dag fra Åmot») | LuxusHair | 1 |
| Trekkspill: beskrivelse, bruk, frakt og retur | Prestige | 1 |
| Fast kjøpsknapp nederst på mobil | Dawn | 1 |
| Kryssalg: «Passer med», «Andre kjøpte også» | LuxusHair | 2 |
| Omtaler med stjerner knyttet til ekte kjøp | Mange | 2 |
| Delbetaling-info (Klarna) og Vipps-merke | LuxusHair | 2 |
| Størrelsesguide | Klær | 2 |
| Strukturerte data for produkt (pris, lager, omtaler) | Google | 1 |

### A5. Kurv, kasse og kampanjer

| Funksjon | Prioritet |
|---|---|
| Rabattkoder | 1 |
| Automatiske kampanjer («kjøp 3, få 15 %», gave ved kjøp over X) | 2 |
| Vipps, Klarna og kort | 1 |
| E-postbekreftelse med ordreoversikt | 1 |
| Kundekonto med ordrehistorikk (valgfritt, aldri påkrevd) | 3 |

### A6. Design på profesjonelt nivå

| Funksjon | Prioritet |
|---|---|
| Ekte fonter, selvhostet (ingen kall til Google, personvernvennlig) | 1 |
| Typografiskala, avstand og knapper som ser gjennomarbeidet ut | 1 |
| Flere varianter per seksjon, slik at to butikker ikke ser like ut | 1 |
| Små, rolige animasjoner (inn-fading, hover), som respekterer «redusert bevegelse» | 2 |
| Mørk og lys flate per seksjon (bakgrunnsfarge per seksjon) | 1 |

---

## B. Admin (studioet) på nivå med Shopify Admin

| Område | Innhold | Prioritet |
|---|---|---|
| Oversikt | Salg i dag, uke og måned, ordre som venter, lav lagerbeholdning, toppvarer, besøk | 1 |
| Ordre | Filtre og søk, plukkliste, pakkseddel, sporingsnummer, e-post til kunde, delvis levering, retur og kreditnota | 1 |
| Varer | Søk og filter, bulkredigering av pris og lager, CSV-import og -eksport, bilder per variant, innkjøpspris og margin | 1 |
| Lager | Flere lagersteder (eget lager og fjernlager), lageroversikt, varsel ved lav beholdning | 2 |
| Kunder | Kundeliste, ordrehistorikk, samtykke til nyhetsbrev, segmenter | 2 |
| Rabatter | Koder, automatiske kampanjer, gyldighetsperiode, bruksgrense | 1 |
| Rapporter | Salg per periode, MVA-rapport, eksport til Fiken | 2 |
| Innhold | Sider, menyer, blogg, globale seksjoner (toppstripe, bunntekst) | 1 |
| Markedsføring | Nyhetsbrev, produktfeed til Google og Meta, AI-teamet | 2 |
| Innstillinger | Betaling, frakt, varsler, brukere og roller, domene | 1 |
| Hurtigsøk (Ctrl+K) i hele adminpanelet | | 2 |
| Fungerer på mobil | | 1 |

---

## C. Byggeverktøyet: enklere og raskere enn konkurrentene

| Funksjon | Prioritet |
|---|---|
| Seksjonsbibliotek med bilder av hver seksjon, ikke bare navn | 1 |
| Dra og slipp rekkefølge | 1 |
| Klikk på et element i forhåndsvisningen for å redigere det | 2 |
| Forhåndsvisning for mobil og desktop | 1 |
| Global stil: fonter, farger, knapper, hjørner, ett sted | 1 |
| Maler for varesiden og kategorisiden (som Shopify-tema) | 2 |
| Angre og gjør om | 2 |
| AI: «lag en seksjon om fri frakt i desember», som kunden godkjenner | 3 |

---

## Rekkefølge

1. **Kvalitetsløft 1, butikkens utseende:** A1 og A6, de viktigste seksjonene i A2, varesiden i A4 og sortering og filtre i A3.
2. **Kvalitetsløft 2, admin:** oversikt, ordrebehandling, varesøk og bulkredigering, rabattkoder.
3. **Kvalitetsløft 3, betaling og e-post:** Vipps, Klarna og kort, ordrebekreftelse på e-post.
4. **Kvalitetsløft 4, byggeverktøyet:** seksjonsbibliotek med bilder, dra og slipp, mobilforhåndsvisning, global stil.
5. Resten etter prioritet 2 og 3 i tabellene.

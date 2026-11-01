"""
Nye bedrifter fra Enhetsregisteret (Brønnøysundregistrenes åpne API) i valgte kommuner og bransjer, som en liste
du åpner i Excel. Grunnlaget for brev og e-post til generelle adresser i kampanjen for Nettgata.

Kjør fra prosjektmappa:
  python scripts/nye-bedrifter.py                      (siste 60 dager, Modum og nabokommunene, bransjene med best treff)
  python scripts/nye-bedrifter.py --dager 30 --kommuner "Modum,Øvre Eiker"
  python scripts/nye-bedrifter.py --alle-bransjer

Reglene (Forbrukertilsynets veileder om markedsføring på e-post, pkt. 2.4, og Datatilsynet, sjekket 01.11.2026):
  - E-post uten samtykke bare til adresser som ikke tilhører en bestemt person, som post@ og kontakt@.
    Aldri navn@firma.no, heller ikke når adressen står i Brønnøysundregistrene.
  - Et enkeltpersonforetak eies av en person. Bruk brev, ikke e-post, uten samtykke.
  - Telefonnumre tas ikke med. Lista har bare det kampanjen trenger.
Lista har personopplysninger om enkeltpersonforetak. Slett den når kampanjen er ferdig, og ikke legg den i git.
"""
import argparse
import csv
import datetime as dt
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

BRREG = "https://data.brreg.no/enhetsregisteret/api/enheter"
KOMMUNER = "https://ws.geonorge.no/kommuneinfo/v1/kommuner"
NABOER = ["Modum", "Øvre Eiker", "Drammen", "Kongsberg", "Ringerike", "Lier", "Hole", "Sigdal", "Krødsherad"]

# Bransjene med best treff i kundegruppetesten 01.11.2026, med næringskode (NACE) som prefiks.
BRANSJER = [
    ("43.21", "Elektriker"),
    ("43.22", "Rørlegger"),
    ("43.32", "Snekker"),
    ("43.33", "Gulv og flis"),
    ("43.34", "Maler"),
    ("43.91", "Taktekker"),
    ("45.20", "Bilverksted"),
    ("56.", "Kafé og restaurant"),
    ("96.02", "Frisør og skjønnhet"),
    ("96.04", "Velvære"),
    ("69.20", "Regnskap"),
    ("70.22", "Rådgivning"),
    ("74.1", "Design"),
    ("74.20", "Fotograf"),
    ("81.2", "Renhold"),
    ("47.", "Butikk"),
]
FORMER = {"AS", "ENK", "ANS", "DA", "NUF"}


def hent(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "nettgata-nye-bedrifter/1"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def bransje(kode: str) -> str | None:
    return next((navn for prefiks, navn in BRANSJER if kode.startswith(prefiks)), None)


def kanal(form: str, nettside: str) -> str:
    if form == "ENK":
        return "Brev (enkeltpersonforetak: ikke e-post uten samtykke)"
    if nettside:
        return "E-post til post@ eller kontakt@ fra nettsiden, aldri navn@"
    return "Brev"


def main() -> None:
    ap = argparse.ArgumentParser(description="Nye bedrifter fra Enhetsregisteret, som CSV for Excel.")
    ap.add_argument("--dager", type=int, default=60, help="hvor mange dager tilbake (standard 60)")
    ap.add_argument("--kommuner", default=",".join(NABOER), help="kommunenavn, skilt med komma")
    ap.add_argument("--alle-bransjer", action="store_true", help="ta med alle bransjer, ikke bare de med best treff")
    ap.add_argument("--ut", default="", help="filnavn (standard salg/nye-bedrifter-<dato>.csv)")
    args = ap.parse_args()

    navn_til_nr = {k["kommunenavnNorsk"]: k["kommunenummer"] for k in hent(KOMMUNER)}
    valgte = [n.strip() for n in args.kommuner.split(",") if n.strip()]
    ukjente = [n for n in valgte if n not in navn_til_nr]
    if ukjente:
        sys.exit(f"Ukjent kommune: {', '.join(ukjente)}. Skriv navnet slik Kartverket skriver det.")

    fra = (dt.date.today() - dt.timedelta(days=args.dager)).isoformat()
    rader = []
    for kommune in valgte:
        side = 0
        while True:
            q = urllib.parse.urlencode({"kommunenummer": navn_til_nr[kommune], "fraRegistreringsdatoEnhetsregisteret": fra, "size": 100, "page": side})
            data = hent(f"{BRREG}?{q}")
            for e in data.get("_embedded", {}).get("enheter", []):
                form = e.get("organisasjonsform", {}).get("kode", "")
                if form not in FORMER or e.get("konkurs") or e.get("underAvvikling"):
                    continue
                nace = e.get("naeringskode1") or {}
                kode = nace.get("kode", "")
                b = bransje(kode)
                if not b and not args.alle_bransjer:
                    continue
                adr = e.get("forretningsadresse") or {}
                nettside = (e.get("hjemmeside") or "").strip()
                rader.append(
                    {
                        "Registrert": e.get("registreringsdatoEnhetsregisteret", ""),
                        "Org.nr": e.get("organisasjonsnummer", ""),
                        "Navn": e.get("navn", ""),
                        "Form": form,
                        "Næringskode": f"{kode} {nace.get('beskrivelse', '')}".strip(),
                        "Bransje": b or "",
                        "Kommune": kommune,
                        "Adresse": ", ".join(adr.get("adresse") or []),
                        "Postnr": adr.get("postnummer", ""),
                        "Poststed": adr.get("poststed", ""),
                        "Nettside": nettside,
                        "Kanal": kanal(form, nettside),
                    }
                )
            sider = data.get("page", {}).get("totalPages", 0)
            side += 1
            if side >= sider:
                break
            time.sleep(0.3)  # Vennlig mot det åpne API-et.

    rader.sort(key=lambda r: (r["Registrert"], r["Kommune"]), reverse=True)
    ut = pathlib.Path(args.ut or f"salg/nye-bedrifter-{dt.date.today().isoformat()}.csv")
    ut.parent.mkdir(parents=True, exist_ok=True)
    felt = ["Registrert", "Org.nr", "Navn", "Form", "Næringskode", "Bransje", "Kommune", "Adresse", "Postnr", "Poststed", "Nettside", "Kanal"]
    # Semikolon og BOM, så norsk Excel åpner fila riktig med æ, ø og å.
    with ut.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=felt, delimiter=";")
        w.writeheader()
        w.writerows(rader)
    med_side = sum(1 for r in rader if r["Nettside"])
    print(f"{len(rader)} nye bedrifter siden {fra} i {len(valgte)} kommuner. {med_side} har nettside. Lagret i {ut}")


if __name__ == "__main__":
    main()

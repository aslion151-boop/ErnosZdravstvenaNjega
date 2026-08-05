# Ernos Zdravstvena Njega — demo scenarij za kupca

Svrha ovog dokumenta je dati jednostavan, ponovljiv scenarij za prvi demo razgovor s ustanovom, patronaznom sluzbom, privatnom njegom ili domom koji ima terenski rad.

## Cilj demo razgovora

Ne prodavati "sve moguce funkcije".

Cilj je pokazati tri stvari:

1. djelatnik na terenu ne mora pisati po papirima,
2. ustanova vidi tko je bio kod pacijenta i kada,
3. QR/NFC moze dokazati posjetu i ubrzati evidenciju.

## Priprema prije sastanka

Prije sastanka pokrenuti demo podatke:

```powershell
cd C:\ErnosZdravstvenaNjega
node scripts\seed-demo-homecare.cjs
node backend/server.v2.cjs
```

Otvoriti aplikaciju:

```text
http://localhost:5056/
```

Za online demo koristiti demo server, ne lokalni razvojni laptop.

## Demo korisnik

Koristiti postojeći admin login:

```text
Korisnik: admin
Lozinka: Admin123!
```

Za pravi demo server kasnije otvoriti posebnog korisnika:

```text
demo_admin
```

## Demo tok od 10 minuta

### 1. Uvod — 60 sekundi

Recenica:

> Ernos Zdravstvena Njega je jednostavan sustav za evidenciju kucnih posjeta, QR/NFC potvrdu dolaska i odlaska, osnovni karton pacijenta i pregled rada za voditelja.

Ne govoriti:

- umjetna inteligencija,
- veliki bolnicki sustav,
- zamjena za sve postojece sustave,
- integracije koje jos nisu gotove.

### 2. Početna — 30 sekundi

Pokazati da je sucelje jednostavno:

- Pacijenti
- Dodaj pacijenta
- Danas
- QR/NFC

Recenica:

> Ideja je da djelatnik ne trazi po menijima. Najcesce stvari su odmah dostupne.

### 3. Pacijenti — 90 sekundi

Otvoriti **Pacijenti**.

Pokazati:

- listu pacijenata,
- adresu,
- kontakt obitelji,
- profil.

Recenica:

> Ovo je osnovna lista pacijenata za terenski rad. Nije zamisljeno kao komplicirani bolnicki karton, nego kao prakticna radna evidencija.

### 4. Profil pacijenta — 2 minute

Otvoriti jednog demo pacijenta.

Pokazati:

- osnovne podatke,
- adresu,
- kontakt obitelji,
- alergije,
- rizike,
- napomenu za ulaz,
- QR/NFC link.

Recenica:

> Djelatnik prije ulaska odmah vidi bitne stvari: alergije, rizike, pristup objektu, kontakt obitelji i napomene.

### 5. Danas — 2 minute

Otvoriti **Danas**.

Pokazati:

- planirane posjete,
- posjete u tijeku,
- zavrsene posjete.

Recenica:

> Voditelj vidi sto je danas planirano, sto je u tijeku i sto je vec odradeno. To smanjuje telefonsko provjeravanje i papirnate liste.

### 6. QR/NFC koncept — 2 minute

Objasniti bez pretjerivanja:

> Kod pacijenta se moze koristiti QR kod ili NFC naljepnica. Djelatnik skenira ili prisloni mobitel. Prvi scan oznaci dolazak, drugi scan oznaci zavrsetak posjete.

Naglasiti:

- isti workflow za QR i NFC,
- NFC je brzi,
- QR je backup,
- ne treba rucno traziti pacijenta nakon scana.

### 7. Zavrsna pitanja — 90 sekundi

Pitati kupca:

1. Koliko imate terenskih posjeta dnevno?
2. Kako danas dokazujete da je posjeta odradena?
3. Koliko vremena se trosi na papirologiju?
4. Tko provjerava izvjestaje?
5. Je li veci problem evidencija, planiranje, obitelj, obracun ili kontrola kvalitete?
6. Bi li vam 30-dnevni pilot s 5-10 pacijenata imao smisla?

## Sto obecati

Sigurno obecati:

- demo verziju,
- jednostavan pilot,
- osnovnu evidenciju pacijenata,
- QR/NFC proof-of-visit,
- dnevni pregled,
- izvjestaj nakon pilota.

Ne obecati jos:

- integraciju s CEZIH-om,
- automatski obracun prema HZZO-u,
- automatsko slanje SMS/WhatsApp poruka,
- pravno potpun medicinski karton,
- migraciju svih starih podataka,
- produkcijsku obradu stvarnih podataka bez ugovora i sigurnosnih uvjeta.

## Idealni zavrsetak razgovora

Recenica:

> Ne bih vam odmah prodavao veliki sustav. Predlozio bih mali pilot od 30 dana na ogranicenom broju pacijenata, da vidimo stedi li vam vrijeme i smanjuje li kaos u evidenciji.

## Nakon sastanka

U roku istog dana poslati email:

- zahvala,
- 3 problema koja su spomenuli,
- prijedlog pilota,
- sto bi ukljucili,
- iduci korak: kratki tehnicki sastanak ili demo server pristup.

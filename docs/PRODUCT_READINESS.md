# Ernos Zdravstvena Njega — priprema za proizvod i prve kupce

Ovaj dokument služi kao radni plan za prelazak iz lokalne razvojne aplikacije prema demo proizvodu koji se može pokazati potencijalnim kupcima.

## 1. Kratka pozicija proizvoda

Ernos Zdravstvena Njega je jednostavna web aplikacija za terensku zdravstvenu njegu i skrb u kući.

Glavna vrijednost:

- evidencija pacijenata na jednom mjestu
- QR/NFC potvrda dolaska i odlaska
- pregled današnjih posjeta
- osnovni profil pacijenta
- sigurnosne napomene prije posjete
- temelj za izvještaje, obiteljsku obavijest i kontrolu rada

Ne prodavati kao veliki bolnički sustav. Prodavati kao praktičan alat za male i srednje timove kućne njege koji žele bolju kontrolu terena.

## 2. Što mora raditi prije prvog ozbiljnog demo sastanka

Minimalni demo mora biti stabilan i jednostavan:

1. Prijava korisnika
2. Lista pacijenata
3. Dodavanje pacijenta
4. Profil pacijenta
5. Današnji pregled
6. QR/NFC workflow za početak i završetak posjete
7. Jednostavan izvještaj posjeta
8. Demo podaci bez stvarnih osobnih podataka

Dok ovo nije stabilno, ne dodavati nove velike module.

## 3. Demo podaci

Za prezentaciju koristiti samo testne pacijente:

- Ana Horvat
- Marko Kovač
- Ivanka Marić
- Petar Novak

Ne koristiti stvarne pacijente, stvarne adrese, stvarne OIB-e, stvarne brojeve telefona ili stvarne medicinske nalaze.

## 4. Server strategija

Za prve kupce ne koristiti lokalni laptop kao proizvodni server.

Preporučeni pristup:

### Faza 1 — lokalni demo

- lokalno na računalu
- bez stvarnih podataka
- koristi se samo za razvoj i prvi prikaz ideje

### Faza 2 — online demo server

- zaseban demo server
- HTTPS domena
- demo baza podataka
- testni korisnici
- bez stvarnih pacijenata

### Faza 3 — pilot server za stvarnog korisnika

- zasebna baza po klijentu ili stroga tenant izolacija
- HTTPS obavezno
- backup baze
- korisničke uloge
- audit log
- ugovor o obradi podataka
- jasna pravila tko ima pristup podacima

## 5. Originalni Ernos ili posebna verzija

Najbolje rješenje: ne dirati originalni Ernos kao glavni stabilni projekt.

Preporuka:

- zadržati postojeći repo kao razvojnu bazu
- napraviti jasnu proizvodnu varijantu: Ernos Zdravstvena Njega
- po mogućnosti koristiti isti backend temelj, ali odvojenu konfiguraciju, bazu i branding

Ne preporučuje se miješati stari Ernos i novu verziju bez jasne granice, jer će to povećati rizik bugova.

## 6. Naziv proizvoda

Radni nazivi:

- Ernos Zdravstvena Njega
- Ernos Care
- Ernos Skrb

Za hrvatsko tržište najjasnije je: Ernos Zdravstvena Njega.

## 7. Kome prvo pokazati

Najbolji prvi kupci / sugovornici:

1. privatne ustanove za zdravstvenu njegu u kući
2. male agencije za skrb i pomoć u kući
3. ordinacije koje imaju patronažu ili terenski rad
4. domovi koji imaju vanjske posjete
5. fizioterapeuti / mobilni terapeuti ako se proizvod kasnije prilagodi

Prvi razgovor ne treba biti prodaja, nego validacija.

Pitati:

- Kako sada evidentirate posjete?
- Kako znate je li djelatnik stvarno bio kod korisnika?
- Gdje najviše gubite vrijeme?
- Tko radi izvještaje?
- Imate li problem s dokazivanjem odrađene posjete?
- Bi li vam QR/NFC potvrda dolaska i odlaska bila korisna?

## 8. Demo scenarij za sastanak

Demo neka traje 7–10 minuta.

Redoslijed:

1. Kratko objasniti problem
2. Otvoriti listu pacijenata
3. Otvoriti profil pacijenta
4. Pokazati važne napomene prije posjete
5. Pokazati Danas
6. Pokazati QR/NFC koncept
7. Objasniti izvještaje
8. Pitati što bi njima najviše vrijedilo

Ne pričati previše o tehnologiji. Fokus je kontrola, jednostavnost i manje papira.

## 9. Što ne obećavati prerano

Ne obećavati:

- integracije s HZZO-om
- slanje medicinskih podataka obitelji bez jasnog pravnog okvira
- punu medicinsku dokumentaciju
- automatske dijagnoze
- zamjenu za službeni medicinski informacijski sustav

Ovo je alat za evidenciju rada i organizaciju terena, barem u prvoj verziji.

## 10. Sljedeći razvojni prioriteti

Prvo stabilizirati:

1. osnovni UI
2. lista pacijenata
3. dodavanje pacijenta
4. profil pacijenta
5. QR/NFC početak i završetak
6. dnevni pregled
7. osnovni izvještaj

Tek nakon toga vraćati dodatke:

- obitelj
- kontakti
- događaji
- materijali
- zadaci
- terapija
- rane

Svaki dodatak vraćati jedan po jedan i testirati.

## 11. Minimalna komercijalna poruka

Jedna rečenica:

> Ernos Zdravstvena Njega pomaže timovima kućne njege da jednostavno evidentiraju pacijente, posjete i QR/NFC potvrdu rada na terenu.

Kratka verzija za poziv:

> Razvijam jednostavan alat za zdravstvenu njegu u kući — lista pacijenata, dnevni raspored i QR/NFC potvrda dolaska i odlaska. Volio bih vam pokazati demo i čuti bi li to riješilo stvaran problem u vašem radu.

## 12. Odluka za sada

Za sada graditi kao zaseban proizvodni smjer: Ernos Zdravstvena Njega.

Ne prodavati dok:

- app ne radi stabilno na demo serveru
- nema odvojene demo baze
- nema jasnog backup plana
- nema osnovnog pravnog teksta za obradu osobnih i zdravstvenih podataka

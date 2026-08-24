# Beamzy relay — telepítés VPS-re

Ez a mappa egy önálló, pár tíz soros Node.js WebSocket szerver. Egyetlen dolga:
összeköti egymással a Beamzy-es eszközpárokat, ha épp nincsenek ugyanazon
a helyi hálózaton. Nem tárol fájlt, nem ismer felhasználói fiókot — csak
addig tartja nyitva a kapcsolatot, amíg egy eszközpár be nem fejezi az
átvitelt, utána semmi nyom nem marad utána a szerveren.

**Ezt egyszer, központilag kell telepítened** (ha publikálod az appot, akkor
a te szervered, nem az egyes felhasználóké) — egyetlen példány párosító
kódonként elkülönített "szobákban" korlátlan sok eszközpárt tud egyszerre
kiszolgálni, tehát nem kell (és nem is kellene) minden felhasználó-párnak
saját relay-t futtatnia.

## Mekkora gép kell hozzá?

A relay **I/O-korlátos, nem CPU-korlátos** — a beérkező adatot (kis JSON
csomagokban, base64-kódolt fájldarabokban) rögtön továbbküldi, gyakorlatilag
nem számol semmit. Ebből következik:

| Erőforrás | Ajánlott minimum | Miért elég ennyi |
|---|---|---|
| CPU | 1 megosztott vCPU | Nincs titkosítás, tömörítés vagy fájlfeldolgozás a relayben magában (a TLS-t a Caddy intézi, az is könnyű). |
| RAM | 512 MB – 1 GB | Eszközönként/kapcsolatonként pár tíz KB állapotot tart csak memóriában; egy 256 KB-os fájldarab is csak pillanatokra van a memóriában, amíg továbbküldi. |
| Tárhely | 5–10 GB | A rendszer + Node/Docker foglalja a helyet, a relay maga semmit nem ír lemezre. |
| Sávszélesség | **ez számít igazán** | Minden átvitt bájt kétszer megy át a szerveren (be, majd ki), base64 miatt kb. +33% overhead-del. Ha sokat és nagy fájlokat küldesz távolról, olyan csomagot válassz, ahol a havi forgalom vagy a sávszélesség nem szűk keresztmetszet (sok szolgáltatónál "unmetered" vagy nagyon nagyvonalú a keret a legkisebb csomagban is). |

Gyakorlatban: a legkisebb, kb. 4-6 USD/hó körüli VPS csomagok (pl. Hetzner
CX22, DigitalOcean/Vultr/Linode legkisebb droplet-jei) bőven elegek egy
maroknyi eszközpár (pl. a saját két géped) alkalmankénti fájlküldéséhez.
Csak akkor érdemes feljebb menni, ha (a) rendszeresen nagyon nagy fájlokat
(sok GB-os videó stb.) tolsz távolról, vagy (b) az appot publikálod és sok
felhasználó egyszerre aktívan használja a távoli átvitelt — mindkét esetben
a sávszélesség/forgalmi keret lesz a limitáló tényező előbb, mint a CPU/RAM.
Mivel minden eszközpár teljesen elkülönített "szobában" van, a szerver
terhelése lényegében lineárisan nő az egyidejűleg *aktívan átvitelt végző*
párok számával, nem a regisztrált felhasználók számával — egy nagyobb
publikált felhasználói bázisnál érdemes lehet a sávszélességet és a RAM-ot
menet közben, a tényleges forgalom alapján felskálázni.

## Mennyire biztonságos ezt kitenni az internetre?

**A relay szándékosan minimális támadási felületű:**

- **Nincs fájltárolás** — a relay memóriában, azonnal továbbítja az adatot, sosem írja lemezre. Ha valaki fel is töri a VPS-t, korábbi átviteleket nem tud visszanézni belőle (nincs mit).
- **Nincs felhasználói fiók/jelszó** — a hozzáférés kulcsa a **párosító kód**: egy rövid (6 karakteres, kötőjellel tagolt, pl. `AB3-K9Q`), kényelmesen begépelhető kód, amit csak a te két géped ismer. Ez lényegesen kevesebb kombináció, mint egy UUID, ezért a `server.js` IP-nkénti rate limitet alkalmaz az új kapcsolódási kísérletekre (alapból percenként ~20), hogy a kód végigpróbálgatása ne legyen praktikus — ez a `MIN_CODE_LENGTH`/`RATE_LIMIT_*` konstansokkal hangolható a fájl tetején.
- **A relay csak jóváhagyott, összekötött eszközök között forwardol** — minden eszköznek saját, állandó kódja van, és csak azok az eszközök látják egymást, amelyek kifejezetten jóváhagyták egymást. Egy idegen, ismeretlen kóddal csatlakozó eszköz sosem lát senkit, amíg valamelyik oldal jóvá nem hagyja.

**Amit viszont neked kell beállítanod, hogy tényleg biztonságos legyen:**

1. **Mindig TLS-en (wss://) keresztül használd, ne sima ws://-n.** Sima
   `ws://` esetén a fájljaid tartalma (base64-ben) titkosítatlanul megy át
   az interneten — bárki, aki lát a hálózati útvonalon (pl. egy rosszhiszemű
   szolgáltató, vagy ugyanazon a wifin lévő valaki, ha épp azon vagy),
   elolvashatja. A mellékelt `Caddyfile.example` ezt egy paranccsal
   megoldja: ingyenes, automatikusan megújuló TLS-tanúsítványt szerez
   (Let's Encrypt) és `wss://relay.sajatdomained.com`-ként teszi elérhetővé.
2. **Tűzfal**: csak a 443-as (HTTPS/WSS) és a 22-es (SSH) portot engedd
   kívülről; a relay saját Node/Docker portja (8787) maradjon csak
   `127.0.0.1`-en — a mellékelt `docker-compose.yml` már így van beállítva.
   Példa (ufw): `ufw allow 22,443/tcp && ufw enable`.
3. **Alap VPS-higiénia**: SSH csak kulccsal (jelszavas bejelentkezés
   kikapcsolva), root bejelentkezés tiltva, rendszeres `apt upgrade`, esetleg
   `fail2ban` az SSH brute force ellen. Ez minden internetre kitett gépre
   igaz, nem Beamzy-specifikus, de a relay sem ér semmit, ha maga a VPS
   sérül.
4. **A párosító kód szándékosan állandó és nem generálható újra** — ez
   megakadályozza, hogy egy kitiltott eszköz egyszerűen új kóddal
   megkerülje a tiltást. Ha egy kód mégis kiszivárogna, az adott eszközt
   a `/admin/block` végponton lehet kitiltani (lásd fent).

Összefoglalva: a relay maga (a kódja, a modellje) eleve úgy van megtervezve,
hogy még ha nyilvánosan elérhető is, önmagában ne jelentsen komoly kockázatot
(nincs tárolt adat, nincs fiókrendszer feltörhető jelszava) — a fő teendőd a
**TLS bekapcsolása** és **alap szerver-higiénia**, ezután nyugodtan futtatható
akár a legkisebb, néhány dolláros VPS-en is.

## Telepítés

### A) Docker (ajánlott — a legkevesebb beállítással jár)

```bash
# a VPS-en, miután feltöltötted ezt a relay/ mappát
cd relay
docker compose up -d --build
```

Ezután állítsd be a `Caddyfile.example` alapján a Caddy-t (vagy bármilyen
más reverse proxyt) a domained TLS-eléréséhez, és a `docker-compose.yml`
már eleve csak `127.0.0.1:8787`-re köti ki a portot, tehát a Node folyamat
sosem közvetlenül a nyílt internetről érhető el.

### B) Sima Node.js + systemd

```bash
sudo mkdir -p /opt/swiftsend-relay
sudo cp server.js package.json /opt/swiftsend-relay/
cd /opt/swiftsend-relay
sudo npm install --omit=dev

sudo useradd --system --no-create-home swiftsend   # ha még nincs ilyen user
sudo chown -R swiftsend:swiftsend /opt/swiftsend-relay

sudo cp swiftsend-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now swiftsend-relay
```

Ezután itt is állítsd be a Caddy-t/nginx-et TLS-hez a `Caddyfile.example`
alapján — a systemd unit is alapból csak a helyi 8787-es porton figyel.

### Ellenőrzés

```bash
curl -s https://relay.sajatdomained.com/   # -> "Beamzy relay OK"
```

Utána a Beamzy appban (mindkét géped Beállítások > Remote access) add
meg a `wss://relay.sajatdomained.com` címet, és a párosító kódot.

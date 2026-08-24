# Beamzy

Ultra gyors fájlküldés Mac és Windows gépek között, ugyanazon a helyi hálózaton (wifi/router). Nincs felhő, nincs feltöltési korlát — a két gép közvetlenül, egymás között küldi a fájlokat a helyi hálózaton.

## Hogyan működik

- **Felderítés**: az app mDNS-szel (Bonjour) automatikusan megtalálja a hálózaton futó másik Beamzy példányokat, párosítási kód nélkül.
- **Küldés (push)**: kiválasztod a fájlokat / mappát, és hogy a másik gépen melyik megosztott mappába kerüljön — utána azonnal indul az átvitel.
- **Lehúzás (pull)**: a másik gép megosztott mappáiban böngészhetsz, és bármelyik fájlt magadhoz húzhatod, anélkül hogy a másik gépen bárkinek fel kellene töltenie.
- **Jogosultságok**: csak azok a mappák láthatók / írhatók kívülről, amelyeket te kifejezetten megosztasz az appban (Beállítások, vagy az első indításkor).
- **Távoli hozzáférés (relay)**: ha a két géped nincs ugyanazon a hálózaton, a Beállítások > Remote access alatt bekapcsolhatod — ekkor egy közvetítő szerveren ("relay") keresztül is tudtok fájlt küldeni/húzni. Lásd lent.

## Távoli (nem-LAN) átvitel — relay szerver

Amikor mindkét géped ugyanazon a wifin/routeren van, az app a fenti közvetlen, gyors útvonalat használja. Ha viszont az egyik géped távol van (más hálózaton, otthonról-irodából stb.), közvetlen kapcsolat általában nem lehetséges (NAT/tűzfal miatt) — ehhez kell egy, az interneten futó **relay szerver**, ami csak továbbítja az adatot a két saját géped között (nem tárol, nem lát bele semmibe, csak egy "cső").

**Ez a relay a *termék* háttérszolgáltatása, nem az egyes felhasználók infrastruktúrája.** Egyetlen relay-telepítés korlátlan sok eszközpárt tud egyszerre kiszolgálni — mindegyik párost a saját, egyedi párosító kódja különíti el a többiektől egy közös szobában (`pairId`), a relay memóriájában, fájltárolás vagy fiókrendszer nélkül. Ha ezt az appot publikálni szeretnéd, **neked (a fejlesztőnek) kell egyszer, központilag elindítanod egy relay-t** — a végfelhasználóidnak ehhez soha nem kell VPS-t üzemeltetniük, nekik tényleg csak a 2 saját gépük kell:

1. **Te, a fejlesztő, telepíted a relay-t** — egyszer, egy helyen — egy publikusan elérhető szerverre (a `relay/` mappa egy önálló, függőségmentes kis Node.js szerver):
   ```bash
   cd relay
   npm install
   npm start   # vagy: node server.js
   ```
   Bármilyen Node.js-t futtató helyen elindítható: egy olcsó VPS-en, vagy ingyenes szolgáltatásokon (Render, Railway, Fly.io stb.) — a lényeg, hogy legyen egy `wss://...` címe. Részletes telepítési útmutató (Docker/systemd, gépigény, TLS, tűzfal, biztonsági megfontolások): [`relay/DEPLOY.md`](relay/DEPLOY.md).

2. **Ezt az egy URL-t beégeted az appba, mielőtt publikálod**: nyisd meg a `src/main/constants.ts`-t, írd át a `DEFAULT_RELAY_URL`-t a saját relayedre, majd buildeld újra (`npm run build:mac` / `npm run build:win`). Ettől kezdve **minden** telepített Beamzy-példány — bárkié, aki letölti a publikált appot — ugyanazt a központi relay-t használja alapból, a távoli hozzáférés pedig már be is van kapcsolva alapértelmezetten.

3. **A végfelhasználó (akár te magad a két géped között, akár bárki más, aki majd letölti az appot) ettől kezdve tényleg csak 2 gépet lát**: telepíti az appot mindkét eszközére, az onboarding végén megjelenik egy **párosító kód** (pl. `AB3-K9Q`) — az első gépen ezt egyszerűen otthagyja, a másodikon pedig felülírja az első gép kódjával. Ha a kód egyezik, a két eszköz látja egymást "🌐 Remote" jelöléssel, és attól kezdve ugyanúgy küldhetnek/húzhatnak fájlokat, mint helyi hálózaton — csak az átvitel a relay-n át megy (ezért lassabb, mint LAN-on, a sebességet az internet-feltöltési/letöltési sebességük korlátozza). Sem VPS-t, sem beállítást, sem Settings-ben turkálást nem igényel tőlük.

> **Biztonsági modell**: a párosító kód rövid (6 karakter + kötőjel), hogy kényelmesen begépelhető legyen — ezért a relay szerver korlátozza az új kapcsolódási kísérletek számát IP-nként (percenként max. ~20), hogy a kód találgatása ne legyen praktikus. A relay maga nem old meg felhasználói fiókokat/jelszavakat, csak a kód alapján azonosítja az eszközöket; a kód szándékosan állandó és nem generálható újra, hogy egy kitiltott eszköz ne tudjon a tiltás elől új kóddal megszökni — ha egy kód mégis kompromittálódna, az adott eszközt a `/admin/block` végponton lehet kitiltani.

## Forráskód és automatikus frissítés — két külön dolog

A forráskód egy **privát** GitHub repóban van (`github.com/VBoti201/beamzy`) — ez csak verziókövetésre/biztonsági mentésre való, nincs köze ahhoz, honnan töltik le a felhasználók az app-frissítéseket. Mivel privát repo release-eit nem tudja letölteni egy telepített app (token nélkül), az automatikus frissítés (lásd `src/main/updater.ts`) **nem GitHubról megy**, hanem egy általad üzemeltetett, sima statikus fájlszerverről (`electron-updater` "generic" provider, lásd a `package.json` `build.publish.url`-jét) — ugyanarra a VPS-re rakhatod, mint a relay-t.

> **Megjegyzés**: minden kiadott verzió egy új commitban adja hozzá az `updates/` alá a bináris fájlokat (~150-250 MB/verzió), a régieket viszont sosem törli a git history — ez lassan, de folyamatosan növeli a `.git` méretét, hiába csak a legutolsó verzió számít ténylegesen. Ha ez már zavaróan nagyra nőtt (`du -sh .git`), a `scripts/trim-update-history.sh` egy paranccsal kitisztítja (csak a jelenlegi verzió binárisait tartja meg a history-ban) — a szkript végén jelzett `git push --force`-ot viszont neked kell lefuttatnod egy sima terminálban, mert ezt Claude Code biztonsági okból nem futtatja le felügyelet nélkül.

## Fejlesztői indítás

```bash
npm install
npm run dev
```

## Build

```bash
npm run build       # csak fordítás, csomagolás nélkül
npm run build:mac   # .dmg / .zip macOS-hez (macOS gépen futtatva)
npm run build:win   # .exe (NSIS + portable) Windows-hoz
```

> **Megjegyzés a Windows build-hez**: `npm run build:win` (NSIS installer + portable exe) Mac gépről futtatva `wine`-t igényel. Wine nélkül is lehet Windows-buildet készíteni Macen — ez nem ad szép telepítőt, de a `Beamzy.exe` simán fut vele:
> ```bash
> npx electron-builder --win dir --x64
> cd dist && zip -r Beamzy-win-x64.zip win-unpacked
> ```
> A kapott zip-et kicsomagolva Windows gépen a `win-unpacked\Beamzy.exe`-re duplán kattintva indul az app. Ha szép telepítőt szeretnél (Start Menu bejegyzés stb.), vagy futtasd a `build:win` parancsot közvetlenül egy Windows gépen, vagy telepítsd a Wine-t (`brew install --cask wine-stable`) — Apple Siliconon ez néha akadozik electron-builderrel.

## Tűzfal / hálózat

Az első indításkor mind macOS, mind Windows megkérdezheti, hogy az app kommunikálhat-e a helyi hálózaton (macOS: "Local Network" engedély, Windows: Defender tűzfal felugró ablak). Ezt mindkét gépen engedélyezni kell, különben a felderítés és az átvitel nem fog működni.

## Architektúra dióhéjban

- `src/main` — Electron main process: eszközkonfiguráció (`electron-store`), mDNS felderítés (`bonjour-service`), saját HTTP-alapú átviteli szerver és kliens (Node `http`, stream-elve — nincs felesleges overhead).
- `src/preload` — biztonságos, `contextBridge`-en keresztüli API a felülethez.
- `src/renderer` — React + TypeScript UI, `framer-motion` animációkkal (indítóképernyő, átmenetek, drag & drop, élő átviteli sáv).

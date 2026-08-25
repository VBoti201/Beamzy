# Beamzy

Ultra-fast file transfer between Mac and Windows machines on the same local network (Wi-Fi/router). No cloud, no upload limits — the two machines send files directly to each other over the local network.

## How it works

- **Discovery**: the app uses mDNS (Bonjour) to automatically find other Beamzy instances on the network, no pairing code needed.
- **Push**: pick the files/folder to send and which shared folder on the other machine they should land in — the transfer starts right away.
- **Pull**: browse the other machine's shared folders and pull any file to yours, without anyone on the other end having to upload it themselves.
- **Permissions**: only folders you explicitly share in the app (Settings, or during first launch) are visible/writable from the outside.
- **Remote access (relay)**: if your two machines aren't on the same network, turn this on under Settings > Remote access — files can then also be sent/pulled through a relay server. See below.

## Remote (non-LAN) transfer — the relay server

When both your machines are on the same Wi-Fi/router, the app uses the direct, fast path above. But if one machine is somewhere else (a different network, home vs. office, etc.), a direct connection usually isn't possible (NAT/firewalls) — that needs a **relay server** running on the internet, which just forwards data between your two machines (it never stores anything or looks inside — it's just a pipe).

**This relay is a backend service *for the product*, not something individual users run.** A single relay deployment can serve an unlimited number of device pairs at once — each pair is kept isolated from the others by its own unique pairing code in a shared room (`pairId`), in the relay's memory, with no file storage or account system. If you want to publish this app, **you (the developer) set up one relay, once, centrally** — your end users never need to run a VPS themselves, they really only need their 2 machines:

1. **You, the developer, deploy the relay** — once, in one place — on a publicly reachable server (the `relay/` folder is a small, dependency-free, standalone Node.js server):
   ```bash
   cd relay
   npm install
   npm start   # or: node server.js
   ```
   It runs anywhere Node.js runs: a cheap VPS, or free-tier services (Render, Railway, Fly.io, etc.) — the only requirement is a `wss://...` address. For a detailed deployment guide (Docker/systemd, sizing, TLS, firewall, security considerations): [`relay/DEPLOY.md`](relay/DEPLOY.md).

2. **Bake that one URL into the app before publishing it**: open `src/main/constants.ts`, set `DEFAULT_RELAY_URL` to your own relay, then rebuild (`npm run build:mac` / `npm run build:win`). From then on, **every** installed Beamzy instance — anyone's, who downloads the published app — uses that same central relay by default, with remote access already turned on out of the box.

3. **From here, the end user (whether that's you between your own two machines, or anyone else who downloads the app) really only ever sees 2 machines**: they install the app on both devices, and at the end of onboarding a **pairing code** shows up (e.g. `AB3-K9Q`) — they leave it as-is on the first device, and overwrite it with the first device's code on the second. Once the codes match, the two devices see each other labeled "🌐 Remote", and from then on can send/pull files just like on a local network — just routed through the relay (so slower than LAN, limited by their internet upload/download speed). No VPS, no configuration, no digging through Settings required from them.

> **Security model**: the pairing code is short (6 characters + a dash) so it's comfortable to type — so the relay server rate-limits new connection attempts per IP (~20/minute by default) to make guessing a code impractical. The relay itself doesn't handle user accounts/passwords, it just identifies devices by their code; the code is deliberately permanent and can't be regenerated, so a blocked device can't dodge a ban with a fresh one — if a code is ever compromised, that device can be blocked at the `/admin/block` endpoint.

## Source code and auto-updates — two separate things

The source code lives in a **private** GitHub repo (`github.com/VBoti201/Beamzy`) — that's purely for version control/backup, and has nothing to do with where users actually download app updates from. Since an installed app can't download releases from a private repo (without a token), auto-updates (see `src/main/updater.ts`) **don't go through GitHub** — instead they use a plain static file server you host yourself (`electron-updater`'s "generic" provider, see `build.publish.url` in `package.json`) — you can put this on the same VPS as the relay.

> **Note**: every released version adds its binaries under `updates/` in a new commit (~150-250MB/version), and old ones are never removed from git history — this slowly but steadily grows the size of `.git`, even though only the latest version actually matters. If this has grown uncomfortably large (`du -sh .git`), `scripts/trim-update-history.sh` cleans it up with one command (keeping only the current version's binaries in history) — the `git push --force` it prints at the end needs to be run by you in a plain terminal, though, since Claude Code won't run that unattended for safety reasons.

## Running it in development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build       # compile only, no packaging
npm run build:mac   # .dmg / .zip for macOS (run on a macOS machine)
npm run build:win   # .exe (NSIS + portable) for Windows
```

> **Note on the Windows build**: running `npm run build:win` (NSIS installer + portable exe) from a Mac requires `wine`. You can still produce a Windows build on a Mac without Wine — it won't be a proper installer, but the resulting `Beamzy.exe` runs fine:
> ```bash
> npx electron-builder --win dir --x64
> cd dist && zip -r Beamzy-win-x64.zip win-unpacked
> ```
> Unzip that on a Windows machine and double-click `win-unpacked\Beamzy.exe` to launch it. If you want a proper installer (Start Menu entry, etc.), either run `build:win` directly on a Windows machine, or install Wine (`brew install --cask wine-stable`) — on Apple Silicon this sometimes has hiccups with electron-builder.

## Firewall / network

On first launch, both macOS and Windows may ask whether the app can communicate on the local network (macOS: "Local Network" permission, Windows: a Defender firewall prompt). This needs to be allowed on both machines, otherwise discovery and transfer won't work.

## Architecture in a nutshell

- `src/main` — Electron main process: device config (`electron-store`), mDNS discovery (`bonjour-service`), a custom HTTP-based transfer server and client (Node's `http`, streamed — no unnecessary overhead).
- `src/preload` — a secure API for the UI via `contextBridge`.
- `src/renderer` — React + TypeScript UI, animated with `framer-motion` (splash screen, transitions, drag & drop, live transfer bar).

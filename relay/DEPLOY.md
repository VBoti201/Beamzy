# Beamzy relay — deploying to a VPS

This folder is a standalone, few-dozen-line Node.js WebSocket server. It has one job: connect Beamzy device pairs to each other when they aren't on the same local network. It doesn't store files, doesn't know about user accounts — it just keeps the connection open until a device pair finishes a transfer, and no trace is left on the server afterward.

**You deploy this once, centrally** (if you're publishing the app, that means your server, not each user's) — a single instance can serve an unlimited number of device pairs at once, each isolated in its own pairing-code "room", so no user pair needs (or should need) to run their own relay.

## How big a machine do I need?

The relay is **I/O-bound, not CPU-bound** — it forwards incoming data (small JSON packets, base64-encoded file chunks) right away, and effectively does no computation. So:

| Resource | Recommended minimum | Why this is enough |
|---|---|---|
| CPU | 1 shared vCPU | No encryption, compression, or file processing happens in the relay itself (TLS is handled by Caddy, which is light too). |
| RAM | 512 MB – 1 GB | Only a few dozen KB of state per device/connection is kept in memory; even a 256 KB file chunk only sits in memory for a moment while it's forwarded. |
| Storage | 5–10 GB | The OS + Node/Docker take up the space — the relay itself never writes anything to disk. |
| Bandwidth | **this is what actually matters** | Every transferred byte passes through the server twice (in, then out), with about +33% overhead from base64. If you send a lot of large files remotely, pick a plan where monthly traffic or bandwidth isn't the bottleneck (many providers offer "unmetered" or a very generous allowance even on their smallest tier). |

In practice: the cheapest VPS tiers, around $4-6/month (e.g. Hetzner CX22, or the smallest DigitalOcean/Vultr/Linode droplets), are plenty for occasional file transfers between a handful of device pairs (e.g. your own two machines). It's only worth going bigger if (a) you regularly push very large files (multi-GB videos etc.) remotely, or (b) you publish the app and many users are actively using remote transfer at once — in both cases, bandwidth/traffic allowance becomes the limiting factor before CPU/RAM does. Since every device pair is fully isolated in its own "room", the server's load scales essentially linearly with the number of pairs *actively transferring at the same time*, not with the number of registered users — at a larger published user base, it may be worth scaling bandwidth and RAM up over time, based on actual traffic.

## How safe is it to expose this to the internet?

**The relay is deliberately built with a minimal attack surface:**

- **No file storage** — the relay forwards data in memory, immediately, and never writes it to disk. Even if someone breaks into the VPS, they can't look back at past transfers (there's nothing to find).
- **No user accounts/passwords** — access is keyed by the **pairing code**: a short (6-character, dash-separated, e.g. `AB3-K9Q`), comfortably typeable code known only to your two machines. That's a significantly smaller space than a UUID, so `server.js` rate-limits new connection attempts per IP (~20/minute by default) to make brute-forcing a code impractical — tunable via the `MIN_CODE_LENGTH`/`RATE_LIMIT_*` constants at the top of the file.
- **The relay only forwards between approved, linked devices** — every device has its own permanent code, and only devices that have explicitly approved each other can see one another. A stranger connecting with an unknown code never sees anyone until one side approves them.

**What you still need to set up yourself for this to actually be safe:**

1. **Always use it over TLS (wss://), never plain ws://.** Over plain `ws://`, the contents of your files (base64-encoded) travel over the internet unencrypted — anyone who can see the network path (e.g. a malicious ISP, or someone on the same Wi-Fi if you're on it) can read them. The included `Caddyfile.example` handles this with one command: it gets a free, auto-renewing TLS certificate (Let's Encrypt) and serves it as `wss://relay.yourdomain.com`.
2. **Firewall**: only allow port 443 (HTTPS/WSS) and 22 (SSH) from the outside; keep the relay's own Node/Docker port (8787) bound to `127.0.0.1` only — the included `docker-compose.yml` is already set up this way. Example (ufw): `ufw allow 22,443/tcp && ufw enable`.
3. **Basic VPS hygiene**: SSH key-only (password login disabled), root login disabled, regular `apt upgrade`, maybe `fail2ban` against SSH brute-forcing. This applies to any internet-facing machine, not Beamzy-specific — but the relay isn't worth much either if the VPS itself gets compromised.
4. **The pairing code is deliberately permanent and can't be regenerated** — this prevents a blocked device from simply dodging the ban with a new code. If a code does leak, that device can be blocked at the `/admin/block` endpoint (see above).

In short: the relay itself (its code, its model) is designed so that even if it's publicly reachable, it isn't a serious risk on its own (no stored data, no account system with passwords to crack) — your main job is **turning on TLS** and **basic server hygiene**, after which it can comfortably run on even the smallest, few-dollar VPS.

## Deployment

### A) Docker (recommended — the least setup)

```bash
# on the VPS, after uploading this relay/ folder
cd relay
docker compose up -d --build
```

Then set up Caddy (or any other reverse proxy) based on `Caddyfile.example` for TLS on your domain — `docker-compose.yml` already binds the port to `127.0.0.1:8787` only, so the Node process is never directly reachable from the open internet.

### B) Plain Node.js + systemd

```bash
sudo mkdir -p /opt/beamzy-relay
sudo cp server.js package.json /opt/beamzy-relay/
cd /opt/beamzy-relay
sudo npm install --omit=dev

sudo useradd --system --no-create-home beamzy   # if this user doesn't exist yet
sudo chown -R beamzy:beamzy /opt/beamzy-relay

sudo cp beamzy-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now beamzy-relay
```

Here too, set up Caddy/nginx for TLS based on `Caddyfile.example` — the systemd unit also only listens on local port 8787 by default.

### Verifying it

```bash
curl -s https://relay.yourdomain.com/   # -> "Beamzy relay OK"
```

Then in the Beamzy app (on both your machines, Settings > Remote access), enter the `wss://relay.yourdomain.com` address and the pairing code.

## Landing page download counter (optional)

The relay also tracks how many times the landing page's download buttons were used, for the little counter shown on the site. Without any extra setup this is stored in a local file (`download-counts.json`) next to `server.js` — that survives a plain process restart but **resets to zero on every redeploy**, since the relay's disk isn't durable across those.

To make it actually persistent, set a `REDIS_URL` environment variable pointing at any Redis-compatible instance (e.g. a Render "Key Value" service, which has a free tier) — the counter then survives redeploys too. If `REDIS_URL` is unset, or the instance is unreachable, the relay falls back to the local file automatically (it never blocks startup waiting on Redis).

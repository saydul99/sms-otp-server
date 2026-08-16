# SMS OTP Server — Cloudflare Worker

OTP relay server deployed on **Cloudflare Workers** with **Durable Object (SQLite)** storage.

## Why Durable Objects instead of KV?

KV is eventually consistent — a POST followed by a GET can read a stale empty value
for up to seconds (the "OTP aane mein late" problem). A Durable Object is a single
point of truth per route: **strong read-after-write consistency** → OTP shows up in
the browser within one poll. Plus a **WebSocket push** endpoint (`/ws/{route}`) so
the OTP can arrive in ~0ms without polling.

## Files

- `cloudflare-worker.js` — Worker source code (Durable Object `OtpStore` + entry point)
- `wrangler.toml` — Cloudflare deploy config (Durable Object binding: `OTP`)

## Deploy

```bash
npx wrangler deploy
```

> The migration tag in `wrangler.toml` (`new_sqlite_classes`) must be kept.
> Do not re-deploy an old KV version over this — the KV binding was removed.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sms` | Android app sends OTP here (`{id, sender, content}`) |
| POST | `/test-sms` | Testing: store a fixed 4-8 digit OTP without a real SMS (`{id, otp}`) |
| GET | `/check-otp/:routeId` | Check OTP without deleting (404 when empty) |
| GET | `/get-otp/:routeId` | Get OTP and delete it (404 when empty) |
| DELETE | `/clear-all` | Clear all stored OTPs (known users × pairs) |
| DELETE | `/clear-all/:routeId` | Clear a single route |
| GET | `/check-all/:userId` | Peek all pairs for a user → `{otps: {P1..P4}}` |
| WS | `/ws/:routeId` | WebSocket push — OTP broadcast instantly (client pings every ~25s) |
| GET | `/status` | Server status + stored OTP list |

## Worker URL

`https://faster-otp-server.haquecom-2015.workers.dev`

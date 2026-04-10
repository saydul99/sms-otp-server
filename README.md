# SMS OTP Server — Cloudflare Worker

OTP relay server deployed on **Cloudflare Workers** with KV storage.

## Files

- `cloudflare-worker.js` — Worker source code
- `wrangler.toml` — Cloudflare deploy config (KV binding: `OTP_STORE`)

## Deploy

```bash
npx wrangler deploy
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sms` | Android app sends OTP here |
| GET | `/get-otp/:id` | Get OTP and delete it |
| GET | `/check-otp/:id` | Check OTP without deleting |
| DELETE | `/clear-all` | Clear all stored OTPs |
| GET | `/status` | Server status |

## Worker URL

`https://sms-otp-worker.haquecom-2015.workers.dev`

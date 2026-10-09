# Cloudflare Worker KV Peer Synchronizer

A lightweight serverless micro-service enabling anonymous peer-to-peer distribution of active 6-digit attendance OTP codes across classmates.

## Architecture & Security
- **Data Retention**: 3600 seconds (1 hour TTL). Records automatically self-destruct upon class completion.
- **Indexing**: Keyed by `class:{id_kelas}` or hash.
- **Authentication**: Stateless, open CORS for extension integration.

## Deployment Steps
1. Navigate into `serverless`:
   ```bash
   cd serverless
   ```
2. Create the Cloudflare KV namespace:
   ```bash
   npx wrangler kv:namespace create PRESENSI_KV
   ```
3. Copy the returned `id` into `serverless/wrangler.toml`.
4. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```

## Endpoints
- `POST /api/code`: Body `{ "class_id": "...", "code": "123456", "room": "TW1-102" }`
- `GET /api/code?class_id=...`: Returns `{ "found": true, "data": { "code": "123456", "room": "...", "updated_at": 1690000000 } }`

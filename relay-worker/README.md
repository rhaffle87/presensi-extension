# Cloudflare Worker Relay & Mesh Coordinator

A high-performance serverless relay backing the peer-to-peer Swarm Mesh and anonymous attendance OTP distribution for `presensi-extension`.

---

## Capabilities & Architecture
- **Stateless & Scalable**: Runs on Cloudflare Edge workers with KV storage.
- **Dynamic CORS & Method Whitelisting**: Allows cross-origin calls from browser extension runtimes and authorized web contexts.
- **Sliding-Window Rate Limiting**: Enforces a per-IP threshold of 60 requests/minute to prevent brute-force attacks and denial-of-service.
- **Anti-Replay Protection**: Rejects state-modifying requests with timestamps older than 5 minutes (`300,000ms`).
- **Input Validation**: Sanitizes identifier keys, checks 6-digit OTP formats, and verifies payload schemas.
- **Automatic TTL Expiration**:
  - OTP codes: 180 seconds (3 minutes)
  - Peer liveness & leader lease: 60 seconds (Cloudflare KV minimum constraint)
  - Swarm shared state: 600 seconds (10 minutes)
  - Replay session cache: 7200 seconds (2 hours)

---

## Deployment Instructions

1. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   ```

2. **Authenticate with Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Create the KV Namespace**:
   ```bash
   wrangler kv:namespace create RELAY
   ```
   Copy the generated `id` and update `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "RELAY"
   id      = "<YOUR_GENERATED_KV_ID>"
   ```

4. **Deploy**:
   ```bash
   wrangler deploy
   ```

---

## API Contract

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Healthcheck and service version information |
| `GET` | `/otp/:tmKey` | Fetch latest active OTP for session `tmKey` |
| `POST` / `PUT` | `/otp/:tmKey` | Publish OTP code or encrypted ciphertext for `tmKey` |
| `POST` / `PUT` | `/mesh/heartbeat/:peerId` | Peer heartbeat, liveness check, and leader election |
| `GET` / `POST` | `/mesh/state` | Retrieve or broadcast global swarm shared state |
| `GET` / `POST` | `/api/code` | Legacy backwards-compatibility route for peer codes |

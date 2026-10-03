# Caddy on the NeoBank platform

## What value does Caddy add?

Caddy is **not** a replacement for APISIX — they operate at different layers:

| Concern | Owner | Why |
|---|---|---|
| TLS termination + auto-renewal | **Caddy** | Automatic ACME certs (Let's Encrypt/ZeroSSL), OCSP stapling, TLS 1.3; APISIX can do TLS but cert automation is manual |
| HTTP/3 + QUIC | **Caddy** | First-class support; measurably better mobile UX on Nigeria's lossy mobile networks (0-RTT resumption, no head-of-line blocking) |
| Edge WAF hand-off | **Caddy → OpenAppSec** | OpenAppSec Nano-Agent integrates natively with Caddy (official attachment); APISIX integration is less mature |
| Edge compression (zstd) | **Caddy** | zstd support; APISIX/nginx is gzip-only |
| Static hosting (PWA/web) | **Caddy** | Built-in file server with try_files SPA fallback — replaces the nginx frontend containers |
| API routing/policy/consumers | **APISIX** | Richer plugin ecosystem (limit-count, consumer auth, observability), etcd-driven dynamic routes |
| AuthN tokens | **Keycloak** | OIDC issuer; Caddy does forward-auth for consoles, APISIX validates JWTs for APIs |

Net value: automatic HTTPS ops, HTTP/3 mobile performance, a clean WAF
insertion point, and simplified static hosting — without disturbing the
existing APISIX policy layer.

## Integration topology

```
Internet
  └─ Caddy :443  (TLS, H3, zstd, OpenAppSec verdict check, forward-auth)
       ├─ /api/*, /ws/*  → APISIX :9080 → backend services
       │                     ├─ JWT validate (Keycloak JWKS)
       │                     ├─ limit-count (Redis)
       │                     └─ http-logger → OpenSearch
       └─ static           → /srv/pwa (SPA)
```

### With APISIX
- Caddy `reverse_proxy` to APISIX with keepalive pools (`Caddyfile` in this
  directory). APISIX trusts only Caddy's egress IP (`trusted_proxies`).
- APISIX keeps: consumer API keys, per-route rate limits, route versioning,
  Prometheus metrics, OpenSearch http-logger.
- Do **not** double-terminate TLS inside APISIX; use h2c/HTTP between the two.

### With OpenAppSec
- Deploy the OpenAppSec Nano-Agent with the **Caddy attachment**
  (agent connects to Caddy via the open-appsec reverse-proxy integration).
- The agent sets `X-OpenAppSec-Verdict: block|accept` per request; the
  Caddyfile aborts blocked requests at the edge before they touch APISIX.
- Learning mode first (2 weeks), then `prevent` for `/api/v1/auth/*` and
  `/api/v1/transfers/*` (highest-risk paths).

### With Keycloak
- **Consoles/admin** (human users): Caddy `forward_auth` to an
  oauth2-proxy/gatekeeper sidecar that completes the OIDC flow with Keycloak
  and copies identity headers upstream.
- **APIs** (machine clients): no change — APISIX `jwt-auth` plugin validates
  Keycloak-issued tokens against the realm JWKS endpoint. Caddy stays
  out of the token path (avoids double introspection latency).

### With other components
- **Redis**: APISIX limit-count shares the Redis instance (separate DB index).
- **OpenSearch**: Caddy JSON access logs shipped via fluent-bit; APISIX
  http-logger posts API telemetry — one `edge-logs-*` index pattern.
- **Dapr**: unaffected (sidecar-to-sidecar mTLS inside the cluster).
- **TigerBeetle/Temporal/Kafka**: internal only; never exposed through Caddy.

## Rollout
1. Deploy Caddy with the provided `Caddyfile` alongside existing nginx.
2. Point 10% of traffic (DNS weighted) at Caddy; compare p50/p95/p99.
3. Attach OpenAppSec agent in learning mode.
4. Cut over fully; retire nginx frontend containers.
5. Enable H3 Alt-Svc advertisement; measure mobile TTI improvement.

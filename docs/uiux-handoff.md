# UI/UX Handoff Pack — NeoBank Design System v1

Phases 1–7 of the World-Class Fintech master prompt are complete. This
document is the audit + handoff record (Section 12.2 Definition of Done).

## Phase recap

| Phase | Scope | Key deliverables |
|---|---|---|
| 1 Foundations | Tokens & theming | `src/styles/tokens.css` (both apps), 3-tier token architecture, light/dark pairs, `src/design/tenantTheme.js` (`tonalRamp`, `contrastRatio`, `ensureContrast`, `applyTenantTheme`, `applyColorMode`, `initTheme`, `amountParts`) |
| 2 Component library | nb/* components | NBButton, NBInput, NBCard, NBStatusPill, NBSkeleton(+composites), NBBalanceCard, NBTransactionRow, NBStates (empty/error/offline), NBSheet, Amount, ThemeToggle + `/design-system` gallery |
| 3 Core journeys | Onboarding, Home, money movement | Onboarding.jsx (4-step KYC, save-and-resume), Dashboard.jsx rewrite, Transfers.jsx 4-step flow with review sheet + success |
| 4 Insights | Dashboards | SpendingInsightsScreen.jsx (donut ≤5 slices, safe-to-spend with tappable formula, budget pace bars, cashflow chart) |
| 5 Cards, security, admin | Trust surfaces | CardManagement.jsx (freeze sheet, role="switch" toggles), SecurityCenter.jsx (devices, 2FA, alerts, privacy, data export), TenantBrandingPage.jsx (seed → live theme, contrast gates) |
| 6 States & theming QA | Edge cases | Transactions.jsx (day headers, search, filter chips, full state sweep), skeleton/error/offline states everywhere, `prefers-reduced-motion`, safe-area classes |
| 7 Audit & handoff | This document | Quality-bar checklist, patch chain, acceptance notes |

## Segmentation engine ("app store")

Backend: `segments`, `segment_apps`, `user_segments` tables
(migration `006_segments_appstore`), router `app/routers/segment_router.py`,
rule engine `app/services/segment_service.py`:

- `GET /segments` — public catalog (idempotently syncs new catalog entries
  on first call; admin edits are never overwritten)
- `GET /segments/{key}` — segment detail with apps
- `GET /app-store` — personalized: `for_you` (enrolled) + `discover`;
  lazily runs rule evaluation first
- `POST /app-store/enroll`, `DELETE /app-store/enroll/{key}` — membership
- `POST /app-store/evaluate` — explicit criteria re-run (call after KYC
  completion)
- `POST/PATCH /admin/segments[...]`, `POST/PATCH /admin/segments/{key}/apps[...]` — admin CRUD (admin/manager role)
- `GET /admin/segments` — full catalog incl. inactive/disabled items
- `POST /admin/segments/{key}/toggle` — **activate/deactivate a whole segment**
- `POST /admin/segments/{key}/apps/{app_key}/toggle` — **enable/disable one app**
- `require_segment_app_factory(app_key)` — FastAPI dependency any router
  can use to gate endpoints behind an enabled app tile + membership

Auto-enrollment (source="rule"): `segment_service.evaluate_and_enroll`
matches a user's age (from `date_of_birth`), `kyc_level`, `kyc_status`
and `country` against each active segment's JSONB `criteria`
(AND semantics; empty criteria = join-by-choice only). It runs on every
`GET /auth/validate` (PWA app start) and lazily on `GET /app-store`, so
enrollment tracks KYC/profile changes with no extra wiring. Rule-based
memberships that stop matching are removed; manual/admin memberships are
never touched. Auth is never blocked by segmentation errors.

Frontend: mobile `AppStore.jsx` (`/store`, "Apps for You" in sidebar) with
join-to-unlock app tiles; web `SegmentsAdminPage.jsx` (`/admin/segments`)
with per-segment activation switches (role="switch") and per-app
Enable/Disable buttons.

Catalog (9 segments, upserted on first catalog call): Students, Traders &
SMEs, Gig & Ride-hail, NYSC Corps, Salary Earners, Ajo & Cooperatives,
Diaspora & Remitters (rule: country in GB/US/CA/AE/DE), Farmers &
Agri-Coops, Parents & Guardians (rule: age 25–65).

## Quality-bar checklist (Section 12.2)

- [x] Every color/spacing/elevation/motion value resolves to a token — no
      hardcoded hex in new components (audit: `grep -rn "#[0-9a-fA-F]\{6\}" src/pages` → 0 in rewritten screens)
- [x] Dark mode is a token swap (`.dark` overrides), not a redesign
- [x] Tenant brand applied via Brand Pack: seed color → tonal ramp →
      `--nb-brand-*` + radius vars; WCAG contrast enforced at runtime
      (`ensureContrast` warns + nudges)
- [x] Touch targets ≥ 44px; focus-visible 3px ring on all interactives
- [x] Status never color-only (NBStatusPill: icon + label)
- [x] Money formatted via `amountParts` / `.amount` with tabular numerals;
      currency symbol de-emphasized at 70%
- [x] Loading = skeletons that match final layout; errors offer retry and
      reassure ("Your money is safe"); offline banner is global
- [x] Destructive/sensitive actions confirm via bottom sheet (NBSheet) with
      the action named ("Freeze card", "Send ₦5,000 to Adaeze")
- [x] `prefers-reduced-motion` honored globally
- [x] Legal/ compliance copy gated behind `{{LEGAL_REVIEW}}` markers
      (Onboarding, SecurityCenter close-account)
- [x] Screenshots captured per phase (light, dark, tenant swap, mobile,
      sheet, flow steps) as proof-of-design

## Patch chain (cumulative — apply only the latest)

1. `neobank-dataflow-mapping.patch` (234 files) — frontend↔backend mapping + probes
2. `neobank-uiux-skin.patch` (244) — Phase 1
3. `neobank-uiux-phase2.patch` (268) — Phase 2
4. `neobank-uiux-phase34.patch` (271) — Phases 3–4
5. `neobank-uiux-phase5-segments.patch` — Phases 5–7 + segmentation engine

Each is a superset of the previous and verified with
`git apply --check --binary` on a clean clone of base commit `aecc95f`.

## Known follow-ups (not blocking)

- Segment rule engine: live — `segment_service.evaluate_and_enroll` runs
  on auth-validate and app-store reads. KYC completion happens in the Go
  service, so call `POST /app-store/evaluate` from the KYC success screen
  for immediate enrollment.
- App-store analytics: track enroll/launch events per segment.
- Tenant Brand Pack publish currently writes to localStorage; promote to a
  server-side tenant config endpoint when multi-tenant admin ships.

## Platform expansion (post-Phase-7)

| Capability | Backend | Frontend |
|---|---|---|
| Developer platform & vetting | `developer_router.py` — register, draft→submit→approve/reject, API keys (sha256, shown once), scopes, publish-to-store, HMAC webhooks, `verify_api_key`/`require_scope` deps | web `/developers` portal |
| Settlement engine | `settlement_router.py` — batches, entries, netting, settle (marks entries reconciled); complements existing reconciliation service | admin API |
| Mortgages w/ payment plans | `mortgage_router.py` — products, EMI amortization quote, apply, admin approve → full schedule, pay installments | mobile `/mortgages` |
| NGX stock investing | `ngx_router.py` — 10 seeded NGX listings, deterministic daily quotes, buy/sell with fees, portfolio valuation | mobile `/investments` (store tile) |
| Stablecoins (USDT/USDC) | `stablecoin_router.py` — custodial wallets, NGN ramp in/out w/ daily rate, sends, history | mobile `/crypto` (store tile) |
| Innovations | `innovation_router.py` — round-ups, subscription radar, salary sorter, money copilot, safe-to-spend | store tiles `/innovations` |
| Tenant themes server-side | `theme_router.py` (`tenant_themes` table) — publish/fetch brand packs | Tenant Branding page |
| Segment analytics | `POST /app-store/track`, `GET /admin/segments-analytics` (`segment_events` table) | admin console |

Migration: `007_platform_expansion` (16 tables). All routers mounted at
`/api/v1` + `/api` following existing conventions.

## Middleware & infrastructure integration

All money-moving features post double-entry transfers to **TigerBeetle**
and emit domain events onto the **event bus** (RabbitMQ in production,
in-memory in dev) via `app/services/platform_integration.py`:

| Feature | Ledger posting | Event emitted |
|---|---|---|
| NGX order (buy/sell) | user ↔ broker_clearing (Ledger.NGX_BROKERAGE), fee → revenue | `NgxOrderExecuted` |
| Stablecoin ramp in/out | user ↔ stablecoin_reserve (Ledger.STABLECOIN) | `StablecoinRampIn/Out`, `StablecoinSent` |
| Mortgage approve | mortgage_pool → user disbursement (Ledger.MORTGAGE) | `MortgageActivated` |
| Mortgage installment | user → mortgage_pool, interest → revenue | `MortgageInstallmentPaid` |
| Settlement settle | net position ↔ settlement_clearing (Ledger.PLATFORM_SETTLEMENT) | `SettlementBatchSettled` |
| Developer publish | — | `DeveloperAppPublished` |
| Segment enroll | — | `SegmentEnrolled` |

New TB ledgers: NGX_BROKERAGE=40, STABLECOIN=41, MORTGAGE=42,
PLATFORM_SETTLEMENT=43; new account codes (BROKER_CLEARING,
STABLECOIN_RESERVE, MORTGAGE_POOL, SETTLEMENT_CLEARING) and transfer codes
(80–87). System accounts are deterministic u128 mappings, auto-created on
first use.

Graceful degradation: when TigerBeetle is down or `TIGERBEETLE_DISABLED`,
postings return {"posted": false, "reason": ...} and never fail the
business operation — Postgres remains the record and the reconciliation
engine catches drift. The event bus import of aio_pika is now guarded, so
the in-memory bus works without the RabbitMQ driver installed.

Reconciliation (existing `reconciliation_service`) already checks
TigerBeetle↔PostgreSQL consistency; settlement batches sit on top and
their entries are marked reconciled on settle.

## Full middleware stack integration

| Component | Role | Integration |
|---|---|---|
| **Kafka** | Event backbone (primary) | `KafkaEventBus` in event_bus_service — auto-selected when `KAFKA_BROKERS` set; all domain events (`NgxOrderExecuted`, `MortgageActivated`, `SettlementBatchSettled`, `SegmentEnrolled`, `DeveloperAppPublished`…) publish to `neobank.{aggregate}` topics |
| **Fluvio** | Edge/mobile stream ingestion | `fluvio_client.py` producer — offline transactions stream to `offline-tx-events` (durable acks) from the connectivity queue; telemetry/USSD topics per tuning doc |
| **Temporal** | Durable workflows | `middleware_adapters.TemporalAdapter` — `MortgageApprovalWorkflow` on apply, `SettlementBatchWorkflow` on settle, `DeveloperVettingWorkflow` SLA on submit |
| **TigerBeetle** | Double-entry ledger | `platform_integration.py` — all money movement posts transfers (NGX/stablecoin/mortgage/settlement ledgers 40–43) |
| **Dapr** | Service mesh | `DaprAdapter` — invoke Go/Rust services, pub/sub via Kafka-backed component, state store |
| **Keycloak** | Federated authN | `KeycloakAdapter` — JWKS token validation (optional path; native JWT remains default) |
| **Permify** | Fine-grained authZ | existing `permify_service` — wired into developer-app review decisions |
| **OpenSearch** | Search/analytics | `OpenSearchAdapter` — segment events indexed monthly |
| **Apache Sedona + GeoLibre** | Geospatial | `GeoAdapter` — nearby agents/branches; Sedona geo-SQL segment heatmaps in lakehouse |
| **APISIX + OpenAppSec** | Gateway + WAF | `deployment/apisix/routes.yaml` — all new APIs routed with JWT + rate limits; OpenAppSec inspects at the gateway |
| **Mojaloop** | Interoperability rails | existing DFSP service + MOJALOOP ledgers in TigerBeetle |
| **Postgres** | System of record | migrations 001–007 |
| **Redis** | Cache/session | existing client |
| **Lakehouse** | Analytics sink | `ingest_segment_event` added; existing ingestors for trades/fraud/loans/etc. |
| **RabbitMQ** | *legacy fallback only* | auto-selected only when Kafka isn't configured |

Observability: `GET /admin/middleware/status` reports live status of every
component. All adapters degrade gracefully — an unavailable component never
fails a business operation (Postgres stays the record; recon catches drift).

Go/Rust services consume the same Kafka topics and are invoked through
Dapr: `ledger-gateway-go` (settlement), `transaction-processor-rs` (core
processing), `analytics-go` (segment/ML), `investments-go` (NGX).

## On-Par-and-Supersede release (motion + breadth)

### Micro-motion system (mobile-pwa/src/components/ui/nb/motion.jsx)
- SPRING presets: snappy (500/35), gentle (260/26), bouncy (400/22) — all spring physics, no linear tweens
- Primitives: MotionPage, Pressable (tap scale + haptic), Stagger/StaggerItem (50ms stagger), SheetMotion (spring entrance + drag-to-dismiss), SuccessCheck (animated SVG draw), useHaptics (navigator.vibrate patterns)
- Every animation honors prefers-reduced-motion
- Wired into: NBSheet (drag handle + dismiss), Transfers (animated success), AppStore (staggered cards, pressable tiles), Mortgages (pressable product cards)

### Breadth — 54 product tiles, all deep-linking to REAL routes
- New surfaces: Savings (vaults/fixed/Ajo-Esusu, savings-go), Rewards (points/tiers/referrals, rewards-go), BNPL (eligibility/split/schedule, bnpl-go), Escrow (protected deals, escrow-go + TigerBeetle holding), Innovations "Smart Money" (round-ups, subscription radar, salary sorter, money copilot, safe-to-spend — /innovations?app=<key>)
- Routes registered: /savings /rewards /bnpl /escrow /innovations + Sidebar entries
- Catalog route audit: /bill-payments→/bills, /payments→/bills, /investments/ngx→/investments/stocks, /fx→/transfers?mode=international, /crypto/stablecoins→/investments/crypto — zero 404 deep-links remain
- Microcopy pass on all new surfaces (plain-language, locally fluent tone)

## Identity & KYC hardening release

### Liveness & anti-deepfake (backend/app/services/idv/liveness.py)
- Challenge-response: server-signed random 3-action sequence (HMAC-SHA256, session-bound nonce, 120s TTL) — kills pre-recorded/deepfake replay
- Injection forensics (self-hosted, graceful degradation): static-image replay, inter-frame motion, Laplacian blur/screen-recapture, resolution sanity, missing camera EXIF
- Passive liveness score via pluggable face API as additive signal (never sole gate)
- Aggregation: PASS / REVIEW / FAIL with reason codes; hard fails auto-decline, borderline routes to analyst
- IDV pipeline gate: sessions now require selfie + liveness + face match (selfie vs document, threshold 0.80) before clean IN_REVIEW; fail -> auto-DECLINED + webhook
- New endpoints: POST /idv/sessions/{id}/liveness/challenge, /liveness/verify; submit accepts selfie_image

### Event-driven KYC triggers (backend/app/services/kyc_trigger_service.py)
- 13 rules across 4 families: CBN-tier thresholds (single ₦50k/daily ₦50k tier1, ₦500k/₦200k tier2, ₦5m monthly EDD), velocity burst, first international transfer, device-change high-value, product onboarding (NGX/stablecoin/mortgage = tier3, BNPL/loan = tier2), sanctions/PEP (enhanced), fraud/chargeback, dormant reactivation, document expiry
- check_gate() hard-blocks regulated product actions (403 + kyc_required payload), advisory for threshold/velocity
- Wired into: transfers, NGX orders, stablecoin ramps, mortgage apply; auto-satisfy on /auth/validate
- KycTriggerEvent persisted (dedupe open per user+key), Kafka events, user notifications
- Endpoints: GET /kyc/triggers/catalog, /kyc/triggers/my, /kyc/admin/triggers
- Migration 008; 13 unit tests passing

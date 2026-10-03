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

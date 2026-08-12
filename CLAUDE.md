# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server for Google Play Console. Exposes 62 tools that let Claude fully manage Android apps via Google Play Developer API — listings, releases, reviews, reports, screenshots, bundles, in-app products, subscriptions, purchases, orders, recovery, testers, and more.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Run with tsx (no compilation needed)
npm start              # Run compiled dist/index.js
npm test               # Run all tests (vitest)
npm run test:watch     # Watch mode
npx vitest run src/__tests__/tools-tracks.test.ts   # Run a single test file
```

## Architecture

```
src/
├── index.ts          # MCP server setup, tool registration, error help mapping
├── client.ts         # HTTP client (gpcGet/Post/Put/Patch/Delete/Upload) with auth, retry, timeouts
├── auth.ts           # Google OAuth2 JWT token management with caching
├── constants.ts      # Locales, tracks, image types, timeouts, API base URL
└── tools/            # Each file exports functions called by index.ts tool handlers
    ├── listings.ts   # App info, store listings, delete listing, update app details
    ├── tracks.ts     # Tracks, releases, rollout, halt, promote
    ├── reviews.ts    # User reviews and replies
    ├── images.ts     # Screenshots: list, upload, delete, deleteAll
    ├── bundles.ts    # Bundle upload, combined AAB upload+release, mapping files
    ├── reports.ts    # Acquisition and crash reports
    ├── products.ts   # One-time products CRUD (monetization.onetimeproducts — see §Known migrations)
    ├── subscriptions.ts # Subscription CRUD
    ├── offers.ts     # Base plan management, subscription offers
    ├── purchases.ts  # Purchase verification, subscription purchase management, voided purchases
    ├── orders.ts     # Order refunds
    ├── recovery.ts   # App recovery actions (emergency response)
    ├── testers.ts    # Tester management per track
    ├── pricing.ts    # Region price conversion
    ├── countries.ts  # Country availability per track
    ├── sharing.ts    # Internal app sharing (bypass edit workflow)
    └── apks.ts       # Generated APKs and legacy APK listing
```

**Key pattern — Edit/Commit cycle**: Mutation operations on editable resources (listings, tracks, images, testers, countries) follow Google Play's edit-based model: create edit → modify resource → commit edit. Non-edit resources (products, subscriptions, purchases, orders) use direct API calls.

**HTTP client** (`client.ts`): Wraps fetch with Bearer auth injection, tiered timeouts (30s default, 120s uploads, 600s bundles), rate-limit retry (single retry after 2s on 429), and `GPCClientError` with status-based help messages.

**Auth** (`auth.ts`): JWT tokens from service account JSON are cached and regenerated 60s before expiry.

## Testing

- Framework: Vitest with 30s timeout per test
- Tests in `src/__tests__/tools-*.test.ts` mock `global.fetch` with call counters to verify multi-step API flows (edit creation → API call → commit)
- `vi.resetModules()` in beforeEach for isolation; `GOOGLE_PLAY_PACKAGE_NAME` set per test

## Environment Variables

- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — path to service account JSON file
- `GOOGLE_PLAY_PACKAGE_NAME` — Android package name (e.g. `com.example.app`)

## Conventions

- All tool responses are formatted as markdown
- Field length validations: title 30 chars, description 4000, short description 80, release notes 500, review reply 350
- Constants module is the single source of truth for supported locales (7), tracks (4), and image types (8)
- Price values use micros format (1,000,000 = $1.00)
- ISO 8601 durations for billing periods (P1M = monthly, P1Y = yearly)

## Known migrations (read before touching a tool that suddenly 403s)

Google periodically sunsets Play Developer API resources. When a tool that
used to work starts failing with a 403 whose message says "Please migrate to
the new publishing API" (or similar), **do not** assume it's a Play Console
permission problem — check the service account's role in Play Console first
(Setup → API access), but if it already has Admin/Release manager (it does,
for this project's `play-store-mcp@vip-chat-dc3b3.iam.gserviceaccount.com`
service account — verified 2026-08-12), the real cause is almost always that
this repo's code is still calling a **deprecated REST resource**, not a
permission gap. Fix it here, in this repo, then commit+push — don't chase it
in Play Console.

### 2026-08-12 — `inappproducts` → `monetization.onetimeproducts`

Google sunset the legacy `inappproducts` resource (used by `products.ts` for
one-time/managed in-app products) in favor of `monetization.onetimeproducts`.
This was NOT a simple path rename — the data model changed substantially:

| Legacy (`inappproducts`) | New (`monetization.onetimeproducts`) |
|---|---|
| `sku` | `productId` |
| `status: 'active'/'inactive'` | `purchaseOptions[].state: 'DRAFT'\|'ACTIVE'\|'INACTIVE'\|'INACTIVE_PUBLISHED'` |
| `listings: { [lang]: {title, description} }` (map) | `listings: [{languageCode, title, description}]` (array) |
| `defaultPrice: {priceMicros, currency}` (one global price) | `purchaseOptions[].regionalPricingAndAvailabilityConfigs[]` — price is **per-region**, there is no single global price |
| `purchaseType: 'managedUser'\|'subscription'` | subscriptions were already split into their own `subscriptions.ts` (different, non-deprecated API); `purchaseOptions[].buyOption.multiQuantityEnabled` now distinguishes consumable (`true`) vs non-consumable (`false`) |
| `POST` to create, `PUT` to update | **`PATCH` for both** — create is `PATCH .../onetimeproducts/{productId}?allowMissing=true&updateMask=...&regionsVersion.version=2022/02`; update uses the same PATCH with only the changed top-level fields in `updateMask` (e.g. `listings` or `purchaseOptions` or both, comma-joined) |
| — | `regionsVersion.version` is a **required** query param on every write (constants.ts `REGIONS_VERSION`); Google only bumps this when the supported-region set changes substantially, so it's safe to hardcode and rarely needs updating |

`client.ts`'s `gpcPatch`/`gpcDelete` gained an optional `params` argument
(query string, same pattern as `gpcGet`) specifically to support
`updateMask`/`allowMissing`/`regionsVersion.version` — reuse that pattern
for any other resource that turns out to need query params on a mutation.

`createProduct`/`updateProduct` only set price for ONE region per call
(the API is fundamentally per-region now, unlike the old single global
price) — callers must call `gpc_update_product` again with a different
`regionCode` to add pricing elsewhere. `newRegionsConfig` (Google's
"default price for regions I haven't configured yet" field, which only
accepts USD/EUR reference prices) was deliberately NOT implemented — out
of scope, would need currency-conversion logic this server has no business
doing.

Source: official Google Play Developer API docs — see git log for this
change (commit message links the exact reference pages used). If a similar
403 shows up for another resource (`subscriptions`, `purchases`, `orders`),
apply the same diagnostic: read the error message literally, check Play
Console permissions ONCE to rule it out, then assume deprecated-endpoint
and go find that resource's current REST reference page.

### Round 2 (same day) — AI-summarized docs got the path wrong; use the discovery JSON

The first pass at this migration (above) used Claude's `WebFetch` tool to
summarize Google's human-readable REST reference pages. That summary was
**wrong on two points**, both only caught by testing against the live API:

1. **Wrong path.** The summarized docs said the path had a `monetization/`
   segment (`applications/{pkg}/monetization/onetimeproducts`). The real
   path has **no such segment** — `applications/{pkg}/oneTimeProducts`.
   Confirmed by curling the endpoint directly: even with a garbage auth
   token, the wrong path 404'd (Google's generic HTML 404 page) before auth
   was ever checked — proof the URL itself was wrong, not a permissions
   thing. And the casing isn't even consistent across methods: `list` /
   `get` / `delete` / `batchGet` / `batchUpdate` use `oneTimeProducts`
   (camelCase), but `patch` specifically uses `onetimeproducts` (all
   lowercase). This inconsistency is real, verified against Google's own
   data, not a typo to "fix."
2. **`state` looked writable, isn't.** The summarized docs didn't flag it
   as read-only. Google's schema (`OneTimeProductPurchaseOption.state`) has
   `"readOnly": true` — sending it in a PATCH body is silently ignored (or
   worse). Activating a newly-created purchase option requires the
   dedicated `purchaseOptions:batchUpdateStates` endpoint (see
   `activatePurchaseOption`/`deactivatePurchaseOption` in `products.ts`).

**Root cause of both: relying on an LLM's markdown summary of an HTML docs
page for exact-match details (path casing, readOnly flags) that summarizer
has no strong incentive to preserve precisely.** The actual fix: fetch
Google's **discovery document** instead — it's the machine-generated,
authoritative source those human-readable pages are rendered from, and it
resolved both issues in minutes once used:

```bash
curl -s "https://androidpublisher.googleapis.com/\$discovery/rest?version=v3" -o /tmp/androidpublisher_discovery.json
python3 -c "
import json
d = json.load(open('/tmp/androidpublisher_discovery.json'))
otp = d['resources']['monetization']['resources']['onetimeproducts']
print(otp['methods']['list']['path'])   # exact path per method
print(json.dumps(d['schemas']['OneTimeProductPurchaseOption'], indent=2))  # readOnly flags, exact field names
"
```

**Lesson for any future Google Play Developer API work in this repo:** for
anything more specific than "does this resource exist" — exact path
casing, which fields are read-only, exact enum values — go straight to the
discovery JSON above. Don't trust a summarized fetch of the human docs for
those details; verify against a real (even unauthenticated) request before
declaring a fix done, the way this round did.

A third bug was caught in the same live test but is unrelated to paths:
Google's `Money` type is proto3, which **omits fields at their zero value**
from JSON output entirely — a $0.99 price (`units` = 0) comes back with no
`units` key at all, not `units: "0"`. `formatPrice()` in `products.ts` was
doing `parseInt(price.units, 10)` unconditionally, so it silently printed
`NaN USD` for any product whose price has a zero whole-dollar part. Fixed
by defaulting both `units` and `nanos` to 0 when absent — general lesson:
never trust a proto3-JSON-backed API to always send a field just because
its type says it's not optional in your local interface.

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
    ├── products.ts   # In-app products CRUD
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

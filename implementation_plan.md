# Implementation Plan

## [Overview]
Transform GOOBER into a live, production-ready dual-currency (`NGN` / `USD`) digital marketplace powered by live **P-AI** (`p-ai.world`, 197 products) and **Graml Social** (`gramlsocial.com`, 100 products) catalogs, verbatim supplier descriptions, an exact **15% markup**, **direct Paystack checkout** + **wallet balance checkout**, storefront category sections (**AI Tools**, **Social Media Accounts**, **Design & Video**, **VPN & Privacy**, **Productivity**, **Streaming**, **Education**, **Music & Audio**), Cloudflare tunnel webhook support (`https://nascar-lending-encounter-ink.trycloudflare.com`), and an offline-capable PostgreSQL + JSON snapshot catalog cache.

## [Types]
- `SupplierProduct` (`packages/providers/src/types.ts`): adds `description?: string` and `category?: string`.
- `DirectCheckoutInput` & `DirectCheckoutDto` (`packages/contracts/src/index.ts`): supports one-click `paystack` or `wallet` checkout in `NGN` or `USD` without requiring a manual two-step quote UI.

## [Files]
- **New**:
  - `implementation_plan.md`
  - `scripts/sync-live-catalog.ts` (`pnpm catalog:sync`)
  - `packages/db/src/live-catalog-snapshot.json`
  - `apps/web/app/checkout/verify/page.tsx`
- **Modified**:
  - `packages/providers/src/types.ts`, `pai.ts`, `graml.ts`, `paystack.ts`
  - `packages/contracts/src/index.ts`
  - `packages/commerce/src/catalog-sync.ts`, `index.ts`, `paystack-funding.ts`
  - `packages/db/src/seed.ts`
  - `apps/api/src/env.ts`, `main.ts`, `auth.guard.ts`, `commerce.controller.ts`, `webhooks.ts`
  - `apps/web/app/layout.tsx`, `page.tsx`, `components/catalog.tsx`, `product-detail.tsx`, `cart.tsx`, `wallet.tsx`

## [Functions]
- `parsePaiCatalog(body: unknown, categoryMap?: Record<string, string>): CatalogResult` (`packages/providers/src/pai.ts`)
- `parseGramlCatalog(body: unknown): CatalogResult` (`packages/providers/src/graml.ts`)
- `syncSupplierCatalog(provider: Supplier, catalog: CatalogResult, options?: { autoPublish?: boolean; providerMode?: string }): Promise<CatalogSyncResult>` (`packages/commerce/src/catalog-sync.ts`)
- `checkoutDirect(ownerId: string, input: DirectCheckoutInput, idempotencyKey: string): Promise<DirectCheckoutDto>` (`packages/commerce/src/index.ts`)

## [Classes]
- `PaiAdapter`, `GramlAdapter`, `PaystackAdapter` (`packages/providers/src/*`)

## [Dependencies]
- None added; uses existing locked workspace dependencies.

## [Testing]
- Offline snapshot seeding in `packages/db/src/seed.ts` + live sync via `pnpm catalog:sync`.
- Full verification via `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, and PostgreSQL integration tests.

## [Implementation Order]
1. Save `implementation_plan.md`.
2. Update `packages/providers` (`types.ts`, `pai.ts`, `graml.ts`, `paystack.ts`) for verbatim descriptions, categories, and live/test key support.
3. Create and run `scripts/sync-live-catalog.ts` (`pnpm catalog:sync`) to pull all 197 P-AI + 100 Graml products into `packages/db/src/live-catalog-snapshot.json` and PostgreSQL with 15% markup.
4. Implement one-click Paystack & Balance checkout (`checkoutDirect`), inline webhook/order fulfillment, and Cloudflare tunnel origin support (`https://nascar-lending-encounter-ink.trycloudflare.com`).
5. Update Next.js storefront (`layout.tsx`, `page.tsx`, `catalog.tsx`, `product-detail.tsx`, `cart.tsx`, `wallet.tsx`, `/checkout/verify`) to remove all test/quote indicators and showcase the category sections and verbatim descriptions.
6. Run `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, integration tests, and `pnpm graphify:update`.

# Implementation Plan

## [Overview]
Deliver a fully automated, hack-proof Paystack-to-Supplier fulfillment pipeline with an insufficient-balance auto-queue workaround, permanent multi-view `.txt` credential documents and clickable P-AI links in customer orders, a functional Help & Support system with direct Telegram (`@raymondstudi0`) integration and Admin ticket management, reusable GOOBER-branded vector product logos (`ProductBrandArt`) for every brand, and a tactile Apple-grade minimalist storefront redesign with zero AI slop.

## [Types]
- `VerifyPaystackOptions` (`packages/commerce/src/paystack-funding.ts`): adds `expectedOwnerId?: string`.
- `SupportStatusInput` (`packages/contracts/src/index.ts`): `{ status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED', operationId: string }`.
- `BrandVisualSpec` (`apps/web/components/product-brand-art.tsx`): brand key, label, GOOBER corner stamp, and bespoke solid palette.

## [Files]
- **New**:
  - `apps/web/components/product-brand-art.tsx`
- **Modified**:
  - `packages/contracts/src/index.ts`
  - `packages/commerce/src/paystack-funding.ts`, `packages/commerce/src/index.ts`
  - `apps/api/src/main.ts`, `apps/api/src/commerce.controller.ts`, `apps/api/src/webhooks.ts`, `apps/api/src/presentation.ts`
  - `apps/worker/src/processor.ts`, `apps/worker/src/fixture-store.ts`
  - `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/globals.css`
  - `apps/web/components/catalog.tsx`, `apps/web/components/product-detail.tsx`, `apps/web/components/cart.tsx`, `apps/web/components/order-detail.tsx`, `apps/web/components/support.tsx`, `apps/web/components/operations.tsx`

## [Functions]
- `assertSafeCallbackUrl(rawUrl: string | undefined, requireLocalAllowlist?: boolean): string | undefined` (`packages/commerce/src/paystack-funding.ts`)
- `fulfillOrderInline(orderId: string | null | undefined): Promise<void>` (`apps/api/src/commerce.controller.ts`)
- `resolveProductBrand(name: string, category: string, provider: string): BrandVisualSpec` (`apps/web/components/product-brand-art.tsx`)
- `ProductBrandArt({ name, category, provider, variant }): JSX.Element` (`apps/web/components/product-brand-art.tsx`)

## [Classes]
- `CommerceController` (`apps/api/src/commerce.controller.ts`)

## [Dependencies]
- None added; 100% native SVG, CSS spring physics, and existing workspace packages.

## [Testing]
- Unit tests (`pnpm test:unit`), PostgreSQL integration tests (`tests/integration/commerce.test.ts`), `pnpm lint`, `pnpm typecheck`, and `pnpm graphify:update`.

## [Implementation Order]
1. Save `implementation_plan.md`.
2. Implement backend security hardening (`SEC-01` through `SEC-05`), inline automated fulfillment, and admin support status management.
3. Upgrade `apps/web/components/order-detail.tsx` and `apps/worker/src/fixture-store.ts` for permanent multi-visit `.txt` credential docs and clickable P-AI links.
4. Upgrade `apps/web/components/support.tsx`, `apps/web/components/operations.tsx`, and `apps/web/app/layout.tsx` with direct Telegram (`@raymondstudi0`) contact and Admin support ticket controls.
5. Create `apps/web/components/product-brand-art.tsx` and redesign `page.tsx`, `catalog.tsx`, `product-detail.tsx`, `cart.tsx`, and `globals.css` with Apple/Swiss tactile editorial craft and spring motion.
6. Run `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, integration tests, and `pnpm graphify:update`.


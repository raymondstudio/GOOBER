# M1 API contract v1

All business paths are /api/v1 through same-origin web proxy. Raw callbacks bypass cookie authority, use provider-specific raw signatures. JSON errors: {error:{code,message}}. JSON request bodies reject unknown fields. Customer amounts decimal minor-unit strings, all customer currency NGN. No delivery/wholesale secrets in ordinary responses. All authenticated responses no-store.

| Method/path | Input/output |
|---|---|
| GET /products, /products/:id | ProductDto[] / ProductDto published approved only |
| GET /me | MeDto current DB session/role |
| GET /wallet | WalletDto |
| GET /wallet/transactions?cursor=...&limit=... | Page<TransactionDto>, max100 |
| POST /quotes | quoteInput -> QuoteDto |
| POST /orders | orderInput + Idempotency-Key (UUID) -> OrderDto; owner/op/env/body scoped |
| GET /orders, /orders/:id | Page<OrderDto> / OrderDto owner |
| POST /orders/:id/delivery/reveal | {} -> DeliveryDto; fresh session <15min, rate limit + audit |
| POST /funding/intents | fundingInput -> FundingDto |
| POST /funding/intents/:id/simulate | {} -> durable signed fixture intake; local/test fixture only, owner |
| POST /webhooks/fixture | raw HMAC-SHA256 body; durable inbox accepted before2xx |
| POST /webhooks/pai | raw sha256=<hex>; authenticated payload identity, encrypted durable inbox |
| POST /webhooks/paystack | raw SHA512 x-paystack-signature with separate test secret; verified input quarantined, no fixture wallet credit |
| GET/POST /support/requests | Page<SupportDto> / supportInput -> SupportDto; owner |
| GET /admin/overview | {orders:OrderDto[],products:ProductDto[],support:SupportDto[],audits:[],providerBalances:[]} current admin only bounded |
| POST /admin/products/:id/approval | approvalInput -> ProductDto; version/audit/op ID |
| POST /admin/orders/:id/resolve | reviewInput -> OrderDto; conclusive fixture evidence; no retry purchase |
| GET /health/live, /health/ready | no secrets; distinct app/service status |

Better Auth /api/auth/* uses maintained client methods signUp.email/signIn.email/signOut/getSession. User role never accepted from registration. Revocation/current roles read from DB; no cookie cache. Origin must equal configured normalized origin for all cookie writes; no arbitrary identity headers. Local HTTP secure cookie intentional; deployed HTTPS required before live. Fixtures cannot target live data. Shared DTOs in packages/contracts/src/index.ts.

Machine-readable OpenAPI3.1: [openapi.json](openapi.json). It documents26implemented auth/business/health/callback operations, current cookie/role/CSRF rules, string-money schemas, operation identities and fixture/external boundaries. Better Auth owns its response envelope.

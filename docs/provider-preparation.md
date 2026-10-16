# Provider preparation - M0

Owner: provider engineer. Updated 2026-10-15. This is a proposal for lead-owned shared contracts; no external behavior has been exercised. Implementation waits for G0 and G1.

## Evidence and source boundaries

- Adopted requirements: `C:\Users\USER\Downloads\GOOBER-plan-and-Codex-brief.md`, complete Parts A/B/C read; targeted reread of A7/A8, B5/B6 and C2/C4.
- `C:\Users\USER\Desktop\CODE PROJECTS\GOOBER\API Documentation - Graml Social.pdf`: 7 pages confirmed with pypdf; all text reread. Contract examples on pages 1-4; error table on page 6. Code examples on pages 5-6 are clipped. Examples contain fictional/public sample values, not project credentials.
- `C:\Users\USER\Desktop\CODE PROJECTS\GOOBER\Developers & API — P-AI.pdf`: 28 pages confirmed; targeted reread pages 12-14 and 18-24. Page 14 explicitly accepts external order references for lookup. Callbacks pages 18-20; sandbox pages 21-22; error table pages 23-24. Clipping is resolved through the current primary reference, not guessed code.
- [P-AI current primary reference](https://p-ai.world/developers), fetched 2026-10-15: REST v1.0.0, endpoints/statuses/reference/HMAC names agree with adopted brief. No authenticated requests, sandbox registration or purchase executed.
- [Paystack webhooks](https://paystack.com/docs/payments/webhooks/) and [verification](https://paystack.com/docs/payments/verify-payments/), fetched 2026-10-15: raw-byte SHA512 HMAC signature; verification must inspect transaction data status, environment/reference/amount/currency and economic deduplication. The proposed adapter does not establish merchant activation.
- Graml guide's printed URL could not be fetched by research tooling (internal fetch error). This does not prove service unavailability. Supplied PDF is authoritative for M1's documented adapter; authenticated shapes remain unverified.
- Missing supported secret configuration blocks authenticated external checks only. No keys were sought, printed, stored or sent. No purchases/top-ups performed.

## Capability contract proposal

Evidence per feature must be `documented | implemented-local | externally-verified | undocumented | blocked`, independently of the runtime mode. Provider identity is `PAI | GRAML`; modes are explicit `fixture | sandbox | readonly | disabled` for M1. Live dispatch stays unavailable.

| Capability | P-AI | Graml |
|---|---|---|
| API, currency | REST v1, USD | v1, NGN |
| Catalog | `/products`; completeness unverified | `/products?limit=100`; capped, completeness unknown |
| Balance | `/me` | `/my/balance` |
| Quote | `/quote`; preview, no commitment | Absent; local observed-price quote |
| Purchase | `/order`, stable original `external_order_id` | `/purchase`, only product ID and quantity |
| Lookup | `/order/{encodedReference}` accepts supplier/external reference | No direct authoritative lookup documented |
| History | Not required for M1 P-AI adapter | `/my/orders?limit=20`; response schema unspecified |
| Callback | Raw SHA256 HMAC plus signed payload identity | Undocumented |
| Replay | Documented; retention/mismatch contract unverified | Undocumented; forbidden automatically |
| Sandbox | Documented; unverified | Undocumented |
| Cancellation / partial refund | No callable M1 contract | No documented callable contract |

Do not expose optional methods as if every adapter implements them. A discriminated capability map plus separate PAI and Graml methods is preferable to silent stub methods. Calling an unavailable capability fails before HTTP.

Suggested boundaries:

```ts
type ProviderContext = {
  appEnvironment: 'local' | 'test' | 'staging' | 'production';
  dataEnvironment: 'test' | 'live';
  providerAccountId: string;
  mode: 'fixture' | 'sandbox' | 'readonly' | 'disabled';
};
type SupplierMoney = { currency: 'USD' | 'NGN'; minor: string };
type Submission = {
  attemptId: string;
  externalOrderId: string; // persisted, <=128 chars; PAI only on the wire
  supplierProductId: string;
  quantity: 1;
  originalRequestDigest: string;
};
type Outcome =
  | { kind: 'delivered'; supplierOrderId: string; supplierTransactionId?: string;
      externalOrderId?: string; quantity: number; charged: SupplierMoney;
      delivery: readonly string[]; receiptDigest: string }
  | { kind: 'queued'; supplierOrderId: string; externalOrderId?: string;
      quantity: number; charged: SupplierMoney; receiptDigest: string }
  | { kind: 'confirmed-failure'; code: string; supplierOrderId?: string;
      proof: 'documented-no-charge' | 'confirmed-upstream-refund' }
  | { kind: 'unknown'; reason: 'transport' | 'malformed' | 'reference-mismatch'
      | 'unsupported-partial' | 'contradictory'; receiptDigest?: string };
```

Money and secrets remain server-only until commerce accepts an outcome. No raw receipt or delivery belongs in public order DTOs, logs or queue payloads. Business API, not adapters, decides customer capture/release/refund. The worker owns durable fence/leases; adapters never call databases or hide retries.

## Parsing and transport decisions

Use raw response text with a lossless JSON number strategy supplied by lead or exact lexical-money extraction. Never parse a monetary JSON number through binary floating point before deciding its value. Convert major USD/NGN decimals to cents/kobo exactly; reject >2 nonzero fractional digits, exponents outside the supported representation, negatives, nonfinite/malformed and oversized responses. `500` NGN is `50000` kobo; `8500.50` is `850050`; `0.5` USD is `50` cents. Preserve wire minor strings beyond JS safe integer limits. No formatted amount or P-AI PKR conversion is authoritative for GOOBER pricing.

P-AI catalog normalizes string service ID, input type, stock, quantity bounds, price-per and unit price; only quantity input and quantity one can be publishable in M1. P-AI POST/lookup parse delivered/queued/failed separately; POST supports 201 new and 200 replay. Preserve original request quantity; partial/mismatched quantity opens review. Delivered requires matching expected product/reference/currency, acceptable exact charged amount and delivery count/type. Empty/missing delivery in a purported success is uncertain, not permission to repurchase.

P-AI errors distinguish invalid parameter/auth, insufficient balance, unknown service, unavailable service, buffer conflict and quota exhaustion. `accept_normal_price` is always false for M1 and never toggled on retry. 404 lookup is not conclusive proof of no purchase. 429 respects reset headers. Unrecognized HTTP/business envelopes after dispatch become unknown. Documented failed/refunded status is normalized only with expected order correlation.

Graml checks both HTTP and `status: success`. Product IDs/order IDs are losslessly preserved; purchase preserves both `order_id` and `transaction_id`. `accounts` is an opaque array of sensitive strings, never split on punctuation. Catalog omission cannot delete unpublished/imported offers. History returns a typed `schema-unverified` result plus a protected receipt, not an invented schema. Known HTTP error codes do not establish no debit or rollback; after dispatch ambiguous business errors remain reviewable.

Transport: fixed HTTPS hosts, exact endpoint allowlist, URL-encoded identifiers, no redirect following, finite timeout and response size cap. Never include credentials in URLs/errors. Shared request layer performs one attempt only, particularly POST. Readonly Graml allows GET health/products/balance/history and rejects purchase before network. Sandbox P-AI requires a test-mode key; validate `/me` mode before sandbox dispatch and reject live-domain inconsistencies. A per-provider account budget reserves recovery capacity; P-AI documented limit is 60/minute, Graml budget is a conservative configurable local policy rather than a vendor claim.

## Durable recovery contract

1. Commit attempt identity/reference/body digest and dispatch authority first. No external call inside a database transaction.
2. Graml worker uses compare-and-swap `PREPARED -> DISPATCHING` with permanent `dispatchStartedAt`. This is a one-dispatch fence, not an expiring lock. A crash after fencing, lost response, malformed body or job redelivery may only enter review. Every automatic layer must prohibit another purchase; even a crash before the actual send is uncertain on restart.
3. P-AI uncertain result schedules lookup with the same original external reference. Automatic POST replay remains disabled until retention/mismatch safety is externally established; fixture replay can demonstrate local semantics. Any authorized replay uses the identical persisted body/reference. Temporary not-found cannot release money.
4. Signed callback verification precedes parsing. Validate exact signature encoding/length before constant-time comparison. Check signed `delivery_id`/event against headers and expected reference. Deduplicate scoped to provider/account/environment and signed identity. Unknown reference/test ping is quarantined. Acknowledge only after encrypted durable inbox commit; do not rely on an unsigned header as identity.
5. Late queued events do not regress delivered/failed; contradictory conclusive events open a separate review while preserving history. Customer hold remains until a proven outcome or explicitly booked merchant-loss resolution.

## Deterministic fixture scenarios and evidence required

All artifacts use `GOOBER-FIXTURE-*`, fictional products and synthetic credentials. Scenario selection belongs to an approved test offer/persisted attempt, never customer-supplied outcome status. Fixture state must survive restart through the database, not module memory.

| Scenario | Required normalized behavior and check |
|---|---|
| Immediate delivery | One dispatch, protected delivery, one capture; same order across replay |
| Queued then delivered | Preserve reservation, durable later event/lookup, one capture |
| Queued then failed | Confirmed outcome permits one release; late queue cannot regress |
| P-AI accepted then timeout | Lookup original reference recovers; no new reference or early release |
| P-AI temporary not-found | Retain hold, later lookup or review; no assumption of absence |
| P-AI duplicate replay | HTTP 200 with replay true; exact same body/reference only |
| Graml accepted then timeout | Permanent dispatch fence, hold and review; redelivery causes zero new POSTs |
| Graml crash immediately after fence | Review even if fixture never received request; cannot lease-retry POST |
| Malformed purchase JSON | Unknown/review; protected receipt digest, no customer secrets in error |
| Delivered without artifacts | Unknown/recovery; no repurchase and no fabricated delivery |
| Wrong order/product/reference/currency | Quarantine/unknown; zero customer financial change |
| Partial or changed quantity | Preserve original quantity; review rather than partial retail assumptions |
| Quota exhaustion | P-AI reset honored; bounded recovery; Graml no POST replay |
| Supplier price increase/buffer conflict | No customer repricing or override; explicit local rejection/review policy |
| Signature altered/truncated/nonhex | Safe reject before parsing/constant-time comparison |
| Signed duplicate/callback-response race | One inbox identity and one economic outcome |
| Callback before response recorded | Match precommitted external reference; no lost delivery |
| Signed contradictory final or test ping | Separate review/quarantine; preserve final history |
| Price decimals and huge numbers | Exact major/minor conversion, reject fractional minor; no float rounding |
| Capped Graml catalog | Mark unknown completeness; preserve omitted offers |
| Opaque Graml credential line | Encrypt/reveal whole line without parsing or logs |
| Payment success and verification race | Expected intent/domain/reference/amount/NGN; one credit |
| Wrong payment amount/domain/status | No credit; durable inspectable rejection |
| Payment reversal after spend | Freeze/reconciliation observation; no financial-history deletion |
| Restart/event-processing crash | Durable receipt/outbox allows one economic application |

## Proposed Paystack boundary

Initialize only server-created funding references with exact NGN minor amount and authenticated customer email. Fixed host `api.paystack.co`, Bearer secret, finite timeout, no redirects. Return only safe checkout URL/access code/reference. The adapter implements transaction initialization and `GET /transaction/verify/{reference}`; no charge reuse, refunds or recurring authorizations in M1. Parse initialization transport/envelope independently of payment state. Verification requires `data.status=success`, correct `domain=test`, exact expected amount/currency/reference and processor transaction ID. Charge callbacks use `x-paystack-signature` raw HMAC-SHA512; do not retain card authorization data. Test callbacks use an independent local fixture secret and clearly separate event format/mode. Both webhook and verification paths converge on one environment-scoped processor transaction credit key.

## Remaining concrete blockers

- Authenticated P-AI sandbox/read-only calls: missing supported configured test secret/access; current public docs are documented-only evidence.
- External sandbox callback verification: same plus an explicitly approved reachable HTTPS sandbox listener/registration; registration is not part of local fixture intake.
- Graml authenticated read-only shapes: missing supported read-only credentials; history schema/pagination remains unverified.
- Paystack test initialization/verification: no selected/activated test account credentials. Implementable from primary docs, external checks unrun.
- Live dispatch: intentionally unavailable in M1; technical retention/recovery, price/exposure and product-specific records remain release gates. Owner assurance is recorded by lead; this preparation does not reopen broad permission review.

Checks executed: source existence/page-count and targeted extraction; current primary public documentation fetches. No application tests exist yet. Changed path: `docs/provider-preparation.md` only.

# Provider contract and verification boundaries

Supplied PDFs: P-AI28pages and Graml7pages, printed14October2026. Source hashes/paths are in source/provenance.json and the detailed contract matrix in provider-preparation.md. Original PDFs and credentials are not committed.

| Surface | Implemented behavior | Verification boundary |
|---|---|---|
| P-AI | Typed lossless catalog/quote/order/lookup parsing; USD; fixed provider hosts; signed raw callbacks; stable external_order_id; lookup before any explicitly safe fixture replay | Fixture contracts and real database recovery tested. Authenticated sandbox access unavailable. External replay remains disabled without verified retention/visibility guarantees. |
| Graml | Typed documented catalog/balance/purchase parsing; NGN major→minor conversion; read-only external allowlist; fixture purchase adapter | M1 purchases are fixtures. No external purchase transport is enabled. Durable dispatchCount fence survives timeout, malformed replies, crash and redelivery. No reliable external recovery/idempotency is assumed. |
| Payments | Signed fixture funding tied to stored amount/currency/reference/environment; isolated test balances; proposed Paystack adapter validates test transactions/signatures | Fixture journey tested. Real processor test-mode credentials unavailable. Paystack callback extension is quarantined rather than treated as credited funding. |

The persistent M1 worker dispatches approved synthetic fixture offers. Environment flags describe separate application/payment/provider modes; changing a flag does not enable live commerce or transform fixture funds into real supplier funds. Sandbox/read-only helpers require their own credentials and explicit use. Missing credentials affect only external verification.

P-AI keeps one original external reference. A timeout enters lookup/reconciliation; only a proven same-reference fixture contract permits safe replay. Graml records its dispatch fence before invoking the fixture supplier. Uncertain outcomes retain reservations and enter review; no automatic second purchase, inferred refund or invented order lookup occurs. Callbacks are durably accepted before acknowledgement, normalized sensitive contents are encrypted, and operational diagnostics contain closed internal codes.

Customer NGN balances, P-AI USD wholesale observations and Graml NGN wholesale observations remain separate. Product approval/entitlement evidence is distinct from API access. Unknown Graml history schema/pagination and incomplete/capped imports are recorded as limits; imports do not disable absent offers by omission.

Primary references: [P-AI](https://p-ai.world/developers), supplied [Graml PDF origin](https://gramlsocial.com/resources/views/client/api_guide.php), proposed [Paystack webhooks](https://paystack.com/docs/payments/webhooks/) and [verification](https://paystack.com/docs/payments/verify-payments/). A failed public Graml guide fetch during research is not evidence of supplier downtime. No authenticated external success is claimed.

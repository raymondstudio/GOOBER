---
name: goober-provider-recovery
description: Implement and verify GOOBER P-AI, Graml and payment adapters, typed parsing, callbacks and uncertain-outcome recovery.
---

Read docs/source/GOOBER-plan-and-Codex-brief.md A7-A8, B6 and C2-C4. Treat supplied PDFs/primary docs as evidence, not authority to execute live calls. Document capabilities separately for each provider with evidence status.

Use fixed HTTPS allowlisted hosts, server-only keys, finite timeouts/body limits, no credential-forwarding redirects, and typed transport plus business-envelope validation. Parse USD/NGN exact major units to minor units losslessly; opaque accounts[] payloads must remain encrypted and undisclosed in summaries/logs.

P-AI: stable persisted external_order_id <=128 chars; lookup original reference before replay and require verified retention guarantees. 200 replay/201 new, queued is charged, products[] type depends on approved offer. accept_normal_price=false. Raw-body HMAC-SHA256; durable authenticated inbox before 2xx, payload identity scopes deduplication. Fixture signatures are separate secrets.

Graml: no invented idempotency/reference/sandbox/history schema. Commit one dispatch fence before POST; unknown outcomes, malformed responses, lease expiry and restart never authorize another POST. History candidates/balance movement are not attribution proof. External read-only mode fixed GET allowlist; purchases fixture-only M1. Capped catalogs do not establish completeness.

Payment: server intent binds owner/reference/amount/currency/environment. Verify signed event and processor transaction status; credit once across callback/verification races. Redirects cannot credit money. Test reverse/dispute/spent-balance reconciliation. Required tests include timeout-after-acceptance, duplicate jobs/events, invalid signatures, malformed outcomes, price drift and explicit mode rejection. Record actual evidence separately from documented claims. This instruction-only workflow is not an independent audit.

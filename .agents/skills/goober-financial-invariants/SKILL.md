---
name: goober-financial-invariants
description: Implement or review GOOBER wallet, journal, quote, order and reversal transactions using PostgreSQL concurrency evidence.
---

Read docs/source/GOOBER-plan-and-Codex-brief.md A4-A5, B7, C2 before financial changes. Use exact BigInt minor amounts and decimal rate parsing; wire amounts are strings. Test fractional minor-unit rejection and amounts beyond Number.MAX_SAFE_INTEGER.

Post journals/postings atomically. Enforce balanced per-currency finalized journals with deferred DB triggers, including journal rows with no postings. Lock posting parents to prevent concurrent finalization. Reject mutations/appends/deletes of posted entries and restrict runtime role; test direct SQL, not only ORM.

Lock wallet then order in consistent order; bounded serializable transaction retries contain no HTTP. Unique quote-to-order, payment reference and economic operation constraints survive retries. Aggregate captures+releases <= reserved; refunds <= captured. Concurrent distinct operation IDs cannot bypass ceilings.

Persist order reservation and outbox in one transaction. Supplier uncertainty retains reservation and reconciles. Restore pauses dispatch. A spent funding reversal freezes spend and records an obligation without erasing history. Evidence must name command, database environment, actual result and limitations. This instruction-only workflow is derived from owner requirements, not independently audited.

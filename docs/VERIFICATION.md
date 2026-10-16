# M1 verification evidence

This matrix implements the adopted brief B7, checks 1–20. Results below distinguish real local PostgreSQL/Redis fixtures from external verification. Synthetic fixture evidence never establishes authenticated supplier or payment behavior.

## Environment and evidence labels

- **documented-only**: source contract or an intended scenario, not exercised behavior.
- **implemented-local**: exercised with isolated local PostgreSQL/Redis and synthetic fixtures.
- **externally verified**: exercised against the named authenticated sandbox/read-only service with sanitized request/result evidence.
- **unrun**: no executable evidence yet.
- **blocked**: exact prerequisite unavailable; independent local checks continue.

Preparation, 15 October 2026: quality role read root `AGENTS.md`, adopted brief B7/C2–C5, `.agents/skills/playwright/SKILL.md`, `.agents/skills/goober-financial-invariants/SKILL.md` and `.agents/skills/goober-provider-recovery/SKILL.md`. PowerShell `Get-Command npx` resolved `C:\Program Files\nodejs\npx.ps1`. Browser test files are explicitly authorized by the implementation request. No application tests ran during this preparation.

## Gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| G0 | Repository/source/skill/dependency provenance and actual role assignments | complete; lead tracker and SKILLS.md own provenance |
| G1 | Clean build, applied migrations, real same-origin authenticated web → Nest API request, raw signed callback through proxy | implemented-local; skeleton4/4 and lead production build |
| G2 | Real PostgreSQL direct constraints, concurrent economic operations, durable outbox | implemented-local; commerce13/13 |
| G3 | API/worker/database customer journey plus delivery/support/operations browser checks | implemented-local;42 core +6HTTP +6browser passed |
| G4 | Independent checks below, security findings, clean checkout and isolated restore | local checks passed except pending clean committed checkout; restore passed |
| G5 | Final branch/commit, runnable commands and honest evidence/limits | pending final commit and clean-checkout verification |

## Acceptance matrix

Executed command A: `node scripts/integration.mjs --e2e` (exit0,16October2026), final run token `76e6151adede`. Actual PostgreSQL17.11 database `goober_test_76e6151adede`, restricted runtime role, Redis-compatible Memurai4.3.2 (Redis API7.2.4) DB11/controlledDB15, optimized Next production build on3005, Nest3006 and continuous BullMQ worker. Controlled phase42/42, HTTP6/6 and browser6/6 passed. Browser Chrome155.0.8059.41 used desktop1440x1000 and Pixel7 emulation412x839. No commerce responses were mocked; support-list transport was delayed then continued to test the real async selection race. The lead completed this final run after the quality agent hit its runtime usage limit. Independent quality authored these suites and earlier ran the financial/HTTP checks; security independently reproduced the high fixes. Retained local transcript: `.local/root-final-verification.log`; per-service/build logs and restore report: `.local/verification-76e6151adede`.

| # | Required behavior / independent scenario | Actual test / reproducible command | Evidence status / result |
| --- | --- | --- | --- |
| 1 | Clean frozen checkout, migrations/seed, actionable configuration and actual boot | `scripts/verify-clean-checkout.mjs`; `node scripts/verify-clean-checkout.mjs` after implementation commit; mode validation in `acceptance.recovery.test.ts` via A | Config/migrate/seed passed locally; clean committed checkout pending lead commit |
| 2 | Authentication → approved products → verified fixture funding → quote → async order → encrypted reveal | `skeleton.test.ts`, `acceptance.http.test.ts` via A; `tests/e2e/journey.spec.ts` via A | implemented-local; real signup/signout/signin, persisted purchase/reveal/support/operations passed on both viewports |
| 3 | Concurrent payment event and verification identities credit once | `commerce.test.ts` concurrent12-event scenario, `acceptance.http.test.ts` eight signed callbacks via A | implemented-local; one funding journal and persisted credited amount |
| 4 | Concurrent checkout uniqueness, body conflict and overspend prevention | `commerce.test.ts`16 distinct keys/same quote and competing independent quotes; HTTP five-key race via A | implemented-local |
| 5 | Currency balance, immutable journals, cached wallet reconciliation and aggregate reversal ceilings | `commerce.test.ts` direct SQL plus distinct concurrent refund IDs and capture/release race via A | implemented-local; totals and posting constraints asserted |
| 6 | Expired/tampered/stale/unapproved offers and quantity/price drift | `commerce.test.ts`, `worker.test.ts`, HTTP strict-input scenarios via A | implemented-local; no supplier fence for proven pre-dispatch price change |
| 7 | Lost accepted response preserves funds; stable-reference lookup or review without resend | `worker.test.ts`, `acceptance.recovery.test.ts` actual child exit75 after persistent fixture receipt via A | implemented-local; P-AI recovered, Graml held/reviewed with dispatchCount1 |
| 8 | Queued completion/failure and duplicate/contradictory callbacks | `worker.test.ts`, `commerce.test.ts`, `acceptance.http.test.ts` via A | implemented-local; terminal delivery preserved and release/capture not duplicated |
| 9 | Committed work, expired leases, abrupt child exits and Redis rebuild | `acceptance.recovery.test.ts`, `worker-recovery.test.ts` via A | implemented-local; actual processes/Redis, durable encrypted supplier receipts and one economic effect |
| 10 | Raw HMAC, malformed lengths, wrong identity/amount/currency/environment and missing auth | `skeleton.test.ts`, `commerce.test.ts`, HTTP and provider parser tests via A / `pnpm test:unit` | implemented-local; real public proxy byte digest and durable inbox asserted |
| 11 | Cross-owner wallet/order/delivery/admin isolation and noncacheable secrets | `acceptance.http.test.ts`, `skeleton.test.ts` via A | implemented-local; role spoofing/cross-owner requests rejected, no-store and rendered client asset scan passed |
| 12 | Desktop/mobile keyboard flow, actual failures, persisted refresh and operations records | `tests/e2e/journey.spec.ts` via A; screenshots `output/playwright/` | implemented-local; six Chrome checks passed, keyboard activation, no overflow, refresh, delayed real support options and operations records; viewport screenshots visually inspected by lead |
| 13 | Explicit modes, production NODE_ENV+isolated fixtures, optimized build and CI boundaries | `acceptance.recovery.test.ts` mode matrix via A; lead `pnpm build`; `.github/workflows/ci.yml`; clean-checkout script | implemented-local; final runner built/served optimized local fixture application and passed full journey. Clean clone pending; remote CI unrun |
| 14 | Provider-specific stable reference/fence/recovery and honest incomplete catalog semantics | `worker.test.ts`, `worker-recovery.test.ts`, `acceptance.recovery.test.ts`, `tests/unit/providers.test.ts` via A / `pnpm test:unit` | Local fixtures passed; P-AI sandbox/Graml read-only external checks unrun without credentials. No external success claimed |
| 15 | Same quote/different keys, elapsed accepted TTL, BigInt JSON and fractional minor rejection | `commerce.test.ts`, `acceptance.recovery.test.ts`, HTTP malformed funding regression and `tests/unit/contracts.test.ts` via A / `pnpm test:unit` | implemented-local; exact9007199254740993 wire string, delayed accepted quote and malformed amount400 verified |
| 16 | Revoked/expired sessions, current roles, CSRF/origin/host and support/reveal ownership | `skeleton.test.ts`, `acceptance.http.test.ts` via A | implemented-local; actual raw HTTP hostile Host400, removed admin403, expired/revoked401 |
| 17 | Runtime SQL rejects imbalance, empty finalized journals, finalized append, cross-currency and history deletion | `commerce.test.ts` direct Prisma/raw SQL using restricted runtime role via A | implemented-local; real PostgreSQL constraints and unique outbox/journal records under races |
| 18 | Replayed reversal, spent credit obligations and reversal-before-success survives retries | `commerce.test.ts` including SEC004 regression via A | implemented-local; freeze/receivable retained, no erased history or restored spendable disputed funds |
| 19 | Canary payload/log/job/asset isolation and immutable authenticated encryption | `worker-security.test.ts` SEC003; `acceptance.http.test.ts`; `tests/unit/commerce.test.ts` via A / `pnpm test:unit` | implemented-local; encrypted callback/support, assets/logs clean, immutable delivery, swapped/bitflip reveal500. SEC005 POST/hydration controls passed actual no-JS and normal sign-in/log-canary checks |
| 20 | Isolated backup/restore retains totals/decryptability, dispatch pause and Graml fence | `scripts/verify-restore.mjs` (A invokes after browser), `worker-recovery.test.ts`, `acceptance.recovery.test.ts` via A | implemented-local; actual pg_dump/pg_restore to goober_restore_557c1c5da1bc:145journals/290postings/41orders/28deliveries/31fences preserved,26valid envelopes decrypt,2corrupt probes rejected, Graml count1, new dispatch paused;6.753s observed, no production RPO/RTO claim |

## Execution requirements

Use a unique isolated test database (and Redis namespace/database) and reject shared/live targets before destructive cleanup. Never use an in-memory substitute to mark PostgreSQL/Redis behavior passing. Execute test suites serially where global worker/Redis lifecycle is mutated. Parallel race checks use separate database sessions and a barrier to establish overlap. Assert persisted journal/order/outbox/attempt invariants after requests settle.

Failure injection must have explicit test-only guards and documented checkpoints; fixture supplier acceptance/receipts survive worker restarts independently from the worker process. A fixture call counter in the crashed worker's memory cannot prove dispatch uniqueness. Tests distinguish payment callback validation from payment transaction verification, and prove raw-byte verification through the same public reverse proxy used by the UI.

For restores, snapshot a database containing delivered and fenced uncertain fixture orders. Restore only into a separately named empty local database using synthetic keys. Assert dispatch pause before starting a restored worker, verify decryptability and ledger totals, and prove a redelivered Graml job cannot create a new purchase. Preserve the original database. Record elapsed restore time as an observation, without inventing production RPO/RTO.

Browser automation uses role/label locators, real running web/API/worker and persisted records. Do not stub successful commerce API responses. Exercise keyboard reachability, visible focus, narrow-screen overflow, announced error/loading states and refresh continuity. Screenshot artifacts use only synthetic identities and delivery content.

## Actual run ledger

| Time / revision | Command / environment | Result / limits |
| --- | --- | --- |
| Preparation, 15 October 2026 | Read `AGENTS.md`, source brief B7, three applicable skill files; `Get-Command npx` | Preparation complete; no app test execution. Await G1 shared contracts and runnable services. |
| G1 source prepared | `node --env-file-if-exists=.env node_modules/vitest/vitest.mjs run tests/integration/skeleton.test.ts --maxWorkers=1` | Exit 1 before collection: `MODULE_NOT_FOUND` for Vitest; dependency installation still in progress. Tests unrun. Source exercises public auth/proxy/API/database/inbox, not mocked services. |
| 16 October 2026, isolated integrated attempt | `node scripts/integration.mjs --e2e`; PostgreSQL `goober_test_85069a834e4c`, Redis DB11 (controlled recovery additionally DB15), Next 3005/Nest 3006 | Migrations/seed passed; commerce13/13, worker9/9, worker-recovery6/6, worker-security4/4 passed. Skeleton2/4 passed; first auth request aborted at25s while Next was compiling its handler, then dependent role test failed. Independent recovery file never collected: Vitest fork `spawn EPERM`. Run failed; HTTP/browser/restore not reached. Runner now warms the actual auth handler and selects one Vitest thread worker to reduce Windows process startup pressure. |
| 16 October 2026, second isolated run | Same integrated command; PostgreSQL `goober_test_c4b76ab89ec6`, Redis11/15, ports3005/3006 | Controlled phase **42/42 passed** across six files. HTTP4/6 passed, including real funding/order/queue/failure/review/support/encrypted reveal. Found malformed funding amount `'1.1'` returning500 (unsafe BigInt refinement), sent to lead for application fix. Host-header assertion used fetch, whose Host normalization prevented the intended wire test; replaced with raw `node:http`. Browser/restore not reached because the HTTP phase correctly failed. |
| 16 October 2026, integrated + targeted browser iterations | A/B against `goober_test_c41b4807bc2f` | Controlled42/42 and HTTP6/6 passed. Initial browser run exposed cold development compilation and ambiguous Next announcer/status selectors; runner warms real pages and selectors now target actual notices. Browser signout/signin then found **SEC005**: unhydrated forms could fall back to credential-bearing GET. Frontend added explicit POST/constant actions, disabled SSR fieldsets/submits and hydration guards across auth/support/wallet; no-JS checks passed on both viewports. Two synthetic password query values in the failed local log were replaced with `[REDACTED-SYNTHETIC]`; no real supplier/customer credentials were used. |
| 16 October 2026, independent restore | `node --import tsx --input-type=module` loads the existing ignored run environment then imports `scripts/verify-restore.mjs` | **PASS** to `goober_restore_a60d7c738ca4`: financial counts/totals match;24 valid synthetic deliveries decrypt; deliberate corruption probes reject; Graml fence stays1 and new dispatch remains paused. Report: `.local/verification-c41b4807bc2f/restore-report.json`. |
| 16 October 2026, current-source integrated attempt | A against `goober_test_61b9ef809304` | Controlled42/42 + HTTP6/6 + browser5/6 passed. Desktop full journey, both actual-error checks and both no-JS SEC005 regressions passed. Mobile revealed a real linked-support race: submission while order options loaded could save a general request. Frontend now retains an explicit selected-order option and controlled identity; browser regression delays the real order-list request and asserts the URL-linked order persists. Await final full rerun after this fix. Actual Chrome155.0.8059.41, desktop1440×1000/mobile412×839. |

| Final lead-run production fixture verification,16October2026 | `node scripts/integration.mjs --e2e`; goober_test_76e6151adede, Next production build, actual PG/Memurai, Chrome155 | **Exit0:42core+6HTTP+6browser passed; restore passed**.26valid synthetic deliveries decrypt;2malformed probes fail closed; balanced NGN/USD totals and all145journals/290postings copied. Source and restore databases retained. |

Earlier browser iterations found real SEC005 native GET credential leakage and an async support-order link race; both were fixed. Synthetic URL password values in failed debug logs were redacted, never copied into reports. Other iterations exposed development HMR/cold compile, locator/transport cleanup races, active auth429 and a Chrome launch EPERM. The runner now uses an optimized test build, respects existing rate limits, and the final lead-run command above passed without reducing application safeguards.

## External and release limits

No supplier/payment credentials have been used by this role. P-AI sandbox, Graml authenticated read-only and real payment test-mode checks remain unrun until supported secrets/access exist. Fixture success cannot be reported as supplier success. Public deployment, production changes, paid supplier actions and live customer money remain outside local verification authority. Remote CI cannot be marked successful from a local test run.

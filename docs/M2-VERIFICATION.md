# M2 verification — 27 October 2026

Functional source: `ce71c428b548a335b3c58fa5e0fe723c728e05d7`, branch `codex/goober-m2-product-quality`. This is local fixture evidence. Historical M1 results remain in VERIFICATION.md; no external supplier/payment or remote CI success is inferred.

## Acceptance outcomes

| # | Requirement | Actual evidence / status |
| --- | --- | --- |
| 1 | Preserve starting branch/worktree and isolate M2 | PASS. Clean main at3ff2441 verified; created requested feature branch. No reset/stash or user-file overwrite. Skills checkpointa92d930, native/audit checkpoint25c4500, verified product commitce71c42. |
| 2 | One infrastructure path, Docker/WSL and Windows reachability | Native PASS; Docker BLOCKED. Actual PG17.11 accepting connections54329/Redis-compatible MemuraiPONG6389, repeated native startup passed. Docker Desktop4.96.0 missing installed WSL/LinuxKit ISOs; daemon unavailable. No compose start/reset/volume deletion or cross-store transfer. Exact diagnostics/commands in LOCAL-RUNTIME.md. |
| 3 | Migration/permissions/seed/auth schema and fixture modes | PASS on selected native DB: bounded runtime grants, normal fixture seed, maintained Better Auth schema and Prisma status (both migrations up to date). Fresh test databases also migrated/granted/seeded. APP_ENVlocal/test, DATA_ENVtest and each payment/providerfixture mode verified; no external credentials/calls. |
| 4 | Persistent complete synthetic M1 journey | PASS. Both1440x1000 and412x839 journeys register/signout/signin, verified fixture funding, quote/order/recovery, reveal/hide, support and same operations records. Immediate SPA header state asserted. All43controlled PG/Redis and6HTTP checks passed. |
| 5 | Confirmed defects and focused regressions | PASS local. Draft pagination zeroPOST;40loaded private support records removed after actual401 without deleting41DBrecords; held real201delivery response stays hidden after same-page session revocation. Actual streaming401 abort unit and4Unicode/exact-money display cases passed. Source/steps/failures in M2-ISSUES.md. |
| 6 | Coherent polished responsive UI with true states | PASS implementation/browser inspection. Compact forest/navy/cream design, earlier catalog/signin, current nav, readable status, cursor navigation, access-gated forms, passive error focus and dense operations. Actual records only; no fake metrics/actions. DESIGN.md describes changes. |
| 7 | Desktop/mobile accessibility and four widths | PASS exercised scope:13Chrome checks, including360/390/768/1280, native keyboard controls, visible >=2px skip-link focus, computed0s transition under reduced motion, form hints/headings/landmarks, actual401 gates and no horizontal overflow. Source-defined core contrast pairs5.66–13.67:1 (source calculation, not full WCAG audit). Manual screen-reader usability was not performed. |
| 8 | Independent security/financial review | PASS source/transcript scope. Independent reviewer rechecked complete changed diff and P2 fixes; no introduced unresolved high/critical finding. Server auth/CSRF/ownership/freshness/encryption and journal/provider/mode code unchanged; only shared contract change is display prefix. Reviewer inspected focused passed runtime entries; lead executed suite. Pagination403 branch source-reviewed; focused runtime cases use401. |
| 9 | Relevant full checks, restore and clean checkout | Lint/types,76units, optimized11route build,49PG/Redis/HTTP and13browser PASS. pg_dump/pg_restore PASS to isolatedDB,196journals/392postings/64orders/30deliveries/54fences and per-currency totals match;28valid envelopes decrypt,2corruption probes reject, Gramlcount1 and newdispatchpaused. Committed clean checkout PASS at ce71c428b548a335b3c58fa5e0fe723c728e05d7: frozen install, both migrations, grants/seed, lint/types,76units, build and real authenticated production web/API boot on3007/3008. Remote CI UNRUN. |
| 10 | Evidence, commits and startup/stop handoff | Current source/evidence recorded in EXECUTION, M2-ISSUES, SKILLS and docs/evidence/m2-*.json. Clean-checkout report retained as evidence/m2-clean-checkout-local.json; documentation-only handoff complete. Exact commands and Docker limitations in LOCAL-RUNTIME. |

## Actual commands and retained evidence

Final full command sequence, exit0: pnpm lint; pnpm typecheck; pnpm test:unit --maxWorkers=1; node scripts/integration.mjs --e2e. PowerShell explicitly forwards each native exit code. Transcript: ignored .local/m2/full-verification-2.log. Run token21d1f7e945f0, sourceDBgoober_test_21d1f7e945f0, service/build logs .local/verification-21d1f7e945f0. Actual installed Chrome156.0.8078.48; earlier baseline audit used155.0.8059.85. Runtime and provider modes are fixtures despite the optimized production build. Services owned by the runner were stopped; native infrastructure/data and isolated databases remain.

Restore target goober_restore_920075a2053d preserved. Observed restore7737ms is a local measurement, not production RPO/RTO. Sanitized reports: evidence/m2-local.json, evidence/m2-restore-local.json and evidence/m2-contrast-local.json. Explicit safe screenshots: ignored .local/m2/qa and output/playwright. Automatic failure screenshots/traces are off so private delivery cannot enter those artifacts. Lead visually inspected actual desktop/mobile storefront captures.

## Failure history and corrections

- First attemptd831c1357de8: optimized build+43controlled+6HTTP passed;7/13browserpassed,6failed on test assumptions (actual accessible combobox rather than label-text matching; main notice rather than Next's route-announcer; actual successful reveal201). Original behavioral assertions retained. Restore not reached.
- That attempt's outer PowerShell returned0 despite innerNode1; it is recorded as FAILED. Final wrapper explicitly exits with each native command result.
- Actual streamingloopback401 test failed before abort guard, passed after. Four literalcurrency tests failed before fixing malformed naira prefix, passed after. A newtest NodeNext import needed explicit.ts extension; typecheck caught and fixed it before final run.
- Final attempt21d1f7e945f0 passed all76unit/49integrationHTTP/13browser and restore. A source hash manifest confirmed executable files unchanged throughout that run; only a design-note clarification followed.

## Reproducibility and limits

Use pnpm test:e2e for a fresh migrated/granted/seeded database plus complete integrated suite and restore. Use pnpm verify for lint/types/units/build plus that suite. After a local code commit, pnpm test:clean-checkout verifies frozen committed files and real production web-to-API auth boot on3007/3008. Never use a shared/live database for these scripts.

Docker acceptance remains blocked by its incomplete installation. P-AI authenticated sandbox, Graml authenticated read-only and payment processor test access remain unavailable; fixture proof does not establish external fulfillment/idempotency. Graml purchase stays fixture-only, P-AI external replay remains disabled. Public deployment, paid purchases/topups, live money, push, merge and production changes were not performed. Owner assurance was not reopened or independently verified.

Final evidence closure: 29 October 2026. Clean-checkout report verifies committed functional source ce71c42; final handoff commit changes documentation only. The earlier check dates above are retained.

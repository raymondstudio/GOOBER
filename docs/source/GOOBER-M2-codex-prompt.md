+# GOOBER M2 — product quality, Docker workflow, and release-safe verification

## Direction

Continue the existing GOOBER repository from its accepted M1 local/test foundation. M1 is functional, but the owner has now used it and reports that the interface looks very basic, the visual quality is poor, and several small bugs remain. Treat this as a request to improve the real product experience, reproduce and fix confirmed defects, and make local development work reliably with Docker on WSL.

This is an implementation assignment, not another planning-only review. Work on a new branch named **codex/goober-m2-product-quality**. Preserve the existing M1 behavior, security controls, financial invariants, migrations, and local data. Do not overwrite or reset the user's working tree. Begin by checking the actual repository, branch, latest commits, uncommitted changes, AGENTS.md, README.md, docs/EXECUTION.md, docs/VERIFICATION.md, docs/DECISIONS.md, docs/THREAT-MODEL.md, docs/SKILLS.md, and relevant setup scripts. The handoff says the functional M1 revision is **56e956d7b2045914446161d73a996cd9dddd6d55** and the documentation/evidence handoff revision is **3ff2441d85432d11f41d6afaa188aad0dae899b3**. Confirm the local state rather than assuming it.

The user has completed pnpm setup on Windows: Node 24.11.0, pnpm 11.25.0, frozen install succeeded, .env was generated/preserved, Prisma client generated, native PostgreSQL and Memurai started, database reachable on port 54329, and db:migrate reported no pending migrations. db:permissions, db:seed, auth:schema:check, and pnpm dev may still need to be run or confirmed. Do not repeat completed setup unless checks show it is necessary. Read the extracted Memurai Developer EULA before ongoing Memurai use; the installer reports development/test-only licensing, telemetry, and a ten-day restart timer.

The owner previously recorded an owner-supplied assurance that intended resale and service activities have been reviewed and permitted. Do not reopen a general legal audit. Keep M2 local/test-only and retain existing fixture catalog publication controls. If a specific documented restriction conflicts with a particular product/action, report only that concrete conflict and keep unrelated work moving. Do not invent permission evidence or publish an unverified SKU.

## M2 outcome

Deliver a polished, coherent storefront and operations experience on top of the existing M1 system, with reported minor bugs reproduced, fixed, and covered by focused regression checks. Give the interface a clear visual system and strong craft, using existing brand assets and a small number of purposeful design decisions. A large visual improvement is authorized; a wholesale rewrite of product architecture is not.

Make the customer journey understandable and usable from registration through fixture funding, catalog browsing, quote acceptance, asynchronous order status, delivery reveal, and order-linked support. Improve local operations views enough to inspect those same records without implying live supplier purchasing is enabled. All visible states must reflect persisted API/database state. No timers, hard-coded success, fake counts, or placeholder actions.

## Team and task ownership

You are the lead engineer, planner, integrator, and final reviewer. Use native Codex subagents to form this bounded team. Give each agent its task, write-path ownership, prerequisites, applicable skills, verification criteria, and short evidence-based report format. Keep shared contracts, migrations, root manifests/lockfile, release decisions, and final integration under lead ownership. Avoid overlapping edits; serialize schema or root configuration changes. If subagents are unavailable, state that once and perform the roles sequentially without claiming delegation happened.

1. **Product and UX auditor — read-only:** inspect customer and operations journeys on desktop/mobile; inventory visual, interaction, responsive, accessibility, copy, empty/loading/error-state, and navigation problems. Return route-by-route observations with evidence and prioritized design direction. Do not edit code.
2. **Frontend/product engineer — apps/web only:** implement the agreed design system and customer/operations UI improvements; preserve API contracts, auth boundaries, ownership checks, CSRF protections, and business behavior. Do not edit shared backend contracts or migrations.
3. **Bug/reliability engineer — assigned backend paths only:** reproduce reported or discovered functional defects, identify root causes, and implement narrow fixes in apps/api, apps/worker, packages/commerce, or packages/providers only when required. Do not duplicate frontend redesign.
4. **QA/browser engineer — tests, scripts, and test-only paths:** add or improve meaningful regression coverage for confirmed bugs and changed journeys; exercise desktop/mobile behavior and failure states. Coordinate before changing shared app files.
5. **Security and financial reviewer — read-only until a finding is assigned:** independently inspect changed UI/API paths against the existing threat model and financial invariants, especially session freshness, ownership, CSRF, safe errors, encrypted delivery, immutable quote/ledger behavior, and no accidental live-mode activation.
6. **Lead integrator:** reconcile findings, own shared files, review diffs, run checks, resolve conflicts, and maintain milestone/evidence log.

Start with parallel read-only discovery where useful. Then assign disjoint implementation work. Agents must read root and path-specific instructions and relevant repository skills. Do not recursively create agents.

## Skills and references

Inventory the existing skills listed in docs/SKILLS.md and .agents/skills. Read AGENTS.md and applicable skill instructions before editing. Reuse existing UI/UX, accessibility, Playwright, security, threat-model, provider-recovery, and financial-invariants workflows when relevant. If a needed skill is missing, research the current official/trusted source, check revision and license, install only through the supported skill workflow, and verify availability before assigning it. Do not run arbitrary install scripts or add skills just to inflate the report. Record new skill provenance and role assignment in docs/SKILLS.md.

For design work, inspect the running product and existing logo/colors first. Use current, credible interface references only to inform concrete choices; do not copy a product, add ornamental motion for its own sake, or use generic AI-generated gradients/cards as a substitute for design decisions. Prefer strong hierarchy, careful type, useful spacing, consistent controls, responsive composition, direct language, and clear product states. Keep motion restrained and respect reduced-motion settings.

## Docker on WSL

The user installed Docker in/for WSL and has already started the repository's native PostgreSQL/Memurai path. Determine whether this is Docker Desktop with WSL integration or Docker Engine installed only inside a WSL distribution before running compose. Check the CLI and daemon from Windows PowerShell and from the relevant WSL distribution; inspect wsl --list --verbose, docker version, and docker compose version without exposing secrets.

Use exactly one infrastructure path at a time. Before Docker starts, stop native services using the repository's documented pnpm dev:infra:stop command. Never launch Docker and native services together because both claim ports 54329 and 6389. Do not uninstall Docker Engine or install Docker Desktop over it until the current installation type is understood. If Docker Desktop is present, verify its WSL 2 engine and enable integration for the user's distro; then the README's docker compose up -d should work from PowerShell. If Docker Engine exists only inside WSL, run compose in that WSL distribution from the repository path and verify Windows can reach the published loopback ports. If path, daemon, port forwarding, or volume behavior is unclear, stop and report precise diagnostics rather than making a risky system change.

Inspect docker-compose.yml/compose.yaml, health checks, published ports, and volumes before startup. Confirm PostgreSQL 17 and Redis-compatible service health and Windows access to 127.0.0.1:54329 and 127.0.0.1:6389. Preserve existing volumes and .env. Never use docker compose down -v, delete native database files, or overwrite secrets. Docker and native data stores are distinct; if local records must be retained across switching, take and verify backup/restore using the documented PostgreSQL 17 workflow. The current migration attempt failed before contacting PostgreSQL and reported no pending migrations once native PostgreSQL started; do not assume Docker contains native records or vice versa. Keep the native path documented and supported; do not make Docker the only supported Windows path.

Once Docker services are healthy, run only necessary DB setup (pnpm db:generate, pnpm db:migrate, permissions, seed, auth schema check) and verify fixture-only environment configuration before launching web/API. Do not use real supplier keys, real customer money, live supplier calls, deployment, or external purchases in M2.

## Milestones — commit each verified mini-milestone

Maintain docs/EXECUTION.md with agent assignments, concrete tasks, status, blockers, decisions, and evidence. At each milestone, record the change, tests run, results, and commit hash. Never commit failing or unverified work as complete.

### M0 — baseline and local runtime
- Inspect git status/branch and preserve user changes.
- Confirm starting revision and M1 checks/evidence from committed files.
- Run Docker diagnostics, choose a safe single infrastructure path, start services, verify ports/health, and confirm local fixture/test environment.
- Start app and record actual baseline results. Capture UI evidence locally in ignored .local/ paths; do not commit screenshots with personal data or secrets.
- Create the new feature branch only after protecting uncommitted work.

### M1 — evidence-based product and bug audit
- Run customer and operations journeys at desktop and narrow mobile widths.
- Create a prioritized issue list. For each bug, record route, preconditions, exact reproduction steps, expected/actual behavior, root cause, severity, and planned regression check.
- Review loading, empty, error, retry, success, offline/slow response, and form-validation states. Do not infer bugs from appearance alone.
- Agree on a compact design system: color tokens derived from brand assets, type scale, spacing, surfaces, focus/disabled/error states, buttons/inputs, layout widths, and responsive breakpoints.
- Maintain current M1 route semantics and API behavior.

### M2 — storefront and customer-flow refinement
- Improve storefront/navigation/catalog discoverability and product detail comprehension.
- Make registration/sign-in, wallet fixture funding, quote review, order submission/status, delivery reveal, and support request flows visually coherent and easy to follow.
- Make asynchronous order states explicit and useful, including queued, delivered, failed, and review-required; never suggest supplier purchase is live.
- Ensure delivery remains encrypted at rest and revealed only to authenticated owner in the allowed recent-session flow. Do not expose credentials in support text, logs, analytics, screenshots, or errors.
- Fix confirmed functional defects with regression checks. Do not add unrelated features or change transaction semantics for superficial UI feedback.

### M3 — operations, accessibility, responsive QA
- Improve operations navigation and information density while preserving role checks and read-only/live-disabled labels.
- Verify keyboard-only use, visible focus, semantic labels, headings, error association, color contrast, reduced motion, and screen-reader-friendly status updates.
- Test around 360, 390, 768, and 1280 pixels. Check horizontal overflow, clipped dialogs, unreachable controls, and state-specific layout failures.
- Test current Chrome/Playwright paths supported by the repo. Keep test accounts/records synthetic.

### M4 — independent review and regression pass
- Ask security/financial reviewer to review the complete diff and any backend changes independently.
- Reproduce confirmed findings before marking fixed. Check whether fixes introduce stale data, duplicate submissions, navigation loss, hydration errors, race conditions, inaccessible controls, or sensitive diagnostics.
- Run lint, typecheck, unit tests, optimized build, integration/API tests, browser E2E, and restore checks required by repository. On an 8 GB Windows laptop, avoid redundant builds concurrently; use established resource-aware scripts.
- Run clean-checkout verification after a local code commit if current repo instructions require it. Remote CI is separate evidence; inspect it only if a remote run exists and report actual state.

### M5 — handoff
- Update docs/EXECUTION.md, docs/VERIFICATION.md, and necessary design/decision/security docs with actual evidence, not intentions.
- Summarize changes, confirmed bugs fixed, changed paths, design behavior, accessibility/browser results, Docker path and exact run/stop commands, remaining defects, and limitations.
- Report branch/final commit, test commands/results, agent roles actually used, and skills actually read/installed. Do not claim independent legal verification, external provider access, production readiness, or passing checks that were not performed.

## Engineering invariants and scope limits

- Preserve PostgreSQL as source of truth for wallets, quotes, orders, delivery, support, and operations.
- Preserve exact money representation, balanced immutable journal entries, wallet reconciliation, aggregate refund/capture/release limits, quote single use, unique economic operation keys, durable inbox/outbox recovery, and no network call inside DB transactions.
- Preserve current authentication, role, CSRF, ownership, rate-limit, recent-session, encryption, raw-callback validation, safe diagnostics, and fail-closed environment protections.
- Do not add supplier purchase modes. P-AI external replay remains disabled unless supplier reference retention/replay guarantees have been verified. Graml purchases remain fixture-only with durable no-repeat fence for uncertainty.
- Keep account credentials and secret configuration out of plaintext UI except explicit owner reveal, logs, analytics, repository, test artifacts, and screenshots. Never ask the user to paste keys into chat.
- Do not publish/deploy, merge default branch, alter production settings, perform supplier purchases/top-ups, credit real customer wallets, weaken auth, disable tests/security controls, or make irreversible changes.
- User-visible copy must accurately describe synthetic fixture funds and local test outcomes. Do not claim external fulfillment success from fixtures.
- Keep functional changes small, reviewable, and reversible. Avoid broad dependency upgrades. Preserve original LICENSE and source documents.

## Acceptance criteria

M2 is ready for review only when all applicable items pass and evidence is recorded:

1. Starting branch/worktree and user changes were preserved; M2 changes are isolated on the new branch.
2. Exactly one infrastructure path is active. The chosen Docker path starts from its documented terminal and both required ports are reachable from the Windows app.
3. Migrations/permissions/seed/auth schema check pass on selected local DB; no real external service is called.
4. Complete M1 synthetic customer journey still works with persisted state.
5. Reported and newly confirmed bugs have reproduction steps, root cause, fix, and regression check; unresolved items are clearly listed.
6. Storefront, catalog/product details, wallet/funding, quote/order, delivery, support, and operations have consistent polished responsive UI states.
7. Desktop/mobile browser checks pass at representative widths; no blocking accessibility issue, horizontal overflow, or broken primary action remains.
8. Security/financial reviewer rechecks changed paths; no unresolved high/critical issue introduced.
9. Relevant repo checks pass: lint, typecheck, units, build, integration/E2E, restore/clean-checkout as directed by current docs. Record skipped checks and why.
10. docs/EXECUTION.md and verification evidence describe actual runs and final commit. Handoff names remaining risks and exact startup/stop commands.

Begin with M0 and read-only audit agents. Proceed through implementation and verified commits without another plan-only response.

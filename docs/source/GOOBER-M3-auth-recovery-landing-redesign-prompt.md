+# GOOBER M3 — authentication recovery and landing redesign

## Objective

Continue the completed M2 local/test implementation. The functional M2 commit is **ce71c428b548a335b3c58fa5e0fe723c728e05d7** on **codex/goober-m2-product-quality**. Skills checkpoint **a92d930** and native/runtime audit checkpoint **25c4500** are separate commits. Confirm actual local HEAD, branch, dirty changes, and commit graph before acting; preserve all user work and M2 evidence.

Create **codex/goober-m3-auth-recovery-landing-redesign** from the actual M2 handoff state. Implement the work below. Do not reset, rebase, force-push, merge to default, or deploy.

The owner reports sign-in and account creation fail, and the landing page looks poor. Use the attached screenshot when available. The request is to fix the real failures and redesign the complete landing/store experience, not to write another plan.

## Evidence and diagnosis

The provided development log shows web, API, and worker start; the API says it is listening and the homepage/sign-in routes return 200. The worker reports “Worker queue unavailable; PostgreSQL work remains durable.” Sign-in and sign-up POSTs return 500 because Prisma cannot reach PostgreSQL at **127.0.0.1:54329**, failing on the DB-backed **RateLimit** model with P1001. The screenshot shows “Catalog temporarily unavailable,” a generic request error, and a reload action.

Treat this as a dependency/readiness problem until verified otherwise. Do not confuse a listening HTTP server with healthy database/queue dependencies. Diagnose from the same Windows process context used by web/API/worker. Verify which native or Docker infrastructure is active, whether PostgreSQL 17 is listening on 54329, whether Redis-compatible service is listening on 6389, the effective non-secret host/port configuration, and how setup/start/stop scripts manage those services. Identify why the worker and catalog fail too.

Do not bypass the problem by disabling DB rate limits, weakening Better Auth, switching persistence to memory, returning fake auth/catalog success, or swallowing database errors. Preserve durable worker recovery. Add dependency preflight/readiness or actionable local diagnostics so a stopped service is reported clearly. Keep sensitive connection values, traces, and internal database details out of user-facing errors and logs.

M2 setup evidence: Node 24.11.0, pnpm 11.25.0, frozen install and local setup passed, Prisma client generated, native PostgreSQL/Memurai started, DB port reachable, and migrations reported no pending changes. The later app run again received P1001. Verify current services before repeating setup. Permissions, seed and auth schema checks may need confirmation. Keep fixture/test mode. No P-AI, Graml, or Paystack keys are required to fix local auth or fixture catalog. If an optional external check is blocked, identify the exact provider, mode, and required access; never ask for secrets in chat.

## Infrastructure and Docker

The M2 handoff states Docker Desktop 4.96.0 could not start because Docker resource files were missing: resources/wsl/docker-wsl-cli.iso and resources/docker-desktop.iso. The owner later said Docker was installed “on WSL,” but has not supplied a successful client/server or Compose result. Establish whether the current setup is Docker Desktop with WSL integration or Docker Engine installed only in WSL. Use read-only diagnostics from Windows and, if needed, the WSL distro: wsl --status, wsl --list --verbose, docker version, and docker compose version.

Use exactly one infrastructure path. Native and Docker services claim ports 54329 and 6389. Before switching, stop native services using the documented **pnpm dev:infra:stop**. Do not install a second engine, uninstall Docker, or repair/reinstall Desktop destructively before identifying the current state. Inspect compose configuration, health checks, ports and volumes. Preserve .env, native database files, Docker volumes and fixture records. Never use docker compose down -v. Native and Docker databases are separate; use and verify the documented PostgreSQL 17 backup/restore process if retaining records across a switch. If Docker is still blocked, continue with the verified native path and tell the owner exactly what external repair or installer is needed. Do not let Docker block login diagnosis or UI work.

After dependency health is established, run only required setup checks: **pnpm db:generate**, **pnpm db:migrate**, **pnpm db:permissions**, **pnpm db:seed**, **pnpm auth:schema:check**. Verify the fixture-only environment before starting the app.

## Landing/store redesign

The screenshot's forest green, navy, warm off-white, GOOBER mark and editorial serif/sans pairing are a useful brand foundation. The current page has a hero, a small journey panel, catalog search/category controls, fixture disclosure, and three process steps. Redesign the entire page and composition; do not only recolor the current layout or add more cards. Aim for a distinctive, finished storefront with clear purpose, strong hierarchy, useful product context, and excellent responsive behavior.

Use Apple's official Human Interface Guidelines as design principles: purpose, agency, responsibility, familiarity, flexibility, simplicity, craft, and delight. Do not copy Apple's site, branding, product pages, trademarks, or platform-specific UI. Verify the screenshot's black “N” indicators are Next.js development tooling before treating them as product UI.

Within the first screen, clearly explain what GOOBER offers, who it serves, and how to begin. Provide a clean path to browse fixture products, review terms, create an account or sign in, and continue the existing persisted order journey. Explain local fixture mode truthfully: synthetic products and funds confer no real entitlement, and live purchasing is disabled. Keep these disclosures accurate but proportionate. Redesign catalog presentation, product cards/details, empty/loading/error/retry states, and responsive navigation around actual API state. Make catalog failures useful and calm without exposing internals; visual polish cannot substitute for a healthy API.

Use meaningful labels, semantic structure, visible focus, keyboard navigation, contrast, reduced-motion behavior, and clear disabled/loading states. Check mobile 360/390px, tablet 768px, and desktop 1280px. Keep motion restrained and performant on the owner's 8 GB laptop. Use only licensed, relevant imagery; no stock filler, fake testimonials, unsupported trust badges, fabricated metrics, or decorative dashboard images. Keep the existing GOOBER identity. Avoid adding runtime dependencies unless there is a proven need.

## Skill and tool discovery requested by the owner

Search for the requested Apple design skill and use a find-skills workflow to find the best relevant design, frontend, accessibility, visual QA, Next.js and bug-diagnosis skills. Inventory existing .agents/skills, .cursor/rules, docs/SKILLS.md, AGENTS.md and installed Codex skills first.

- If a dedicated **find-skills** skill exists, read and use it. If not, read the current official instructions for the Vercel Labs Skills CLI/catalog and use its search command, such as **pnpm dlx skills find**. Do not mistake search for installation.
- Search for the exact Apple design skill. Inspect source repository, revision, license, scripts, permissions and network behavior. The M2 audit says an Apple community skill was not installed because no license grant was found. Recheck current terms. Install it only if the license permits use. If it still lacks clear permission, do not bypass the terms; ask one focused question about that candidate while continuing independent bug work and the landing design with Apple's official HIG.
- Evaluate the official Apple HIG/Design Resources, Vercel web-design-guidelines and React best-practices, plus a reputable frontend-design skill. Verify source, revision, license and project relevance. M2 already used Vercel React/Next practices and UI/accessibility guidelines; check what is installed before adding another copy.
- Choose a small, complementary set, assign each to agents who need it, and record actual source/revision/license/use in docs/SKILLS.md. Do not install design software, add app dependencies, or execute unreviewed remote scripts just to meet the request. Ask the owner only when access/license or a missing product fact truly blocks a decision.

Apple's HIG is official guidance, not an installable skill or endorsement. The product must look like GOOBER, not an Apple clone.

## Core agent team

You are lead engineer, architect, integrator, and project manager. Use native Codex subagents. Start with parallel read-only discovery, then delegate bounded non-overlapping work. Each agent must read AGENTS.md, path instructions, and assigned skills. State write-path ownership, prerequisites, acceptance checks, and evidence format. Keep shared contracts, root configuration, migrations, and final integration with the lead. Do not recursively spawn agents. If subagents are unavailable, say so and work sequentially without claiming delegation.

1. **Runtime/auth investigator:** reproduce P1001 and Redis/catalog failure; inspect startup, readiness, service ports, env loading and Windows/WSL boundary; implement a narrow source-level fix and safe preflight.
2. **Product/design auditor, read-only:** inspect screenshot and routes; research HIG and candidate skills; return a concise GOOBER-specific design direction and page/state map.
3. **Frontend engineer, apps/web only:** implement landing/store redesign and accessible outage/retry states; preserve API/session/ownership behavior.
4. **QA/browser engineer, tests/scripts only unless coordinated:** regression coverage for database/Redis unavailable and recovery, auth, catalog, and responsive landing behavior.
5. **Security/financial reviewer, read-only:** independently check auth/rate-limit changes, fixture claims, delivery privacy, CSRF, ownership, and money/order invariants.
6. **Lead integrator:** own branch, shared files, task ordering, conflict resolution, commits, evidence, and handoff.

## Milestones and commits

Track assignments, status, dependencies, decisions and actual evidence in docs/EXECUTION.md. Commit each verified mini-milestone on the new branch.

### G0 — protect the repo
Record status, branch, HEAD and commits; inspect current M2 instructions/evidence; preserve local changes; create the M3 branch only from the verified M2 state.

### G1 — fix and verify local runtime
Reproduce P1001, worker Redis unavailability and catalog failure. Prove dependency reachability from Windows app processes. Determine the actual active infrastructure path. Fix the verified cause or report a precise external blocker. Confirm signup, login, persisted session, catalog, and worker behavior with actual DB state. Test service-down behavior without weakening security or durability. Record exact startup/stop commands.

### G2 — design plan and skills
Run the skill search and license review. Inspect the actual running app and screenshot. Write a short design plan with audience/job, brand-derived palette, type roles, content hierarchy, responsive composition, motion/accessibility rules, and reasons behind key choices. Ask only about blocking license/access questions.

### G3 — implement the redesign
Rework the complete landing/store page, navigation, catalog/product presentation, and service states. Wire every CTA to a real route/action. Use only truthful content and backend state. Keep the UI consistent with the existing M1 auth and commerce flows.

### G4 — regression, accessibility, independent review
Test auth success with a healthy DB and safe failure with DB stopped. Test Redis available/unavailable/recovery and durable worker semantics. Exercise the full synthetic customer path: auth, catalog, fixture funding, quote, order, async status, owner-only delivery reveal, support. Check desktop/mobile layouts, keyboard/focus, form labels/autocomplete, retry, loading/empty/error states, reduced motion, overflow, and visible status messages. Run repo-required lint, types, units, build, integration/API, Playwright, restore and clean-checkout checks as applicable. Use serial/resource-aware execution on this laptop. Have security/financial review the final diff. Record failures and skips honestly; passing a build alone is not completion.

### G5 — handoff
Update docs/EXECUTION.md, docs/VERIFICATION.md, docs/SKILLS.md, and runtime/setup guidance with actual results. Report confirmed root cause, exact verified startup/stop path, redesign, fixed bugs, tests, branch/commit, skill/license status, agent roles used, unresolved issues, and specific owner-side actions or access needed.

## Hard boundaries

Preserve M2 financial and security invariants: PostgreSQL source of truth, exact money, balanced immutable ledger, quote single-use, operation idempotency, inbox/outbox recovery, encrypted delivery, signature-checked callbacks, auth/session freshness, DB rate limits, CSRF, ownership, role checks, safe diagnostics, and fail-closed modes.

Keep M3 local/test-only. No real supplier calls, live keys, purchases/top-ups, real customer funds, public deployment, production changes, default-branch merge, disabling tests/security, or destructive local data changes. Do not expose credentials or delivery content in logs, screenshots, support, or ordinary UI. Preserve original LICENSE and M2 evidence. Do not claim Apple endorsement, independent legal verification, external API success, production readiness, or “no errors” without evidence.

## Definition of done

- Existing M2 history and user data are preserved; work is isolated on the M3 branch.
- Root cause of DB unreachability and Redis queue loss is established and fixed, or documented with the exact user-side blocker.
- Signup/login persist successfully with a healthy local DB; dependency-down errors are safe, actionable, and do not weaken auth.
- Catalog and fixture journey work with healthy services; outage and retry behavior is clear and truthful.
- The entire landing/store page is distinctive, polished, responsive, accessible, and grounded in verified design references.
- Browser regressions pass at mobile, tablet and desktop sizes; M1 financial/security behavior remains intact.
- Skills, sources, licenses, agents, commands, test results, remaining limitations, and final commit are documented truthfully.

Begin at G0/G1 and continue through implementation and verification. Do not stop after agents, skill installation, or a design proposal.

# GOOBER implementation mandate

Raymond explicitly adopted `docs/source/GOOBER-plan-and-Codex-brief.md` Parts A/B/C and the 15 October 2026 implementation instruction. Execute M0/M1 through working integrated code and evidence; setup or a plan alone is insufficient. Preserve existing files and LICENSE.

Use TypeScript/pnpm, Next.js web/auth handler, NestJS commerce API, Prisma/PostgreSQL, Better Auth database sessions, Redis/BullMQ and persistent worker. PostgreSQL owns economic records and durable work. Never replace required database/concurrency evidence with in-memory tests.

Authority includes local branches, reviewed dependencies/skills, implementation, migrations, tests, sandbox/read-only verification and local commits. Public deployment, merging main, real money, paid supplier purchases/topups and production changes require a separate owner release instruction. Never print or commit secrets.

Owner assurance is recorded once in docs/DECISIONS.md. Preserve product-specific approvals/entitlements; flag exact documented conflicts without reopening general permission review.

Lead owns root configuration, package manifests/lockfile, shared contracts and integration. Agents have exclusive assigned paths; serialize migrations (initial: 202610150001_initial). No nested agents. Six roles run in waves within the four-active-agent limit. Read assigned skills before coding. Report paths, decisions, actual commands/results and blockers.

G0 preparation precedes application coding; G1 proves migrations, real web-to-API session and raw signed callback before feature expansion. Track G0-G5 and all 20 acceptance checks in docs/EXECUTION.md and docs/VERIFICATION.md. Distinguish documented, implemented-local, externally verified, unrun and blocked.

Financial invariants: exact minor-unit BigInt/string transport; balanced immutable per-currency journals enforced in PostgreSQL; one order per quote; unique economic operations; locked aggregate capture/release/refund ceilings; no external calls in DB transactions; durable inbox/outbox; owner/role/session/CSRF checks; authenticated encrypted deliveries.

P-AI uses one stable external_order_id and lookup before verified-safe replay. Graml purchase is fixture-only in M1; durable dispatch fence prevents any automatic repeat after uncertainty/restart/redelivery. Never invent supplier capabilities. Keep APP_ENV, payment and supplier modes explicit; fixture funds cannot reach live purchases. No production secrets required for local M1.

Use PowerShell-compatible commands. Report real test failures and external blockers honestly and continue unrelated work. Each implementation handoff includes runnable commands, commit, acceptance evidence and remaining limits.

## M2 continuation

The owner requests product quality, confirmed bug fixes and safe Docker-on-WSL development from docs/source/GOOBER-M2-codex-prompt.md. Work on codex/goober-m2-product-quality; preserve M1 architecture/data/security/financial invariants. Use bounded audit/frontend/reliability/QA/security agent waves without recursive delegation; lead owns shared files and final integration. Inspect running UI before redesign, record confirmed bugs versus candidates, verify four responsive widths, and commit verified milestones. Use exactly one infrastructure path; never delete volumes or native data, overwrite .env, or reset Docker. A concrete Docker installation blocker does not stop independent native local/test work. No live modes, external purchases, public deployment, push or merge. Record M2 evidence separately from historical M1 results.

## Skill routing

For substantial tasks, select the relevant installed workflow from docs/SKILLS.md; simple fixes may use direct source reading. Cross-module graph analysis is optional, bounded, code-only and local. React/Next work uses vercel-react-best-practices plus the existing design/accessibility workflows; PostgreSQL work uses supabase-postgres-best-practices plus GOOBER financial/provider invariants. Existing security/Playwright skills remain available. No skill authorizes deployments, external purchases, automatic upgrades, hooks/watchers or application scope changes. Cursor uses the short .cursor/rules/goober-skill-routing.mdc map.

## M3 continuation

Continue from verified M2 handoff097c2e6 on codex/goober-m3-auth-recovery-landing-redesign under docs/source/GOOBER-M3-auth-recovery-landing-redesign-prompt.md. Diagnose dependency health from Windows before auth changes; retain database rate limits and durable worker recovery. Use bounded read-only discovery then exclusive frontend/runtime/QA work, independent security review, no nested agents. Verify healthy and unavailable DB/Redis, persisted auth/catalog/customer journey, four responsive widths, restore and committed clean checkout. Keep one infrastructure path and preserve all records, .env and M2 evidence. Lead owns shared/root/configuration/integration. No live money, external purchases, deployment, push or merge. Record M3 evidence separately.

## M4 — Final Implementation Directives & Graphify Persistent Memory

1. **Graphify Mandatory Workflow**:
   - The complete GOOBER codebase is mapped in `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` using `.local/skill-tools/graphify/Scripts/graphify.exe` (`pnpm graphify:update`) and exposed via local MCP (`scripts/graphify-mcp-stdio.py`, configured in `.vscode/mcp.json` and Cline MCP settings).
   - **Query-first requirement**: Before investigating or modifying any feature, query Graphify (`query_graph`, `get_node`, `get_neighbors`, `shortest_path`, or CLI `graphify query`) to locate relevant files, functions, modules and dependencies. Then inspect the actual source code before editing.
   - **Synchronization**: Run `pnpm graphify:update` after significant architectural changes to keep the graph and `GRAPH_REPORT.md` synchronized. Never include `.env` or secret credentials in generated artifacts.
2. **Multi-Agent & VS Code Environment**:
   - VS Code + Cline extension is the primary IDE/agent. Do not simulate native subagents inside the extension; use isolated branches/worktrees or sequential specialist passes with Principal Engineer integration review and `docs/EXECUTION.md` tracking.
3. **Paystack & Dual-Currency Marketplace (`NGN` / `USD`)**:
   - Paystack is the primary payment gateway (`NGN` in kobo, `USD` in cents; server-authoritative verification, raw SHA-512 webhook validation, idempotency, refunds).
   - Selling price = Supplier base price (`P.ai` USD / `Graml` NGN) × `1.15` (exact 15% markup in supplier currency), then converted to customer-selected currency (`NGN` or `USD`) via the centralized Exchange-Rate Service with immutable order rate snapshots.
   - Fixed-price professional e-commerce presentation only; no bargain/discount language or crossed-out prices.


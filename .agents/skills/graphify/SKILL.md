---
name: graphify
description: Map cross-module architecture, dependencies and change impact with a local Graphify AST graph. Use for substantial architecture or relationship questions when a bounded code-only index is useful; simple edits can use source directly.
license: Apache-2.0
metadata:
  author: Graphify-Labs; GOOBER local adapter
  version: 0.9.96-goober.1
  source-revision: dac063456bc1f5d92354ec3936fd9dd1513a83f3
---

# Graphify — bounded local AST workflow

This is a local adaptation of Graphify-Labs/graphify0.9.96, not an unmodified upstream installer. Upstream attribution/licenses and complete Codex references are retained. The original skill is [upstream-codex.md](references/upstream-codex.md); read it only for advanced formats/query semantics. Its auto-install, broad activation, hooks, semantic extraction and shell examples do not override this local workflow.

## Runtime and commands

Use the pinned ignored virtual environment at .local/skill-tools/graphify/Scripts/graphify.exe. It is Python3.14 Windows base runtime, with no optional extras. In the task's PowerShell process, set GRAPHIFY_NO_AUTO_REFRESH=1 and GRAPHIFY_BACKEND=none. No global settings, editor hooks, watchers, git hooks, cloud, MCP or semantic extraction are enabled. Do not execute upstream Step1 or automatic installs/upgrades.

- Check version/help with the pinned executable and --version / --help.
- Build only an explicitly selected, copied/allowlisted source subset: graphify extract <subset> --code-only --no-cluster --no-dedup --max-workers 1 --out <ignored-output-directory>. The --out argument is a parent directory; the actual graph is <ignored-output-directory>/graphify-out/graph.json. These options are verified against the pinned source; there is no invented --no-llm flag.
- Query a graph with graphify query <question> --graph <graph.json>; inspect [query guidance](references/query.md) for actual supported options before use. Use top-level --help; query --help is treated as query text, not subcommand help. Raw --no-cluster JSON stores edges under edges, while some upstream inline fallback examples expect links; prefer the verified CLI query.
- Prefer the same extract command's incremental behavior after relevant changes; see [update](references/update.md). Do not attach hooks or rescan per message.

## Scope and interpretation

Exclude .env/credentials, .git, dependencies, build/generated output, all skill/tool directories, auth state, uploads, real user data and evidence logs. Never index the entire root merely because the upstream defaults to it. Installation proof uses only two synthetic TypeScript modules under .local. No real GOOBER project index exists yet. Ask for scope only when the intended subset cannot be determined safely.

Do not run optional save-result/reflect memory examples unless the actual task requires them. Any requested memory/feedback outputs need explicit paths inside the selected ignored output directory; upstream defaults are not a scope grant.

Graphs distinguish EXTRACTED, INFERRED and ambiguous relationships. Check important authorization, ownership, financial and data-flow conclusions against actual source/migrations and current index scope/revision. A graph is a navigation aid, not security or runtime proof. Missing/stale graphs do not block direct reading or simple edits.

Runtime recreation and pinned hashes: docs/skills/graphify-requirements-windows-py314.txt and docs/SKILLS.md. On another platform, review compatible runtime wheels rather than using this Windows lock blindly.

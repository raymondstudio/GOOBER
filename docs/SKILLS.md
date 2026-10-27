# Skill provenance and assignments

Prepared before feature coding. Official skills were inspected at pinned openai/skills revision `49f948faa9258a0c61caceaf225e179651397431`, then installed using the bundled skill-installer into `.agents/skills`. License files/NOTICE retained. Installed folders and full SKILL.md reads verified. New installs are discoverable on a subsequent turn; this turn agents receive explicit verified paths.

| Capability | Skill/source/revision | License and execution | Assigned role |
|---|---|---|---|
| Browser verification | .agents/skills/playwright; official pinned revision above | Apache-2.0; wrapper invokes npx @playwright/cli; script inspected; user explicitly requires automated tests so locked @playwright/test used | quality |
| Security practices | .agents/skills/security-best-practices; official pinned revision above | Apache-2.0; instruction/reference files only; Next, React, general frontend and Express refs | security |
| Threat model | .agents/skills/security-threat-model; official pinned revision above | Apache-2.0; instructions/templates only. User provides scope and explicitly authorizes implementation/fixes; no repetitive scope approval | security |
| Frontend/accessibility | installed ui-ux-pro-max at C:/Users/USER/.agents/skills/ui-ux-pro-max; SHA256 88AADD21220542083A455E373BD162FFE7843266A71F06F4D837BB3B34F9C9C7 | local Python search, no package/network execution; full instructions read; license not independently verified, reused locally not redistributed | frontend |
| Interface review | installed web-design-guidelines v1.0.0; SHA256 F4647CA866A3ACCF763777F83E7682954F0187CD6BEA7EEA0399796652414E8F | instructions only, fresh official Vercel guidelines retrieval | frontend/quality |
| Financial invariants | .agents/skills/goober-financial-invariants; repository version | owner-derived instruction-only workflow; no scripts/remote calls, covered by repository LICENSE; not independently audited | commerce/platform/quality/security |
| Provider contract/recovery | .agents/skills/goober-provider-recovery; repository version | owner-derived instruction-only workflow; no scripts/remote calls; repository LICENSE; not independently audited | providers/worker/quality/security |
| Skill creation/install | preinstalled .system/skill-creator and skill-installer | full instructions + installer scripts inspected; pinned GitHub HTTPS downloads; no downloaded helper scripts executed | lead |
| Source PDFs | bundled pdf skill 26.1013.11914 | local extraction/rendering only; prior review completed, no original PDFs committed | lead/providers |
| Codex skill/subagent guidance | preinstalled openai-docs and current official Learn pages | read-only official docs; native collaboration tools actually used, four active slots | lead |

Custom skills have required frontmatter, narrow scope and no unfinished placeholders. Bundled quick_validate passed for both custom skills after installing PyYAML 6.0.3 into ignored .local/skill-validation; running with sandbox escalation was required to read the installed dependency. CI repair skill is available through GitHub plugin but not invoked without an actual CI failure. Runtime libraries are separate from skills; supplier credentials are not included in skills.

Agent waves: platform, commerce and providers preparation; frontend, quality and security preparation; platform G1; commerce/providers/frontend feature implementation; independent quality/security then repairs. Lead owns root manifests, lockfile and shared contracts. No recursive agents.

Primary sources: https://learn.chatgpt.com/docs/build-skills ; https://learn.chatgpt.com/docs/agent-configuration/subagents ; https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated .

## Additional setup requested before M2 continuation — 27 October 2026

Source request: C:/Users/USER/Downloads/Lerna_Cursor_Skills_Setup_Prompt.md. It describes Lerna/Cursor; the direct request was to install its skills in this ongoing GOOBER task. GOOBER branch/stack and all existing M2 edits were preserved; no Lerna project, stabilization branch, AI model, Supabase service or application dependency was introduced. M2 implementation was paused during this setup. Installer and skill-creator instructions/scripts were read first.

### Installed/reused inventory

| Actual name | Maintainer/source and pinned revision | Installation / activation | Verified status and limits |
| --- | --- | --- | --- |
| graphify (local adapter) | [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), dac063456bc1f5d92354ec3936fd9dd1513a83f3; runtime graphifyy0.9.96, Apache-2.0 with retained LICENSE/NOTICE and MIT attribution | .agents/skills/graphify; cross-module architecture/impact only when a bounded code-only graph helps | 13 skill/resource/license files; pinned isolated Python3.14 Windows venv .local/skill-tools/graphify; 31 base wheels, no optional extras; pip check passed; CLI version, help, two-module extraction and query passed with network connections denied |
| vercel-react-best-practices1.0.0 | [Vercel Engineering](https://github.com/vercel-labs/agent-skills/tree/6ec269328bc400712ee225a173a14b6b29128df7/skills/react-best-practices); MIT declared in upstream SKILL frontmatter | .agents/skills/vercel-react-best-practices; React/Next rendering/data/performance work | Supported skill-installer at exact revision; complete76-file folder, no executable scripts/hooks; validation passed. Runtime/library suggestions remain advisory, not installation authority. |
| supabase-postgres-best-practices1.1.1 | [Supabase](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices); MIT | .agents/skills/supabase-postgres-best-practices; actual PostgreSQL query/schema/locking/privilege tasks | Supported skill-installer at exact revision; complete36-file folder plus upstream LICENSE; validation passed. PostgreSQL-anywhere guidance only; no Supabase auth/storage conversion, live introspection or SQL changes. |
| playwright, security-best-practices, security-threat-model | Existing pinned official OpenAI installations, provenance above | Existing project folders reused for browser and requested security work | No duplicate copies or package changes. |
| goober-financial-invariants, goober-provider-recovery | Existing owner-derived instruction-only workflows | Existing project folders reused for exact money, persistence, callbacks and recovery | Higher-specificity GOOBER constraints govern generic database/framework suggestions. |
| ui-ux-pro-max, web-design-guidelines | Existing user-level installations, provenance above | Existing ~/.agents/skills copies reused, no global changes | Verified current Cursor documentation includes user .agents paths; no redundant project copies. |

### Graphify source review and adaptation

Assumed requested 'grapify' means the supplied Graphify-Labs project. Verified PyPI name is **graphifyy**, executable **graphify**, not another similarly named package. Exact PyPI wheel SHA256: bbef4c79b5905f45e384a7ca49417cd6c131d4774f280037159dd6cf4c425e29. Reviewed __main__.py/install.py/cli.py match the downloaded wheel byte-for-byte; wheel digest matches PyPI JSON. All31 downloaded wheels were inspected for metadata/licenses/entry points and .pth files (none). Base dependencies are NetworkX, NumPy, RapidFuzz, PyYAML, Tree-sitter and language grammars; optional LLM/cloud/database/watch/visualization extras were not installed. Pip installed reviewed wheels offline using standard hash-checked requirements.

The stock installer can add always-on rules, edit AGENTS.md, register hooks, and refresh other editor integrations. It was not run. Original skill includes automatic/global install fallback instructions, including break-system-packages; these are explicitly excluded by the local adapter. The adapter follows skill-creator guidance, retains the original Codex skill and all eight upstream reference files, and narrows activation/commands. No global config, hooks, timers, watcher, MCP, cloud service or paid extraction was enabled. GRAPHIFY_NO_AUTO_REFRESH=1 and GRAPHIFY_BACKEND=none are verified upstream settings; actual AST-only CLI uses **--code-only**, not an invented no-LLM flag.

Smoke test indexed only .local/skills-review-20261027/fixture/math.ts and main.ts: 4 nodes/5 EXTRACTED relationships, including imports and calculate-to-twice call. A Python audit hook rejected any socket.connect; extraction/query succeeded under that guard. Important graph conclusions must still be checked against source/migrations. **No GOOBER project indexing was performed.**

Recreate the isolated runtime on Windows/Python3.14:

```powershell
python -m venv .local/skill-tools/graphify
.local/skill-tools/graphify/Scripts/python.exe -m pip install --only-binary=:all: --require-hashes -r docs/skills/graphify-requirements-windows-py314.txt
.local/skill-tools/graphify/Scripts/python.exe -m pip check
$env:GRAPHIFY_NO_AUTO_REFRESH='1'
$env:GRAPHIFY_BACKEND='none'
.local/skill-tools/graphify/Scripts/graphify.exe --version
```

The requirements file is standard pip hash syntax generated from actual reviewed wheels, not an invented tool lockfile. Other platforms/Python versions need a separately reviewed compatible wheel set. No application manifest/lockfile or global Python packages changed.

### Blocked / skipped / documentation coverage

- **Apple community candidate not installed:** bowen31337/apple-design at c95fa1324ca371d7a8df9564ce8a03ff4bed5465 has root SKILL.md, seven referenced MD resources and two CSS assets, but no LICENSE/NOTICE/COPYING or explicit license grant (repository license:null). Independent source review also found broad token-import instructions, incomplete dialog focus handling and unguarded demo motion. It is not Apple-authored. Needed to reconsider: explicit suitable licensing/permission or a verified licensed alternative. No Apple fonts/assets were downloaded.
- [Official Apple HIG](https://developer.apple.com/design/human-interface-guidelines/) and [motion](https://developer.apple.com/design/human-interface-guidelines/motion) are **documentation references**, not installed skills. Use for hierarchy, readable spacing and purposeful/reduced motion while retaining GOOBER identity; no animation library is required by setup.
- Current official Next skill next-dev-loop reviewed at cc0cdc8bd93f946177b8d34cb23790b2b01934cd: requires Turbopack and agent-browser>=0.31.1 and instructs missing-runtime upgrades. GOOBER uses supported webpack plus Playwright, so it was **not installed/applied**. React/Next practice skill plus installed Next16.4.2 docs cover the actual framework; no canary APIs or global agent-browser install. Other canary cache/prefetch adoption skills are outside this task.
- Debugging uses existing domain workflows and M2's reproduce/root-cause/regression requirements; no generic wrapper skill was invented. Privacy/observability reference: [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), combined with existing security/domain skills. General accessibility reference: [W3C WAI](https://www.w3.org/WAI/). These links are not installations. AI/retrieval/Gemini/Supabase-specific product integration is not part of GOOBER's verified stack and was skipped.

### Routing, discovery and maintenance

Installed Cursor version:3.24.18 (CLI be4c9e5350d77747b42cd467cbd3370a753d4640, x64). Current [Cursor skills](https://cursor.com/docs/skills) and [project rules](https://cursor.com/docs/rules) documentation verified .agents/skills, YAML name/description and .cursor/rules/*.mdc with alwaysApply. New skills match folder names; all3 pass bundled quick_validate; local relative references and complete folders checked. .cursor/rules/goober-skill-routing.mdc is a short task-selection map; existing rules were absent and no settings were overwritten. AGENTS.md gets only an appended routing pointer; no wholesale upstream instructions injected.

Cursor UI discovery is **not yet verified**: the installed Cursor Agents window was found, but accessibility text was empty, window capture timed out and the refreshed window-list helper timed out. No project was opened/uploaded and no Cursor chat sent. Reopen/reload GOOBER in Cursor and check Customize > Skills; Codex refreshes its available-skill catalog on the next turn. File/format validation is not reported as actual UI discovery.

Update only at a concrete review/advisory: inspect upstream diff/license/scripts, choose a new exact revision/version, regenerate compatible hashes and repeat small smoke tests. Uninstall only the three named new skill folders, their routing entries, the dedicated ignored venv and this setup's requirements/evidence when no longer needed; preserve all existing skills and user work. No automatic updater or schedule exists.

Independent Graphify forward-test also passed in a separate ignored output directory:2synthetic modules,4nodes/5EXTRACTED edges, zero model input/output tokens; query import/call relationships matched source. The local adapter now clarifies top-level help, --out parent semantics, raw edges versus links, and bounded optional feedback paths. No full application suite was run merely for skill installation. Static instruction demonstrations read the installed React server-action/derived-state rules and PostgreSQL privilege/consistent-lock-order references; these identify positive/negative review controls, not actual app or SQL tests.

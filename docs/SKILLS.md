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

# GOOBER product interface

Status: implemented against frozen M1 DTOs after lead confirmed G0/G1. Web TypeScript and scoped ESLint passed; browser evidence remains assigned to integrated verification.

## Direction

Build a compact, calm commerce workspace: warm white canvas (`#f8f7f3`), navy text (`#162b36`), green primary action (`#155d43`), white surfaces and visible gray-green borders. Use local system sans-serif fonts so the local build needs no font CDN. Headings use tight, balanced lines; numeric values use tabular figures. Body text starts at 16px with 1.5 line height. The green is a deliberate GOOBER brand choice informed by the minimal, high-contrast search result rather than a claim that the skill prescribed this exact palette.

Desktop uses a bounded 1200px content region, straightforward horizontal navigation and a two-column checkout/account area. At 390px everything becomes a single column; navigation wraps with 44px targets, and tables become bounded cards or scrollable labeled regions. No fixed overlay hides focused controls. Prefer semantic text and a simple lettermark over decorative imagery or fake brand logos. Do not add invented metrics, uptime, stock promises or warranties.

## Journey and content

- Store: explicit fixture-mode notice, category/search controls, actual approved products, clear NGN retail price, product entitlement and delivery terms. Detail links use stable product IDs.
- Account: library-managed registration/sign-in/sign-out, visible labels, password-manager autocomplete and paste support. Never store sessions or passwords in browser storage.
- Balance: persisted available/reserved NGN and ledger history. Funding is labeled isolated test credit; a server-created intent and verified test event drive credit, never an optimistic client balance.
- Checkout: request a server quote; display accepted price, expiry, quantity one, entitlement and terms. Accept via one request and stable idempotency key; disable only while pending. An expired quote offers a fresh quote action.
- Orders: display independent fulfillment and funds states. Pending/queued/review are truthful states with refresh and order-linked support. No delivery values enter list data.
- Secure delivery: explicit reveal POST, fresh-session guidance, no-store result kept only in component memory, a clear hide control, and no analytics/logging/storage of payloads. Never fetch or automatically open supplier links.
- Support: bounded text and owned-order association, persisted confirmation and request history. Tell customers to omit credentials.
- Operations: same persisted orders, pending reviews, audit context, approval catalog records and support requests. Only show links for current role; the API still enforces every permission. Mutations require reason/version/unique operation ID from the frozen contract.

## Accessibility and feedback

Use a skip link, landmarks, ordered headings, links for navigation, buttons for actions and visible focus outlines. Every field has a label/name/autocomplete and nearby helper/error text. Errors announce through a polite status region; error summaries receive focus after failed submission. Statuses include text, not just color. Give each pending action a specific label. Keep input drafts through recoverable errors. Respect reduced motion; only short color/opacity transitions, no looping motion. Currency uses exact minor-unit string formatting without converting a large BigInt to Number. Dates use Intl with explicit local zone where shown.

## Skills and preparation evidence

Read root AGENTS.md and adopted brief Parts A/B/C. Read full installed UI skill and web review skill before coding, plus UI quick-reference sections 1–3 and pro-rules scope/checklist.

| Skill | Source | SHA256 | Applied |
| --- | --- | --- | --- |
| ui-ux-pro-max | `C:/Users/USER/.agents/skills/ui-ux-pro-max/SKILL.md` | `88AADD21220542083A455E373BD162FFE7843266A71F06F4D837BB3B34F9C9C7` | Minimal high-contrast direction, responsive navigation/forms and final review |
| web-design-guidelines | `C:/Users/USER/.agents/skills/web-design-guidelines/SKILL.md` | `F4647CA866A3ACCF763777F83E7682954F0187CD6BEA7EEA0399796652414E8F` | Semantics, input behavior, focus, no-store and responsive audit |

Executed with local Python 3.14:

```powershell
python C:\Users\USER\.agents\skills\ui-ux-pro-max\scripts\search.py 'digital subscriptions storefront trust' --design-system -p GOOBER
python C:\Users\USER\.agents\skills\ui-ux-pro-max\scripts\search.py 'accessible commerce forms sessions' --stack nextjs
```

The design search returned Minimalism & Swiss Style, high contrast and clear typography. The explicit Next.js stack search returned environment and data-fetching advice; its generic server-action suggestion is superseded by GOOBER's Nest-owned commerce boundary. Fresh review rules fetched 15 October 2026 from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`; fetch again for implementation review.

## Implementation acceptance

Prove the real registration → catalog → funding → quote → asynchronous order → reveal → support → operations journey against persisted local records. Browser checks must include keyboard navigation and a 390px viewport, plus no horizontal page overflow, labels, loading/error/empty states and reduced-motion behavior. Report observed evidence and exact blockers separately; design preparation is not a browser pass.

## Implemented route handoff (16 October 2026)

Store `/`, product `/products/[id]`, Better Auth `/sign-in`, account `/account`, purchasing balance `/wallet`, order list/detail `/orders` and `/orders/[id]`, order-linked `/support`, and privileged `/operations` now call real local APIs. No mock success data or counters. Search/category state is URL reflected. Wallet and fulfillment use bounded polling of persisted records. Delivery uses the protected POST only, remains in component memory, and hides after 60 seconds or hidden tab.

Commands executed: `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` and `node node_modules/eslint/bin/eslint.js apps/web/app apps/web/components --no-warn-ignored`; both exited 0 before final polish and repeated after account/filter/error-focus updates. The Next server was unavailable during the frontend handoff, so no browser pass is claimed here. Lead/QA must rebuild integrated routes and run the browser journey and 390px keyboard/overflow checks.

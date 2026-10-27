# GOOBER product system — M2

The running M1 storefront was inspected through the product auditor's real 390px screenshot before implementation. The catalog started around 1170px because the introduction repeated its promise in a second large panel. Existing assets are the `g.` wordmark, forest green, navy ink and warm canvas. These remain the brand foundation.

M2 uses an editorial shop with Georgia display headings and system sans-serif controls. Fonts are installed system fallbacks, with no external requests or package additions. The shop introduction is compact; product discovery comes before the explanatory steps. Account and operations pages use compact sans-serif headings to make room for actual records.

- Tokens: canvas `#f8f7f3`, white surface, ink `#162b36`, forest action `#155d43`, muted `#55656b`, pale forest surfaces and high contrast control borders. Statuses have text as well as color.
- Type: 16px body; 12–14px supporting metadata; 24–32px section headings; restrained 36–58px shop display. Money uses tabular figures and existing exact formatting.
- Layout: 1200px readable maximum, 20/32px responsive gutters, 4/8px spacing rhythm. Two product columns on desktop, one on mobile. Account panels stack below 768px. Operations has an anchor index rather than hidden tabs.
- Controls: minimum 44px interactive height, visible 3px focus rings, specific pending labels, semantic labels, disabled SSR mutation controls until hydration, POST fallbacks retained.
- Feedback: passive request failures announce without taking focus; errors never imply that account access fixes a network problem. Empty states require a successful empty response. Recoverable next-page failures retain loaded records; authorization loss clears private records and pending work.
- Motion: only short color transitions; reduced motion removes these. No autoplay, ornamental loops, remote media, invented metrics or simulated success.

Core action names and API routes remain stable. Delivery reveal remains explicit and transient, cleared on order identity/session changes and hidden tabs. Fixture and live-disabled explanations stay visible and truthful.

Instructions read: repository AGENTS, installed Next server/client and navigation/TypeScript guides, UI UX Pro Max SKILL/pro-rules/quick-reference, fresh official Vercel Web Interface Guidelines, repository Playwright and Next security guidance. The skill's generic indigo palette and large marketing hero were rejected because they did not match the existing brand or observed catalog discovery problem. Browser acceptance is owned by the QA role; this design note does not claim an unrun check.

Additional React practice references read before resuming: server-auth-actions, derived-state-no-effect, move-effect-to-event, narrow effect dependencies and client event listeners. Existing server authorization remains authoritative; request generations and abort controllers prevent stale results, and page data derives from its current source identity. No SWR dependency or caching change was introduced.

# M2 product and defect evidence

Status: baseline audit in progress. Source facts and candidates are not claimed as runtime-confirmed defects.

| ID | Route / observation | Evidence so far | Status / regression |
| --- | --- | --- | --- |
| M2-001 | Browser launch uses missing per-user Chrome path while system Chrome exists | Auditor launched pinned Playwright against system Chrome155.0.8059.85 successfully | QA reproducing/configuring discovery; retain Linux and explicit channel behavior |
| M2-002 | Header only resolves session once; sign-in updates form state | Source site-header/auth-form | Runtime reproduction pending; check SPA auth without reload |
| M2-003 | Resource hook may accept stale prior-path response | Shared active ref reactivated for newer path; independently noted by QA/security | Runtime/focused reproduction pending; generation/abort guard and reveal-identity clearing |
| M2-004 | Wallet history failure renders empty-history text | Source wallet.tsx | Check actual unavailable state; distinguish errors from empty |
| M2-005 | ErrorNotice always links Account access | Source shared.tsx | Contextual auth-only recovery; real non-auth failure regression |
| M2-006 | Orders/wallet/support discard nextCursor | Source response handling | Older persisted records must be reachable using existing API pagination |
| M2-007 | Auto order updates lack polite status announcement; navigation lacks aria-current | Source order-detail/site-header | Accessibility implementation with browser assertions |
| M2-008 | Preserved fixture product observations may age beyond quote freshness bound | Catalog source versus assertProduct24h bound | Check real DB after normal seed; never relax quote freshness |

Design facts: no reusable logo/image assets; existing g. wordmark and forest/navy/warm-white palette. Baseline historical screenshots are not current runtime evidence. Compact editorial storefront and denser operations use actual records, clear statuses, consistent controls and restrained motion.

## Fresh baseline and independent review

Actual Chrome155.0.8059.85 captured storefront at360/390/768/1280 plus signed-out signin/wallet/orders/support/operations390. Artifacts: .local/m2/product-audit. No overflow observed; this does not establish authenticated-state accessibility. Confirmed runtime observations: passive catalog error steals focus/scroll403px at1280, catalog error adds unrelated Account access; wallet401 still displayed dash balance/falseempty history/enabled composer; support401 displayed enabled composer; catalog begins~1170px at390; signin email starts~800px. Source root causes: unconditional ErrorNotice focus/auth link, independent error/empty/form branches, oversized stacked introduction. Implemented corrections await current-source browser checks.

Independent changed-source findings SEC-M2-001/P2 (pagination401/403 retains cached private records) and SEC-M2-002/P2 (MoreRecords defaults to submit inside related-order support form) were assigned to frontend. Fixes invalidate/cancel private resources on authorization loss, retain public catalog browsing, and set pagination type=button. Three real persisted regressions are authored: valid unsent draft+cursorGET with zeroPOST;41encrypted support records then sessionrevocation/401 clearing; held actual delivery response released after same-page401 must remain hidden. Actual runtime results pending; no source-only assertion is called a completed browser reproduction.

No backend defect currently justifies changing commerce/provider semantics. Normal seed refreshes fixture observations while preserving publication choices. No quote freshness safeguard was relaxed.

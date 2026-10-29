# M2 product and defect evidence

Status: local implementation and final regression complete; final closure below. Source facts and candidates are not claimed as runtime-confirmed defects.

| ID | Route / observation | Evidence so far | Status / regression |
| --- | --- | --- | --- |
| M2-001 | Browser launch uses missing per-user Chrome path while system Chrome exists | Auditor launched pinned Playwright against system Chrome155.0.8059.85 successfully | Fixed Chrome discovery; final13browser checks passed with system Chrome; Linux/explicit channel behavior retained |
| M2-002 | Header only resolves session once; sign-in updates form state | Source site-header/auth-form | Implemented session refresh; immediate SPA header assertions passed in authenticated journeys |
| M2-003 | Resource hook may accept stale prior-path response | Shared active ref reactivated for newer path; independently noted by QA/security | Generation/abort and identity guards implemented; held real delivery after same-page401 stayed hidden. Other path-race variants source-reviewed |
| M2-004 | Wallet history failure renders empty-history text | Source wallet.tsx | Confirmed signed-out baseline; corrected gating/error states passed four-width401 checks |
| M2-005 | ErrorNotice always links Account access | Source shared.tsx | Baseline runtime confirmed unrelated auth link and passive focus jump; contextual recovery/focus fix implemented and browser checked |
| M2-006 | Orders/wallet/support discard nextCursor | Source response handling | Cursor navigation implemented; real21order/41support record regressions passed |
| M2-007 | Auto order updates lack polite status announcement; navigation lacks aria-current | Source order-detail/site-header | Current navigation and polite status implemented; scoped browser accessibility checks passed |
| M2-008 | Preserved fixture product observations may age beyond quote freshness bound | Catalog source versus assertProduct24h bound | Candidate resolved by normal fixture seed; quote journey passed. No backend defect or freshness relaxation |

Design facts: no reusable logo/image assets; existing g. wordmark and forest/navy/warm-white palette. Baseline historical screenshots are not current runtime evidence. Compact editorial storefront and denser operations use actual records, clear statuses, consistent controls and restrained motion.

## Fresh baseline and independent review

Actual Chrome155.0.8059.85 captured storefront at360/390/768/1280 plus signed-out signin/wallet/orders/support/operations390. Artifacts: .local/m2/product-audit. No overflow observed; this does not establish authenticated-state accessibility. Confirmed runtime observations: passive catalog error steals focus/scroll403px at1280, catalog error adds unrelated Account access; wallet401 still displayed dash balance/falseempty history/enabled composer; support401 displayed enabled composer; catalog begins~1170px at390; signin email starts~800px. Source root causes: unconditional ErrorNotice focus/auth link, independent error/empty/form branches, oversized stacked introduction. Implemented corrections passed the final current-source browser checks.

Independent changed-source findings SEC-M2-001/P2 (pagination401/403 retains cached private records) and SEC-M2-002/P2 (MoreRecords defaults to submit inside related-order support form) were assigned to frontend. Fixes invalidate/cancel private resources on authorization loss, retain public catalog browsing, and set pagination type=button. Three real persisted regressions are authored: valid unsent draft+cursorGET with zeroPOST;41encrypted support records then sessionrevocation/401 clearing; held actual delivery response released after same-page401 must remain hidden. All three real persisted regressions passed in final run21d1f7e945f0. Pagination403 branch remains source-reviewed; focused runtime uses401.

No backend defect currently justifies changing commerce/provider semantics. Normal seed refreshes fixture observations while preserving publication choices. No quote freshness safeguard was relaxed.

Additional confirmed defects: streamed401 cancellation could emit a stale session-expired event; actual loopback HTTP regression failed1/1 before the post-body abort guard and passed1/1 after. Price glyph was three mojibake characters (U00E2/U201A/U00A6), confirmed in source and real screenshot; four explicit zero/positive/large-BigInt/negative formatting tests failed before correcting only the prefix to escaped U20A6. Arithmetic and wire contracts are unchanged. Exact storefront glyph assertions now run at four widths.

First integrated attempt d831c1357de8 passed optimized build,43controlled PG/Redis,6HTTP and7/13browser checks. Six new browser failures were test assumptions: Next route-announcer made alert locators ambiguous, successful reveal HTTPstatus is201, and wrapped select-label text defeated exact getByLabel despite correct accessible combobox name. Tests now use main-scoped notices, actual201 and semanticcombobox locators without weakening behavior assertions. Restore was not reached. A later roottypecheck caught the new helpertest missing .ts importextension; fixed before finalrun. Earlier outer PowerShell wrapper returned0 despite innerNode1; evidence treats that attempt as FAILED, and final wrapper explicitly forwards every native failure status.

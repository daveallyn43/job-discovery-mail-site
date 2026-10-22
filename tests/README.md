# Review Desk checks

Run from this repository: `node --test tests/*.test.mjs`.
All auth values and requests in these tests are synthetic. Tests do not connect to Supabase or read browser sessions.

The site is published from main at repository root by the existing GitHub Pages configuration. Review code is in `review/`.

- `adapter.test.mjs`: existing access, pagination, feedback, and sign-in regressions.
- `session.test.mjs`: explicit opt-in, new-instance restoration, expiry and rotating refresh tokens, cross-tab serialization, logout, unavailable storage and rejected refresh responses.
- `sources.test.mjs`: multiple discovery channels, separation of official-description enrichment, and exclusion of private fields.

Remember this device stores the access/refresh pair only after explicit opt-in in this browser. Renewal uses Supabase Auth's refresh-token endpoint and replaces both tokens. Web Locks serialize refresh/logout across tabs. Unsupported or storage-blocked browsers must use unchecked sign-in. Sign-out clears the session and preference locally and requests server revocation. Jobs and comments are not persisted in browser storage. Existing owner-only RLS and column grants are unchanged.

Discovered via shows all recorded discovery channels, not necessarily chronological first source. Official match sightings appear separately as description evidence. No sender is inferred from a LinkedIn destination URL.

Verification limit: synthetic tests and public asset checks do not establish authenticated browser reload behavior. The earlier October 13 refresh check used the in-app Refresh button; it did not test page reload persistence. Live authenticated reload, multi-tab and logout checks remain to be done when supported browser controls are available.

## Scroll layout check (October 22)

`scroll.test.mjs` runs the actual render functions against a minimal synthetic DOM with 360 jobs. It checks list position on distant selection, detail reset for a different job, retained scroll on same-job rerenders, and unsaved draft retention across filtering. It does not calculate CSS layout.

Desktop uses two independently scrolling panes; below 801px the existing stacked layout remains, with a list capped at 330px or 40% of the viewport. The detail pane is keyboard-focusable and named. No auth, source filtering, network or feedback API logic changed.

44 tests pass. Visual QA completed in a separate native Chrome window with 360 synthetic jobs and long descriptions at 1200×800, 390×844, and the 800×600 breakpoint. Desktop list scrolling reached 3366px; selecting role 028 retained that position and reset details to 0. Keyboard Tab/Enter selected the next role with focus retained; Page Down scrolled details 518px without moving the list. At phone width, list scrolling reached 1655px and selecting role 014 preserved it; description remained reachable through normal page scrolling. Document width equaled viewport width (390px and 800px), with no horizontal overflow. Search reduced the queue to role 359 and updated the selection. No feedback was saved.

QA used a localhost-only wrapper with fixed-size frames and a synthetic read-only API (POST rejected). The temporary server omitted only the top-level framing guard from the served test copy so viewport frames could exercise the real renderer/CSS; the repository's production guard is unchanged. This verifies responsive Chromium layout, not physical iOS Safari behavior. The browser check uncovered lost focus when rebuilding selected buttons; selection now restores focus with preventScroll and the rendering test checks it.

The user confirmed authenticated refresh keeps them signed in on October 22. This is user-verified reload persistence, not an expiry or logout test.

## Company directory preparation (October 22)

`companies.test.mjs` and `company-panel.test.mjs` add 12 synthetic checks: unavailable versus successfully empty feeds, exact linked-job filtering with unmatched email leads retained in All companies, bounded composite-key pagination, malformed/orphan data, missing migration/403 independent from job access, 401 invalidation, request validation and no enrollment mutation, concurrent UUID conflicts, immutable double submits, lost-response retries, and panel state after refresh failures. The full suite contains 56 tests.

The optional directory reads `companies`, `company_jobs`, and `company_requests` separately from the existing job loader. A company filter intersects existing job filters and never links jobs by name. Request inserts contain only client UUID, company name, and HTTPS source URL; created_at is server generated. Recording a request cannot enable collection. Request fields remain available for retry after an uncertain response, using the same UUID and payload.

Requires the separately reviewed company-registry migration: owner-only SELECT on all three surfaces and INSERT(id,name,source_url) on company_requests. No permissions are added by this site change. No company records are fabricated when the migration is absent. Nilo remains enabled but visibly unavailable with unknown openings; a successful empty feed is explicitly different.

New company-panel visual browser QA and live RLS integration verification remain pending. These tests use a minimal DOM and mocked HTTP only; they make no live requests, save no feedback, and do not establish rendered responsive geometry. The existing tested Jobs pane layout is retained.

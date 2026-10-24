# admin-dashboard Specification

## Purpose

Gives operators a read-only data dashboard served by the same Java API that the mini program uses, without exposing database credentials, without touching the mini program session path, and without entering the assistant's capability catalog. The dashboard answers questions that today require SSH + hand-written SQL: how many users registered, how many actually joined a family, which families are real, how the ledger is growing.

## ADDED Requirements

### Requirement: Isolated dashboard authentication

The dashboard endpoints under `/admin/api/**` MUST authenticate with a dedicated Bearer token read from `ADMIN_DASHBOARD_TOKEN`, and MUST NOT accept or consult the mini program session token (`X-HS-Token`). When the token is not configured, every dashboard request MUST be refused (503) rather than allowed. A missing or wrong token MUST return 401. The token MUST be compared in constant time and MUST NOT be accepted from a query parameter.

#### Scenario: Token not configured
- **WHEN** `ADMIN_DASHBOARD_TOKEN` is empty and a client calls `/admin/api/overview`
- **THEN** the response is 503 `DASHBOARD_DISABLED` and no data is returned

#### Scenario: Wrong token
- **WHEN** a client sends `Authorization: Bearer <wrong>` to `/admin/api/overview`
- **THEN** the response is 401 and no data is returned

#### Scenario: Mini program token is not accepted
- **WHEN** a client sends a valid mini program `X-HS-Token` but no Bearer token
- **THEN** the dashboard refuses the request

### Requirement: Read-only aggregate overview

The system MUST expose a single read-only endpoint that returns, in one response: overall counts (users, users with a family, users without a family, 7-day active users, families, items, multi-family users, items expiring within 7 days, items with an expiry subscription), a family health breakdown (active / silent / empty), the family list with member/item counts, creation time, last activity time and a status, and a 30-day daily series. The endpoint MUST perform only `SELECT` statements and MUST NOT write to any table, append activities, or run a migration.

Metrics that cannot inform an action MUST NOT be included: cumulative activity row counts, raw image counts, and per-space item distribution are explicitly out of scope.

#### Scenario: Overview reflects current data
- **WHEN** an authorized client requests the overview
- **THEN** the totals match the corresponding table row counts and no table is modified

#### Scenario: No openid exposure
- **WHEN** the overview is returned
- **THEN** the payload contains no `openid` values and family identifiers are truncated

### Requirement: Family health classification

Every family MUST be classified into exactly one bucket, using the same 7-day window: `active` (has items and a ledger activity within 7 days), `silent` (has items but no activity in 7 days, or no activity ever), `empty` (zero items). The three bucket counts MUST sum to the family total, and the family list MUST carry the same classification as the aggregate.

#### Scenario: Buckets sum to total
- **WHEN** the health breakdown is returned
- **THEN** active + silent + empty equals the family count

#### Scenario: Empty family wins over recency
- **WHEN** a family has zero items but recent activity rows
- **THEN** it is classified as empty, not active

### Requirement: Honest metric definitions

Metrics MUST be computed from columns that actually exist. Because `users` has no `created_at`, the system MUST NOT report a "daily new registrations" series; the daily series MUST use `memberships.joined_at`, `items.created_at`, and `activities.created_at`. The third daily series MUST be distinct active actors (`activities.actor_openid`), not raw activity row counts, and the UI MUST state that it excludes users who only opened the mini program. `item_expire_subs` counts (person × item) MAY exceed the item total, so it MUST be reported as an absolute count and MUST NOT be rendered as a percentage of items. The response MUST carry a short human-readable note describing these constraints.

#### Scenario: Trend omits registration series
- **WHEN** the trend data is returned
- **THEN** it contains new items, new members, and distinct active users per day, and no registration series

#### Scenario: Subscription count not turned into a ratio
- **WHEN** the overview is returned
- **THEN** the expire-subscription value is an absolute number, not a percentage of items

### Requirement: Static dashboard page

The system MUST serve a single-file dashboard page at `/admin/` that renders the overview without any external CDN, build step, or package dependency. The page MUST prompt for the token on first use, persist it in browser storage, and re-prompt when the API returns 401 or 503. User-supplied values such as family names MUST be escaped before insertion into the DOM.

#### Scenario: First visit without token
- **WHEN** the page is opened with no stored token
- **THEN** a token prompt is shown and no data request is made

#### Scenario: Family name with markup
- **WHEN** a family name contains HTML metacharacters
- **THEN** the page renders it as literal text

### Requirement: No impact on existing surfaces

The dashboard MUST NOT modify any `/api/**` route, the mini program session filter, the assistant capability catalog, Flyway migrations, or table structure. Dashboard routes MUST NOT be reachable as an assistant capability.

#### Scenario: Assistant catalog unchanged
- **WHEN** the assistant capability catalog is loaded
- **THEN** it contains no dashboard action and its version is unchanged

#### Scenario: Mini program paths unaffected
- **WHEN** the mini program calls any existing `/api/{module}/{action}`
- **THEN** authentication and behavior are identical to before this change

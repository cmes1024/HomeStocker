# cloud-read-cache Specification

## Purpose

Cuts repeat domain reads during a short session window by caching at the call layer, without teaching each page about cache keys or invalidation. After the Java backend migration, the primary goal is snappy navigation—not CloudBase call quotas—so entries use short TTLs.

## Requirements

### Requirement: Cache lives only in the cloud call layer
Page code MUST keep calling the existing domain helpers (`callItem`, `callFamily`, `callSpace`, and equivalents). The cache MUST sit in the shared cloud-call utility (`utils/cloud.js` + `utils/queryCache.js`). Pages MUST NOT inspect hit/miss or persist domain-read cache to `wx.storage`. The family page MAY call `load` on every `onShow`; that still goes through `callFamily` and MAY hit L1 within TTL.

#### Scenario: Second identical read within TTL does not go to the network
- **WHEN** a page requests the same cached read twice within the entry TTL with no intervening write and no return-from-background invalidation
- **THEN** the second call returns the cached result without another Java HTTP request

### Requirement: Short TTL by domain
Cached reads MUST expire. Item-domain reads (`item.*` reads, `activity.list`, `bootstrap.home`, and space reads that embed items: `listItemsBySpace`, `listPockets`, `detail`) MUST use a TTL of 15 seconds. Structure/family-domain reads (`family.*` reads, `space.list`, `space.listLocations`, `tag.list` / `ensureDefaults`) MUST use a TTL of 45 seconds. Expired entries MUST be treated as a miss and removed.

#### Scenario: Foreground stay past item TTL
- **WHEN** the member stays in the foreground longer than 15 seconds and then requests an item-domain read again with no write and no background return
- **THEN** the call is not served from the expired cache and goes to the network

### Requirement: Writes invalidate related reads
Successful item writes MUST invalidate item and activity reads (and space-item lists / bootstrap). Successful space or tag writes MUST invalidate that domain's reads. Switching or leaving a family MUST clear the whole table. Unregistered writes MUST clear the whole table rather than risk stale data.

#### Scenario: Create item then reopen ledger
- **WHEN** a member creates an item and returns to the ledger
- **THEN** the next item list read is not served from the pre-create cache

### Requirement: Return-from-background uses an activity cursor
When the app returns from background, the first item-domain read MUST probe `activity.cursor` once per process (bootstrap.home MAY drop item-domain caches instead of a separate cursor round-trip). If the latest activity id/time is unchanged, item caches MAY be kept (still subject to TTL). If it changed, item-domain caches MUST be invalidated. Cursor itself MUST NOT be cached as a list result.

#### Scenario: Background return with no item changes
- **WHEN** the member leaves WeChat and comes back and no family item activity occurred
- **THEN** at most one cursor call is made and unexpired cached item reads may still hit

### Requirement: No family id means no cache
Reads made before the session has a current family MUST go to the network and MUST NOT be stored under an empty family key.

#### Scenario: Onboarding reads
- **WHEN** a user with no current family triggers a family read
- **THEN** the result is not stored in the session cache table

### Requirement: Space and tag renames by others are best-effort
Activity cursor MUST NOT be required to detect space/tag/family-meta changes that do not write activities. Freshness for those reads relies on write invalidation on this device and structure-domain TTL. Real-time push is out of scope.

#### Scenario: Another member renames a space while this device stays foreground
- **WHEN** another member renames a space and this device does not write and does not return from background
- **THEN** this device MAY keep showing the old name until the structure-domain TTL expires or a related local write invalidates space reads

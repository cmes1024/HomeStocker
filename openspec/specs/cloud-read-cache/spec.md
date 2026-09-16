# cloud-read-cache Specification

## Purpose

Cuts repeat cloud-function reads during a session by caching at the call layer, without teaching each page about cache keys or invalidation.

## Requirements

### Requirement: Cache lives only in the cloud call layer
Page code MUST keep calling the existing domain helpers (`callItem`, `callFamily`, `callSpace`, and equivalents). The cache MUST sit in the shared cloud-call utility. Pages MUST NOT call invalidate, inspect hit/miss, or persist cache to `wx.storage`.

#### Scenario: Second identical read does not go to the cloud
- **WHEN** a page requests the same cached read twice in one session with no intervening write and no return-from-background revalidation
- **THEN** the second call returns the cached result without another `wx.cloud.callFunction`

### Requirement: Writes invalidate related reads
Successful item writes MUST invalidate item and activity reads (and space-item lists). Successful space or tag writes MUST invalidate that domain's reads. Switching or leaving a family MUST clear the whole table. Unregistered writes MUST clear the whole table rather than risk stale data.

#### Scenario: Create item then reopen ledger
- **WHEN** a member creates an item and returns to the ledger
- **THEN** the next item list read is not served from the pre-create cache

### Requirement: Return-from-background uses an activity cursor
When the app returns from background, the first item-domain read MUST probe `activity.cursor` once per process. If the latest activity id/time is unchanged, item caches MAY be kept. If it changed, item-domain caches MUST be invalidated. Cursor itself MUST NOT be cached as a list result.

#### Scenario: Background return with no item changes
- **WHEN** the member leaves WeChat and comes back and no family item activity occurred
- **THEN** at most one cursor call is made and cached item reads may still hit

### Requirement: No family id means no cache
Reads made before the session has a current family MUST go to the cloud and MUST NOT be stored under an empty family key.

#### Scenario: Onboarding reads
- **WHEN** a user with no current family triggers a family read
- **THEN** the result is not stored in the session cache table

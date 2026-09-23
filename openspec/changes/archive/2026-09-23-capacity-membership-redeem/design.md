## Context

See proposal.md — Why. Narrative plan: `docs/plans/2026-09-21-capacity-membership-redeem/`. Existing ledger writes go through `item`; family create/join go through `family`. Old AI-redeem change must not be implemented as-is.

## Goals / Non-Goals

**Goals:**

- Config-driven plans/products; redeem binds capacity to `familyId`
- Free defaults: 1 family / 2 members / 50 items; paid plan all unlimited (`null`)
- Gate create/join/item-create paths only; keep entitlement reads cheap
- Family page shows status without polling
- Admin issue codes for closed beta

**Non-Goals:**

- Payment, AI hard gates, space/tag/theme/media limits
- Per-list entitlement checks
- Forced delete / kick when over limit after expiry

## Decisions

### 1. Sell household capacity (homes + seats + items), not AI

**Choice:** Gate `item.create` / `createMany`, `family.create`, and `family.join`; leave `ai.extract` / `act` ungated by subscription.

**Why:** BYOK externalizes model cost; CloudBase scales with household graph size.

**Alternatives:** AI-only gate (rejected); items-only (too weak for cloud cost).

### 2. Three limits in one plan row

**Choice:** `PLANS.free = { familyLimit: 1, memberLimit: 2, itemLimit: 50 }`; `capacity_std` all `null`.

**Why:** Single redeem unlocks the whole free ceiling; matches product promise.

### 3. `familyLimit` is per openid; unlocked if any home has active paid plan

**Choice:** Count `memberships` for the openid. If any joined family has an active subscription resolving to `familyLimit == null`, allow unlimited create/join. Otherwise enforce free `familyLimit=1`.

**Why:** Capacity is family-scoped, but “how many homes can I enter” is a user-scoped question; tying unlock to “any active strengthened home” avoids a second billing object.

**Alternatives:** Always free=1 even after redeem (rejected — contradicts unlimited choice); user-level subscription doc (YAGNI).

### 4. `memberLimit` / `itemLimit` always use the target family’s subscription

**Choice:** Join checks the family being joined; item create checks current family.

**Why:** Seats and SKUs belong to that household’s ledger.

### 5. `itemCount` on `families`; reuse `memberCount`

**Choice:** Maintain `itemCount` on create/createMany/remove; use existing `memberCount` for seat checks; lazy `count()` calibrate items when null.

**Why:** O(1) gates; no new counter for members.

### 6. Entitlement snapshot on `families` for UI; subscription doc as truth on write

**Choice:** `families.entitlement = { planId, expiresAt, itemLimit, memberLimit, familyLimit }` on redeem; write path reads `familySubscriptions`.

**Why:** `getMyFamily` +0 reads for UI; writes must not trust client cache.

### 7. Config table + optional `limitsOverride`

**Choice:** Shared `entitlements` module; override object may set any of the three limits.

### 8. Over-limit after expiry: keep data, block growth

**Choice:** No forced leave/delete; only reject new memberships / joins / item creates.

### 9. `createMany` fails entirely if batch would exceed remaining

**Choice:** All-or-nothing.

### 10. API surface on `family`, not `ai`

**Choice:** `family.redeem` / `getEntitlement` / `issueCodes`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `itemCount` drift | Lazy calibrate; admin repair; never go negative |
| Over-limit after expiry | Allow keep; block growth only |
| `familyLimit` check needs scanning user’s families’ subs | Accept small read fan-out at create/join; cache later if needed |
| Closed-beta redeem vs platform policy | In-app: 内测兑换 only |
| Old AI-redeem docs confuse agents | Superseded pointers; implement this change only |

## Migration Plan

1. Widen `PLANS` / snapshot fields (backward compatible: missing keys → free defaults).
2. Keep existing item gate; add `assertUserFamilyCapacity` / `assertMemberCapacity`.
3. Update family-page copy for three limit types.
4. Rollback: set free limits to `null` in config to disable a gate without deleting collections.

## Open Questions

- None for this revision (paid = unlimited on all three; confirmed).

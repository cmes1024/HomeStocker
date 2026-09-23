# capacity-membership-redeem Specification

## Purpose

Provide family-scoped capacity membership via redeem codes so free households stay within home, seat, and item limits while closed-beta codes unlock an unlimited capacity plan without in-app payment.

## Requirements

### Requirement: Redeem code activates family capacity plan
The system MUST allow an authenticated member of a current family to redeem a single-use code that binds a capacity product to that family. Codes MUST be stored hashed at rest. A successful redeem MUST set or extend `expiresAt` using max(existing expiry, now) plus product days, and MUST record the product’s plan id on the family subscription. Concurrent redeems of the same unused code MUST result in at most one success.

#### Scenario: First redeem activates plan
- **WHEN** a member redeems a valid unused capacity code for the current family
- **THEN** the family has an active capacity subscription with an expiry in the future and the code becomes used

#### Scenario: Renew extends from remaining time
- **WHEN** a family with an unexpired capacity subscription redeems another valid code for a capacity product
- **THEN** the new expiry is computed from the previous expiry plus product days (not from now alone)

#### Scenario: Double redeem rejected
- **WHEN** two redeem attempts race on the same unused code
- **THEN** at most one attempt activates or extends a subscription and the other fails as used or invalid

### Requirement: Expired subscription falls back to free limits
When a family’s subscription is missing or `expiresAt` is in the past, the system MUST treat that family as the free plan for member and item capacity checks. When a user has no active strengthened family unlocking unlimited homes, the system MUST treat that user as the free plan for family-count checks. Existing items and memberships MUST NOT be deleted or removed solely because a plan expired.

#### Scenario: Expiry blocks new items only
- **WHEN** a family’s capacity subscription has expired and the household already holds more items than the free item limit
- **THEN** the system still allows reading those items but MUST reject creating additional items under the free limit

#### Scenario: Expiry blocks new members only
- **WHEN** a family’s capacity subscription has expired and the household already has more members than the free member limit
- **THEN** the system MUST NOT remove existing members but MUST reject additional joins under the free limit

#### Scenario: Expiry blocks additional homes only
- **WHEN** a user previously unlocked multiple homes via an active capacity plan that has since expired on all their families, and they already hold more memberships than the free family limit
- **THEN** the system MUST NOT remove existing memberships but MUST reject creating or joining another family under the free limit

### Requirement: Free plan default limits
The free plan MUST default to at most one family membership per user, at most two members per family, and at most fifty items per family, unless configuration overrides say otherwise. An active `capacity_std` (or equivalent) plan MUST treat family, member, and item limits as unlimited (`null`) unless `limitsOverride` narrows them.

#### Scenario: Free defaults apply without subscription
- **WHEN** a family has no active capacity subscription
- **THEN** effective limits are familyLimit=1 (for the user’s memberships when no strengthened home unlocks unlimited), memberLimit=2, and itemLimit=50

#### Scenario: Active capacity plan is unlimited
- **WHEN** a family has an active capacity subscription on the standard capacity plan without narrowing overrides
- **THEN** that family’s member and item limits are unlimited, and any member of that family MAY create or join additional families without a finite familyLimit

### Requirement: Admin can issue redeem codes
The system MUST provide an admin-only operation that creates unused redeem codes for a known capacity product and returns plaintext codes once. Callers other than the configured admin identity MUST be denied.

#### Scenario: Admin issues codes
- **WHEN** the configured admin requests a batch of codes for a valid capacity product
- **THEN** the system returns that many plaintext codes and stores only hashes as unused

#### Scenario: Non-admin cannot issue
- **WHEN** a non-admin caller requests code issuance
- **THEN** the system denies the request

### Requirement: Entitlement query for current family
The system MUST provide an operation that returns the current family’s effective plan, active flag, expiry, item/member/family limits, item count, and member count for authorized members. List and search item APIs MUST NOT be required to call this operation on every request.

#### Scenario: Member reads entitlement
- **WHEN** a member of the current family requests entitlement
- **THEN** the response includes whether capacity membership is active, the effective item and member limits, the family’s item and member counts, and the effective familyLimit for display

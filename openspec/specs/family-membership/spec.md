# family-membership Specification

## Purpose

Enable household members to create or join a shared family via invite code, with membership as the source of truth for access, including multiple families and switching the current working family.

## Requirements

### Requirement: Create family
Authenticated users MAY create a family when under their effective family-count limit. Creating a family MUST create the family document, a unique 6-character invite code (`A-Z0-9`), the creator’s membership, and set `currentFamilyId`. Free-plan users without any active strengthened home MUST be limited to one membership total.

#### Scenario: First family allowed on free plan
- **WHEN** a user with no memberships creates a family
- **THEN** the system creates the family and membership, sets the caller's `currentFamilyId`, and returns the family including `inviteCode`

#### Scenario: Second family rejected on free plan
- **WHEN** a user who already has one membership and has no active capacity plan unlocking unlimited homes attempts to create another family
- **THEN** the system denies the create with a family-limit error

#### Scenario: Additional family allowed with active capacity plan
- **WHEN** a user belongs to a family with an active unlimited familyLimit capacity plan and creates another family
- **THEN** the system creates the new family and membership, switches `currentFamilyId` to it, and does not return `ALREADY_IN_FAMILY`

### Requirement: Join family by invite code
Authenticated users MAY join a family via invite code when (1) they are under their effective family-count limit and (2) the target family is under its effective member limit. Duplicate join of the same family MUST be rejected. Join MUST increment `memberCount`.

#### Scenario: Join within free seat limit
- **WHEN** a user with no memberships joins a free-plan family that currently has one member
- **THEN** the system adds membership and `memberCount` becomes two

#### Scenario: Reject join at free member limit
- **WHEN** a user attempts to join a free-plan family that already has two members
- **THEN** the system denies the join with a member-limit error and does not change memberships

#### Scenario: Reject join at free family limit
- **WHEN** a user who already has one membership and no unlimited-home unlock attempts to join another family
- **THEN** the system denies the join with a family-limit error

#### Scenario: Invalid invite code
- **WHEN** a user submits an invite code that matches no family
- **THEN** the system returns an error indicating the code is invalid and creates no membership

#### Scenario: Reject join when already in that family
- **WHEN** a user who is already a member of family F submits F's invite code
- **THEN** the system returns `ALREADY_IN_FAMILY` and creates no additional membership

### Requirement: Membership is the relationship source of truth
The system MUST store person↔family relationships only in `memberships` (not as nested member arrays on family documents). Membership document identity MUST be idempotent for the pair `(openid, familyId)`.

#### Scenario: Query my families via memberships
- **WHEN** the system needs to know which families a user belongs to
- **THEN** it queries `memberships` by `openid` and MUST NOT rely on a `familyIds[]` field on the user document

### Requirement: Get my current family
The system SHALL provide an operation that returns the caller's current family summary (including invite code and member count) when the caller has a valid membership for `currentFamilyId`. The system SHALL also list the caller's families and switch `currentFamilyId` among them.

#### Scenario: Member gets family summary
- **WHEN** a member with a valid `currentFamilyId` and matching membership requests their family
- **THEN** the system returns family name, invite code, and member count

#### Scenario: No family context
- **WHEN** a user with no membership or null `currentFamilyId` requests their family
- **THEN** the system indicates no current family

#### Scenario: Switch current family
- **WHEN** a member who belongs to more than one family switches to another membership
- **THEN** `currentFamilyId` becomes that family and subsequent reads/writes use it

### Requirement: Leave or dissolve family
The system SHALL allow a member to leave the current family. When the owner leaves or dissolves, the system MUST clear related memberships and family-scoped data, including any capacity membership subscription for that family. Non-owner leave MUST decrement `memberCount`. If the leaving user still has other memberships, `currentFamilyId` MUST move to one of them; otherwise it MUST be cleared so they return to onboarding.

#### Scenario: Non-owner leaves
- **WHEN** a non-owner member leaves the current family
- **THEN** their membership is removed, `memberCount` decreases by one, and their `currentFamilyId` is either another remaining family or cleared

#### Scenario: Owner dissolves
- **WHEN** the owner dissolves the family
- **THEN** memberships for that family are removed, family-scoped collections are cleaned (including capacity subscription records), affected users who have no other family have `currentFamilyId` cleared, and former members can create or join again subject to capacity limits

### Requirement: Family summary includes capacity entitlement snapshot
When a member fetches the current family summary, the system SHOULD include an entitlement snapshot, item count, and member count sufficient for the family page to render capacity status without a mandatory second round trip. Snapshot fields MUST NOT replace server-side enforcement on create/join/item create.

#### Scenario: Member gets family summary with capacity fields
- **WHEN** a member with a valid current family requests their family summary
- **THEN** the response includes item count, member count, and capacity entitlement information for display (active or free fallback)

### Requirement: Identity from cloud context only
Family relationship writes MUST authenticate using cloud function `OPENID` only. The system MUST NOT trust client-supplied `openid` or arbitrary `familyId` overrides for create, join, leave, switch, or get-my-family.

#### Scenario: Forged identity ignored
- **WHEN** a client calls a family write action with a forged openid in the payload
- **THEN** the system uses `OPENID` from the cloud context and ignores the forged identity field

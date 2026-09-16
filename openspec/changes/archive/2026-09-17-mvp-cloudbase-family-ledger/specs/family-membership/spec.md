## Purpose

Enable household members to create or join a shared family via invite code, with membership as the source of truth for access and MVP single-family experience constraints.

## ADDED Requirements

### Requirement: Create family with invite code
The system SHALL allow a user with no memberships to create a family, receive a unique 6-character invite code (`A-Z0-9`), become a member, and have `currentFamilyId` set to that family.

#### Scenario: Successful create
- **WHEN** a user with zero memberships creates a family with a valid name
- **THEN** the system creates a family document, a membership for the caller, sets the caller's `currentFamilyId`, and returns the family including `inviteCode`

#### Scenario: Reject create when already in a family
- **WHEN** a user who already has any membership attempts to create a family
- **THEN** the system returns `ALREADY_IN_FAMILY` and creates no new family

### Requirement: Join family by invite code
The system SHALL allow a user with no memberships to join an existing family by entering a valid invite code, creating a membership and setting `currentFamilyId`.

#### Scenario: Successful join
- **WHEN** a user with zero memberships submits a valid invite code for an existing family
- **THEN** the system creates a membership, increments `memberCount`, sets `currentFamilyId`, and returns the family summary

#### Scenario: Invalid invite code
- **WHEN** a user submits an invite code that matches no family
- **THEN** the system returns an error indicating the code is invalid and creates no membership

#### Scenario: Reject join when already in a family
- **WHEN** a user who already has any membership attempts to join via invite code
- **THEN** the system returns `ALREADY_IN_FAMILY` and creates no additional membership

### Requirement: Membership is the relationship source of truth
The system MUST store person↔family relationships only in `memberships` (not as nested member arrays on family documents). Membership document identity MUST be idempotent for the pair `(openid, familyId)`.

#### Scenario: Query my families via memberships
- **WHEN** the system needs to know which families a user belongs to
- **THEN** it queries `memberships` by `openid` and MUST NOT rely on a `familyIds[]` field on the user document

### Requirement: Get my current family
The system SHALL provide an operation that returns the caller's current family summary (including invite code and member count) when the caller has a valid membership for `currentFamilyId`.

#### Scenario: Member gets family summary
- **WHEN** a member with a valid `currentFamilyId` and matching membership requests their family
- **THEN** the system returns family name, invite code, and member count

#### Scenario: No family context
- **WHEN** a user with no membership or null `currentFamilyId` requests their family
- **THEN** the system indicates no current family

### Requirement: Leave or dissolve family
The system SHALL allow a member to leave the current family. When the owner leaves or dissolves, the system MUST clear related memberships and family context for affected users so they return to onboarding. Non-owner leave MUST decrement `memberCount` and clear that user's `currentFamilyId`.

#### Scenario: Non-owner leaves
- **WHEN** a non-owner member leaves the current family
- **THEN** their membership is removed, `currentFamilyId` is cleared, and `memberCount` decreases by one

#### Scenario: Owner dissolves
- **WHEN** the owner dissolves the family
- **THEN** memberships for that family are removed, affected users' `currentFamilyId` for that family are cleared, and the family (and its items as applicable) are deleted so former members can create or join again

### Requirement: Identity from cloud context only
Family relationship writes MUST authenticate using cloud function `OPENID` only. The system MUST NOT trust client-supplied `openid` or arbitrary `familyId` overrides for create, join, leave, or get-my-family.

#### Scenario: Forged identity ignored
- **WHEN** a client calls a family write action with a forged openid in the payload
- **THEN** the system uses `OPENID` from the cloud context and ignores the forged identity field

# family-membership Specification

## Purpose

Enable household members to create or join a shared family via invite code, with membership as the source of truth for access, including multiple families and switching the current working family.

## Requirements

### Requirement: Create family with invite code
The system SHALL allow a user to create a family, receive a unique 6-character invite code (`A-Z0-9`), become a member, and have `currentFamilyId` set to that family. Creating MUST remain allowed when the user already belongs to other families.

#### Scenario: Successful create
- **WHEN** a user creates a family with a valid name
- **THEN** the system creates a family document, a membership for the caller, sets the caller's `currentFamilyId`, and returns the family including `inviteCode`

#### Scenario: Create another family while already a member
- **WHEN** a user who already has a membership creates another family
- **THEN** the system creates the new family and membership, switches `currentFamilyId` to it, and does not return `ALREADY_IN_FAMILY`

### Requirement: Join family by invite code
The system SHALL allow a user to join an existing family by entering a valid invite code, creating a membership and setting `currentFamilyId`. Join MUST be rejected only when the caller is already a member of **that** family.

#### Scenario: Successful join
- **WHEN** a user submits a valid invite code for a family they do not belong to
- **THEN** the system creates a membership, increments `memberCount`, sets `currentFamilyId`, and returns the family summary

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
The system SHALL allow a member to leave the current family. When the owner leaves or dissolves, the system MUST clear related memberships and family-scoped data. Non-owner leave MUST decrement `memberCount`. If the leaving user still has other memberships, `currentFamilyId` MUST move to one of them; otherwise it MUST be cleared so they return to onboarding.

#### Scenario: Non-owner leaves
- **WHEN** a non-owner member leaves the current family
- **THEN** their membership is removed, `memberCount` decreases by one, and their `currentFamilyId` is either another remaining family or cleared

#### Scenario: Owner dissolves
- **WHEN** the owner dissolves the family
- **THEN** memberships for that family are removed, family-scoped collections are cleaned, affected users who have no other family have `currentFamilyId` cleared, and former members can create or join again

### Requirement: Identity from cloud context only
Family relationship writes MUST authenticate using cloud function `OPENID` only. The system MUST NOT trust client-supplied `openid` or arbitrary `familyId` overrides for create, join, leave, switch, or get-my-family.

#### Scenario: Forged identity ignored
- **WHEN** a client calls a family write action with a forged openid in the payload
- **THEN** the system uses `OPENID` from the cloud context and ignores the forged identity field

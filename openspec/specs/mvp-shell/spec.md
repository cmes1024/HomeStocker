# mvp-shell Specification

## Purpose

Bootstrap the mini program: cloud init, user session, route users without a family to onboarding and members to the item ledger, and keep demo/chat off the product navigation.

## Requirements

### Requirement: Cloud init and user document
On launch the app MUST initialize cloud development with user tracing and ensure a `users` document exists for the signed-in openid (creating one if missing) before membership routing.

#### Scenario: First launch creates user
- **WHEN** a user opens the app for the first time with cloud auth
- **THEN** a `users` document exists for their openid with `currentFamilyId` null until they create or join a family

### Requirement: Route by membership
Users with no membership MUST land on onboarding (create/join). Users with a valid current family membership MUST land on the items list. After leave or dissolve, if the user still has another membership the app MUST switch to one of those families; otherwise they MUST return to onboarding.

#### Scenario: No membership opens onboarding
- **WHEN** a user with zero memberships opens the app
- **THEN** they are shown create/join family onboarding

#### Scenario: Member opens items
- **WHEN** a user with a membership and valid `currentFamilyId` opens the app
- **THEN** they are shown the shared items list for that family

#### Scenario: After leave with no other family returns to onboarding
- **WHEN** a user successfully leaves or their only family is dissolved
- **THEN** subsequent entry shows onboarding again

#### Scenario: After leave with another family stays in product
- **WHEN** a user leaves one family but still has another membership
- **THEN** `currentFamilyId` is set to one remaining family and they stay in the product (not onboarding)

### Requirement: Product pages exclude demo and chat
Product navigation MUST register onboarding, the family ledger and edit, family settings (including tags and messages), browse subpackage pages (spaces, item detail, pockets), and the AI capture subpackage. Demo pages and chat UI MUST NOT be registered on the product path. The `chatProxy` cloud function shell MAY remain for a later Agent phase without a chat UI entry point.

#### Scenario: App pages exclude demo and chat
- **WHEN** the app configuration is loaded
- **THEN** registered product pages do not include `pages/demo/*` or `pages/chat/*` as entry points

### Requirement: Network failure is visible and retryable
List and write failures due to network or cloud errors MUST present a failure state with retry. The product MUST NOT implement an offline write queue.

#### Scenario: Failed list shows retry
- **WHEN** loading the items list fails due to network error
- **THEN** the UI shows a failure state and allows the user to retry

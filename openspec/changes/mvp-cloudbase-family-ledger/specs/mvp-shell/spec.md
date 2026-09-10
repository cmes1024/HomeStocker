## Purpose

Bootstrap the mini program for MVP: cloud init, user session, route users without a family to onboarding and members to the item ledger, and strip demo/chat from the product navigation.

## ADDED Requirements

### Requirement: Cloud init and user document
On launch the app MUST initialize cloud development with user tracing and ensure a `users` document exists for the signed-in openid (creating one if missing) before membership routing.

#### Scenario: First launch creates user
- **WHEN** a user opens the app for the first time with cloud auth
- **THEN** a `users` document exists for their openid with `currentFamilyId` null until they create or join a family

### Requirement: Route by membership
Users with no membership MUST land on onboarding (create/join). Users with a valid current family membership MUST land on the items list. After leave or dissolve, users MUST return to onboarding.

#### Scenario: No membership opens onboarding
- **WHEN** a user with zero memberships opens the app
- **THEN** they are shown create/join family onboarding

#### Scenario: Member opens items
- **WHEN** a user with a membership and valid `currentFamilyId` opens the app
- **THEN** they are shown the shared items list for that family

#### Scenario: After leave returns to onboarding
- **WHEN** a user successfully leaves or their family is dissolved
- **THEN** subsequent entry shows onboarding again

### Requirement: MVP product pages only
Product navigation MUST register onboarding, items list, items edit, and family pages. Demo pages and chat UI MUST NOT be registered on the product path. The `chatProxy` cloud function shell MAY remain for a later Agent phase without a chat UI entry point.

#### Scenario: App pages exclude demo and chat
- **WHEN** the MVP app configuration is loaded
- **THEN** registered pages are the MVP onboarding/items/family surfaces and do not include `pages/demo/*` or `pages/chat/*` as product entry points

### Requirement: Network failure is visible and retryable
List and write failures due to network or cloud errors MUST present a failure state with retry. The MVP MUST NOT implement an offline write queue.

#### Scenario: Failed list shows retry
- **WHEN** loading the items list fails due to network error
- **THEN** the UI shows a failure state and allows the user to retry

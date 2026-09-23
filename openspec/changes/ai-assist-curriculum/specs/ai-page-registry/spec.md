## MODIFIED Requirements

### Requirement: page.get fetches registry progressively
The capability catalog MUST expose an enabled `page.get` action. When the plan calls `page.get` without a page id, the system MUST return a compact index of page ids and hints for the model. When the plan calls `page.get` with a known page id, the system MUST return that entry’s path and query contract. A small alias table MAY map analogical ids (such as `family.keys`) to a registered id. Unknown page ids MUST return the compact index as `pageDoc` without inventing a path and without emitting navigation. The system MUST NOT inject the full registry body into every act prompt by default.

#### Scenario: Index without pageId
- **WHEN** a plan step uses `page.get` with no pageId
- **THEN** the act report includes a compact list of registered page ids and hints for the model

#### Scenario: Detail for one page
- **WHEN** a plan step uses `page.get` with pageId for item detail
- **THEN** the act report includes that page’s path and that `id` is required in query

#### Scenario: Unknown pageId returns index
- **WHEN** a plan step uses `page.get` with a pageId not in the registry and not an alias
- **THEN** the act report includes the compact index for the model and no navigation UI is emitted

#### Scenario: family.keys aliases to ai.keys
- **WHEN** a plan step uses `page.get` with pageId `family.keys`
- **THEN** the system treats it as the registered `ai.keys` page

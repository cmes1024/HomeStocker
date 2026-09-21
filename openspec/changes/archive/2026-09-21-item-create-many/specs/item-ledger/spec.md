## ADDED Requirements

### Requirement: Batch create through item domain API
Authenticated members of the current family SHALL be able to create multiple items in one item-domain write via `createMany`. The API MUST validate every row before writing any item. On success it MUST insert one `items` document per row and one `activities` create row per item. Client SDK direct writes remain denied.

#### Scenario: Valid batch writes all rows
- **WHEN** a member calls createMany with two valid item payloads for the current family
- **THEN** the system stores two items under that family, each with `createdBy` as the caller's openid, and records a create activity for each

#### Scenario: Invalid row writes nothing
- **WHEN** createMany includes an item with an empty name
- **THEN** the system does not insert any item from that request

#### Scenario: Batch size limit
- **WHEN** createMany includes more than 20 items
- **THEN** the system rejects the request without writing

## ADDED Requirements

### Requirement: Item references accept stable ids

Write capabilities that target an existing item MUST accept an `itemId` as a first-class argument in addition to a short ref. The executor MUST verify that the id belongs to the current family and appears in the rows retrieved during this act; an id failing either check MUST be rejected with `REF_UNKNOWN`.

#### Scenario: Direct id targets the item

- **WHEN** the model sends an update with `itemId` for a row it retrieved earlier in the same act
- **THEN** the executor updates that item without requiring a short ref

#### Scenario: Foreign id is rejected

- **WHEN** the model sends an `itemId` that belongs to another family or was never retrieved in this act
- **THEN** the executor rejects the call with `REF_UNKNOWN` and does not write

### Requirement: Short refs are re-emitted each turn

Rows already introduced earlier in the act MUST be repeated in a later tool result together with their short ref, name, quantity, and place. The executor MUST NOT hide a row solely because it was returned before, and MUST NOT require the model to remember a ref across turns without re-supplying it.

#### Scenario: Repeated probe re-lists known rows

- **WHEN** a second probe returns rows that already had short refs assigned
- **THEN** those rows appear again with the same refs and are not silently skipped

#### Scenario: Unknown ref is reported

- **WHEN** the model references a short ref that does not exist in the current act
- **THEN** the executor returns `REF_UNKNOWN` with the refs that do exist and does not invent a placeholder row

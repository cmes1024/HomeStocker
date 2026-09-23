## ADDED Requirements

### Requirement: Enabled hints state job boundary
Each enabled catalog entry that the model may call MUST include a hint that states when to use the action and when not to use it. Write entries that create new rows MUST tell the model not to use them only to increase quantity on an existing row. Batch `*Many` entries MUST tell the model to prefer them when two or more of the same kind are created or removed in one turn. Read and navigation entries MUST tell the model not to invent numbers or page paths. Hint text MUST remain the single model-facing description for that id; the prompt MUST NOT add a shadow tool name.

#### Scenario: item.create hint forbids add-quantity
- **WHEN** `item.create` is enabled
- **THEN** its model-facing hint states that it opens a new ledger row and must not be used only to add quantity to an existing row

#### Scenario: item.update hint states absolute quantity
- **WHEN** `item.update` is enabled
- **THEN** its model-facing hint states that `quantity` is the absolute value after the change and that add or subtract requires a current-stock read first

#### Scenario: page.get hint forbids fake paths
- **WHEN** `page.get` is enabled
- **THEN** its model-facing hint states that pages are fetched on demand, names the keys page as `ai.keys`, and that the model must not invent a path outside the registry

## ADDED Requirements

### Requirement: Named inventory retrieval is shared
When the assistant probes or searches items by name/keyword, the system MUST use one shared keyword retrieval path (same filter semantics for probe and item.search). With a non-empty name/keyword, the system MUST prefer name-scoped candidates over a family-wide unfiltered dump. Results injected as short refs MUST remain capped.

#### Scenario: Probe by name hits matching rows
- **WHEN** the plan probes with name 挂面 (optional space)
- **THEN** injected probe rows are items whose names match that keyword under the scope, not an arbitrary unfiltered family list capped at the same limit

#### Scenario: item.search matches probe semantics
- **WHEN** the model calls item.search with the same keyword and place scope as a probe would use
- **THEN** the inventory rows returned follow the same keyword filter rules as that probe path

### Requirement: Receipt recovery probe prefers names
When the system recovers inventory for quantity rollback from assistant qty-change receipts, the recovery probe MUST prefer each receipt’s item name and space when present. The system MUST NOT default to family-wide listAll solely because multiple receipts share different spaces if each receipt still has a usable name.

#### Scenario: Multi-space receipts recover by name
- **WHEN** the latest assistant receipt changed 挂面 in 厨房 and 纸巾 in 客厅 and the next turn needs recovery probe
- **THEN** recovery probing uses those item names (with spaces when known) rather than only listAll

### Requirement: History truncation prefers qty receipts
When sanitizing conversation history to the maximum turn count, the system MUST prefer retaining assistant turns that contain quantity-change receipt text (items reported as changed with before→after quantities) over older turns that lack such receipts, while still respecting the maximum turn count and per-turn text length bound.

#### Scenario: Chitchat does not evict the last qty receipt
- **WHEN** history exceeds twenty turns and includes an assistant turn with qty-change receipts plus many later chitchat turns
- **THEN** the sanitized history still includes that receipt-bearing assistant turn if it fits within the twenty-turn budget after preferential retention

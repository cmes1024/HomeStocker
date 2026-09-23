## ADDED Requirements

### Requirement: Product and role questions retrieve knowledge before answering
When the member asks what the product is, what the assistant’s job is, what a ledger concept means, or how capacity / 加强版 works, a conforming act plan MUST retrieve the matching enabled knowledge topic before stating those rules. The model MUST NOT invent prices, purchase channels, or hard-denied household actions that contradict retrieved knowledge. Structure-only questions that are already answered by the injected family tree MAY be answered without a knowledge fetch.

#### Scenario: Capacity question fetches capacity
- **WHEN** a member asks how many items the free tier allows
- **THEN** the plan calls `knowledge.get` for the capacity topic (or an equivalent enabled capacity topic id) before giving the numeric rule

#### Scenario: “What can you do” fetches role
- **WHEN** a member asks what the assistant can help with
- **THEN** the plan retrieves the role topic and answers within that job boundary, including opening registered pages when `page.get` can help

### Requirement: Used-up quantity must not persist zero
When an act plan would set an existing item’s quantity to zero, the executor MUST NOT persist a zero-quantity row. The model SHOULD emit `item.remove` (or removeMany) instead of `item.update` with quantity 0. The system MUST NOT rewrite the member’s utterance into a delete, and MUST NOT insert extra confirmation asks in code. The existing `item.remove` confirmation gate remains the single hard confirmation.

#### Scenario: Update quantity 0 is refused
- **WHEN** a plan calls `item.update` with quantity 0
- **THEN** that write does not store 0, and the turn does not invent a phrase-table delete

#### Scenario: Reduce last pack uses remove
- **WHEN** reducing would exhaust the current quantity
- **THEN** a conforming plan uses item.remove and the member sees at most the standard delete confirmation card, not a prior assistant ask round whose only job is to confirm the same delete

### Requirement: Core curriculum scenarios remain hand-checkable
The project MUST keep a scenario catalog that names each core act situation, the owning literacy layer, and the expected member-visible outcome. Manual acceptance for this change MUST cover at least: add quantity then undo, reduce with insufficient stock, same-name ambiguity, new-row create versus add-to-existing, open a registered management page instead of claiming the skill is missing, a product or role knowledge question, and a hard-denied household action. The system MUST NOT require an automated model-eval process to satisfy this requirement.

#### Scenario: Acceptance list includes knowledge and page-open
- **WHEN** a reviewer follows the curriculum core-track acceptance list
- **THEN** the list includes a product or role question that should trigger `knowledge.get` and a “open tag management / keys” style request that should use `page.get` rather than the capability-limit ask

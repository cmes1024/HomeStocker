# ai-assistant-act Specification

## Purpose

Turns a member’s natural-language text into a planned list of allowed domain actions against the current family, using the structure tree and capability catalog, without giving the model a direct database write.

## Requirements

### Requirement: Act uses current family and membership
Assistant act MUST resolve the caller via cloud identity and current family membership. Client-supplied family id MUST NOT override that family. The act request MUST include non-empty text. The system MUST inject today’s date in Asia/Shanghai, the structure tree rendered as names, and the enabled capability list.

#### Scenario: Forged family id ignored
- **WHEN** a member calls act with another family’s id in the payload
- **THEN** the plan and writes apply only to the caller’s current family

#### Scenario: Empty text rejected
- **WHEN** a member submits act with blank text
- **THEN** the system does not call the model

### Requirement: Follow-up turns may carry sanitized context
Act MAY accept a client-supplied conversation history and recent item ids. History MUST be treated as prompt context only and MUST NOT authorize writes. The server MUST sanitize history to at most **twenty** text turns (user/assistant with non-empty text, truncating each turn’s text to a bounded length). Recent item ids MUST be loaded from the current family and injected as opaque short refs for this turn. Database document ids MUST NOT appear in the model prompt.

#### Scenario: Change the milk just recorded
- **WHEN** a member first asks to record milk in the kitchen fridge and then says to change it to three bottles
- **THEN** the follow-up act includes the prior turns as context and can address that item via this turn’s short ref

#### Scenario: History longer than twenty is truncated
- **WHEN** the client sends more than twenty history turns
- **THEN** the model prompt includes at most twenty sanitized turns (preferring the most recent), and excess turns do not authorize any write

### Requirement: Model emits a plan not writes
The language model MUST return a structured plan with optional clarification questions, optional one-shot inventory probe, and an ordered list of capability ids with name-based arguments. The model MUST NOT receive database document ids in the prompt except opaque short refs created for this turn from focus or probe rows. The model MUST NOT write collections itself.

#### Scenario: Ask blocks all writes
- **WHEN** the plan includes a non-empty clarification list
- **THEN** the system does not create, update, or remove items in that turn

#### Scenario: Unknown capability dropped
- **WHEN** the plan asks to use a capability id that is not enabled
- **THEN** that step is not executed

### Requirement: At most one inventory probe per act
If the plan requests a probe of items at a named place (optional name filter), the system MUST query that family’s items at most once, inject compact matching rows with short refs, and MAY call the model one more time. A second probe request in that follow-up MUST be ignored.

#### Scenario: Fridge probe then create
- **WHEN** the plan probes 厨房 / 冰箱 for 牛奶 and then, after probe rows return, asks to create 牛奶 there
- **THEN** the system performs one item lookup for that place and then executes the create through the item write API

### Requirement: Names map through the tree then existing writes
The executor MUST resolve space, location, and tag names against the current structure tree. A missing location under a matched space MAY be created through the existing location-create API when that capability is enabled. Item create, **createMany**, update, and remove MUST go through the existing item domain write API with source agent. The assistant MUST NOT duplicate item validation in a second write implementation.

#### Scenario: Confirmed create becomes a ledger item
- **WHEN** a valid create step for 牛奶 in 厨房 / 冰箱 runs for the current family
- **THEN** an item document is written via the item cloud write path with source agent

#### Scenario: Batch createMany becomes ledger items
- **WHEN** a valid createMany step lists two items with resolvable space names for the current family
- **THEN** both item documents are written via the item domain createMany path with source agent and the system does not invent a parallel write implementation inside the assistant

#### Scenario: Unmatched space is not auto-created
- **WHEN** a create or createMany step names a space that is not on the structure tree
- **THEN** the system does not create a new space

### Requirement: Default create not merge
When the utterance does not explicitly ask to merge, a create or createMany step MUST insert new item rows even if same-named items already exist at that place. After successful single creates, the operation report MAY list possible duplicates at the same space and location. createMany MAY omit per-row database duplicate scans. The system MUST NOT merge items unless the member explicitly confirms a merge capability.

#### Scenario: Second milk is a new row
- **WHEN** 厨房 / 冰箱 already has 牛奶 and the member says to put two bottles of milk in the fridge without asking to merge
- **THEN** the system creates another item rather than increasing the existing quantity

#### Scenario: Same name creates another row
- **WHEN** 牛奶 already exists in 厨房 / 冰箱 and the plan creates 牛奶 there again without asking to merge
- **THEN** the system creates another item rather than increasing the existing quantity

### Requirement: Sequential failure keeps earlier successes
If an earlier plan step succeeds and a later step fails, the earlier writes MUST remain. The member MUST be told which step failed.

#### Scenario: Second create fails
- **WHEN** the first create in a plan saves and the second item create fails
- **THEN** the first item remains and the report names the failed item

### Requirement: Operation report is not a model scene
After an act attempt, the system MUST return a code-built report of executed steps, failures, and optional possible duplicates. Generating that report MUST NOT require an extra language-model call.

#### Scenario: Report after two creates
- **WHEN** two items are created in one act
- **THEN** the member sees a report listing both creates without a second model call for the report wording

### Requirement: Multi-item plans prefer createMany
When the member asks to record two or more new items in one turn and spaces are resolvable, the model SHOULD emit a single `item.createMany` call with an items array rather than multiple `item.create` calls. A single new item MAY still use `item.create`.

#### Scenario: Two spaces two items one call
- **WHEN** the member asks to add one item in 厨房 and one in 客厅 and both spaces are on the tree
- **THEN** a conforming plan uses item.createMany with two entries (or equivalent one-step batch) rather than requiring two separate item.create tool steps for optimality

### Requirement: createMany is all-or-nothing
If any entry in a createMany batch fails validation (missing name, unknown space, invalid date, over the batch limit), the system MUST write zero item documents for that step and MUST report failure.

#### Scenario: One bad row blocks the batch
- **WHEN** createMany includes one valid row and one row whose spaceName is not on the tree
- **THEN** neither row is written

### Requirement: Optimal structure-then-items composition
When a turn needs new spaces, locations, and items, the model SHOULD emit calls in order: spaces, then locations, then items. For each kind, two or more new entities SHOULD use the corresponding createMany capability; a single entity MAY use the singular create capability.

#### Scenario: Two rooms two closets then goods
- **WHEN** the member asks to create 主卧 and 次卧, add 衣柜 under each, and add clothing items there
- **THEN** a conforming plan uses space.createMany, then space.createLocationMany, then item.createMany (or equivalent minimal Many steps) rather than only repeated singular creates

### Requirement: Batch location create through existing write path
space.createLocationMany MUST resolve space names against the current structure tree (including spaces created earlier in the same act after the tree is refreshed) and MUST write through the location domain writer with all-or-nothing validation.

#### Scenario: Location batch fails on unknown space
- **WHEN** createLocationMany names a space not on the tree and not created earlier in the plan
- **THEN** no location documents are written for that step

### Requirement: Create-class failure triggers at most one model replan
When a create-class tool step fails (item/space create or createMany, or createLocation / createLocationMany), the system MUST stop further calls in that plan, inject an execution receipt (successes, failure, pending calls) and the current structure tree into the assistant context, and MAY ask the model once to emit a new plan for remaining work. The executor MUST NOT silently rewrite space or location targets. The system MUST NOT run inventory search solely to build the receipt.

#### Scenario: Location create fails then model replan
- **WHEN** space.createLocation fails and later item.createMany steps were pending
- **THEN** the system provides an EXEC receipt to the model for one replan turn and does not invent degrade placements in code

#### Scenario: No third planning round
- **WHEN** the replan turn’s calls also fail a create-class step
- **THEN** the system does not start another replan in the same act

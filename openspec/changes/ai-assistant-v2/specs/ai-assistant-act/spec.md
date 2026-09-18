## Purpose

Turns a member’s natural-language text into a planned list of allowed domain actions against the current family, using the structure tree and capability catalog, without giving the model a direct database write.

## ADDED Requirements

### Requirement: Act uses current family and membership
Assistant act MUST resolve the caller via cloud identity and current family membership. Client-supplied family id MUST NOT override that family. The act request MUST include non-empty text. The system MUST inject today’s date in Asia/Shanghai, the structure tree rendered as names, and the enabled capability list.

#### Scenario: Forged family id ignored
- **WHEN** a member calls act with another family’s id in the payload
- **THEN** the plan and writes apply only to the caller’s current family

#### Scenario: Empty text rejected
- **WHEN** a member submits act with blank text
- **THEN** the system does not call the model

### Requirement: Follow-up turns may carry sanitized context
Act MAY accept a short client-supplied conversation history and recent item ids. History MUST be treated as prompt context only and MUST NOT authorize writes. Recent item ids MUST be loaded from the current family and injected as opaque short refs for this turn. Database document ids MUST NOT appear in the model prompt.

#### Scenario: Change the milk just recorded
- **WHEN** a member first asks to record milk in the kitchen fridge and then says to change it to three bottles
- **THEN** the follow-up act includes the prior turns as context and can address that item via this turn’s short ref

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
The executor MUST resolve space, location, and tag names against the current structure tree. A missing location under a matched space MAY be created through the existing location-create API when that capability is enabled. Item create, update, and remove MUST go through the existing item domain write API with source agent. The assistant MUST NOT duplicate item validation in a second write implementation.

#### Scenario: Confirmed create becomes a ledger item
- **WHEN** a valid create step for 牛奶 in 厨房 / 冰箱 runs for the current family
- **THEN** a new item appears in that family’s ledger with that name, marked as agent-sourced

#### Scenario: Unmatched space is not auto-created
- **WHEN** a create step names a space that is not on the structure tree
- **THEN** the system does not create a new space

### Requirement: Default create not merge
When the utterance does not explicitly ask to merge, a create step MUST insert a new item even if a same-named item already exists at that place. After successful creates, the operation report MAY list possible duplicates at the same space and location. The system MUST NOT merge items in this version.

#### Scenario: Second milk is a new row
- **WHEN** 厨房 / 冰箱 already has 牛奶 and the member says to put two bottles of milk in the fridge without asking to merge
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

## Purpose

Gives the family text assistant a progressive product-knowledge library: a short topic index is always visible, full articles are fetched on demand, and members get product, role, and capacity answers from those articles rather than invented copy.

## ADDED Requirements

### Requirement: Progressive knowledge index without default bodies
The assistant MUST inject a short index of enabled knowledge topics (topic id plus one-line summary) into each act context. Topic bodies MUST NOT be included in the default system prompt. The model MUST retrieve at most a small bounded number of topic bodies per act via the enabled `knowledge.get` capability.

#### Scenario: Index lists enabled topics without bodies
- **WHEN** an act turn starts with at least one enabled knowledge topic
- **THEN** the model-facing context includes each enabled topic id and summary and does not include those topics’ full bodies until `knowledge.get` returns them

#### Scenario: Unknown topic is not invented
- **WHEN** a plan calls `knowledge.get` with a topic id that is not enabled
- **THEN** the system does not invent article text for that id and does not treat the miss as ledger authority

### Requirement: Literacy topics cover product, role, ledger, and capacity
The enabled knowledge library MUST include topics that explain what HomeStocker is, what the assistant’s job is and is not, how the family ledger concepts work (space, location, item, tags, expiry subscription), and the existing capacity / 加强版 rules. Capacity answers MUST continue to attach live entitlement facts for the current family when that topic is loaded.

#### Scenario: Product question can be answered from a topic
- **WHEN** a member asks what a space is versus a location
- **THEN** a conforming plan retrieves the ledger or product topic and answers from that body instead of inventing a conflicting definition

#### Scenario: Role question uses the role topic
- **WHEN** a member asks what the assistant can do or whether it can create a second family
- **THEN** a conforming plan retrieves the role (or capacity, if the question is about limits) topic and does not claim a hard-denied household action is available

#### Scenario: Capacity topic still carries live facts
- **WHEN** a member asks about the free-tier item limit and `knowledge.get` loads capacity
- **THEN** the injected body includes that family’s current entitlement summary in addition to the static article

### Requirement: Knowledge text does not authorize writes
Injected knowledge bodies MUST be treated as explanatory context only. They MUST NOT by themselves authorize item, space, tag, or family writes. Writes MUST still go through the allowlisted catalog and existing domain actions.

#### Scenario: Reading a topic does not write items
- **WHEN** a plan only calls `knowledge.get` for the role topic
- **THEN** no item, space, or tag documents are created, updated, or removed from that step

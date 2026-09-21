# ai-agent-runtime Specification

## Purpose
Defines the standard agent control flow for the family text assistant: assemble product context and tools for the model, let the model decide intent and next steps, then run allowlisted tools or answer the member directly under fixed guardrails.

## Requirements

### Requirement: Model is the sole intent router
On each natural-language act turn that requires understanding the member’s intent, the system MUST load product context (structure tree as names, enabled tools, date, optional focus/history/probe) and invoke the language model before choosing domain side effects. Code MUST NOT classify member intent with keyword or regex routers in order to skip the model, rewrite the model’s plan, or substitute a hard-coded answer for structure, inventory listing, or similar ledger questions.

#### Scenario: Structure question goes through the model
- **WHEN** a member asks how many rooms or what locations exist in the home
- **THEN** the system still calls the model with the structure tree in context and returns the model’s ask or final answer rather than a code-only tree dump that discards the model plan

#### Scenario: Inventory listing is not forced by regex
- **WHEN** a member asks what is in a place or what goods they have
- **THEN** the system does not override the model plan with a hard-coded probe solely because the utterance matched an inventory keyword pattern

### Requirement: Tools are the only domain side-effect path
Enabled catalog entries MUST be exposed to the model as tools (name, argument hints, confirmation flag). Domain reads and writes for the assistant MUST run only through the tool runtime mapped to existing family domain actions. The model MUST NOT receive raw database document ids except opaque short refs for the current turn. The assistant MUST NOT expose a generic collection read or write tool.

#### Scenario: Create goes through the create tool
- **WHEN** the model plans an item create with space and location names
- **THEN** the tool runtime resolves names against the structure tree and persists via the existing item domain write with source agent

#### Scenario: Disabled or denied tool is not executed
- **WHEN** the model asks for a tool that is disabled, unknown, or hard-denied
- **THEN** that step is not executed and the member is told the assistant cannot do that

### Requirement: Direct answer without tools remains allowed
When the model can answer from injected context alone (for example structure names already in the prompt) or needs clarification, it MUST be allowed to return clarification questions or a final reply with zero tool calls. Clarification questions MUST block all writes in that turn.

#### Scenario: Ask blocks writes
- **WHEN** the model returns a non-empty clarification list
- **THEN** the system does not create, update, remove, or merge items in that turn

### Requirement: Guardrails stay in code
The system MUST enforce identity and membership from cloud OPENID, ignore forged family ids, require confirmation before tools marked confirm, refuse hard-denied household and secret actions even if a stored catalog enables them, and MUST NOT present inventory facts that were not produced by a tool result or injected focus/probe/recent rows in the same act. Confirmed replay of a prior bound plan MAY skip the model so short refs and item ids stay stable.

#### Scenario: Delete requires confirmation
- **WHEN** a plan includes item remove and the member has not confirmed
- **THEN** the system does not delete the item

#### Scenario: Confirmed remove replays without re-planning
- **WHEN** the member confirms a prior remove plan that already bound real item ids
- **THEN** the system executes that plan without asking the model again

#### Scenario: No fabricated stock from reply alone
- **WHEN** the model returns a final reply that claims specific inventory counts or item rows without a corresponding tool or probe result in that act
- **THEN** the system does not treat that reply as an authoritative inventory report to the member

### Requirement: Platform-limited flows surface via tools not pre-routers
Flows that the assistant cannot complete inside the model loop because of platform limits (for example WeChat subscribe-message authorization requiring a user gesture) MUST be reachable as an enabled tool or an explicit model-directed UI directive after the model turn, not as a pre-model keyword short-circuit that never calls the model.

#### Scenario: Expire subscribe panel after model turn
- **WHEN** a member asks to manage expiry subscription switches for items
- **THEN** the system still invokes the model with that intent available as a tool or directed outcome, and the client may show the existing subscribe panel from the act response rather than skipping the model entirely at the act entry

### Requirement: At most one inventory probe per act
If the model requests an inventory probe, the system MUST query that family’s items at most once, inject compact matching rows with short refs, and MAY call the model one more time. A second probe in that follow-up MUST be ignored.

#### Scenario: One probe then act
- **WHEN** the first plan probes a place and the second plan creates an item there
- **THEN** the system performs one item lookup and then runs the create tool

### Requirement: Operation report is code-built
After tool execution, the system MUST return a code-built report of successes, failures, and optional possible duplicates without an extra model call solely to word the report.

#### Scenario: Report after tools
- **WHEN** two create tools succeed in one act
- **THEN** the member sees a code-built report listing both creates

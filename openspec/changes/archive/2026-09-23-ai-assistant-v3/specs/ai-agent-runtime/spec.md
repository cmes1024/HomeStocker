## ADDED Requirements

### Requirement: Code MUST NOT map utterance phrases to tools
The system MUST NOT use regular expressions or fixed phrase tables on member text, clarification chip labels, or model ask questions to force a tool id, synthesize calls, or rewrite a model plan. Allowed code duties are limited to: short-ref resolution for the current turn, capability allowlisting, confirmation gates for confirm-marked tools, empty-plan fallback messaging, and code-built execution receipts.

#### Scenario: Affirm chip is plain text to the model
- **WHEN** the member taps a clarification chip whose label is a natural-language affirmation
- **THEN** the next act submits that choice as text (optionally with prior utterance as clarification context) and does not construct domain write calls from a phrase regex match

### Requirement: Follow-up intent uses history and reads not session memory
When the member refers to a prior assistant action (for example undo an add-one), the system MUST rely on sanitized conversation history and, when current stock is required, allowlisted inventory read tools. The system MUST NOT require a cross-turn recent-items or last-ops memory bag to understand or execute that follow-up. When the question or required slots are unclear, the model MUST ask; when inventory facts are unclear, the model MUST use read tools rather than inventing numbers.

#### Scenario: Undo after add-one without session bag
- **WHEN** history shows the member asked to add one each to named goods and the assistant reported those updates succeeded, and the member then asks to undo
- **THEN** the model may plan quantity decreases using that dialog plus optional probe/search of current quantities, without a server or client operation ledger

#### Scenario: Delete amount checks stock via tools
- **WHEN** the member asks to delete or reduce by a stated amount
- **THEN** a conforming plan uses inventory read tools as needed and either writes through allowlisted tools or asks/reports if stock is insufficient, without consulting a session memory bag

### Requirement: Prompt guides soft norms not hard routing
The assistant system prompt MUST provide business knowledge and norms, operation boundaries, scenario descriptions, and explanations of tool capabilities. The prompt MUST NOT encode phrase-to-tool routing tables. Hard enforcement of identity, allowlists, and confirmation MUST remain in code. The prompt MUST NOT be omitted or reduced to an empty unconstrained instruction.

#### Scenario: Prompt describes tools without forcing utterances
- **WHEN** the model-facing prompt lists an enabled update capability and its argument meaning
- **THEN** that text does not require any specific member sentence to map to that capability by keyword table

## MODIFIED Requirements

### Requirement: Model is the sole intent router
On each natural-language act turn that requires understanding the member’s intent, the system MUST load product context (structure tree as names, enabled tools, date, optional focus/history/probe) and invoke the language model before choosing domain side effects. Code MUST NOT classify member intent with keyword or regex routers in order to skip the model, rewrite the model’s plan, or substitute a hard-coded answer for structure, inventory listing, undo, or similar ledger questions.

#### Scenario: Structure question goes through the model
- **WHEN** a member asks how many rooms or what locations exist in the home
- **THEN** the system still calls the model with the structure tree in context and returns the model’s ask or final answer rather than a code-only tree dump that discards the model plan

#### Scenario: Inventory listing is not forced by regex
- **WHEN** a member asks what is in a place or what goods they have
- **THEN** the system does not override the model plan with a hard-coded probe solely because the utterance matched an inventory keyword pattern

#### Scenario: Undo is not forced by regex
- **WHEN** a member asks to undo the previous operation
- **THEN** the system does not synthesize update or remove calls from an undo phrase table; the model plans using history and tools

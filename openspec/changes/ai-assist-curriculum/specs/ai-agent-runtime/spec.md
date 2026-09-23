## MODIFIED Requirements

### Requirement: Prompt guides soft norms not hard routing
The assistant system prompt MUST provide persona, channel rules (ask / probe / calls / reply), and soft operating norms. Full product textbooks, job descriptions, and ledger concept articles MUST live in progressive knowledge topics rather than being inlined in full in the system prompt. The prompt MAY keep a one-line product skeleton and MUST still explain that tools are listed in the capability catalog. The prompt MUST NOT encode phrase-to-tool routing tables. Hard enforcement of identity, allowlists, and confirmation MUST remain in code. The prompt MUST NOT be omitted or reduced to an empty unconstrained instruction.

#### Scenario: Prompt describes tools without forcing utterances
- **WHEN** the model-facing prompt lists an enabled update capability and its argument meaning
- **THEN** that text does not require any specific member sentence to map to that capability by keyword table

#### Scenario: Product textbook is not fully inlined
- **WHEN** an act turn assembles the system prompt
- **THEN** the prompt does not embed the full knowledge topic bodies for product, role, ledger, or capacity; those bodies appear only after `knowledge.get`

## ADDED Requirements

### Requirement: Literacy facts have a single home
Each durable assistant literacy fact MUST belong to exactly one layer: always-on prompt (persona and channels), progressive knowledge (product / role / ledger / capacity), capability hint (when to use or refuse a tool), or code (identity, allowlist, confirmation, receipts). A later change that restates the same fact in a second layer MUST treat the owner layer as authoritative.

#### Scenario: Create-versus-add lives on the capability hint
- **WHEN** the catalog describes `item.create`
- **THEN** the model-facing hint states that create opens a new row and MUST NOT be used only to increase an existing row’s quantity, and the system prompt does not add a second conflicting create-versus-add routing table

## MODIFIED Requirements

### Requirement: Direct answer without tools remains allowed

When the model can answer from injected context alone (for example structure names already in the prompt) or needs clarification, it MUST be allowed to return clarification questions or a final reply with zero tool calls. A turn MAY both ask the member one question and execute writes whose provenance verified successfully; a clarification question MUST NOT by itself cancel those writes. Irreversible actions (remove, removeMany, merge) MUST still be held for confirmation.

#### Scenario: Ask does not cancel grounded writes

- **WHEN** the model asks which of two same-named items to change and also updates a third item whose `_src` declares `probe` and verifies successfully
- **THEN** the third item's update executes and the clarification question is returned to the member

#### Scenario: Ask blocks writes

- **WHEN** the model returns a non-empty clarification list together with an irreversible call (remove, removeMany, merge)
- **THEN** those irreversible actions are held for confirmation and do not execute in that turn

#### Scenario: Ask never bypasses confirmation

- **WHEN** the model asks a question and includes an item.remove in the same turn
- **THEN** the remove is held for confirmation instead of executing

## ADDED Requirements

### Requirement: Semantic audit is distinct from the irreversible gate

The system MUST keep two separate mechanisms: a deterministic provenance audit that decides whether a write parameter is traceable, and an irreversible gate that stops remove, removeMany, and merge until the member confirms. The audit MUST NOT use phrase matching to decide what the member meant. The gate MUST NOT evaluate whether the target selection was correct.

#### Scenario: Audit passes, gate still holds

- **WHEN** an item.remove carries `from: inference` with a valid `via` ref
- **THEN** the audit passes and the call is still held for confirmation

#### Scenario: Audit fails, gate is irrelevant

- **WHEN** a write declares `from: probe` with a ref whose field value does not match
- **THEN** the call is rejected before any confirmation card is produced

### Requirement: Prompt carries domain knowledge not flow patches

The act prompt MUST describe household domain rules: ledger semantics, same-name handling, expiry meaning, and the existence of the confirmation gate. It MUST NOT contain instructions whose only purpose is to compensate for a missing protocol, such as telling the model not to pick a place itself or not to ask before a confirmable tool.

#### Scenario: Domain rule stays

- **WHEN** the prompt is reviewed
- **THEN** the same-name rule and the confirmation-gate rule are present

#### Scenario: Flow patch is removed

- **WHEN** the prompt is reviewed after this change
- **THEN** instructions that forbid the model from inferring a place are absent, because provenance replaces them

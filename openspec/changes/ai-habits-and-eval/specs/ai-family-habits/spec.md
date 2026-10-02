## ADDED Requirements

### Requirement: Family habits are capped and typed
Each family MAY store at most **seven** AI habit entries. Each entry MUST use one of the slot ids `default_space`, `naming`, `unit`, `summarize`, `duplicate_name`, `tone`, `focus`, and at most one entry per slot. Habit text MUST be non-empty and bounded in length. Exceeding the cap or using an unknown slot MUST be rejected without partial write.

#### Scenario: Upsert within empty slots succeeds
- **WHEN** a member upserts `default_space` with text naming an existing space preference and fewer than seven slots are filled
- **THEN** the habit is stored and subsequent act prompts for that family include that text under family habits

#### Scenario: Duplicate slot overwrites
- **WHEN** a member upserts the same slot that already exists
- **THEN** the previous text for that slot is replaced and the slot count does not increase

#### Scenario: Eighth distinct slot rejected
- **WHEN** seven slots are already filled and the member upserts a different unused slot
- **THEN** the write fails with a habit-limit error and stored habits are unchanged

### Requirement: Habits inject as facts not as routes
Stored family habits MUST be injected into the act system prompt as preference facts. The runtime MUST NOT map habit slot values to forced capability ids, fabricated calls, or NL keyword routers.

#### Scenario: Habit does not fabricate writes
- **WHEN** family habits include a default space and the member sends an ambiguous create request
- **THEN** the server still requires a model plan (ask/probe/calls) and does not auto-emit `item.create` solely because a habit exists

### Requirement: Habit tools are allowlisted
Act MUST expose enabled tools to list, upsert, and remove family habits for the current family only. Client-supplied family id MUST NOT redirect the write.

#### Scenario: List returns current family habits
- **WHEN** a member plans `habit.list`
- **THEN** the tool returns only that family’s habit entries

#### Scenario: Remove clears a slot
- **WHEN** a member plans `habit.remove` with an existing slot
- **THEN** that slot is deleted and no longer appears in the next act prompt

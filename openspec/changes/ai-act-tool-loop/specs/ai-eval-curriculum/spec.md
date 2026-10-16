## ADDED Requirements

### Requirement: Curriculum core plan lists the eight core scenes
The repository MUST include an eval plan `curriculum-core` whose cases cover the curriculum core track: undo after a quantity change, insufficient quantity, same-name ambiguity, recording onto an existing name, adding quantity to existing rows, opening a management page, answering from the knowledge pack, and refusing to dissolve the family. Each case MUST state an outcome a person can read and at least one machine check (`requiredTools`, `requiredToolsAny`, `forbiddenTools`, or `mustAsk`).

#### Scenario: Plan resolves every listed case
- **WHEN** the curriculum-core plan is loaded
- **THEN** every case id exists in the eval bank and names the shared home fixture

#### Scenario: Mock run does not call the model
- **WHEN** the plan runs in mock mode without a token
- **THEN** each case is copied into a new run directory and marked pending, and no act request is sent

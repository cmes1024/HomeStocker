## ADDED Requirements

### Requirement: Habit capability ids are registered
The capability catalog MUST include enabled APIs `habit.list`, `habit.upsert`, and `habit.remove` with hints that describe parameters and the seven-slot cap. Hints MUST NOT teach scene keyword routing.

#### Scenario: Catalog lists habit tools
- **WHEN** capabilities are seeded at the version that introduces habits
- **THEN** those three ids are enabled and available to the model plan

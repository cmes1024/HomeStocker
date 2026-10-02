## ADDED Requirements

### Requirement: Global dialogue habits are injected
Act system prompt MUST include a fixed set of **five** global dialogue/style habits shared by all families. These habits MUST remain short preference/channel rules and MUST NOT encode scene→tool keyword recipes.

#### Scenario: Prompt contains global habits block
- **WHEN** act builds the system prompt
- **THEN** the five locked global habit lines are present for the model

### Requirement: Family habits appear beside other turn context
When the current family has stored habits, act MUST render them into the system prompt (e.g. a `{{HABITS}}` placeholder). When empty, the prompt MUST show an explicit empty marker such as 「无」.

#### Scenario: Empty habits render as none
- **WHEN** the family has zero habit rows
- **THEN** the habits section is present and indicates none

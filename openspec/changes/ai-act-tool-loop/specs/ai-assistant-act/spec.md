## ADDED Requirements

### Requirement: Name overlap is recalled before the first model call
Before the first model call of an act turn, the system MUST compare the member's current text with item names in the current family and MUST inject matching rows into the prompt as recall facts. Matching MUST be substring overlap with catalog names, longest name first so a shorter name inside an already matched span is not also selected. Recall MUST NOT choose a write capability from the wording. Recalled rows MUST receive operable short refs for this turn. The recall section MUST be empty when no catalog name occurs in the text. A later probe in the same turn MUST NOT reuse those short ref numbers.

#### Scenario: Named goods appear before the model answers
- **WHEN** the family has 鸡蛋 and 盐 and the member says 鸡蛋和盐各加一个
- **THEN** the first model prompt contains both rows with quantity and place, and no write has run yet

#### Scenario: Unrelated text recalls nothing
- **WHEN** the member's text contains none of the family's item names
- **THEN** the recall section is empty and the model may still probe

#### Scenario: Longer name consumes the shorter span
- **WHEN** the family has both 大米 and 米 and the text contains 大米
- **THEN** recall includes 大米 and does not also treat the inner 米 as a separate hit

### Requirement: Tool loop replaces the one-shot JSON plan
The model MUST be able to call enabled capabilities as tools and read each tool result before the next step. A turn MUST stop after a bounded number of model steps. Writes that require confirmation MUST stop the loop and return the existing confirm card. Hard-denied capabilities MUST NOT execute. A final message that is a JSON object or array MUST NOT be parsed or executed as a plan. The member-facing statuses remain ask, confirm, and done.

#### Scenario: Search then update stays inside one turn
- **WHEN** the member asks to add one to an existing item and the first tool result shows its current quantity
- **THEN** a later step in the same turn may update that row to the absolute quantity, without a second client request

#### Scenario: Delete still confirms
- **WHEN** the model calls a capability marked confirm
- **THEN** the system returns a confirm payload and does not write until the member confirms

#### Scenario: JSON text does not write
- **WHEN** the model returns a JSON object containing calls and no tool call
- **THEN** those calls are not executed and the member does not see the raw JSON

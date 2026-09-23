## ADDED Requirements

### Requirement: Dissolve cleans family AI subscription
When the owner dissolves a family, the system MUST delete that family’s AI membership subscription record along with other family-scoped artifacts, so a removed household does not keep an active entitlement document.

#### Scenario: Dissolve deletes subscription
- **WHEN** the owner dissolves the family
- **THEN** no AI membership subscription remains for that family id

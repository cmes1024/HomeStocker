## ADDED Requirements

### Requirement: Search capability describes shared keyword retrieval
The enabled catalog entry for item search MUST hint that search uses the same keyword matching rules as inventory probe (name/keyword under optional place scope), so the model can choose probe or search without assuming divergent filters.

#### Scenario: Search hint mentions keyword scope
- **WHEN** item.search is enabled in the catalog
- **THEN** its model-facing hint states keyword/name matching under optional space or location scope consistent with probe

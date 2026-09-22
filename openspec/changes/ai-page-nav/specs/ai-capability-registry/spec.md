## ADDED Requirements

### Requirement: page.get is listed when enabled
The enabled catalog MUST include `page.get` when the seed marks it enabled. The model-facing list MUST use the same id as the executor handler. The entry MUST hint that page docs are fetched on demand (not assumed known) and that opening a page requires registered query keys.

#### Scenario: page.get appears in model list
- **WHEN** the catalog marks page.get as enabled
- **THEN** the model-facing capability list includes page.get with a pageId/query/open argument hint

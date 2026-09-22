## ADDED Requirements

### Requirement: Nav links render as tappable jumps
When act returns a nav-links UI directive with one or more whitelist URLs, the assistant transcript MUST show a tappable control per link. Tapping MUST navigate with the mini-program router to that URL (or switchTab when the registry marks a tab page). The client MUST NOT navigate to URLs that were not returned by the server for that turn. Cold-start transcript restore MUST NOT be required to restore nav link buttons.

#### Scenario: Tap opens item detail
- **WHEN** act returns a nav link to item detail with a concrete id query
- **THEN** tapping the control opens that detail page with the same id

#### Scenario: Client rejects non-returned URLs
- **WHEN** a message only contains free text mentioning a path
- **THEN** the assistant does not invent a navigate control for that path without a server navLinks directive

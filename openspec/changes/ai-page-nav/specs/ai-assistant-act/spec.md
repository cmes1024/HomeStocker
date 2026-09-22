## ADDED Requirements

### Requirement: page.get bodies inject like progressive knowledge
When an act plan executes `page.get` and returns page index or page contract text for the model, the system MAY call the model once more in the same act with that text injected as context so the assistant can reply or emit a follow-up `page.get` open step. Injected page text MUST NOT authorize domain writes by itself. The system MUST NOT invent page paths outside the registry when building that injection.

#### Scenario: Fetch then answer with page facts
- **WHEN** the first plan calls page.get for the item-edit contract and the body is returned
- **THEN** a follow-up model turn in the same act may see that contract text and MUST still use only catalog tools for any further side effects

### Requirement: Open page.get returns navLinks without writing ledger
A successful `page.get` open that validates against the registry MUST surface `navLinks` (or equivalent UI directive) on the act response alongside the code-built report. That step MUST NOT create, update, or remove ledger documents.

#### Scenario: Open does not write items
- **WHEN** a plan only opens a registered page with valid query
- **THEN** the response includes navLinks and no item create/update/remove occurs from that step

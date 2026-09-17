## Purpose

Publishes a versioned, application-wide catalog of which domain actions the natural-language assistant may invoke, so prompt text and the executor share one enablement list.

## ADDED Requirements

### Requirement: Single catalog for prompt and executor
The assistant MUST load a system-level capability catalog (not per family). Only entries marked enabled MUST be described to the model and MUST be eligible for execution. Disabled entries MUST NOT appear in the model-facing capability list.

#### Scenario: Disabled merge is hidden
- **WHEN** the catalog marks item merge as not enabled
- **THEN** the model-facing capability list omits merge and the executor refuses a plan that asks to merge

#### Scenario: Enabled search is listed
- **WHEN** the catalog marks item search as enabled
- **THEN** the model-facing capability list includes item search

### Requirement: Seeded version can be updated
The catalog MUST carry a numeric version. When the deployed seed version is greater than the stored document, the system MUST replace the stored catalog with the seed. Members MUST NOT edit the catalog from the mini program.

#### Scenario: Newer seed overwrites store
- **WHEN** the stored catalog version is lower than the seed shipped with the assistant
- **THEN** the next assistant run uses the seeded catalog contents and version

### Requirement: V2 enabled actions
The initial enabled catalog MUST include item search, list expiring, create, update, and remove, plus creating a location under an existing space. Item remove MUST require explicit member confirmation before execution.

#### Scenario: Remove requires confirmation
- **WHEN** a plan includes item remove and the member has not confirmed that remove
- **THEN** the system does not delete the item

### Requirement: Hard deny of household and secret actions
The executor MUST refuse family create, join, leave, switch, dissolve, theme changes, and AI key mutations even if a stored catalog marks them enabled. The executor MUST refuse to run capture extract or speech transcribe as assistant plan steps in this version.

#### Scenario: Leave family is never executed
- **WHEN** a plan asks to leave or dissolve the family
- **THEN** the system does not change membership and reports that the assistant cannot do that

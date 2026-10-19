# ai-photo-capture Specification

## Purpose

Gives the item edit form a one-shot vision prefill: shoot or pick a photo of household goods, get structured field suggestions back, and confirm by hand before anything lands in the ledger. Reuses the family's own model keys (BYOK) and the hosted key pool — no second model channel, no direct client-to-provider path. This is the successor, in spirit, of the retired `ai-item-capture` V1 (which never did visual recognition); unlike V1 it does not walk a wizard and does not write on its own.

## ADDED Requirements

### Requirement: Vision-capable presets in the model catalog

The server-side model catalog MUST mark which preset models accept image input, and MUST reject unknown provider/model ids for these presets the same way it rejects unknown text models. The catalog's client preset listing MUST expose the per-model vision flag. The key settings page MUST show a badge for vision-capable models.

#### Scenario: Catalog knows a vision model
- **WHEN** the catalog resolves a configured vision-capable provider and model
- **THEN** the resolved preset is accepted and carries `vision = true`

#### Scenario: Unknown model still refused
- **WHEN** a key or platform pool entry names a model outside the catalog
- **THEN** the system rejects it and does not call any provider

### Requirement: One-shot capture endpoint

The system MUST expose a single `ai.capture` action that accepts one compressed image (base64 data URL) plus an optional user hint, and returns structured field suggestions. `ai.capture` MUST NOT write to any ledger collection, MUST NOT append activities, and MUST NOT touch assistant history. Identity and family membership MUST be resolved server-side exactly like other `ai` actions; requests without a current family MUST fail with `NO_FAMILY`. `ai.capture` MUST share the same per-user rate limit as assistant act.

#### Scenario: Capture returns suggestions only
- **WHEN** a member posts a photo of packaged goods with their API keys configured
- **THEN** the response contains editable field suggestions (name/quantity/unit/dates as recognized) and the ledger is unchanged

#### Scenario: No family blocks capture
- **WHEN** a caller without a current family invokes `ai.capture`
- **THEN** the system does not call the model and returns `NO_FAMILY`

### Requirement: Advisory, normalized fields

Returned fields MUST be advisory values for a human to edit, never auto-applied writes. The server MUST normalize and validate each field: `quantity` MUST be a finite non-negative number, dates MUST be `YYYY-MM-DD` within a sane range, `name` and `unit` MUST be trimmed and length-capped. An invalid value MUST be dropped from the response without failing the whole call. The capture prompt MUST instruct the model to extract only what is visible in the image, to leave unreadable fields empty, to never fabricate, and to normalize dates to `YYYY-MM-DD`.

#### Scenario: Garbage date dropped
- **WHEN** the model returns `expireDate: "下周三"` or `quantity: "两瓶"`
- **THEN** the response omits that field and includes the rest

#### Scenario: Unreadable fields stay empty
- **WHEN** the image shows only a package photo with no legible text
- **THEN** the response carries no invented fields

### Requirement: Key selection prefers vision-capable keys

Key resolution for `ai.capture` MUST reuse the family key resolver and hosted pool (including cooldown), restricted to vision-capable presets: the family's own vision-capable keys MUST be preferred, falling back to an enabled vision-capable hosted pool key. When no vision-capable key exists anywhere, the system MUST NOT call any model and MUST return an error code that lets the client hide or disable the prefill entry.

#### Scenario: Text-only default falls back to hosted vision key
- **WHEN** a family's default key is a text-only model and the hosted pool has a vision-capable key enabled
- **THEN** `ai.capture` uses the hosted vision key and succeeds

#### Scenario: No vision key anywhere blocks capture
- **WHEN** neither the family nor the hosted pool has a vision-capable key
- **THEN** the system does not call any model and returns a "no vision capability" error

### Requirement: Edit-form entry fills empty fields only

The item edit page MUST offer a prefill action only when the family has vision capability (from the key list's availability flag). Invoking it MUST send one image (preferring a local not-yet-uploaded photo; falling back to downloading a stored cover image; degrading quietly when that is impossible) and MUST fill only form fields that are currently empty, then tell the member how many fields were filled. Saving MUST remain the existing `item.create` / `item.update` path with `source: 'ui'`; prefill MUST NOT create records, images, or activity entries.

#### Scenario: Empty fields get filled
- **WHEN** a member starts a new item with only a photo taken and taps prefill
- **THEN** empty form fields are populated from the suggestions and the member can edit before saving

#### Scenario: Manual input is never overwritten
- **WHEN** the member already typed a name and taps prefill
- **THEN** the typed name is preserved and only empty fields are filled

#### Scenario: No vision capability hides the entry
- **WHEN** the current family has no vision-capable key and no hosted vision key
- **THEN** the edit page does not show the prefill action

#### Scenario: Capture failure leaves the form untouched
- **WHEN** the model call times out, is rate-limited, returns unrepairable output, or recognizes nothing
- **THEN** the member sees a specific toast and the form keeps its current values

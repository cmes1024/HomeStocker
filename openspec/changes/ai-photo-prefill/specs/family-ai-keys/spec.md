# family-ai-keys Specification (delta)

## ADDED Requirements

### Requirement: Masked list marks vision capability

The client-visible key list MUST include a per-model vision flag for preset models and a boolean telling whether the family currently has usable vision capability (a vision-capable family key or an enabled vision-capable hosted pool key). The full-secret masking rule MUST stay unchanged.

#### Scenario: List carries vision flags
- **WHEN** a member loads the family key list
- **THEN** each preset model entry marks whether it accepts image input, and the payload states whether vision capability is available

#### Scenario: Vision availability true when a vision key exists
- **WHEN** the family's default key is a vision-capable model, or the hosted pool has an enabled vision-capable key and the family has no vision-capable key
- **THEN** the availability flag is true and the secret remains masked

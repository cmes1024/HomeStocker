## Purpose

Stores an optional cover image for an agent-created item beside the ledger document so capture can keep photos without changing the item schema or list UI in this version.

## ADDED Requirements

### Requirement: Attach after successful item create
When a confirmed capture row that has a local photo is saved as a new item, the system MUST upload that photo to family cloud storage and record a media link for that item in the current family. Abandoned rows MUST NOT upload. The item create path used by the manual form MUST remain unaware of this media record.

#### Scenario: Saved row stores a cover file
- **WHEN** a member confirms a draft that still has its capture photo
- **THEN** after the item exists, a media record for that item and family points at an uploaded file

#### Scenario: Abandoned row uploads nothing
- **WHEN** a member abandons a card that had a photo and finishes the session
- **THEN** the system stores no media record and no cloud file for that row

### Requirement: Ledger does not display sidecar covers yet
The family item list and item detail in this version MUST NOT require or render sidecar media. Missing media MUST NOT block viewing or editing the item.

#### Scenario: New agent item visible without photo on list
- **WHEN** an agent-created item has sidecar media
- **THEN** the ledger still shows the item by name and quantity as today, without failing if no image is drawn

### Requirement: Media stays in the same family
Attaching media MUST succeed only when the target item belongs to the caller’s current family. Foreign or missing item ids MUST be rejected.

#### Scenario: Reject attach to another family’s item
- **WHEN** a member tries to attach a file to an item id that is not in the current family
- **THEN** the system rejects the attach and writes no media row

### Requirement: Dissolve cleans media
Dissolving a family MUST remove that family’s sidecar media records and SHOULD delete the underlying storage files when possible.

#### Scenario: Dissolve removes media documents
- **WHEN** the owner dissolves the family
- **THEN** no sidecar media documents remain for that family id

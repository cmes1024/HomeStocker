# atmosphere-storage-cleanup Specification

## Purpose

Reclaim cloud storage used by leftover family atmosphere photos. The product now uses named themes only; custom photo/gradient/solid backgrounds are not offered. Cleanup MUST NOT block the primary write, leave, or dissolve path.

## Requirements

### Requirement: Replace atmosphere deletes previous image file
When a member updates the current family's background and the previous background was a cloud-stored image whose file id differs from the new value (including when the new background is a named theme), the system MUST attempt to delete the previous image file from cloud storage. Named-theme updates with no previous file id MUST succeed without a delete. Failure to delete the file MUST NOT roll back the successful background update.

#### Scenario: Switch from photo to named theme
- **WHEN** a family still has a leftover image background and a member sets a named theme
- **THEN** the system persists the theme and attempts to delete the previous image file

#### Scenario: Theme-to-theme with no file
- **WHEN** a member switches from one named theme to another
- **THEN** the system persists the new theme id and does not fail if no atmosphere image file exists

### Requirement: Leave or dissolve cleans atmosphere image
When a member leaves the current family or the family is dissolved, if that family's background is a leftover cloud-stored image, the system MUST attempt to delete that image file as part of cleanup. File deletion failure MUST NOT prevent leave or dissolve from completing their data cleanup.

#### Scenario: Dissolve family with photo background leftover
- **WHEN** the owner dissolves a family whose background is still an image file id
- **THEN** the system cleans family data as today and attempts to delete the atmosphere image file

#### Scenario: Dissolve family with named theme
- **WHEN** the owner dissolves a family whose background is a named theme
- **THEN** dissolve still completes and does not require an atmosphere file delete to succeed

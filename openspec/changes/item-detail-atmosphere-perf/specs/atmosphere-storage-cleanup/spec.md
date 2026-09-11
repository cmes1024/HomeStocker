## Purpose

Reclaim cloud storage used by family atmosphere photos when the background changes or when a member leaves or the family is dissolved, without blocking the primary write flow if file deletion fails.

## ADDED Requirements

### Requirement: Replace atmosphere deletes previous image file
When a member updates the current family's background and the previous background was a cloud-stored image whose file id differs from the new value (including when the new background is a gradient or solid color), the system MUST attempt to delete the previous image file from cloud storage. Failure to delete the file MUST NOT roll back the successful background update.

#### Scenario: Switch from photo to gradient
- **WHEN** a member changes the family background from an image to a gradient
- **THEN** the system persists the gradient background and attempts to delete the previous image file

#### Scenario: Replace one photo with another
- **WHEN** a member uploads a new atmosphere photo that replaces a previous image file id
- **THEN** the system persists the new image background and attempts to delete the previous file id

### Requirement: Leave or dissolve cleans atmosphere image
When a member leaves the current family or the family is dissolved, if that family's background is a cloud-stored image, the system MUST attempt to delete that image file as part of cleanup. File deletion failure MUST NOT prevent leave or dissolve from completing their data cleanup.

#### Scenario: Dissolve family with photo background
- **WHEN** the owner dissolves a family whose background is an image
- **THEN** the system cleans family data as today and attempts to delete the atmosphere image file

# ai-item-capture Specification

## Purpose

Lets household members bulk-add ledger items from photos plus per-row spoken notes, with a review step, without turning the existing list or edit screens into an AI surface.

## Requirements

### Requirement: Capture entry on the family ledger
The current-family item ledger MUST provide a persistent control that opens the AI capture flow. Opening that flow MUST NOT change how the ledger loads, filters, or edits items. The capture UI MUST live outside the main item edit screen.

#### Scenario: Open capture from ledger
- **WHEN** a member with a current family taps the AI capture control on the item ledger
- **THEN** the system opens the AI capture flow for that family

#### Scenario: Ledger behavior unchanged after returning
- **WHEN** a member returns from the capture flow to the ledger without saving
- **THEN** the ledger still shows the same family items and filters as before the visit, aside from ordinary refresh

### Requirement: One photo row with its own transcript
The capture flow MUST show each selected photo on its own row with an editable text field and a control to record speech for that row only. Speech MUST be converted to text into that row’s field. The system MUST NOT send photos to the language model in this version.

#### Scenario: Two photos get two independent transcripts
- **WHEN** a member adds two photos and records speech on the second row only
- **THEN** the first row’s text stays empty and the second row contains the transcript for that recording

#### Scenario: Member can edit transcript
- **WHEN** speech-to-text fills a row
- **THEN** the member can change that text before extraction

### Requirement: Skip rows without text
The system MUST ignore rows that have a photo but no non-empty text when starting extraction. If every row lacks text, the system MUST NOT call extraction.

#### Scenario: Photo-only row skipped
- **WHEN** a member starts extraction with one row that has text and one row that has only a photo
- **THEN** extraction runs only for the row that has text

#### Scenario: All rows empty blocked
- **WHEN** a member starts extraction while every row’s text is empty
- **THEN** the system does not extract and tells the member that spoken or typed text is required

### Requirement: Single extraction for remaining rows
The system MUST send all non-empty row texts in one extraction request, tagged by stable row indexes, together with the current family’s space, location, and tag names as context. Extraction MUST produce at least one draft card per included row, bound to that row’s photo. If one row’s text clearly splits the same item across different spaces or locations with a quantity for each place, the system MUST show one draft card per place, all bound to that row’s photo. The model MUST NOT write the database.

#### Scenario: Two spoken rows become two draft cards
- **WHEN** extraction succeeds for two indexed texts that each describe a single place
- **THEN** the preview shows two cards whose content corresponds to those indexes and photos

#### Scenario: One row split across two existing spaces
- **WHEN** a row text is「啤酒，一共3瓶，厨房冰箱里有2瓶，客厅有1瓶」and the family catalog includes spaces named「厨房」and「客厅」
- **THEN** the preview shows two cards for that row’s photo: 2 bottles in 厨房 / 冰箱, and 1 bottle in 客厅; it MUST NOT put all 3 bottles in 厨房

#### Scenario: Two named goods in one row
- **WHEN** a row text clearly names two different goods with quantities, such as「啤酒3瓶可乐2瓶都在冰箱」
- **THEN** the preview shows two cards bound to that row’s photo

#### Scenario: Dates resolved against today
- **WHEN** a row text includes a calendar day such as「10月20」
- **THEN** the draft’s expiry field is an absolute `YYYY-MM-DD` interpreted relative to Asia/Shanghai today (next year if that month-day has already passed this year)

### Requirement: Preview abandon and confirm copy
Each draft card MUST allow the member to mark「放弃录入」. While at least one card is not abandoned, the primary action MUST be to confirm entering that many items. When every card is abandoned, the primary action MUST be to abandon the whole session and MUST NOT write items.

#### Scenario: Partial abandon
- **WHEN** two cards are shown and the member abandons one
- **THEN** the primary action indicates confirming one item

#### Scenario: Abandon entire session
- **WHEN** the member abandons every card and confirms abandoning the session
- **THEN** the system creates no items and uploads no photos

### Requirement: Save through existing item write path
Confirmed drafts with a non-empty name MUST be created one at a time through the same item-create path used by the manual form, with `source` equal to `agent`. Missing locations that were flagged to create MUST be created under the resolved space before the item write. Empty names MUST NOT be written. The capture flow MUST NOT invent a second item-write implementation.

#### Scenario: Confirmed draft becomes a ledger item
- **WHEN** a member confirms a valid draft for the current family
- **THEN** a new item appears in that family’s ledger with the drafted name and quantity, marked as agent-sourced

#### Scenario: New location created only when flagged
- **WHEN** a confirmed draft names a location that does not exist under the matched space and is flagged to create
- **THEN** the system creates that location in that space and stores the item with that location

#### Scenario: Spaces and tags are not auto-created
- **WHEN** a draft names a space or tag that is not in the family catalog
- **THEN** the system does not create a new space or tag; unmatched space falls back to the default warehouse and unmatched tags are omitted

#### Scenario: Sequential failure keeps earlier successes
- **WHEN** the first confirmed draft saves and the second item create fails
- **THEN** the first item remains and the member is told which item failed

### Requirement: No chat product in this change
The capture flow MUST be a structured wizard, not a free-form chat transcript. Product navigation MUST NOT re-register the legacy chat page as an entry.

#### Scenario: Capture is not a message list
- **WHEN** a member opens AI capture
- **THEN** they see photo rows and transcripts, not a chat bubble thread as the primary UI

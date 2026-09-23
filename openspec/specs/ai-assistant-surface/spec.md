# ai-assistant-surface Specification

## Purpose

Gives household members a natural-language assistant page in its own subpackage so capture, ledger editing, and chat-style products stay separate surfaces.

## Requirements

### Requirement: Assistant lives in a new subpackage
The natural-language assistant UI MUST live outside the main item edit screen and outside the V1 photo-capture flow. The capture subpackage MUST keep its existing capture behavior. Product navigation MUST NOT register the legacy chat page as the assistant entry.

#### Scenario: Open assistant is not capture
- **WHEN** a member opens the V2 assistant
- **THEN** they see a text input for natural language, not the photo-row capture wizard as the primary UI

#### Scenario: Capture FAB still opens capture
- **WHEN** a member taps the existing AI capture control on the item ledger
- **THEN** the system still opens the V1 photo-capture flow for that family

### Requirement: Text only in this version
The assistant MUST accept typed natural-language text. This version MUST NOT require speech-to-text or sending photos to the model to complete an act.

#### Scenario: Submit text without recording
- **WHEN** a member types a sentence and submits it with no audio and no photo
- **THEN** the system may call act with that text

### Requirement: Clarification returns to the same act
When act returns clarification questions, the assistant MUST show them in the chat transcript with slot choices or a confirmation, and resubmit act with the member’s next utterance plus recent conversation context. After two clarification rounds still missing required slots, the system MUST offer the existing item edit form with any already parsed fields instead of continuing free-form questioning. Chip and short replies MUST be forwarded as text; the client MUST NOT rewrite them into tool call lists.

#### Scenario: Pick which fridge
- **WHEN** act asks which of two fridges and the member taps one chip
- **THEN** the system sends that choice as the next chat turn to act, with prior turns included as context, and the act text MUST retain the original write intent (not treat the place chip alone as a list-inventory query)

#### Scenario: Affirmation is not a local executor
- **WHEN** the member taps a chip that affirms a proposed quantity change
- **THEN** the client does not execute or stage writes locally from that chip; act decides the plan

### Requirement: Chips submit text only
When the member taps a clarification chip, the assistant MUST send the chip label as the next user utterance (and MAY prefix the prior original utterance as clarification context). The client MUST NOT match chip labels with regex or phrase tables to build domain write calls, confirm payloads, or skip act.

#### Scenario: Affirm chip goes through act
- **WHEN** act asked whether to reduce two items by one each and the member taps an affirmative chip
- **THEN** the client calls act with that text as clarification context and does not locally assemble item.update or item.remove calls from the chip wording

### Requirement: Client does not maintain recent or last-ops state
The assistant page MUST NOT maintain a recentItems, recentItemIds, or lastOps client bag for correctness of follow-up acts. Transcript history plus server tools are sufficient for follow-up understanding.

#### Scenario: Next sentence after write needs no local op bag
- **WHEN** an act completes item updates and the member sends another sentence
- **THEN** the act request remains valid without a non-empty client recentItems or lastOps array

### Requirement: Chat transcript is the assistant surface
The assistant page MUST present a chat-style transcript: the member’s sent text appears as a message, the input clears after send, and the next sentence can be typed without deleting the previous one. Act reports, questions, and confirmations MUST appear as assistant messages. The page MUST NOT register the legacy `pages/chat` route.

#### Scenario: Send then speak again
- **WHEN** a member sends one sentence and the report appears
- **THEN** the composer is empty and they can type a follow-up immediately

### Requirement: Local transcript retains twenty text turns
The assistant MUST persist at most twenty transcript turns locally as text only (`role` and `text`), scoped to the current family. The same twenty-turn window MUST be what the page sends as act `history` so on-screen context matches model context. Persisted storage MUST NOT restore confirm blocks, pending write calls, clarification chips, or item result cards after a cold start; those interactive elements MAY exist only within the current page session. When the local buffer exceeds twenty turns, the system MUST drop turns using the same preferential rule as the server: retain assistant turns that contain quantity-change receipt text when possible, then fill with the most recent remaining turns. When the member reaches the oldest retained message while scrolling, the UI MUST indicate that local retention does not go further. Switching the current family MUST NOT show another family’s transcript.

#### Scenario: Relaunch shows recent text only
- **WHEN** a member had a confirm-delete card on screen, leaves the mini program, and reopens the assistant for the same family
- **THEN** at most the last twenty text turns reappear as bubbles, and no confirm actions or pending write calls are restored

#### Scenario: Cap tip at the oldest bubble
- **WHEN** the local transcript is already at twenty turns and the member scrolls to the oldest retained message
- **THEN** the UI shows that only this many turns are kept locally

#### Scenario: Family switch isolates transcript
- **WHEN** the member switches `currentFamilyId` and opens the assistant
- **THEN** the transcript shown is that family’s stored turns (or empty), not the previous family’s

#### Scenario: Buffer full keeps qty receipt when possible
- **WHEN** the local transcript exceeds twenty turns and an older assistant turn contains qty-change receipt text
- **THEN** that receipt-bearing turn is kept in preference to older non-receipt turns within the twenty-turn cap

### Requirement: No key guides to existing key settings
When the current family has no AI key, starting act MUST NOT call the model. The assistant MUST tell the member to configure a key and MUST offer the existing family key-settings page. The assistant MUST NOT implement a second key editor.

#### Scenario: Empty key opens existing settings
- **WHEN** a member submits assistant text and the family has no keys
- **THEN** the system does not call the model and offers the existing AI key settings from the capture subpackage

### Requirement: Nav links render as tappable jumps
When act returns a nav-links UI directive with one or more whitelist URLs, the assistant transcript MUST show a tappable control per link. Tapping MUST navigate with the mini-program router to that URL (or switchTab when the registry marks a tab page). The client MUST NOT navigate to URLs that were not returned by the server for that turn. Cold-start transcript restore MUST NOT be required to restore nav link buttons.

#### Scenario: Tap opens item detail
- **WHEN** act returns a nav link to item detail with a concrete id query
- **THEN** tapping the control opens that detail page with the same id

#### Scenario: Client rejects non-returned URLs
- **WHEN** a message only contains free text mentioning a path
- **THEN** the assistant does not invent a navigate control for that path without a server navLinks directive

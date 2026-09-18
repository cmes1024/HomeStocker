## Purpose

Gives household members a natural-language assistant page in its own subpackage so capture, ledger editing, and chat-style products stay separate surfaces.

## ADDED Requirements

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
When act returns clarification questions, the assistant MUST show them in the chat transcript with slot choices or a confirmation, and resubmit act with the member’s next utterance plus recent conversation context. After two clarification rounds still missing required slots, the system MUST offer the existing item edit form with any already parsed fields instead of continuing free-form questioning.

#### Scenario: Pick which fridge
- **WHEN** act asks which of two fridges and the member taps one chip
- **THEN** the system sends that choice as the next chat turn to act, with prior turns included as context, and the act text MUST retain the original write intent (not treat the place chip alone as a list-inventory query)

### Requirement: Chat transcript is the assistant surface
The assistant page MUST present a chat-style transcript: the member’s sent text appears as a message, the input clears after send, and the next sentence can be typed without deleting the previous one. Act reports, questions, and confirmations MUST appear as assistant messages. The page MUST NOT register the legacy `pages/chat` route.

#### Scenario: Send then speak again
- **WHEN** a member sends one sentence and the report appears
- **THEN** the composer is empty and they can type a follow-up immediately

### Requirement: No key guides to existing key settings
When the current family has no AI key, starting act MUST NOT call the model. The assistant MUST tell the member to configure a key and MUST offer the existing family key-settings page. The assistant MUST NOT implement a second key editor.

#### Scenario: Empty key opens existing settings
- **WHEN** a member submits assistant text and the family has no keys
- **THEN** the system does not call the model and offers the existing AI key settings from the capture subpackage

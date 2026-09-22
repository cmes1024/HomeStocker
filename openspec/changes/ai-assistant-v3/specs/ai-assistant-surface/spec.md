## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Clarification returns to the same act
When act returns clarification questions, the assistant MUST show them in the chat transcript with slot choices or a confirmation, and resubmit act with the member’s next utterance plus recent conversation context. After two clarification rounds still missing required slots, the system MUST offer the existing item edit form with any already parsed fields instead of continuing free-form questioning. Chip and short replies MUST be forwarded as text; the client MUST NOT rewrite them into tool call lists.

#### Scenario: Pick which fridge
- **WHEN** act asks which of two fridges and the member taps one chip
- **THEN** the system sends that choice as the next chat turn to act, with prior turns included as context, and the act text MUST retain the original write intent (not treat the place chip alone as a list-inventory query)

#### Scenario: Affirmation is not a local executor
- **WHEN** the member taps a chip that affirms a proposed quantity change
- **THEN** the client does not execute or stage writes locally from that chip; act decides the plan

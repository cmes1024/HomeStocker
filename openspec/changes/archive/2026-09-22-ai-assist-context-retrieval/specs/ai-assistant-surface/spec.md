## MODIFIED Requirements

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

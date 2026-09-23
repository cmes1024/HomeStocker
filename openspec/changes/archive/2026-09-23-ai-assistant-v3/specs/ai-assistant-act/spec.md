## ADDED Requirements

### Requirement: Act does not use client recent bags as truth
Act MUST accept optional sanitized conversation history and optional focus item id. Act MUST NOT treat client-supplied recentItems or recentItemIds as authoritative for addressing recently discussed goods. If those legacy fields are present, the system MUST ignore them as truth for short refs and planning.

#### Scenario: Follow-up works with history only
- **WHEN** a prior turn updated goods and the next act request includes history but omits recentItems
- **THEN** the system still invokes the model with that history and available tools so the member can ask to revert or adjust quantities

## MODIFIED Requirements

### Requirement: Follow-up turns may carry sanitized context
Act MAY accept a client-supplied conversation history. History MUST be treated as prompt context only and MUST NOT authorize writes. The server MUST sanitize history to a bounded maximum number of text turns (user/assistant with non-empty text). Within that maximum window, truncation MUST preserve semantic continuity of the most recent exchanges: the system MUST prefer keeping whole recent turns (and SHOULD avoid dropping only the assistant success report that explains what was just done). Per-turn text length limits used when building model history MUST be aligned with what the assistant surface persists, so the server does not silently cut meaning the client still shows. Operable short refs for a turn MUST come only from current-turn focus or probe/search rows injected for that turn. Database document ids MUST NOT appear in the model prompt except as those opaque short refs.

#### Scenario: Change the milk just recorded
- **WHEN** a member first asks to record milk in the kitchen fridge and then says to change it to three bottles
- **THEN** the follow-up act includes the prior turns as context and the model may probe or use focus/probe short refs from the current turn to address that item

#### Scenario: History at the cap keeps the newest exchanges
- **WHEN** the client sends more turns than the configured history maximum
- **THEN** the model prompt keeps the most recent sanitized turns up to that maximum, excess older turns do not authorize any write, and the retained window still includes the latest member request and the latest assistant outcome needed to understand follow-ups such as undo

#### Scenario: History longer than twenty is truncated
- **WHEN** the client sends more than twenty history turns and the configured maximum is twenty
- **THEN** the model prompt includes at most twenty sanitized turns (preferring the most recent), and excess turns do not authorize any write

#### Scenario: Per-turn cap does not strand undo
- **WHEN** the previous assistant turn reported completing quantity updates on named goods and the member asks to undo within the history window
- **THEN** those outcome lines remain available in model history at a length sufficient to understand what was done (not stripped by a tighter server-only truncation than the surface transcript)

#### Scenario: Legacy recentItems does not create refs
- **WHEN** the client sends recentItemIds
- **THEN** those ids do not appear as operable short refs solely because the client echoed them

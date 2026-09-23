## MODIFIED Requirements

### Requirement: Follow-up turns may carry sanitized context
Act MAY accept a client-supplied conversation history. History MUST be treated as prompt context only and MUST NOT authorize writes. The server MUST sanitize history to at most **twenty** text turns (user/assistant with non-empty text, truncating each turn’s text to a bounded length). When trimming, the server MUST prefer retaining assistant turns that contain quantity-change receipt text (before→after) over older turns without such receipts. Recently written rows for follow-up addressing MUST come from current-turn focus or probe/search rows, exposed as opaque short refs for this turn only—not from a cross-turn operation memory bag. Database document ids MUST NOT appear in the model prompt except as those opaque short refs.

#### Scenario: Change the milk just recorded
- **WHEN** a member first asks to record milk in the kitchen fridge and then says to change it to three bottles
- **THEN** the follow-up act includes the prior turns as context and can address that item via this turn’s short ref derived from probe/focus

#### Scenario: History longer than twenty is truncated
- **WHEN** the client sends more than twenty history turns
- **THEN** the model prompt includes at most twenty sanitized turns (preferring the most recent, and preferring qty-receipt assistant turns within that budget), and excess turns do not authorize any write

#### Scenario: History longer than twenty prefers receipts
- **WHEN** the client sends more than twenty history turns including an assistant qty-change receipt
- **THEN** the model prompt includes at most twenty sanitized turns and still retains that receipt-bearing turn when it fits the preferential budget

#### Scenario: Legacy recentItems does not authorize refs
- **WHEN** the client sends recentItemIds that are not loaded as focus or probe
- **THEN** those ids do not appear as operable short refs solely because the client echoed them

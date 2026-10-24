## ADDED Requirements

### Requirement: Confirmation is not a fabricated user utterance

Tapping a confirmation card MUST NOT write a synthetic member message into the transcript or into the next act history. The confirmation MUST be expressed only through the `confirmed` flag with the `planId` and the pending calls. Any visible acknowledgement MUST be rendered as an assistant message, never as a member message.

#### Scenario: Merge confirmation leaves no member text

- **WHEN** the member taps the merge confirmation button
- **THEN** the transcript gains no member message containing 确认合并, and the next act history contains no such member turn

#### Scenario: Cancel is an assistant acknowledgement

- **WHEN** the member dismisses a confirmation card
- **THEN** the acknowledgement appears as an assistant message and no member message is created

### Requirement: Model prose is not discarded on confirm or done

On a `confirm` response the client MUST render the model's lead text, falling back to the fixed confirmation title only when the lead is empty. On a `done` response the client MUST prefer the model reply, then the lead, then the report lead. The client MUST NOT replace the message body with a fixed title when the model produced prose.

#### Scenario: Lead survives a confirmation card

- **WHEN** an act returns `status: confirm` with a non-empty lead
- **THEN** the confirmation message shows that lead above the confirmation block

#### Scenario: Reply survives a done turn

- **WHEN** an act returns `status: done` with a non-empty reply
- **THEN** the transcript shows that reply rather than only the code-built report lead

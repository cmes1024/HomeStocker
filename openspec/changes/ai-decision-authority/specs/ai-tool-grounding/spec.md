## ADDED Requirements

### Requirement: Write calls declare parameter provenance

Every write capability call that targets a place or a quantity MUST carry a `_src` object declaring the origin of those parameters. Each entry MUST name a `from` value from `user`, `probe`, `inference`, `habit`, `default`, and MUST include the supporting fields required by that origin (`quote` for `user`, `via` for `probe` and `inference`).

#### Scenario: Inferred place carries its basis

- **WHEN** the model updates an item to 厨房 / 橱柜 after probing a row that already sits there
- **THEN** the call contains `_src` entries for `spaceName` and `locationName` with `from: inference` and `via` naming that probed ref

#### Scenario: Quoted place carries the member's words

- **WHEN** the member says 放厨房 and the model sets `spaceName: 厨房`
- **THEN** the call declares `from: user` with a `quote` that appears in the ground text

### Requirement: Provenance is verified deterministically

The server MUST verify provenance without interpreting natural language. `user` MUST be checked against the ground text composed of the current utterance plus the most recent family utterances. `probe` MUST be checked against the named ref row and field value. `habit` MUST be checked against the stored slot value. `default` MUST be accepted. No check may consult a phrase table or a regular expression that infers intent.

#### Scenario: Probe value mismatch is rejected

- **WHEN** a call declares `spaceName` as `probe` via `P3` but `P3` sits in 客厅
- **THEN** the server rejects the call with a structured grounding code and does not execute it

#### Scenario: Habit default is accepted

- **WHEN** a create call declares `from: habit` and the family habit default space matches the given space
- **THEN** the call is accepted without requiring the space name to appear in the utterance

### Requirement: Inference provenance requires a real basis

An `inference` declaration MUST name a `via` ref that exists in the current act. The server MUST NOT evaluate whether the inference is correct. A missing or unknown `via` MUST be rejected.

#### Scenario: Inference without basis is rejected

- **WHEN** a call declares `from: inference` for `locationName` but omits `via`
- **THEN** the server rejects the call with `INFERENCE_NO_BASIS` and does not execute it

#### Scenario: Inference with basis is accepted

- **WHEN** a call declares `from: inference` with `via: P1` and `P1` exists
- **THEN** the server accepts the call even though the utterance never named that place

### Requirement: Grounding failures return structured codes

When grounding fails, the tool feedback MUST be a compact JSON object carrying `code`, the offending `field`, the `given` value, the `declared` origin, and up to five `candidates`. The feedback MUST NOT contain an imperative Chinese instruction telling the model what to ask next.

#### Scenario: Unplaced write returns candidates

- **WHEN** a create call omits both space and location
- **THEN** the feedback carries `PLACE_UNGROUNDED` with the existing spaces as `candidates` and no instruction sentence

#### Scenario: Ambiguous name returns rows

- **WHEN** two items share a name and the call does not identify one
- **THEN** the feedback carries `REF_AMBIGUOUS` with both rows described in `candidates`

### Requirement: Absent provenance is audited not blocked

During the compatibility window, a write call without `_src` MUST still execute, and the server MUST record an audit counter identifying the missing origin. The counter MUST be logged per act so provenance coverage can be measured before enforcement tightens.

#### Scenario: Legacy client call still runs

- **WHEN** a write call arrives with no `_src` block
- **THEN** the call executes and the act log records `audit.noSource` for that field

## ADDED Requirements

### Requirement: Issuing a code can optionally grant the hosted model
The admin issue operation MUST accept an optional hosted-model flag. When the flag is omitted or false, the issued code MUST NOT grant the hosted model. When the flag is true, the code MUST record that it grants the hosted model for the same number of days already stored on the code. Existing issue requests that omit the flag MUST keep working.

#### Scenario: Omitted flag does not grant the model
- **WHEN** the admin issues a capacity code without a hosted-model flag
- **THEN** the stored code does not grant the hosted model

#### Scenario: Flag snapshots the grant
- **WHEN** the admin issues a capacity code with the hosted-model flag set
- **THEN** the stored code grants the hosted model for that code’s days

### Requirement: Redeem applies the hosted grant without changing capacity math
Redeeming a code that grants the hosted model MUST extend the family’s hosted-model expiry by that code’s days, using the hosted-model clock, and MUST still extend capacity expiry with the existing capacity formula. Redeeming a code that does not grant the hosted model MUST NOT change the hosted-model expiry. A code that grants only the hosted model on top of capacity MUST NOT create a separate subscription row.

#### Scenario: Flagged code extends both clocks
- **WHEN** a member redeems an unused code that grants the hosted model
- **THEN** capacity expiry extends as it does today and the hosted-model expiry extends by the code’s days

#### Scenario: Unflagged code leaves the hosted expiry
- **WHEN** a member redeems an unused code that does not grant the hosted model
- **THEN** capacity expiry extends and the hosted-model expiry stays as it was

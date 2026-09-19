## ADDED Requirements

### Requirement: Create-class failure triggers at most one model replan
When a create-class tool step fails (item/space create or createMany, or createLocation / createLocationMany), the system MUST stop further calls in that plan, inject an execution receipt (successes, failure, pending calls) and the current structure tree into the assistant context, and MAY ask the model once to emit a new plan for remaining work. The executor MUST NOT silently rewrite space or location targets. The system MUST NOT run inventory search solely to build the receipt.

#### Scenario: Location create fails then model replan
- **WHEN** space.createLocation fails and later item.createMany steps were pending
- **THEN** the system provides an EXEC receipt to the model for one replan turn and does not invent degrade placements in code

#### Scenario: No third planning round
- **WHEN** the replan turn’s calls also fail a create-class step
- **THEN** the system does not start another replan in the same act

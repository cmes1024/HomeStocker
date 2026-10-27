## ADDED Requirements

### Requirement: A baseline run is recorded before any behaviour change

Before the first behaviour-changing batch, the repository MUST contain a completed `ai-eval` run for `release-smoke`, `daily-use`, and `day-flow` under `ai-eval/runs/`, and its `summary.md` MUST state the pass count for each plan. Subsequent batches MUST compare against that recorded baseline.

#### Scenario: Baseline exists before batch one

- **WHEN** the first behaviour-changing batch is proposed
- **THEN** a baseline run directory with pass counts for all three plans already exists in the repository

#### Scenario: Missing baseline blocks progress

- **WHEN** a behaviour-changing batch is proposed and no baseline run exists
- **THEN** the batch is not accepted until the baseline is produced

### Requirement: Each batch declares a pass line

Every batch in `tasks.md` MUST state its acceptance numbers: `release-smoke` MUST reach one hundred percent, and `daily-use` plus `day-flow` MUST NOT fall below the recorded baseline. The batch report MUST record the observed numbers next to the declared line.

#### Scenario: Batch report compares numbers

- **WHEN** a batch is completed
- **THEN** its report shows declared pass line, observed pass line, and the delta against baseline

### Requirement: Expected outcome changes are declared

Any modification to an `expected` block in the eval bank MUST be listed in `tasks.md` with its reason. Tightening a constraint is always allowed; relaxing a constraint MUST be justified by a behavioural contract change in this change's specs.

#### Scenario: Relaxed constraint is justified

- **WHEN** a case's `expected.callExcludes` entry is removed
- **THEN** the corresponding requirement change is cited in the task entry

### Requirement: Regression bank covers the three decision classes

The eval bank MUST contain at least one case for each of: placing by inference without asking again, same-name ambiguity that requires identification, and multi-turn reference to an item established in an earlier turn. Each case MUST reproduce the member-visible failure it guards against.

#### Scenario: Inference placement case

- **WHEN** the inference-placement case runs
- **THEN** the act completes the update in a single turn without a clarification round

#### Scenario: Multi-turn reference case

- **WHEN** the multi-turn case runs across three or more turns
- **THEN** the final turn targets the item identified in an earlier turn without a reference error

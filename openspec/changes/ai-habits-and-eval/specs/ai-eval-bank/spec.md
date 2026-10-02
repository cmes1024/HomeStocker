## ADDED Requirements

### Requirement: Eval bank is read-only question storage
The repository MUST keep an `ai-eval/` tree with a case bank under `bank/` partitioned by perspective `product`, `eng`, and `user`. Case files are the source of truth and MUST NOT be mutated by a test run.

#### Scenario: Run does not rewrite bank
- **WHEN** an eval plan is executed
- **THEN** files under `ai-eval/bank/` remain byte-identical and results are written only under a new `ai-eval/runs/<id>/` directory

### Requirement: Each case carries expected outcomes
Every bank case MUST include an id, perspective, title, user-facing prompt or multi-turn script, setup or fixture reference, and an `expected` object describing machine-checkable constraints and/or `manual` notes.

#### Scenario: Product curriculum case has expected tools
- **WHEN** a product case migrated from curriculum core track is loaded
- **THEN** its `expected` names required or forbidden tool uses for that scenario

### Requirement: Runs copy the exam paper
Executing a plan MUST create a new run directory containing a snapshot of the plan, copied case files for selected ids, per-case result files, and a `summary.md` aggregating pass/fail/manual.

#### Scenario: Selective plan run
- **WHEN** a plan lists a subset of case ids
- **THEN** only those cases are copied into the run and judged

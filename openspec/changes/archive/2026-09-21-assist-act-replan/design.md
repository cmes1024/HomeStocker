## Context

Batch create tools exist. Failure previously stopped the whole call list. Product rule: code never makes planning decisions; model re-plans from execution receipts.

## Decisions

1. Stop at first create-class failure; pending calls returned for prompt, not auto-run.
2. At most one replan (like probe).
3. EXEC text from executed/failed/pending + renderTreeNames only — no extra queries.
4. Handlers unchanged for degrade; only success/fail.

## Risks

- Extra DeepSeek round on failure (cost/latency).
- Model may still ask or skip goods — acceptable.

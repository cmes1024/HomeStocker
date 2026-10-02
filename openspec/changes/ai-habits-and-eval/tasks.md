## 1. Design lock

- [x] 1.1 Lock global 5 + family slot types (5–7) and red lines in design/proposal
- [x] 1.2 Write plan docs under `docs/plans/2026-10-02-ai-habits-and-eval/`

## 2. Eval bank

- [x] 2.1 Scaffold `ai-eval/` (schemas, bank, plans, README)
- [x] 2.2 Migrate curriculum C1–C8 into `bank/product/`
- [x] 2.3 Add sample `eng/` and `user/` cases
- [x] 2.4 Runner: copy plan → `runs/`, write summary skeleton
- [x] 2.5 Runner: mock judge against `expected`

## 3. Runtime habits

- [x] 3.1 Global 5 in `AssistPromptTexts` + bump prompt version + `{{HABITS}}`
- [x] 3.2 Flyway `family_ai_habits` + repository/service (max 7)
- [x] 3.3 Inject family habits in `ActContextBuilder` / `ActPrompt`
- [x] 3.4 Capability seed v37 + `habit.list|upsert|remove` in `DomainTools`

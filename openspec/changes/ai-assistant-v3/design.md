## Context

See `proposal.md`. Pain was keyword routers plus session bags (recentItems / proposed lastOps). Constraint: WeChat + CloudBase; model-only intent; single write path; no extra DB round-trips just to remember「刚加了 1」.

## Goals / Non-Goals

**Goals:**
- Uncertain **question/slots** → ask the member; uncertain **data** → read tools (probe/search/…); **no session operation memory**
- Prompt = soft business guidance (norms, boundaries, scenarios, tool explanations)—neither hard-coded phrase tables nor laissez-faire
- Hard limits in **code** only (allowlist, confirm, identity, no NL routers); modular `ai` package; slim client

**Non-Goals:**
- Server or client **operation memory** (lastOps, recentItems echo, aiSessions ledger)
- Using prompt as a second executor or keyword router
- LangGraph / new domain writers

## Decisions

### 1. Ask / probe / no memory
- **Choice:** Ambiguous intent or missing slots → `ask`. Need current stock or identity of rows → allowlisted reads. User said「各加 1」and success was reported → undo is「各减 1」from **history**, optionally after reading current qty. Delete/reduce by N → check stock via tools, else report. **No** parallel memory bag—complexity creates chaos.

### 2. Kill session bags
- **Choice:** Remove client recentItems; do **not** add lastOps / aiSessions.
- **Alternatives rejected:** DB lastOps; client pass-through ledger (same role as recent).

### 3. Short refs
- **Choice:** F*/P* only for **this turn** (focus / probe). No cross-turn R* bag.

### 4. Keyword routers
- **Choice:** Delete NL routers; chips = text to act; confirm = model-issued confirm + `confirmed` replay only.

### 5. Prompt role
- **Choice:** Prompt carries product knowledge, business norms, operation boundaries, scenario descriptions, and tool capability hints so the model behaves well. It MUST NOT be treated as hard enforcement (code does that) and MUST NOT be emptied into “do whatever.” It MUST NOT become「用户说了某句 → 必须走某接口」对照表. Bump prompt version when reshaping.

### 6. History window keeps semantic continuity
- **Choice:** Keep a bounded max turn count, but truncation MUST preserve continuity of recent meaning: prefer whole recent user/assistant exchanges; do not clip the just-completed “add then report success” so thin that undo cannot be understood; align per-turn text caps between client transcript and server sanitize (today client 500 vs server 200 is a continuity bug); leave budget so history is not crowded out by an oversized system blob.
- **Alternatives rejected:** Unlimited history (cost/risk); aggressive 200-char server cut that discards assistant result lines.

## Risks / Trade-offs

- [Same-name ambiguity] → Probe + ask; do not invent a memory bag to paper over it.
- [History omits numbers] → Model asks or probes; empty-plan fallback stays.
- [Activities log as before/after] → Out of scope unless later product asks; not required for「各加 1 → 撤销减 1」.

## Migration Plan

1. Strip recentItems paths (client + server truth use).
2. Strip any lastOps scaffolding if started; no aiSessions.
3. Prompt + module cleanup; ship mini program + `ai` together.
4. Rollback = prior package pair.

## Open Questions

- None blocking; optional later: use `activities` for audit-quality undo (YAGNI now).

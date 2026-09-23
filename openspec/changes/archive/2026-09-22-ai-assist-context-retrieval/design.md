## Context

See `proposal.md`. V3 control plane is in place (`ai.act` + history + probe). Pain is retrieval quality, history truncation dropping qty receipts, and prompt token bulk—not intent routing.

## Goals / Non-Goals

**Goals:**
- Named inventory lookup shares one keyword path for probe and `item.search`
- Probes with a name stay name-scoped; receipt recovery prefers name+space over listAll
- History truncation within the 20-turn cap prefers assistant turns that contain qty-change receipts
- Slimmer prompt / hints without becoming a phrase router

**Non-Goals:**
- ES / vector search; lastOps; Jev; NL keyword→calls; expanding knowledge packs unless forced by gaps

## Decisions

### 1. Shared keyword retrieval in `itemsQuery`
- **Choice:** One `searchItemsByKeyword` (or enhanced `listItemsCompact`) used by `runProbe` and `item.search`. With keyword: pull a larger candidate window then filter+cap into P*. With space/location: filter first.
- **Alternatives rejected:** Calling cloud `item.search` from ai (extra hop, duplicate auth); ES.

### 2. Receipt recovery probe
- **Choice:** `probeFromReceipts` always prefers per-receipt name (+ space when present); listAll only when no names.
- **Alternatives rejected:** Always listAll (noisy).

### 3. History truncation prefers receipts
- **Choice:** When trimming to 20 turns, keep a protected set of assistant turns matching qty receipt pattern (`已改` + `→`), fill remaining slots with most recent other turns. Same rule client + server.
- **Alternatives rejected:** Unlimited history; server lastOps bag.

### 4. Prompt slim + soft name-probe hint
- **Choice:** Cut redundant examples; one soft line that named stock ops should probe with name; bump version.
- **Alternatives rejected:** Phrase→API tables.

## Risks / Trade-offs

- [Larger keyword pull] → Cap P* rows; family-wide still bounded.
- [Receipt-prefer truncation drops older chat] → Acceptable; undo needs receipts more than chitchat.
- [Receipt regex still format-coupled] → Keep presentation summary format stable; test parser when copy changes.

## Migration Plan

1. Ship Wave 1 (`ai` + prompt bump) with A–C smoke.
2. Ship Wave 2 (client transcript + server sanitize) together.
3. Ship Wave 3 prompt slim; archive change.

Rollback = prior `ai` + `packageAiAssist` pair.

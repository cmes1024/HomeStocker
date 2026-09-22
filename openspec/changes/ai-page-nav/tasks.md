## 1. Page registry module

- [x] 1.1 Add `cloudfunctions/ai/pages/` registry (ids, paths, query required/optional, hints); exclude demo/chat/pockets
- [x] 1.2 Export `renderIndex`, `getPage`, `buildNavUrl` (validate query; support `ref`→id for detail/edit via focus/probe maps)
- [x] 1.3 Cap opens/gets per act (mirror knowledge MAX_GETS)

## 2. Capability + tool

- [x] 2.1 Add `page.get` to `capabilities.js` seed; bump `CAPABILITY_VERSION`
- [x] 2.2 Implement `tools/pageGet.js` (index / one page / open→navLinks); register in `tools/registry.js`
- [x] 2.3 Plumb `pages`/`page`/`navLinks`/`ui` through execution report rows

## 3. Orchestrator + prompt

- [x] 3.1 After successful non-open `page.get`, inject page body and allow one follow-up model turn (same pattern as knowledge)
- [x] 3.2 Soft prompt note: 直达页面前用 page.get；禁止臆造 path；open 须合规 query（bump assist prompt version if needed)
- [x] 3.3 Presentation: open step → short lead + pass through navLinks (no fake ledger write cards)

## 4. Assistant surface

- [x] 4.1 Parse `navLinks` / `ui: navLinks` on act result; show tappable links on the assistant bubble
- [x] 4.2 Tap → `wx.navigateTo` (fail toast); only URLs from server payload
- [x] 4.3 Cold-start transcript: do not restore navLinks (align with chips/confirm)

## 5. Docs / verify

- [x] 5.1 Cross-check registry paths vs `app.json` product routes
- [ ] 5.2 Manual smoke: get index → get items.detail → open with focus ref → tap opens detail（本地已用 node 校验 path/ref→url；真机/开发者工具待你点验）
- [x] 5.3 Brief note under `docs/plans/` or AGENTS AI bullet that page nav is via `page.get` (optional one-liner)

# Changelog

## 0.3.5 - 2026-05-08

Fixes the "target not found: vn" failure mode when CLI invocations span
across iTerm panes (or any environment where TERM_SESSION_ID changes
between calls). The fallback owner is derived from
`TERM_SESSION_ID` / `ITERM_SESSION_ID` / `CLAUDE_SESSION_ID` etc., so each
iTerm pane gets a different owner and labels stored in pane A become
invisible to pane B even when both point at the same browser profile. The
labels.json file showed 11+ owner-scoped entries for `vna` across
different sessions, all under the same `profile:chrome:Default` base
context — perfectly resolvable across owners but the lookup was
strict-same-owner.

Changed:

- `contextFlagsForKnownTarget(target, owner)` is now two-tier:
  1. Same-owner first (preserves prior behavior — parallel sessions
     don't accidentally hijack each other's `-t app` references).
  2. Cross-owner fallback when same-owner has no match. Picks up any
     entry across owners under the SAME base context (e.g.
     `profile:chrome:Default`); returns those flags only if the base
     context is unique. Anonymous + profile contexts never bleed into
     each other.
- `BrowserDaemon.labelsForContext({ includeCrossOwner: true })` returns a
  merged label map: cross-owner same-base-context labels first, then
  same-owner overrides on conflict. Used internally for display + as a
  resolution fallback.
- `BrowserDaemon.resolveTarget(label)` now falls back to cross-owner
  labels when the same-owner label is missing OR resolves to a dead tab.
  Reports `target stale (resolved across owners; the underlying tab was
  closed)` when an old label points to a closed tab so the user knows
  to re-`tab ensure`.
- `BrowserDaemon.tabs()` now displays cross-owner labels in `tab list`
  output. A label set in another iTerm pane / Claude Code session
  surfaces next to its tab. Mutations (`setLabel`) still write under the
  current owner, so each session has its own label registry.

Self-test gains 5 new assertions for the cross-owner fallback covering:
mixed owner labels, base-context isolation between profile and
anonymous, contextFlagsForKnownTarget unique-base-context resolution
when no same-owner match exists.

Validation:

- `node --check scripts/realbrowser.mjs`
- `./scripts/realbrowser --version` → 0.3.5
- `./scripts/realbrowser self-test`

User-facing impact: chained shell commands like
`realbrowser tab select X --profile chrome:Default --label vn && realbrowser read tree -t vn`
now succeed even when the chained second invocation lands in a context
without `--profile` (which iTerm-spawned shells often produce because
TERM_SESSION_ID changed). Previously this scenario errored
`target not found: vn`. Mutations on cross-owner-resolved targets still
respect `profileTargetProven`/`--allow-browser-scope-target` rules.

## 0.3.4 - 2026-05-08

Adopts openclaw's canonical ARIA role classification verbatim and adds
hierarchy preservation in `read tree --interactive --compact`. The 0.3.3
test run produced a flat 112-line `read tree -i -c` output with no "where
am I" context — every button at depth 0, no enclosing region/tabpanel/
landmark to ground the model's mental map of the page.

Changed:

- ARIA role classification refactored to mirror
  openclaw's `snapshot-roles.ts` exactly:
  - `INTERACTIVE_ROLES` (17 roles, was already aligned).
  - `CONTENT_ROLES` (10 roles): article, cell, columnheader, gridcell,
    heading, listitem, main, navigation, region, rowheader. Get a ref
    when named; render in compact mode regardless of name.
  - `STRUCTURAL_ROLES` (19 roles): application, directory, document,
    generic, grid, group, ignored, list, menu, menubar, none,
    presentation, row, rowgroup, table, tablist, toolbar, tree,
    treegrid. Skipped in compact mode unless named.
  Sets are documented "keep in sync with openclaw" so future divergence is
  obvious.
- Plus an `ALWAYS_LANDMARK_ROLES` set (banner, complementary, contentinfo,
  dialog, alertdialog, tabpanel, form, search) for landmarks that
  openclaw doesn't classify but that Chrome's AX tree emits and that we
  always want as hierarchy anchors.
- `read tree --interactive --compact` now preserves landmark + content-role
  hierarchy when the role scopes at least one interactive descendant.
  Empty regions are still skipped (matches openclaw's `compactTree` post-
  pass that drops parents whose subtree has no `[ref=]` children). This
  deviates from openclaw's interactive mode (which is flat) — verified
  improvement: a page with 100+ buttons now shows them grouped under their
  `region "Search"` / `tabpanel "Mua vé"` / `heading "..."` ancestors
  instead of as a flat list.
- `read tree --compact` (without `--interactive`) now matches openclaw's
  `processLine` semantics: skip `STRUCTURAL_ROLES && !name`, render
  everything else.

Validation:

- `node --check scripts/realbrowser.mjs`
- `./scripts/realbrowser --version` → 0.3.4
- `./scripts/realbrowser self-test` (parser, ref-pattern, ariaTree,
  lineDiff, bug-fix regressions, plus 0.3.2/0.3.3/0.3.4 assertions
  including 4 new hierarchy preservation checks: named main+region
  rendered, tabpanel rendered, interactive buttons rendered, empty region
  skipped, indentation > 0 for nested elements).

Reference: openclaw's role classification at
`extensions/browser/src/browser/snapshot-roles.ts` and
`pw-role-snapshot.ts` (line-by-line YAML processing of Playwright's
`ariaSnapshot({ mode: "ai" })` output). We adopt the role sets verbatim
and add hierarchy preservation in the `-i -c` interactive view since raw
CDP doesn't ship with Playwright's ai-mode formatter.

## 0.3.3 - 2026-05-08

Tightens `read autocomplete` after the v0.3.2 run showed the reader picking
a small Login/Register popup (z=9999, 200x131) instead of the actual airport
autocomplete on every call. The new heuristic + a `--near <ref>` anchor
makes the reader usable on real sites where small high-z overlays coexist
with the dropdown the user opened.

Changed:

- `read autocomplete` (alias `read overlay`) layer eligibility now requires
  the layer to be either >= 150x80 OR contain >= 3 list-like items
  (`li`, `[role=option]`, `[role=menuitem]`, `[role=row]`, `[role=listitem]`,
  `[role=treeitem]`, plus a fallback that counts text-bearing direct
  children). Tiny popups without list structure are skipped — the result
  reports `(skipped N ineligible layers)` so the model knows.
- Anchor proximity is now strictly enforced when an anchor exists: layer
  must horizontally overlap (anchor.left/right ± 150px) and be within
  ±700px vertically (below, overlapping, or above). When no eligible layer
  is near the anchor, returns `ok:false` with `(no eligible layer near
  anchor)` and a list of skipped candidates instead of silently falling
  through to the wrong layer.
- Anchor source priority changed: explicit `--near <ref>` first, then
  `document.activeElement` (only if it is an `INPUT`/`TEXTAREA`/contentEditable —
  this prevents `BODY` or unrelated buttons from being the anchor when the
  page lost focus).
- Output now reports the chosen layer's `listItems` count and whether it
  was list-like, plus the `anchor source` (`near-arg` vs `active-input`),
  so the model can verify the reader picked the right layer.

Added:

- `read autocomplete --near <ref>` — anchor the floating-layer search at a
  specific button or input ref. Use this whenever the dropdown opened from
  a click rather than a focused input. Tiny ~10-line wiring; the in-page
  evaluator resolves the anchor selector first via `pierceQuerySelector`
  fallback so shadow-DOM-stamped refs work.
- SKILL.md: "Report partial success and stop" rule (~14 lines under
  Efficiency Rules). When the user asked for multi-part data and you have
  one part captured with confidence, report what you have *first* before
  navigating away to fetch the rest. SPA results pages frequently lose
  state on back/forward — a 6-minute happy path can become a 12-minute
  timeout if you abandon a captured result to chase the next one.
- SKILL.md: `read autocomplete --near <ref>` guidance under
  "Dropdowns, pickers, and autocomplete" with explicit click-then-popup
  use case and the recovery for `(no eligible layer near anchor)`.

Validation:

- `node --check scripts/realbrowser.mjs`
- `./scripts/realbrowser --version` → 0.3.3
- `./scripts/realbrowser self-test` (parser, ref-pattern, ariaTree, lineDiff,
  bug-fix regressions, plus 7 0.3.2/0.3.3 assertions including
  `read autocomplete --near` parser)

## 0.3.2 - 2026-05-08

Generic, cross-platform fixes for three loop patterns observed in skill-run
forensics: custom-autocomplete selector hunts, soft-404 pages reporting
success, and clicks blocked by sticky overlays. All three changes are pure
CDP / Node — no OS-specific code, no site-specific strings.

Added:

- `read autocomplete` (alias `read overlay`) — new reader that snapshots the
  topmost floating layer (position fixed/absolute, z-index >= 1) near the
  focused input and emits its visible items as `o1, o2, …` refs. Stamps
  `data-realbrowser-ref` directly via `el.setAttribute` so refs are
  click-ready without round-trip CDP. Header line reports the layer's tag,
  role, z-index, size, and the focused input's name+value so the model can
  confirm context. Fixes the autocomplete selector-hunt loop where models
  burned 8-12 calls trying `[role="tooltip"] li`, `[class*="recent"]`, etc.
- `action click --bypass-overlay` — new flag that, when the only blocker is
  `coveredBy:<sel>` or `pointerEnabled=false`, dispatches the full
  pointerdown/mousedown/pointerup/mouseup/click sequence directly to the
  element via `el.dispatchEvent`. Bypasses browser-level hit-testing entirely
  (so a sticky nav z-index overlay no longer steals the click). Cross-platform
  by construction since it runs in the page.
- `o`-prefix refs accepted everywhere refs are recognized (root, selector,
  click target). Same shape as `b/l/e` refs — validated by self-test.

Changed:

- `tab navigate` now appends a `WARN:` line to its stdout when the resulting
  page title matches the cross-language soft-404 pattern (`404`, `not found`,
  `không tìm thấy`, `seite nicht gefunden`, `página no encontrada`, `500`,
  `503`). Exit code stays 0; the model sees the warning and pivots. Catches
  SPAs that serve a custom 4xx template at HTTP 200 (Vietnam Airlines and
  many others). The result also gains `errorPageHint` and `title` fields for
  programmatic consumers.
- `storeRefs(targetId, refs, { merge: true })` now merges instead of
  replacing. `read autocomplete` uses merge so previous tree refs (`b1`,
  `e1`, …) survive — letting the model use the same input ref before and
  after typing. `read tree` and other readers still replace by default.
- "No visible enabled click candidate" error now hints at `--bypass-overlay`
  when at least one candidate had `coveredBy` or `no-pointer` set.
- SKILL.md: added one-liner under "Dropdowns, pickers, and autocomplete"
  pointing at `read autocomplete`. Failure-budget table gained two rows for
  the new `--bypass-overlay` recovery and the soft-404 warning. `Refs first`
  section now lists `o1, o2, …` alongside `b1/l1/e1`.
- Help for `read` now mentions `read autocomplete` with usage hint.

Validation:

- `node --check scripts/realbrowser.mjs`
- `./scripts/realbrowser --version` → 0.3.2
- `./scripts/realbrowser self-test` (parser, ref-pattern, ariaTree, lineDiff,
  bug-fix regressions, plus 5 new 0.3.2 assertions)

Estimated impact: ~34% wall-time reduction on multi-step round-trip search
flows where the page mixes a custom autocomplete, a sticky header, and an
SPA error page (measured against the 13m32s VietnamAirlines run with 113
calls — the targeted loops accounted for ~275s).

## 0.3.1 - 2026-05-08

ARIA ref stamping reliability and OS-focus-restore for browser-scoped CDP
profile tabs. Adopts the openclaw `markBackendDomRefsOnPage` pattern.

Fixed:

- `assignAriaRefs` now uses the correct CDP method
  `DOM.pushNodesByBackendIdsToFrontend` (the prior `DOM.pushNodesByBackendIds`
  silently failed via "Method not found", which caused every interactive ref
  to be stripped from `read tree` output and triggered "ref stale or unknown"
  on the next `action click`).
- Removed the heavy `DOM.getDocument({ depth: -1, pierce: true })` call from
  the stamp pipeline — it was unnecessary on top of the proper push method
  and could time out on complex pages, dropping all refs.
- Shadow-DOM elements are now stamped via `DOM.resolveNode` +
  `Runtime.callFunctionOn` per node when batch push returns nodeId 0. Refs
  for elements inside shadow roots are now reliable.
- `tab ensure` browser-scoped CDP-create-first path (anonymous-context
  opening a tab in a default profile) wraps the CDP create in
  `captureForegroundAppForBackgroundLaunch` /
  `restoreForegroundAppAfterBackgroundLaunch` so the user's foreground app
  is restored after the tab opens — no more focus-steal to the default
  Chrome process when the user is browsing in anonymous mode.

Added:

- `pierceQuerySelector` / `pierceQuerySelectorAll` helpers in `PAGE_HELPERS`
  so action functions can find elements inside shadow DOM roots when the
  document-level `querySelector` would miss them. `clickFunction` and
  `fillFunction` fall back to pierce when their direct `querySelector`
  returns null, so shadow-DOM-stamped refs work end to end.
- SKILL.md "Read before acting" rules in Efficiency Rules: explicit
  guidance that the ARIA tree is structured data and the agent must
  match the user's intent to the tree text (state attributes, modal
  flags, ancestor context) before clicking.

Changed:

- Bumped script version to `0.3.1`.

## 0.3.0 - 2026-05-08

Added ARIA tree, token efficiency improvements, bug fixes, and Claude Code
plugin support.

Added:

- `action scroll` command: scroll the window or a specific element/ref by pixel
  amount. Directions: up/down/left/right. Supports `--selector` and ref-based
  container scrolling.
- Tab-level focus restore: `tab ensure`/`tab new` without `--front` now
  re-activates the previously visible Chrome tab after creating the new one,
  so the user's current tab stays in view.

- `read tree` command: compact ARIA accessibility tree via CDP
  `Accessibility.getFullAXTree`. 5-20x more compact than DOM-based snapshots.
  Composable flags: `--interactive`/`-i`, `--compact`/`-c`, `--depth N`/`-d N`,
  `--diff`/`-D`, `--selector`. Refs bridge to DOM for click/fill/type.
- Short flag aliases: `-i` (interactive), `-c` (compact), `-D` (diff), `-d`
  (depth) for compact CLI usage.
- Linux focus restore via `xdotool` for `--best-effort-background`.
- Windows focus restore via PowerShell for `--best-effort-background`.
- Windows Chromium user data directory in `browserBases()`.
- `.claude-plugin/plugin.json` manifest for Claude Code plugin auto-discovery.
- `skills/realbrowser/` directory structure following the Claude Code plugin
  convention (SKILL.md, scripts, and references inside the skill subdirectory).
- Enhanced SKILL.md description for better auto-triggering in Claude Code.

Changed:

- Replaced set-based `simpleDiff` with proper LCS-based `lineDiff` that
  preserves line ordering, handles duplicates, and shows context lines.
- `--best-effort-background` focus restore now works on Linux (xdotool) and
  Windows (PowerShell) in addition to macOS (osascript).
- SKILL.md operating loop updated: `read tree -i -c` as primary interaction
  reader, `read tree --diff` as verify-after-action pattern, explicit warning
  against Playwright pseudo-selectors, preference for `wait ready --visual-stable`
  over `sleep N && screenshot capture`.
- Moved `SKILL.md`, `scripts/`, and `references/` into `skills/realbrowser/`
  for Claude Code skill auto-discovery.
- Replaced Codex-specific path (`$HOME/.codex/skills/...`) with portable
  skill-relative path references.
- Replaced Codex-specific language with agent-generic terms throughout docs.
- Updated `README.md` with Claude Code installation instructions and new
  directory layout.
- Set the script version to `0.3.0`.

Fixed:

- `wait ready --screenshot <path>` no longer treats the output path as a CSS
  selector (was using `args[0]` as selector fallback).
- `action state --root <ref>` now resolves ref-based and CSS selector roots
  instead of always falling back to `activeRootElementSourceEval()`.
- Dead ternary in `actionOptions` (`"active" : "active"`) replaced with correct
  conditional.
- `ariaRefKind` regex now uses grouping so roles like `tabpanel` and `tablist`
  are not misclassified as button refs.
- `assignAriaRefs` uses pre-assigned `node.ref` from `finalizeAriaRefs` instead
  of recomputing counters, preventing ref mismatch when `pushNodesByBackendIds`
  partially fails.
- Windows focus capture uses `GetForegroundWindow` via P/Invoke instead of
  `Get-Process` sort, which could return the wrong window.
- Screenshot canvas transcode scaling was broken (`Math.min(1, Math.max(1, x))`
  always returned 1). Images over `--max-side` are now properly downscaled while
  preserving aspect ratio.
- Deduplicated env var parsing for `DEFAULT_SCREENSHOT_MAX_SIDE` and
  `DEFAULT_SCREENSHOT_MAX_BYTES`.
- Removed `fromSurface: true` from all CDP screenshot calls (Chrome 146+
  rejects it in managed/headful browsers).
- Full-page screenshots now use viewport expansion via
  `Emulation.setDeviceMetricsOverride` instead of clip rects, with two-phase
  viewport restore matching OpenClaw's approach.
- Checkpoint screenshots (`action state --screenshot`, `wait ready --screenshot`)
  capture full viewport instead of clipping to the active root element.
- `action state --screenshot <path>` accepts positional arg as output path.
- `tab ensure`/`tab new` focus restore wrapped in `try/finally`.
- `tab ensure` now force-reassigns labels when the old label points to a stale
  target, preventing "label already exists" errors on retries.

Changed:

- SKILL.md operating loop updated: `read tree -i -c` as primary interaction
  reader with graduated reader hierarchy, `read tree --diff` as default
  verify-after-action step, explicit guidance to reduce screenshot frequency,
  ephemeral UI handling, stale ref recovery, and error recovery patterns.

Compatibility:

- `agents/openai.yaml` retained at root for Codex compatibility.
- The CLI implementation (`scripts/realbrowser.mjs`) is unchanged; only docs
  and directory layout were updated.

## 0.2.1 - 2026-05-07

This release hardens `0.2.0` for parallel sessions and lower-approval
real-browser workflows.

Added:

- Owner-scoped labels, default context, and element refs via `--owner` /
  `REALBROWSER_OWNER`.
- Target leases for mutating commands so parallel sessions do not
  accidentally control each other's tabs.
- Owner-separated anonymous daemons while keeping real signed-in browser
  endpoints shared per physical browser endpoint.
- Local JSON state locking for labels, target metadata, leases, and owner default
  contexts.
- Daemon runtime schema checks so old same-version daemons are restarted when the
  state/lease model changes.

Changed:

- `tab ensure` skips another owner's URL match and creates a fresh tab instead
  of reusing a leased target.
- HTTP and direct WebSocket forms of the same CDP endpoint are treated as the
  same browser endpoint for daemon reuse.
- Chrome browser-wide permission grant/reset now requires `--force`, even after
  the target lease check passes.
- Full, responsive/device, and annotated screenshots/checkpoints are
  lease-guarded because they temporarily scroll, emulate, or draw page overlays.
- Expanded docs for multi-session operation, Chrome approval prompt limits, and
  release validation.

Fixed:

- Owner-scoped refs prevent one session's `b1`/`e1` reads from overwriting
  another session's pending action refs.
- Cross-owner lease detection now considers duplicate/stale lease records and
  keeps the newest relevant lease.
- Broadened mutating raw CDP detection for `devtools raw`.
- Preserved the `realbrowser` name consistently across code and docs.
- Set the script version to `0.2.1`.

## 0.2.0 - 2026-05-07

This is a major CLI and workflow refactor from `v0.1.0`.

Breaking changes:

- Replaced the old selected-tab/top-level command model with a target-first
  grouped CLI:
  `realbrowser [global flags] <group> <command> [args] [flags]`.
- Reads, actions, screenshots, console, network, state, dialogs, performance,
  downloads, and PDF export now require an explicit `-t <label>` target or
  `--handle`.
- Replaced old flows such as `open`, `tabs`, `observe`, `snapshot`, `console`,
  and `screenshot` with grouped commands such as `tab ensure`, `tab list`,
  `read observe`, `read snapshot`, `console list`, and `screenshot capture`.
- Removed the old split reference docs (`references/debugging.md`,
  `references/profiles.md`, `references/screenshots.md`) in favor of the new
  command reference plus workflow reference.

Added:

- New command groups: `profile`, `session`, `daemon`, `tab`, `handle`, `read`,
  `wait`, `action`, `screenshot`, `console`, `network`, `state`, `dialog`,
  `perf`, `download`, `export`, `devtools`, `chain`, and `completion`.
- Stable labeled targets from `tab ensure`, `tab select`, and `tab new`.
- Provenance checks for signed-in profile work, including safer handling for
  browser-scoped CDP endpoints where existing tabs cannot prove profile
  ownership.
- Anonymous managed sessions plus explicit `--incognito` / `--private` support
  when a visible Chrome Incognito window is required.
- Structured, compact readers for large pages: `read size`, `read query`,
  `read items`, `read item`, `read snapshot`, `read text`, `read html`,
  `read links`, and `read forms`.
- Root-scoped action workflows with `action state`, guarded `action upload`,
  exact-label or ref-based `action submit`, keyboard actions, and
  file-chooser protection.
- Target-bound screenshot workflows: `screenshot capture`, `screenshot full`,
  `screenshot area`, and `screenshot device`.
- Target-bound console and network workflows, including capture windows,
  response body export, HAR export, and large-output guards.
- `chain` for running target-bound JSON step sequences with compact summaries.
- `references/workflows.md` and `references/design-notes.md`.

Changed:

- Reworked `SKILL.md`, `README.md`, `agents/openai.yaml`, and
  `references/commands.md` around the target-first contract.
- Made background-first signed-in profile behavior the documented default;
  profile app launch focus risk now requires explicit `--best-effort-background`
  or `--front`.
- Kept exact-tab console-copy guidance explicit: select one tab, verify it, and
  copy that tab's DevTools-style lines rather than mixing multiple matches.
- Made large reads, network bodies, traces, screenshots, downloads, and PDFs
  prefer `--out` or artifact paths instead of stdout.
- Set the script version to `0.2.0`.

Validation:

- `node --check scripts/realbrowser.mjs`
- `./scripts/realbrowser --version`
- `./scripts/realbrowser self-test`
- Help generation for all command groups.
- `git diff --check`
- Anonymous `about:blank` smoke test.

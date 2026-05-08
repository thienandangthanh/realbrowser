# Changelog

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

# Changelog

## 0.3.0 - 2026-05-12

This release adds first-class Claude Code support alongside existing Codex support.

Added:

- Dual install paths documented for Codex (`$HOME/.codex/skills/realbrowser`) and
  Claude Code (`$HOME/.claude/skills/realbrowser`) in `SKILL.md` and `README.md`.
- `scripts/install-claude.sh` to symlink or copy the repo into
  `~/.claude/skills/realbrowser`.
- `agents/claude.md` manifest mirroring `agents/openai.yaml` for Claude Code.
- Self-test assertion that `CLAUDE_SESSION_ID` flows through owner resolution
  (verifies the `OWNER_ENV_KEYS` coverage added in 0.2.1).

Changed:

- Doc prose is now vendor-neutral: "agent sessions" instead of "Codex sessions" in
  `SKILL.md`, `README.md`, `references/workflows.md`, `references/design-notes.md`,
  `references/commands.md`, and CLI help strings.
- CLI help now reads "agent sessions" instead of "Codex sessions" for `--owner` flag
  and target lease conflict messages.

Validation:

- `node --check scripts/realbrowser.mjs`
- `./scripts/realbrowser --version` (expects `0.3.0`)
- `./scripts/realbrowser self-test`
- `bash scripts/install-claude.sh` (then again for idempotency)
- `test -f agents/claude.md`
- Anonymous Brave smoke: `BROWSER=brave-browser ./scripts/realbrowser tab ensure https://example.com --anonymous --session smoke --label page --background` → `read observe` → `screenshot capture /tmp/rb-smoke.png` → `daemon stop`

## 0.2.1 - 2026-05-07

This release hardens `0.2.0` for parallel Codex sessions and lower-approval
real-browser workflows.

Added:

- Owner-scoped labels, default context, and element refs via `--owner` /
  `REALBROWSER_OWNER`.
- Target leases for mutating commands so parallel Codex sessions do not
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
- Expanded docs for multi-Codex operation, Chrome approval prompt limits, and
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

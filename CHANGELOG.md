# Changelog

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

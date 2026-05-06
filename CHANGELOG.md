# Changelog

## 0.2.0 - 2026-05-07

- Renamed the skill and CLI surface fully to `realbrowser`.
- Consolidated docs around the current target-first grouped CLI.
- Added workflow and design references for signed-in profiles, anonymous
  sessions, repeated-content reads, uploads, submits, screenshots, console,
  network, downloads, and PDF export.
- Kept signed-in profile browsing background-first, with explicit opt-in for
  profile app launch focus risk.
- Kept exact-tab console-copy and compact read guidance front and center.
- Set the script version to `0.2.0` and removed stale `realbrowser2` / `0.2.1`
  naming.

Validation:

- `node --check scripts/realbrowser.mjs`
- `./scripts/realbrowser --version`
- `./scripts/realbrowser self-test`
- Help generation for all command groups.
- `git diff --check`
- Anonymous `about:blank` smoke test.

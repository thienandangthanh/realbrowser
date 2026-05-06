# Realbrowser

Realbrowser is a Codex skill and small local CLI for fast target-first browser
automation against Chrome/Chromium. It is built for the cases where the useful
state is in the browser the developer is already using: signed-in profiles,
cookies, local storage, active tabs, console logs, network traffic, downloads,
and local app state.

The current CLI is grouped and target-first:

```bash
realbrowser [global flags] <group> <command> [args] [flags]
```

Acquire or create one tab target first, then pass `-t <label>` or `--handle` to
reads, actions, screenshots, console, network, state, dialogs, performance,
downloads, and exports.

## What It Provides

- A Codex skill named `realbrowser`.
- A zero-dependency Node CLI at `scripts/realbrowser.mjs`.
- Portable wrappers:
  - `scripts/realbrowser` for macOS/Linux shells.
  - `scripts/realbrowser.ps1` for PowerShell.
  - `scripts/realbrowser.cmd` for Windows `cmd.exe`.
- Signed-in profile attach through Chrome/Chromium DevTools endpoints.
- Anonymous managed sessions for clean browser state.
- Stable labeled tab targets.
- Compact page reads, structured item extraction, screenshots, console logs,
  network request/response capture, uploads, guarded submits, downloads, and PDF
  export.

## Requirements

- Node.js 22 or newer.
- Chrome or a Chromium-family browser.
- A local machine where Chrome DevTools access is acceptable for the requested
  profile/session.

## Quick Start

macOS/Linux:

```bash
REALBROWSER="$HOME/.codex/skills/realbrowser/scripts/realbrowser"
"$REALBROWSER" help
```

Windows PowerShell:

```powershell
$Realbrowser = Join-Path $HOME ".codex\skills\realbrowser\scripts\realbrowser.ps1"
& $Realbrowser help
```

Portable Node entrypoint:

```bash
node scripts/realbrowser.mjs help
```

Run the built-in checks:

```bash
./scripts/realbrowser self-test
```

## Common Flows

Anonymous page:

```bash
./scripts/realbrowser tab ensure https://example.com --anonymous --session check --label page --background
./scripts/realbrowser read observe -t page --anonymous --session check
```

Visible Chrome Incognito window:

```bash
./scripts/realbrowser tab ensure https://example.com --anonymous --session private --label page --front --incognito
./scripts/realbrowser read observe -t page --anonymous --session private
```

Signed-in profile:

```bash
./scripts/realbrowser profile list --active
./scripts/realbrowser tab list "localhost" --profile chrome:Default
./scripts/realbrowser tab ensure http://localhost:3000 --profile chrome:Default --label app --background
./scripts/realbrowser read observe -t app --profile chrome:Default
```

Console and network evidence:

```bash
./scripts/realbrowser console list -t app --errors --limit 50
./scripts/realbrowser console capture -t app --reload --duration 3000 --out tmp/console.json
./scripts/realbrowser network capture -t app --reload --duration 5000 --out tmp/network.json
./scripts/realbrowser network body -t app req_12 --response --out tmp/req_12-response.json --full
```

Actions and uploads:

```bash
./scripts/realbrowser action state -t app --root active --compact --screenshot --annotate-refs
./scripts/realbrowser action fill -t app e1 "caption text"
./scripts/realbrowser action upload -t app --root active --input-ref e2 ~/Downloads/media.png
./scripts/realbrowser action submit -t app --root active --text "Submit"
```

Screenshots and exports:

```bash
./scripts/realbrowser screenshot capture -t app tmp/app.png
./scripts/realbrowser screenshot full -t app tmp/app-full.png
./scripts/realbrowser screenshot device -t page --anonymous --session responsive --devices desktop:1440x900,tablet:768x1024,mobile:390x844 tmp/page
./scripts/realbrowser export pdf -t app tmp/page.pdf --print-background
```

## Operating Model

Use the smallest command that answers the question:

- `profile list --active` to discover usable signed-in profile endpoints.
- `tab list`, `tab select`, `tab ensure`, and `tab new` to acquire a target.
- `read observe`, `read size`, `read query`, `read items`, `read item`, and
  `read snapshot` for compact page state and structured content.
- `action state` before mutating the page, then act on current refs.
- `console` and `network` for debugging evidence.
- `screenshot` and `export pdf` for visual artifacts.

Do not start from broad HTML or whole-page dumps. Use `--out` for large reads,
network bodies, HAR files, screenshots, and traces so they can be inspected with
local tools instead of sent through model context.

## Profile Safety

With `--profile`, existing browser tabs may be diagnostic only when CDP is
browser-scoped and the tab was not created by Realbrowser through that profile.
If a named-profile open needs a proven target, create a new tab through the
profile with `tab ensure <url> --profile <profile> --label <label>`.

`--anonymous` creates isolated temporary browser state. It is not network
anonymity and is not the same as Chrome's visible Incognito UI. Add
`--incognito` or `--private` only when a visible private window is explicitly
needed.

Realbrowser should keep signed-in profile work in the background when possible.
Use `--front` only for explicit visual handoff. Use `--best-effort-background`
when the CLI reports that a profile app launch is required and the focus risk is
acceptable.

## Development Notes

Realbrowser is intentionally thin and portable:

- Keep workflow guidance in `SKILL.md`.
- Keep command details in `references/commands.md` and
  `references/workflows.md`.
- Keep the implementation in `scripts/realbrowser.mjs` unless a boundary becomes
  stable enough to justify another file.
- Add or update `self-test` coverage for parser, help, state, and CLI behavior
  regressions.

Useful checks:

```bash
./scripts/realbrowser --version
./scripts/realbrowser help
./scripts/realbrowser self-test
```

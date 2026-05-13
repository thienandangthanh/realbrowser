# Realbrowser

Realbrowser is an agent skill and small local CLI for fast target-first browser
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

- An agent skill named `realbrowser` (works with Claude Code, Codex, and other
  agent platforms).
- A zero-dependency Node CLI at `skills/realbrowser/scripts/realbrowser.mjs`.
- Portable wrappers:
  - `skills/realbrowser/scripts/realbrowser` for macOS/Linux shells.
  - `skills/realbrowser/scripts/realbrowser.ps1` for PowerShell.
  - `skills/realbrowser/scripts/realbrowser.cmd` for Windows `cmd.exe`.
- Signed-in profile attach through Chrome/Chromium DevTools endpoints.
- Anonymous managed sessions for clean browser state.
- Stable labeled tab targets, scoped per owner/session.
- Target leases for mutating commands so parallel sessions do not
  accidentally navigate, close, or click each other's tabs.
- Compact page reads, structured item extraction, screenshots, console logs,
  network request/response capture, uploads, guarded submits, downloads, and PDF
  export.

## Requirements

- Node.js 22 or newer.
- Chrome or a Chromium-family browser.
- A local machine where Chrome DevTools access is acceptable for the requested
  profile/session.

## Installation

### Claude Code

Install as a Claude Code plugin from a local path:

```bash
claude plugin add /path/to/realbrowser
```

Or from a git repository:

```bash
claude plugin add https://github.com/<owner>/realbrowser
```

The skill auto-activates when tasks involve browser interaction, screenshots,
console logs, network debugging, or form automation.

### Codex

Place the repo under `$HOME/.codex/skills/realbrowser` and use the
`agents/openai.yaml` configuration.

### Standalone CLI

```bash
node skills/realbrowser/scripts/realbrowser.mjs help
```

Run the built-in checks:

```bash
skills/realbrowser/scripts/realbrowser self-test
```

## Common Flows

Parallel sessions:

```bash
export REALBROWSER_OWNER=my-project
realbrowser session use profile:chrome:Default
realbrowser tab ensure http://localhost:3000 --profile chrome:Default --label app --background
realbrowser read observe -t app
```

`REALBROWSER_OWNER` or `--owner <id>` scopes labels and default context. Without
an explicit owner, Realbrowser uses the current agent/terminal session when one is
available, falling back to the project path. Mutating commands claim a target
lease; if another owner already owns that tab, rerun with `--take-lease` only when
you intentionally want to take it over. `tab ensure` creates a fresh tab instead
of reusing another owner's URL match.

Anonymous page:

```bash
realbrowser tab ensure https://example.com --anonymous --session check --label page --background
realbrowser read observe -t page --anonymous --session check
```

Visible Chrome Incognito window:

```bash
realbrowser tab ensure https://example.com --anonymous --session private --label page --front --incognito
realbrowser read observe -t page --anonymous --session private
```

Signed-in profile:

```bash
realbrowser profile list --active
realbrowser tab list "localhost" --profile chrome:Default
realbrowser tab ensure http://localhost:3000 --profile chrome:Default --label app --background
realbrowser read observe -t app --profile chrome:Default
```

Console and network evidence:

```bash
realbrowser console list -t app --errors --limit 50
realbrowser console capture -t app --reload --duration 3000 --out tmp/console.json
realbrowser network capture -t app --reload --duration 5000 --out tmp/network.json
realbrowser network body -t app req_12 --response --out tmp/req_12-response.json --full
```

Actions and uploads:

```bash
realbrowser action state -t app --root active --compact --screenshot --annotate-refs
realbrowser action fill -t app e1 "caption text"
realbrowser action upload -t app --root active --input-ref e2 ~/Downloads/media.png
realbrowser action submit -t app --root active --text "Submit"
```

Screenshots and exports:

```bash
realbrowser screenshot capture -t app tmp/app.png
realbrowser screenshot full -t app tmp/app-full.png
realbrowser screenshot device -t page --anonymous --session responsive --devices desktop:1440x900,tablet:768x1024,mobile:390x844 tmp/page
realbrowser export pdf -t app tmp/page.pdf --print-background
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
Use `--front` only for explicit visual handoff. `tab ensure --background`
performs verified browserContextId discovery when possible.
`--best-effort-background` is only for stopped-profile launch risk and must not
OS-launch an already-running browser-scoped profile.

Chrome approval prompts are controlled by Chrome, not the skill. Realbrowser
reduces repeated prompts by reusing the same direct `DevToolsActivePort`
WebSocket and daemon per browser endpoint. After a browser/computer restart, a
signed-in real Chrome profile can still require Chrome's approval once; managed
anonymous sessions avoid signed-in-profile approval but do not contain the user's
logged-in state.

## Plugin Structure

```
realbrowser/
├── .claude-plugin/
│   └── plugin.json              # Claude Code plugin manifest
├── skills/
│   └── realbrowser/
│       ├── SKILL.md             # Skill instructions
│       ├── scripts/             # CLI and wrappers
│       │   ├── realbrowser      # macOS/Linux shell wrapper
│       │   ├── realbrowser.cmd  # Windows cmd wrapper
│       │   ├── realbrowser.ps1  # PowerShell wrapper
│       │   └── realbrowser.mjs  # Node CLI implementation
│       └── references/          # Detailed documentation
│           ├── commands.md
│           ├── workflows.md
│           └── design-notes.md
├── agents/
│   └── openai.yaml              # Codex agent configuration
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## Development Notes

Realbrowser is intentionally thin and portable:

- Keep workflow guidance in `skills/realbrowser/SKILL.md`.
- Keep command details in `skills/realbrowser/references/commands.md` and
  `skills/realbrowser/references/workflows.md`.
- Keep the implementation in `skills/realbrowser/scripts/realbrowser.mjs` unless
  a boundary becomes stable enough to justify another file.
- Add or update `self-test` coverage for parser, help, state, and CLI behavior
  regressions.

Useful checks:

```bash
skills/realbrowser/scripts/realbrowser --version
skills/realbrowser/scripts/realbrowser help
skills/realbrowser/scripts/realbrowser self-test
```

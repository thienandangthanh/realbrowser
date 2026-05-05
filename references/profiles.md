# Profiles, Sessions, And Real Chrome

Read this when existing cookies/login state, a specific Chrome profile, or real
Chrome DevTools approval matters.

## Browser Choice

Default behavior:

1. Prefer Chrome DevTools MCP auto-connect so Codex can control the user's real
   running Chrome profile after remote debugging is enabled.
2. If auto-connect cannot attach, fall back to the dedicated managed profile at
   `~/.realbrowser/profile`.

When existing cookies/login state matters, fallback is not acceptable. Use
`--no-fallback` or `REALBROWSER_NO_FALLBACK=1`, and stop if no DevTools endpoint
is available.

A named profile or current-tab request is permission to inspect and navigate
within the requested target only. Do not use the profile as a license to browse
unrelated sensitive tabs, private messages, admin/payment pages, or account
settings. Ask before sends, submits, purchases, deletes, permission grants,
security/account changes, or broad access outside the named target.

Chrome may show "Allow remote debugging?" when a new controller attaches to a
real signed-in profile. Reuse the existing approved session instead of
restarting daemons. When Chrome remote debugging is already enabled or the
endpoint session is already running, routine commands should not need
`--allow-profile-reattach`. Current realbrowser also keeps routine endpoint
commands on one persistent CDP browser socket plus persistent page sessions, so
approving the first fresh attach is enough for follow-up `tabs`, `select-tab`,
`js`, `observe`, `console`, and screenshot commands. Do not use
`--restart-daemon --allow-profile-reattach` unless the prompt tradeoff is
intentional.

## Listing And Selecting Profiles

```bash
"$REALBROWSER_CLI" profiles --active
"$REALBROWSER_CLI" profiles
"$REALBROWSER_CLI" profiles "work@example.com" --browser chrome
```

Use stable ids such as `chrome:Default` or `chrome:Profile 4`. Human names can
be ambiguous. Use `--browser <key>` to narrow to Chrome, Brave, Edge, Chromium,
or Vivaldi. Use `--json` only when exact `userDataDir`, `profilePath`,
`devtoolsScope`, or endpoint metadata is needed.

## Opening A Specific Profile

```bash
"$REALBROWSER_CLI" open --profile "chrome:Profile 4" https://example.com --no-fallback --timeout 15000
"$REALBROWSER_CLI" find-tab example.com --all-sessions
"$REALBROWSER_CLI" select-tab example.com --all-sessions
"$REALBROWSER_CLI" observe --max-chars 2000
```

`open --profile <id> <url>` is the script-owned way to initialize or switch a
selected UI profile. Do not call OS browser launchers directly from an agent. If
the selected profile exposes no DevTools endpoint, stop and report the blocker.
Default to the least disruptive route for real signed-in profiles, especially
when the user is actively working in another app. Reusing an existing endpoint
tab and navigating it with CDP is the lowest-focus path. A profile-specific OS
app launch can foreground an existing browser window while handling the new tab.
For that reason, non-front profile app launches are blocked by default on every
desktop OS. Use `--best-effort-background` only when the user accepts the focus
risk, or `--front` when the user explicitly wants visual handoff. On macOS,
best-effort background uses `open -g`, but that is not a hard no-focus
guarantee.

Profile selection is setup, not the steady-state execution path. When a
profile-routed open can reuse an existing endpoint session, realbrowser
activates that session and prints a continuation hint. Follow-up work should use
plain commands such as `realbrowser observe`, `realbrowser js ...`, or
`realbrowser extract-items ...`; omit `--profile` unless switching profiles.
This keeps one approved CDP controller warm and avoids repeatedly taking the
profile-targeted branch.

Omit `--select` on the initial profile open unless follow-up commands must
immediately target a known existing tab rather than the newly opened target. Use
`--front`, `focus`, or `--foreground-until-ready` only when the task explicitly
needs visual handoff, or after background waits/scrolls/extraction fail and the
foreground need is worth interrupting the user.

```bash
# Do: reuse the endpoint after the profile/session exists.
"$REALBROWSER_CLI" find-tab "example.com" --all-sessions
"$REALBROWSER_CLI" select-tab "example.com" --all-sessions
"$REALBROWSER_CLI" goto "https://example.com"

# If no reusable tab exists and a specific UI profile is required, opt into the
# focus-risk path explicitly.
"$REALBROWSER_CLI" open --profile "chrome:Default" "https://example.com" --no-fallback --best-effort-background --timeout 30000
"$REALBROWSER_CLI" observe --max-chars 2000
"$REALBROWSER_CLI" extract-items --limit 5 --max-text-chars 700

# Do not use unless the user asked to see Chrome or foregrounding is required.
"$REALBROWSER_CLI" open --profile "chrome:Default" "https://example.com" --no-fallback --front
```

Browser-level endpoints can include tabs from multiple profiles. After attach,
verify/select by URL or title before taking action.

## Foreground-Gated Pages

Default profile opens are background-friendly. For slow or lazy pages, first try
background `wait-ready`, scrolls, compact extraction, and targeted `js`/selector
reads. If a site still does not finish hydrating until its tab is active, opt in
explicitly:

```bash
"$REALBROWSER_CLI" claim https://example.com/items \
  --profile "chrome:Profile 4" \
  --handle-name items \
  --no-fallback \
  --foreground-until-ready \
  --selector main \
  --card-selector ".item-card" \
  --min-cards 3 \
  --timeout 20000
```

`--foreground-until-ready` implies tab activation, runs a `wait-ready` content
check, and on macOS profile-targeted flows best-effort foregrounds the browser
app. It is intentionally explicit so routine commands do not pop Chrome over
the user's terminal.

Use generic readiness criteria:

- `--selector <css>`: a visible container must exist.
- `--min-cards <n>`: repeated visible page items must be present; pair it with
  `--card-selector <css>` unless generic card detection has already been
  verified for the target page.
- `--card-selector <css>`: override generic card detection.
- `--ready-text <text>`: required text must appear.
- `--visual-stable`: text/card/image/loading-marker counts must settle.
- `--no-skeletons`: visible loading markers must be gone.

## Existing Tabs

Search before opening:

```bash
"$REALBROWSER_CLI" sessions
"$REALBROWSER_CLI" find-tab app.example.com --all-sessions
"$REALBROWSER_CLI" select-tab app.example.com --all-sessions
"$REALBROWSER_CLI" observe --max-chars 2000
```

If multiple candidates match, show the candidates and ask the user which one to
use. Do not guess.

## Handles For Longer Workflows

Use handles when a task spans many commands or turns:

```bash
HANDLE="tmp/realbrowser-handles/app.json"
"$REALBROWSER_CLI" claim https://app.example.com --profile "chrome:Profile 4" --handle-out "$HANDLE" --no-fallback --timeout 15000
export REALBROWSER_HANDLE="$HANDLE"
"$REALBROWSER_CLI" --handle "$HANDLE" observe --max-chars 2000
```

Handles pin follow-up commands to a session plus page id even when another
Codex tab selects a different page. Handles are live references, not bookmarks:
if the daemon is gone or the page is closed, reclaim the URL.

Use project/task-specific handle paths for concurrent work. Short global
`--handle-name` values live under `~/.realbrowser/handles/` and can collide.

## Anonymous And Clean Sessions

`--anonymous` means isolated browser state, not network anonymity. It does not
hide IP address, fingerprint, or network identity.

```bash
"$REALBROWSER_CLI" open https://app.example.com --anonymous --session app-anon --select --timeout 20000
"$REALBROWSER_CLI" observe --max-chars 2000
"$REALBROWSER_CLI" detach --session app-anon
```

Anonymous sessions persist until `detach`/`stop`. Use `--keep-anonymous` only
when you need the temporary `userDataDir` preserved for inspection.

For multiple anonymous/profile contexts, name each session and search all
sessions before opening a duplicate:

```bash
"$REALBROWSER_CLI" sessions
"$REALBROWSER_CLI" find-tab app.example.com --all-sessions
```

For profile-bound Incognito:

```bash
"$REALBROWSER_CLI" open https://app.example.com --profile "chrome:Profile 4" --anonymous --session work-anon --select --no-fallback
```

This still requires the selected profile to expose a DevTools endpoint.

## Banner And Detach Rules

The "Chrome is being controlled by automated test software" banner is expected
while DevTools control is active. Do not suppress it during normal work.

- Plain `detach` closes realbrowser's session and leaves Chrome remote debugging
  enabled.
- `detach --dismiss-banner` is an explicit best-effort UI action to hide the
  visible banner.
- `detach --cleanup-remote-debugging` turns off Chrome's remote-debugging
  setting while a daemon is still running.
- Do not detach real signed-in profile sessions as routine cleanup. Keeping one
  approved attach alive avoids repeated approval prompts.

## Platform Notes

- Supported runtimes: macOS, Linux, and Windows with Node.js 22+ and
  `npm`/`npx`.
- macOS/Linux: `scripts/realbrowser`.
- Windows PowerShell: `scripts\realbrowser.ps1`.
- Windows `cmd.exe`: `scripts\realbrowser.cmd`.
- Portable fallback: `node scripts/realbrowser.mjs`.
- In WSL, Docker, SSH, Parallels, or split-host setups, guest filesystem and
  `127.0.0.1` are not the host browser by default. Run the host-side wrapper or
  connect to a forwarded CDP endpoint with `--browser-url <host-cdp-url>`.

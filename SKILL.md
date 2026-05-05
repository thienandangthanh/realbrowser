---
name: realbrowser
description: Use when you need fast local real-browser automation from Codex, including listing/selecting Chrome profiles, named browser sessions, anonymous clean-state sessions, OpenClaw-style role/DOM extraction for large dynamic pages, network/performance capture, opening tabs, taking snapshots or screenshots, clicking, typing, filling forms, reading console/network data, or debugging localhost/browser UI with Chrome DevTools MCP.
---

# Realbrowser

Use this skill for local browser checks when a real or managed Chrome session is
more direct than generic browser tooling. Keep the first pass small: read the
task router below, run the matching recipe when it covers the request, and open
later sections or references only when the task needs their detail.

## Quick Start

Use the wrapper that matches the host OS:

```bash
# macOS/Linux shells
REALBROWSER_CLI="$HOME/.codex/skills/realbrowser/scripts/realbrowser"
"$REALBROWSER_CLI" open https://example.com --anonymous --session task --select --timeout 20000
"$REALBROWSER_CLI" --session task observe --max-chars 2000
```

```powershell
# Windows PowerShell
$RealbrowserCli = Join-Path $HOME ".codex\skills\realbrowser\scripts\realbrowser.ps1"
& $RealbrowserCli open https://example.com --anonymous --session task --select --timeout 20000
& $RealbrowserCli --session task observe --max-chars 2000
```

On Windows `cmd.exe`, use `scripts\realbrowser.cmd`; `node
scripts/realbrowser.mjs` is the portable fallback on any OS. Examples below use
POSIX shell syntax and `/tmp` output paths for brevity. On Windows, translate
paths to `$env:TEMP`/`%TEMP%` and use PowerShell `Select-String` /
`ConvertFrom-Json` or Node when `rg`/`jq` are unavailable.

Do not run `doctor` by default. Use it when setup is uncertain or a browser
command fails.

## Task Router

For a simple public screenshot or responsive-capture request, do not read the
console/debug/profile sections first and do not do memory/history lookup unless
the user refers to an existing tab, profile, credentials, prior browser state, or
a previous failed attempt. Use a clean anonymous session, cap text reads, capture
the images, inspect them, and detach the dedicated session:

```bash
REALBROWSER_CLI="$HOME/.codex/skills/realbrowser/scripts/realbrowser"
"$REALBROWSER_CLI" open https://site.example --anonymous --session site-shot --select --timeout 30000
"$REALBROWSER_CLI" --session site-shot observe --max-chars 1200
"$REALBROWSER_CLI" --session site-shot device-screenshots /tmp/site-shot
"$REALBROWSER_CLI" --session site-shot detach
```

If the wording implies an existing target, verify and reuse it before opening a
new tab:

```bash
"$REALBROWSER_CLI" sessions
"$REALBROWSER_CLI" find-tab "<url-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" select-tab "<url-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" js '({href: location.href, title: document.title, readyState: document.readyState})'
```

Use the matching later section only when needed:

- Console output or DevTools logs: read "Console Output Copy Fast Path".
- Large dynamic pages or DOM extraction: read "OpenClaw-Style Extraction".
- Login, custom devices, full-page regions, or clipping risk: read
  "Screenshot Task Fast Path" and then `references/screenshots.md` if needed.
- Profile cookies or signed-in browser state: read `references/profiles.md`.
- Failed network, cache, headers, HAR, or performance: read
  `references/debugging.md`.

## Console Output Copy Fast Path

For requests like "check console log", "copy console output", or "what is in
DevTools Console", treat the user's ask literally: select the exact existing
tab, read the DevTools-style console lines, and paste those lines back in a
code block. Do not summarize first, do not mix output from other matching tabs,
and do not reload unless the user asks to reproduce startup logs. For target
mismatches, signed-in Chrome profile details, or fresh startup capture, read
`references/debugging.md`.

```bash
REALBROWSER_CLI="$HOME/.codex/skills/realbrowser/scripts/realbrowser"
"$REALBROWSER_CLI" sessions
"$REALBROWSER_CLI" find-tab "<url-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" select-tab "<url-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" js '({href: location.href, title: document.title, readyState: document.readyState})'
"$REALBROWSER_CLI" console --preserve --limit 80
```

## OpenClaw-Style Extraction

For large dynamic pages such as feeds, chats, search results, dashboards, or
virtualized lists, use compact role/DOM readers instead of full-page HTML stdout.
Write deep reads to files and inspect those artifacts locally. For nested item
boundaries, stale daemon handling, or selector strategy, read
`references/debugging.md`.

```bash
"$REALBROWSER_CLI" snapshot --selector main --compact --max-chars 2500
"$REALBROWSER_CLI" snapshot --compact --max-chars 2500
"$REALBROWSER_CLI" snapshot-dom --out "$ARTIFACT_DIR/page-dom.json" --limit 1800 --max-text-chars 180
"$REALBROWSER_CLI" snapshot-aria --out "$ARTIFACT_DIR/page-aria.json" --limit 1800
"$REALBROWSER_CLI" query-selector 'main, [role="feed"], [role="article"], article' --out "$ARTIFACT_DIR/page-elements.json" --limit 60 --max-text-chars 300 --max-html-chars 800
```

## Screenshot Task Fast Path

For requests like "check staging site, log in if needed, open inbox, take
desktop/tablet/mobile screenshots", use the Task Router recipe when it covers
the request. For exact default desktop/tablet/mobile PNG screenshots on an
already selected or named session:

```bash
"$REALBROWSER_CLI" device-screenshots /tmp/site-inbox
"$REALBROWSER_CLI" --session site-check device-screenshots /tmp/site-inbox
```

Inspect saved images with `view_image` when available. Detach only
anonymous/dedicated sessions you opened for the task; do not detach an existing
real-profile tab or session the user was already using. For login, custom
devices, full-page/internal-scroll screenshots, mobile emulation, or clipping
risk, read `references/screenshots.md`.

## Decision Matrix

- Public page or clean login test with no existing target implied: use
  `--anonymous --session <task> --select`.
- Existing tab/session implied, including a named anonymous session: run
  `sessions` and `find-tab <query> --all-sessions`, then verify URL/title before
  acting.
- Existing user cookies, a named Chrome profile, or `--no-fallback`: read
  `references/profiles.md`.
- Focus-gated or lazy pages that do not hydrate in a background tab:
  use explicit `--foreground-until-ready` plus `wait-ready` criteria.
- Large dynamic pages, social feeds, or pages with thousands of nodes:
  read `references/debugging.md` before dumping HTML. Start with compact
  snapshots, write deep reads to files, and inspect those files with
  OS-available local tools.
- Exact viewport, mobile screenshot, raw PNG dimensions, or responsive capture:
  read `references/screenshots.md`.
- Full-size screenshots of fixed-body apps with internal scroll panes, or
  screenshots of a specific page region: read `references/screenshots.md`.
- Console errors, failed network requests, HAR/performance, cache/header proof,
  or large HTML/text extraction: read `references/debugging.md`.
- Full command syntax, global flags, or less common commands: read
  `references/commands.md`.

## Operating Loop

1. Reuse existing context before opening duplicates: `sessions`, then
   `find-tab <url-or-title> --all-sessions` when prior attempts may exist or the
   user mentions an existing/current tab, profile, session, anonymous/incognito
   context, or follow-up browser state.
2. Open or claim one stable target. Use `--session <name>` for isolated flows
   and `claim ... --handle-name <task>` for longer workflows.
   For real signed-in profiles, omit `--select` on the initial `open --profile`
   unless immediate automation selection is required; select or claim after the
   tab exists. Use `--front`, `focus`, or `--foreground-until-ready` only for an
   explicit visual handoff.
3. Read before acting. Use `observe --max-chars 1500-2500` for page state and
   `snapshot --efficient` when current `uid` or CDP `[ref=eN]` refs are needed.
4. Act only on current refs. After navigation, modal changes, form submission,
   or stale-ref failures, run `observe` or `snapshot --efficient` again.
5. Prefer visible-state waits over sleeps: `wait <text> --visible`,
   `wait --selector <css> --visible`, `wait --domcontentloaded`, or
   `wait --networkidle`. For modern lazy pages, use `wait-ready` with
   `--selector`, `--min-cards`, `--visual-stable`, or `--no-skeletons`.
6. For multi-step command streams, prefer `chain --return final` or
   `chain --return summary --trace <path>` to reduce process round trips.
7. Keep large outputs in files: use `--out`, `--har`, `--request-file`, or
   `--response-file`, then inspect with local tools.
8. Stop and report manual blockers: captcha, 2FA, browser permission prompts,
   missing Chrome remote-debugging approval, or unavailable profile endpoints.
9. Ask explicit user approval before sensitive submits, purchases, deletes,
   security/account changes, permission grants, or hard-to-undo actions.
10. Detach anonymous/dedicated sessions when finished. Do not routinely detach
    real signed-in Chrome sessions; keeping one approved attach alive avoids
    repeated remote-debugging prompts.

## Five Common Recipes

### 1. Clean Page Check

```bash
"$REALBROWSER_CLI" open https://app.example --anonymous --session app-check --select --timeout 20000
"$REALBROWSER_CLI" --session app-check observe --max-chars 2000
"$REALBROWSER_CLI" --session app-check screenshot /tmp/app.png --raw-size
```

### 2. Login With Provided Credentials

```bash
"$REALBROWSER_CLI" --session app-check goto https://app.example/users/sign_in
"$REALBROWSER_CLI" --session app-check snapshot --efficient --max-chars 3000
# Replace 1_6, 1_10, and 1_12 with current snapshot refs.
"$REALBROWSER_CLI" --session app-check fill-form '[{"uid":"1_6","value":"user@example.com"},{"uid":"1_10","value":"secret"}]'
"$REALBROWSER_CLI" --session app-check click 1_12
"$REALBROWSER_CLI" --session app-check wait --domcontentloaded --timeout 15000
"$REALBROWSER_CLI" --session app-check observe --max-chars 2500
```

### 3. Exact Device Screenshots

Use this for verified desktop/tablet/mobile PNG evidence.

```bash
"$REALBROWSER_CLI" --session app-check device-screenshots /tmp/app-inbox
"$REALBROWSER_CLI" --session app-check device-screenshots /tmp/app-inbox --devices desktop:1440x900,tablet:768x1024,mobile:390x844
"$REALBROWSER_CLI" --session app-check device-screenshots /tmp/app-inbox --selector main --visual-stable --settle-ms 500
"$REALBROWSER_CLI" --session app-check full-screenshot /tmp/app-full.png --viewport 390x844
```

### 4. Existing Tab Or Profile

```bash
"$REALBROWSER_CLI" find-tab app.example --all-sessions
"$REALBROWSER_CLI" select-tab app.example --all-sessions
"$REALBROWSER_CLI" observe --max-chars 2000
```

If cookies in a specific Chrome profile matter, read `references/profiles.md`
before opening or attaching.

For a page that stalls until the tab is active, foregrounding is explicit:

```bash
"$REALBROWSER_CLI" claim https://app.example/items \
  --profile "chrome:Default" \
  --handle-name app-items \
  --no-fallback \
  --foreground-until-ready \
  --selector main \
  --min-cards 3 \
  --timeout 20000
"$REALBROWSER_CLI" --handle app-items wait-ready --selector main --min-cards 3 --visual-stable
```

### 5. Render Or Network Debug

```bash
"$REALBROWSER_CLI" capture-console https://app.example --anonymous --duration 5000 --out /tmp/app-console.json
"$REALBROWSER_CLI" capture-network https://app.example --anonymous --duration 8000 --har /tmp/app.har
```

Read `references/debugging.md` before drawing cache, header, auth, or response
body conclusions.

## Speed And Token Rules

- Cap routine reads: `observe --max-chars 2000`, `console --errors --limit 20`,
  `network --failed --limit 30`, `snapshot --compact --max-chars 2000`.
- On CDP-backed real-profile sessions, `snapshot --compact` reads the
  OpenClaw-style role snapshot substrate first.
- Use `snapshot-aria` when you need OpenClaw-style AX node records.
- On CDP-backed real-profile sessions, `text`, `html`, and `query-selector`
  use OpenClaw-style `getDomText` / `querySelector` primitives.
- Use `snapshot-dom --out <path>` when you need OpenClaw-style DOM element
  records for local inspection instead of raw HTML.
- Use `screenshot` for visual evidence and `html --out <path>` for
  selector/debug work, not as the default page parser.
- Do not use `--full-stdout` for large or unknown output. Prefer artifacts and
  targeted local inspection.
- For social/app feeds, chats, search results, or nested dynamic lists, do not
  treat full-page HTML as the parser and do not rely on removed semantic
  shortcuts such as `posts`, `blocks`, or `content-blocks`. Use
  `snapshot --compact`, `snapshot-aria`, `snapshot-dom --out`, and
  `query-selector --out`; use screenshots only to verify visual boundaries or
  media-heavy content.
- Use `--raw-size` only when exact browser pixels matter. Default screenshots
  are normalized for agent use.

## Safety Notes

Chrome DevTools MCP/CDP can inspect and modify browser state. Avoid sensitive
tabs unless the user explicitly wants that. The local daemon binds to
`127.0.0.1` and uses the bearer token in the state file for command calls.

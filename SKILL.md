---
name: realbrowser
description: Use when you need fast local real-browser automation from Codex, including listing/selecting Chrome profiles, named browser sessions, anonymous clean-state sessions, structured role/DOM extraction for repeated, lazy, or nested page content, network/performance capture, opening tabs, taking snapshots or screenshots, clicking, typing, filling forms, reading console/network data, or debugging localhost/browser UI with Chrome DevTools MCP.
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

## Operating Contract

Start by classifying the browser scope: current/existing tab, signed-in profile,
anonymous public page, console/network debug, screenshot, form interaction, or
repeated-content extraction. Attach with the least disruption that satisfies
that scope, verify the target with a small URL/title/visible-text read, and keep
the first content read bounded. Treat target-changing browser commands as
sequential: do not parallelize `select-tab`, `open`, `goto`, clicks, or typing
with page reads such as `js`, `observe`, snapshots, console capture, or
screenshots. Verify the selected URL/title after the target changes, then read;
otherwise a read can hit a transient browser surface, stale tab, or wrong
profile page. If the user names a profile, current tab, or logged-in state, that
is permission to inspect and navigate within the requested target; it is not
permission to inspect unrelated sensitive tabs or perform sensitive actions. Ask
before submits, sends, purchases, deletes, security/account changes, permission
grants, or broad access outside the named target.

## Browser Inspection Loop

Use this loop for general browsing work before picking a recipe:

1. Classify the scope: existing tab/profile, anonymous page, screenshot,
   console/network, form/action, single detail read, or structured content.
2. Acquire one stable target with the least disruption. Prefer existing
   sessions/tabs when the prompt implies current state or a named profile.
3. Verify cheaply with URL, title, ready state, and a small visible-text sample.
4. Preserve state when practical: note the selected tab, URL, scroll position,
   filter/sort, focused field, or modal before changing it.
5. Choose the smallest reader that answers the question. Use the reader ladder
   below instead of starting with full HTML or broad snapshots.
6. Refine boundaries before trusting extracted content. Confirm the root,
   direct children, current sort/filter, and whether unrelated nested content is
   mixed in.
7. Act/read on current refs only, then report the result with context such as
   signed-in profile state, current visible order, current filters, or anonymous
   public state. Restore inspection-only state when practical.

For generic "check/read this page" tasks, the fast path is:

1. Resolve scope: public page, existing signed-in tab, or new signed-in
   navigation.
2. Find and select by the most specific URL or route available; use title only
   when URL matching is not enough.
3. Verify `href`, `title`, and `readyState`.
4. Run one targeted extraction for the requested answer.
5. If you click or change filters, verify the selected state before extracting
   again.

Reader ladder:

- URL/title/ready/scroll/account hints: tiny `js`.
- Visible page state and quick controls: bounded `observe`.
- Forms, buttons, labels, and accessible controls: `snapshot-aria`.
- Repeated or nested content: `extract-items`, then selector-scoped records.
- Ambiguous DOM boundaries: `query-selector --out` or `snapshot-dom --out`.
- Exact clicking/typing refs: `snapshot --efficient`.
- Visual, canvas, iframe, media-heavy, clipped, or responsive checks:
  screenshots.
- Console or network evidence: console/network capture commands; do not reload
  unless the user asks to reproduce load-time output.

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
new tab. Run selection and verification as ordered steps; do not combine them
with parallel tool calls:

```bash
"$REALBROWSER_CLI" sessions
"$REALBROWSER_CLI" find-tab "<url-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" select-tab "<url-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" js '({href: location.href, title: document.title, readyState: document.readyState})'
```

For a signed-in profile browse/read request, keep the first pass generic and
tight. Use targeted `find-tab` queries before printing broad tab lists. If a
real-profile endpoint session already exists and an existing same-site tab can
be safely reused, select that tab and `goto` the requested URL; this is the
lowest-focus path because it stays inside CDP. Use `open --profile ...` only
when you must initialize/switch a specific UI profile or no reusable target
exists. Non-front profile app launches are blocked by default because browsers
can steal focus from the user's active app on desktop OSes; use
`--best-effort-background` only when the user accepts that focus risk. Verify
with one tiny
URL/title/visible-text read, then extract only the requested content:

```bash
"$REALBROWSER_CLI" profiles --active
"$REALBROWSER_CLI" find-tab "<site-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" open --profile "<profile-id>" "<url>" --no-fallback --timeout 30000
"$REALBROWSER_CLI" find-tab "<site-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" select-tab "<site-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" goto "<url>" --timeout 30000
"$REALBROWSER_CLI" js '({href: location.href, title: document.title, readyState: document.readyState, text: document.body?.innerText?.slice(0, 500) || ""})'
```

Use the matching later section only when needed:

- Console output or DevTools logs: read "Console Output Copy Fast Path".
- Repeated, lazy, or nested page content: use "Structured Page Extraction"
  before broad `observe`, then read `references/debugging.md` only if
  boundaries are ambiguous.
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

## Structured Page Extraction

Use this for any page where the requested answer lives inside repeated, lazy, or
nested structures: feeds, inboxes, search results, tables, grids, chats,
dashboards, notifications, product/catalog lists, file lists, comments, or
virtualized panes. `observe` is for page state, controls, and sanity checks; it
is not the default parser for item content.

First identify the stable content root and direct children. Treat selectors such
as `[role="article"]`, `article`, rows, cards, or message bubbles as hypotheses:
they can match comments, replies, sidebars, composers, pinned/sponsored blocks,
chat overlays, or hidden templates. When item order matters, report it as the
current visible/current loaded order unless you deliberately scroll, dedupe, and
confirm the sort/filter. Do not use `snapshot --selector <large-root>` as the
default content parser for feeds/lists: even a correct root such as `main` or
`[role="main"]` can expand into a large role tree. Prefer direct-child `js` or
`extract-items` first, then use snapshots only for small verified containers,
accessible refs, or boundary checks with a hard `--max-chars` cap.

```bash
"$REALBROWSER_CLI" extract-items --limit 5 --max-text-chars 700
"$REALBROWSER_CLI" extract-items --selector main --limit 5 --max-text-chars 700
"$REALBROWSER_CLI" extract-items --selector main --item-selector article --limit 5 --out "$ARTIFACT_DIR/page-items.json"
"$REALBROWSER_CLI" js '(() => { const root = document.querySelector("main,[role=main],[role=feed],[role=list],[role=grid],table") || document.body; return [...root.children].slice(0,12).map((el,i)=>({i, tag:el.tagName, role:el.getAttribute("role"), text:(el.innerText||"").replace(/\s+/g," ").slice(0,240)})); })()'
"$REALBROWSER_CLI" snapshot --selector '<small-stable-container>' --compact --max-chars 2000
"$REALBROWSER_CLI" snapshot --compact --max-chars 2000
"$REALBROWSER_CLI" snapshot-dom --selector main --out "$ARTIFACT_DIR/page-dom.json" --limit 1800 --max-text-chars 180
"$REALBROWSER_CLI" snapshot-aria --out "$ARTIFACT_DIR/page-aria.json" --limit 1800
"$REALBROWSER_CLI" query-selector 'main,[role="main"],[role="feed"],[role="list"],[role="grid"],table,[role="article"],article' --out "$ARTIFACT_DIR/page-elements.json" --limit 60 --max-text-chars 300 --max-html-chars 800
```

For huge or noisy pages, do not print or grep broad artifact matches into the
conversation. First identify a stable root or candidate headings, then extract a
small JSON/text summary with `jq`, Node, or a targeted `js` expression. When a
page may contain API keys, auth tokens, customer data, private messages, billing
details, or other secrets, avoid raw stdout: use `--out` artifacts for local
inspection or a targeted `js` expression that redacts before returning text. If
hydration stalls with low item counts, visible skeletons, or
`document.visibilityState === "hidden"`, try background waits, scrolls, compact
extraction, and targeted `js` first; foreground only when that is required to
finish the task.

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
  `references/profiles.md`. Treat profile selection as setup/discovery. Once a
  real-profile endpoint session exists, continue with plain session/handle
  commands and omit `--profile` unless switching profiles. Real signed-in
  profile opens should not steal focus: profile app launches without `--front`
  are blocked unless `--best-effort-background` explicitly accepts the focus
  risk. Do not request foregrounding unless the user asked for visual handoff.
- Focus-gated or lazy pages that do not hydrate in a background tab:
  first try background `wait-ready`, scrolls, compact extraction, and targeted
  `js`/selector reads. Use explicit foregrounding only after those fail or when
  the user asked to bring the browser forward.
- Large, lazy, repeated, or deeply nested pages: use "Structured Page
  Extraction" before dumping HTML. Start with compact item summaries, confirm
  roots/direct children, write deep reads to files, and inspect those files with
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
   For real signed-in profiles, first reuse the active endpoint session when
   one exists: `open "<url>"`, `goto "<url>"`, `select-tab ...`, or `claim ...`
   without `--profile`. Use `open --profile "<id>" "<url>" --no-fallback` only
   to initialize or switch the profile endpoint; after it activates a session,
   continue with plain `realbrowser ...` commands. Omit `--select` on the
   initial profile open unless immediate automation selection is required.
   Do not add `--front`,
   `focus <target-or-url-fragment>`, or `--foreground-until-ready` just because a
   page is slow or lazy. Use foregrounding only for explicit visual handoff, or
   after background waits/scrolls/extraction fail and the foreground need is
   worth interrupting the user.
   For inspection-only work, record scroll position, active filter/sort, modal,
   or focused input before changing them when practical.
3. Read before acting. Use `observe --max-chars 1500-2500` for page state,
   controls, and quick sanity checks. For repeated, lazy, or nested content,
   start with the structured extraction path (`extract-items --limit <n>`, root
   or direct-child checks, then selector-scoped `snapshot`, `snapshot-dom`,
   `snapshot-aria`, or `query-selector --out` only as needed) and keep large
   artifacts out of stdout.
   Use `snapshot --efficient` when current `uid` or CDP `[ref=eN]` refs are
   needed.
4. Act only on current refs. After navigation, modal changes, form submission,
   or stale-ref failures, run `observe` or `snapshot --efficient` again.
5. Prefer visible-state waits over sleeps: `wait <text> --visible`,
   `wait --selector <css> --visible`, `wait --domcontentloaded`, or
   `wait --networkidle`. For modern lazy pages, use `wait-ready` with
   `--selector`, `--ready-text`, `--visual-stable`, or `--no-skeletons`. Use
   `--min-cards` only with a known `--card-selector` or when generic card
   detection has already matched the target content.
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
"$REALBROWSER_CLI" sessions
"$REALBROWSER_CLI" find-tab app.example --all-sessions
"$REALBROWSER_CLI" select-tab app.example --all-sessions
"$REALBROWSER_CLI" observe --max-chars 2000
```

If cookies in a specific Chrome profile matter, read `references/profiles.md`
before opening or attaching.

For real signed-in profiles, reuse an existing endpoint tab when possible. If
you must open a specific UI profile through the OS launcher, use `--front` for
explicit visual handoff or `--best-effort-background` only when focus risk is
acceptable. Then omit `--profile` for follow-up commands:

```bash
"$REALBROWSER_CLI" open --profile "chrome:Default" "https://app.example/items" --no-fallback --timeout 30000
"$REALBROWSER_CLI" observe --max-chars 2000
"$REALBROWSER_CLI" extract-items --limit 5 --max-text-chars 700
```

Do not add `--front`, `focus`, or `--foreground-until-ready` unless the user
asked to see the browser or background reads have failed and foregrounding is
required to finish the task.

For a page that stalls until the tab is active, foregrounding is explicit:

```bash
"$REALBROWSER_CLI" claim https://app.example/items \
  --profile "chrome:Default" \
  --handle-name app-items \
  --no-fallback \
  --foreground-until-ready \
  --selector main \
  --card-selector ".item-card" \
  --min-cards 3 \
  --timeout 20000
"$REALBROWSER_CLI" --handle app-items wait-ready --selector main --card-selector ".item-card" --min-cards 3 --visual-stable
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
- Use a tiny `js` expression for URL/title/ready-state/heading verification
  when full page state is unnecessary.
- Prefer targeted `find-tab <query> --all-sessions` over broad `tabs` output.
  Print full tab lists only when candidate disambiguation is required, and then
  keep the list scoped to the user's target.
- On CDP-backed real-profile sessions, `snapshot --compact` reads the
  structured role snapshot substrate first.
- Use `snapshot-aria` when you need structured AX node records.
- On CDP-backed real-profile sessions, `text`, `html`, and `query-selector`
  use structured `getDomText` / `querySelector` primitives.
- Use `extract-items --limit <n>` before broad snapshots when the task is to
  read repeated content and the root is not yet known. It favors specific roots
  such as `main`, `[role="main"]`, and `[role="feed"]` over broad `body`
  fallback, then does candidate scoring and nested-item suppression in one page
  eval. Add `--selector <root>` only after the stable content container is known.
- Use `snapshot-dom --selector <css> --out <path>` when a stable container is
  known; omit `--selector` only when full-document DOM records are intentional.
- Use `screenshot` for visual evidence and `html --out <path>` for
  selector/debug work, not as the default page parser.
- Do not use `--full-stdout` for large or unknown output. Prefer artifacts and
  targeted local inspection.
- For repeated, lazy, or nested pages, do not treat full-page HTML as the parser
  and do not rely on site-specific shortcuts such as `posts`, `blocks`, or
  `content-blocks`. Use `extract-items`, root/direct-child checks,
  selector-scoped snapshots, `snapshot-aria`, `snapshot-dom --selector <css>
  --out`, and `query-selector --out`; use screenshots to verify visual
  boundaries or media-heavy content. Slow hydration is not by itself a reason to
  foreground a signed-in profile tab; try background waits, scrolls, compact
  extraction, and targeted `js` first.
- If a command unexpectedly prints huge output or truncates, stop that read path
  and switch to `--out` artifacts plus targeted local inspection.
- If extracted content includes or may include secrets, credentials, private
  messages, or account data, keep raw output local and return only a redacted
  excerpt or summary.
- Use `--raw-size` only when exact browser pixels matter. Default screenshots
  are normalized for agent use.

## Safety Notes

Chrome DevTools MCP/CDP can inspect and modify browser state. Avoid sensitive
tabs unless the user explicitly wants that. A request to use a signed-in profile
or current tab permits inspection within the named target, not unrelated inboxes,
admin pages, payments, private chats, or account settings. The local daemon
binds to `127.0.0.1` and uses the bearer token in the state file for command
calls.

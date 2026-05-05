# Debugging, Network, Console, And Large Reads

Read this for render bugs, console errors, network failures, performance
captures, cache/header proof, or large HTML/text extraction.

## Choosing A Read Mode

- `observe`: first pass for page state, visible controls, fields, console
  errors, and recent failed network lines. Do not use it as the primary parser
  for repeated or nested content on large pages.
- `extract-items`: compact one-eval repeated-content extraction with root
  discovery, candidate scoring, link capture, and nested-item suppression.
- `snapshot --compact`: compact OpenClaw-style role snapshots.
- `snapshot-aria`: OpenClaw-style AX node records for local inspection.
- `snapshot-dom`: OpenClaw-style DOM element records for local inspection.
- `query-selector`: OpenClaw-style selector match records for local inspection.
- `screenshot`: visual evidence, canvas/image/card-heavy content, or ambiguous
  visual boundaries.
- `snapshot --efficient`: clickable/accessible refs for interaction.
- `html`: selectors, DOM attributes, or extraction debugging. Prefer
  selector-scoped reads and `--out <path>` for large output.
- `js`: targeted reads when built-in modes do not expose the structure needed.

Avoid forcing a semantic answer out of the wrong read mode. Switch deliberately
when content boundaries are ambiguous.

## Compact Content Reads

```bash
"$REALBROWSER_CLI" claim "https://example.com/items" --session content-read --handle-name content-read --timeout 15000 --quiet
"$REALBROWSER_CLI" --handle content-read chain '[["wait","Items","--visible","--timeout","15000"],["snapshot","--compact","--max-chars","2000"]]' --return final
```

For large dynamic pages such as feeds, dashboards, chats, search results, or
virtualized lists:

1. Reuse or claim the real tab/profile once. For real signed-in profiles, keep
   the open in the background by default. Slow hydration is not enough reason to
   add `--front` or `--foreground-until-ready`; try background `wait-ready`,
   scrolls, compact extraction, and targeted `js`/selector reads first. Use
   foregrounding only when the user asked to see the browser or after background
   reads fail and activation is required.
2. Add `--min-cards` only when you also know the repeated-item selector or have
   already confirmed generic card detection maps to the target content.
3. If you need page identity, run a tiny `js` expression for URL/title/heading
   or a tightly capped `observe`; do not start with a broad body read.
4. Start with `extract-items --selector <stable-container> --limit <n>` when
   the target area is known; otherwise use `extract-items --limit <n>` and let
   root discovery pick the best visible container.
5. Use `snapshot --selector <stable-container> --compact --max-chars 2000-3000`
   when you need accessible context or refs; otherwise use
   `snapshot --compact --max-chars 2000-3000`.
6. If item boundaries or nesting are ambiguous, write OpenClaw-style records to
   files and inspect them with OS-available local tools. `rg`/`jq` are optional;
   PowerShell `Select-String`/`ConvertFrom-Json` or Node work on Windows.
   Do not dump full-page HTML into stdout.
7. Use screenshots only for visual confirmation, media-heavy posts, canvas
   content, or when text extraction cannot expose the visual boundary.

```bash
ARTIFACT_DIR="${TMPDIR:-/tmp}/realbrowser-feed"
mkdir -p "$ARTIFACT_DIR"
"$REALBROWSER_CLI" claim "https://example.com/feed" \
  --profile "chrome:Default" \
  --handle-name feed-read \
  --no-fallback \
  --timeout 30000
"$REALBROWSER_CLI" --handle feed-read wait-ready --selector main --visual-stable --timeout 30000
"$REALBROWSER_CLI" --handle feed-read extract-items --selector main --limit 5 --max-text-chars 700
"$REALBROWSER_CLI" --handle feed-read extract-items --selector main --item-selector article --limit 5 --out "$ARTIFACT_DIR/feed-items.json"
"$REALBROWSER_CLI" --handle feed-read snapshot --compact --max-chars 2500
"$REALBROWSER_CLI" --handle feed-read snapshot-dom --selector main --out "$ARTIFACT_DIR/feed-dom.json" --limit 1800 --max-text-chars 180
"$REALBROWSER_CLI" --handle feed-read snapshot-aria --out "$ARTIFACT_DIR/feed-aria.json" --limit 1800
"$REALBROWSER_CLI" --handle feed-read query-selector 'main, [role="feed"], [role="article"], article' \
  --out "$ARTIFACT_DIR/feed-elements.json" \
  --limit 60 \
  --max-text-chars 300 \
  --max-html-chars 800
```

Search the saved artifacts with whichever local tool is available:

```bash
rg -n "needle|role|article|data-|aria" "$ARTIFACT_DIR"/feed-*.json
```

Keep artifact inspection targeted. Broad `rg` over DOM/AX JSON can print large
ancestor text repeatedly because OpenClaw-style DOM snapshots store bounded
`innerText` on each node. Prefer heading/candidate extraction first, then a
small summary around likely item roots.

```powershell
$ArtifactDir = Join-Path $env:TEMP "realbrowser-feed"
Select-String -Path (Join-Path $ArtifactDir "feed-*.json") -Pattern "needle|role|article|data-|aria"
```

There is no site-specific `posts`, `blocks`, or `content-blocks` shortcut.
Use the generic `extract-items` reader first, then the snapshot/selector
substrate above when the page's actual role and DOM records are needed.

If `snapshot-dom`, `snapshot-aria`, or `query-selector` fails with a daemon
capability error, check `status` before falling back to raw HTML or unrelated
source-code searches. A stale daemon can be running an older copy of this skill
script even when the current `scripts/realbrowser` supports the command. On real
signed-in profiles, reload/restart only when the reader is needed because Chrome
may surface the remote-debugging approval/banner.

### Nested Item Trap

On nested feeds, chats, search results, issue trackers, dashboards, and other
repeated-item pages, selector names are not proof of item boundaries. A selector
such as `[role="article"]` may match nested comments, replies, cards, or
subpanels instead of the top-level item the user asked about. Do not count
selector matches as feed items without checking surrounding DOM/AX context.

A more reliable sequence is:

```bash
ARTIFACT_DIR="${TMPDIR:-/tmp}/realbrowser-feed"
mkdir -p "$ARTIFACT_DIR"
"$REALBROWSER_CLI" query-selector 'main h1, main h2, main h3, [role="heading"]' --out "$ARTIFACT_DIR/headings.json" --limit 80 --max-text-chars 200 --max-html-chars 500
"$REALBROWSER_CLI" extract-items --selector main --limit 8 --max-text-chars 700 --out "$ARTIFACT_DIR/items.json"
"$REALBROWSER_CLI" snapshot-dom --selector main --out "$ARTIFACT_DIR/feed-dom.json" --limit 2200 --max-text-chars 180
"$REALBROWSER_CLI" snapshot-aria --out "$ARTIFACT_DIR/feed-aria.json" --limit 2200
```

Use the heading/candidate list to identify likely top-level items in visible
order, then use DOM/AX records around those candidates to separate primary item
text from nested content. If the boundary is still unclear, use a targeted
screenshot for visual confirmation rather than broad screenshot OCR or full-page
HTML stdout.

For large HTML:

```bash
ARTIFACT_DIR="${TMPDIR:-/tmp}/realbrowser-read"
mkdir -p "$ARTIFACT_DIR"
"$REALBROWSER_CLI" html ".target" --out "$ARTIFACT_DIR/target.html" --max-chars 2000
"$REALBROWSER_CLI" snapshot-aria --out "$ARTIFACT_DIR/snapshot-aria.json" --limit 1200
"$REALBROWSER_CLI" snapshot-dom --selector ".target" --out "$ARTIFACT_DIR/snapshot-dom.json" --limit 1200 --max-text-chars 220
"$REALBROWSER_CLI" query-selector ".target" --out "$ARTIFACT_DIR/query-selector.json" --limit 20
```

Then inspect the saved files with `rg`, PowerShell `Select-String`, editor
search, Node, or another local JSON/text tool that exists on the machine.

Use `--raw --full-stdout --max-chars <n>` only when the user explicitly needs
full raw stdout and you know it fits safely in context.

## Console Capture

For render bugs, "check console log", or "copy DevTools Console output", first
decide whether the user wants the existing tab's current console buffer or a
fresh reproduction. Existing-tab copy should preserve the current page and paste
the console lines back verbatim in a code block.

```bash
"$REALBROWSER_CLI" find-tab "<url-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" select-tab "<url-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" observe --max-chars 1500
"$REALBROWSER_CLI" console --preserve --limit 80
```

For exact-tab work, verify the selected target with `tabs` plus a targeted `js`
read before trusting copied output. Prefer the selected-tab `console` command
after verification. On real signed-in Chrome endpoint sessions, routine reads
prefer the same persistent CDP daemon and page session so `tabs`, `select-tab`,
`js`, `observe`, `console`, and screenshots do not each start a separate
remote-debugging controller.

If the page is in a real signed-in Chrome profile, selected-tab `console` is
CDP-backed and buffers messages while the endpoint daemon is attached. When
Chrome remote debugging is already enabled or a persistent realbrowser endpoint
session exists, run the same selected-tab command without adding
`--allow-profile-reattach`; avoid asking the user twice for the same approved
attach. Chrome can still show its own "Allow remote debugging?" prompt, and the
user must allow that browser prompt if it appears. Treat one browser approval as
permission for the persistent realbrowser CDP session, then reuse the same
session for follow-up reads. Use the reattach flag only when intentionally
replacing or restarting the controller, or when the CLI explicitly refuses a
fresh MCP attach:

```bash
"$REALBROWSER_CLI" console --preserve --limit 80
```

If the copied output is empty or appears to come from another site when the user
expects logs, do not stop there. Run `status` and check for
`Daemon script: <old> (current <new>; reload needed for new skill code)`. A
stale daemon can miss current target-mapping behavior. Rerun the normal routine
read first; current realbrowser can route console/screenshot commands through
an endpoint-scoped current CDP daemon when Chrome remote debugging is already
enabled or an explicit endpoint is in use, activates that session for follow-ups,
and avoids disposable temporary controllers for the normal profile workflow. Use
`--allow-profile-reattach` only for an intentional real-profile reload/restart
or an explicit MCP-only command that refuses to attach.

For startup/render bugs where a fresh load is needed:

```bash
"$REALBROWSER_CLI" capture-console "<url>" --anonymous --duration 5000 --out /tmp/realbrowser-console.json
"$REALBROWSER_CLI" console --errors --limit 20
"$REALBROWSER_CLI" console get <msgid> --raw
```

For authenticated pages, select the tab/profile first, then capture on reload
only when reproduction on reload is wanted:

```bash
"$REALBROWSER_CLI" select-tab "<url-or-title-fragment>" --all-sessions
"$REALBROWSER_CLI" capture-console --reload --duration 5000 --out /tmp/realbrowser-console.json
```

If the authenticated reload capture hits the real-profile MCP approval guard,
first check `status`. When Chrome remote debugging is enabled or a persistent
endpoint session is active, rerun the normal command. Add
`--allow-profile-reattach` only when accepting a new controller attach:

```bash
"$REALBROWSER_CLI" capture-console --reload --duration 5000 --out /tmp/realbrowser-console.json --allow-profile-reattach
```

`capture-console` includes JavaScript console messages and failed DevTools
network rows by default because Chrome DevTools shows those in Console. Use
`--no-network` only when JavaScript messages alone are desired.

Console and network artifacts can contain user data, tokens, request payloads,
or account details. Keep them local unless the user explicitly asks to share.

Copy-output response rules:

- Include only the selected tab's console output unless the user asks for
  analysis.
- Keep DevTools Console network failures because Chrome shows them in Console.
- If there are multiple matching tabs or profiles, verify the exact target by
  URL/title/visible page text before reading output.
- If no lines are captured, say that no console output was found for the
  selected tab and state whether the page was reloaded. If the user says the
  DevTools Console should contain startup logs, arm `capture-console --reload`
  and reproduce instead of relying on historical console replay.

## Network And Performance Capture

Start capture before navigation or reload:

```bash
"$REALBROWSER_CLI" capture-network https://app.example.com --anonymous --duration 15000 --har /tmp/app.har
"$REALBROWSER_CLI" select-tab app.example.com --all-sessions
"$REALBROWSER_CLI" capture-network --reload --duration 15000 --har /tmp/app-auth.har
```

`capture-network` records PerformanceResourceTiming plus DevTools request rows,
then summarizes slow requests, large transfers, failed/error lines,
render-blocking resources, top hosts, and navigation timing. It does not capture
response bodies or auth headers. HAR artifacts preserve full URLs locally.

## Cache, Header, Auth, Or Body Proof

Do not stop at the capture summary. Pin proof to a current request row:

```bash
"$REALBROWSER_CLI" select-tab app.example.com --all-sessions
"$REALBROWSER_CLI" network --clear --limit 200
"$REALBROWSER_CLI" capture-network --reload --duration 8000 --har /tmp/app-cache.har
"$REALBROWSER_CLI" network --filter "/api/cache-target" --limit 20
"$REALBROWSER_CLI" network get <reqid> --request-file /tmp/cache.request.txt --response-file /tmp/cache.response.txt --raw
```

Use the `reqid` from filtered current-page rows. `network --clear` only clears
realbrowser's compact line buffer; it is not proof by itself. Avoid
`--preserve` for cache verdicts unless intentionally comparing older rows.

## Useful Overrides

```bash
REALBROWSER_MODE=dedicated "$REALBROWSER_CLI" doctor --deep
"$REALBROWSER_CLI" --backend dev doctor --deep
REALBROWSER_BROWSER_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" tabs
REALBROWSER_CDP_URL=http://127.0.0.1:9222 "$REALBROWSER_CLI" wait-download report.pdf
REALBROWSER_STATE_FILE=/tmp/realbrowser.json "$REALBROWSER_CLI" doctor
REALBROWSER_SESSION=work-anon "$REALBROWSER_CLI" observe
REALBROWSER_NO_ACTIVE_SESSION=1 "$REALBROWSER_CLI" status
REALBROWSER_BROWSER_USER_DATA_DIR=/path/to/browser/profile-root "$REALBROWSER_CLI" status
REALBROWSER_BROWSER_PROCESS_NAME="Google Chrome" "$REALBROWSER_CLI" detach --dismiss-banner
```

## Output Hygiene

- Cap routine reads: `observe --max-chars 2000`, `console --errors --limit 20`,
  `network --failed --limit 30`.
- Full large data belongs in files: `--out`, `--har`, `--request-file`,
  `--response-file`, or targeted screenshot artifacts.
- If stdout truncates, realbrowser may write an auto artifact. Read that file
  with local tools instead of rerunning huge stdout.

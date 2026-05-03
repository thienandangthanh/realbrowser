# Debugging, Network, Console, And Large Reads

Read this for render bugs, console errors, network failures, performance
captures, cache/header proof, or large HTML/text extraction.

## Choosing A Read Mode

- `observe`: first pass for page state, visible controls, fields, console
  errors, and recent failed network lines.
- `posts`: repeated content cards in screen order. Prefer visible container
  boundaries such as direct children of a feed/list/grid.
- `blocks`: dashboards, search results, documents, and generic pages.
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
"$REALBROWSER_CLI" --handle content-read chain '[["wait","Items","--visible","--timeout","15000"],["posts","--limit","3","--max-chars","2000"]]' --return final
```

For large HTML:

```bash
"$REALBROWSER_CLI" html ".target" --out /tmp/target.html --max-chars 2000
rg -n "needle|data-id|aria" /tmp/target.html
```

Use `--raw --full-stdout --max-chars <n>` only when the user explicitly needs
full raw stdout and you know it fits safely in context.

## Console Capture

For render bugs or "check console log":

```bash
"$REALBROWSER_CLI" capture-console https://app.example.com --anonymous --duration 5000 --out /tmp/app-console.json
"$REALBROWSER_CLI" console --errors --limit 20
"$REALBROWSER_CLI" console get <msgid> --raw
```

For authenticated pages, select the tab/profile first, then capture on reload:

```bash
"$REALBROWSER_CLI" select-tab app.example.com --all-sessions
"$REALBROWSER_CLI" capture-console --reload --duration 5000 --out /tmp/app-auth-console.json
```

`capture-console` includes JavaScript console messages and failed DevTools
network rows by default because Chrome DevTools shows those in Console. Use
`--no-network` only when JavaScript messages alone are desired.

Console and network artifacts can contain user data, tokens, request payloads,
or account details. Keep them local unless the user explicitly asks to share.

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

# Screenshots And Responsive Viewports

Read this for exact viewport screenshots, mobile captures, responsive evidence,
or PNG dimension verification.

## Exact Device Screenshots

Use this for the common "desktop/tablet/mobile screenshots" request. The command
runs inside the daemon, pins CDP captures to the selected `targetId` when
available, writes raw PNGs, and verifies their dimensions.

```bash
"$REALBROWSER_CLI" --session site-check device-screenshots /tmp/site-inbox
```

Default devices:

- `desktop:1440x900`
- `tablet:768x1024`
- `mobile:390x844`

Custom devices:

```bash
"$REALBROWSER_CLI" --session site-check device-screenshots /tmp/site-inbox --devices desktop:1440x900,tablet:768x1024,mobile:390x844
"$REALBROWSER_CLI" --session site-check device-screenshots https://example.com/app /tmp/site-inbox --devices wide:1600x900,phone:390x844
```

Readiness and emulation options:

```bash
"$REALBROWSER_CLI" --session site-check device-screenshots /tmp/site-inbox --selector main --visual-stable --settle-ms 500
"$REALBROWSER_CLI" --session site-check device-screenshots /tmp/site-inbox --mobile-emulation
"$REALBROWSER_CLI" --session site-check device-screenshots /tmp/site-inbox --target-id <cdp-target-id>
"$REALBROWSER_CLI" --session site-check device-screenshots /tmp/site-mobile-full --devices mobile:390x844 --full --mobile-emulation
```

- `--settle-ms <ms>` waits after each viewport change; default is `200`.
- `--selector`, `--ready-text`, `--min-cards`, `--visual-stable`, and
  `--no-skeletons` run the same visible readiness check as `wait-ready`.
- `--mobile-emulation` applies mobile/touch emulation to devices named
  `mobile`, `phone`, `iphone`, or `android`; `--mobile` forces it for all
  devices.
- `--full` captures the full page after applying the device viewport. Full-page
  PNG dimensions are reported but not constrained to the viewport height.
- If multiple tabs match the URL, the command fails instead of guessing. Use
  `select-tab`, `--handle`, `--page`, or `--target-id` to pin the tab.
- If the selected real-profile daemon is old and lacks this command, the CLI
  uses a temporary current-script controller against the same CDP endpoint,
  reuses the selected `targetId`, captures, and stops the temporary controller.

Aliases: `exact-screenshots`, `responsive-exact`.

## Fast Responsive Capture

Use this when the user wants mobile/tablet/desktop evidence and exact custom
sizes are not required:

```bash
"$REALBROWSER_CLI" --session site-check responsive /tmp/site-inbox
```

This saves mobile, tablet, and desktop screenshots in one daemon call. Inspect
the saved images before finishing.

## Full-Size Screenshots

Use this when the user asks for a "full size", "full page", or complete
screenshot, whether the viewport is desktop, tablet, or mobile:

```bash
"$REALBROWSER_CLI" full-screenshot /tmp/site-full.png
"$REALBROWSER_CLI" full-screenshot /tmp/site-mobile-full.png --viewport 390x844
"$REALBROWSER_CLI" full-screenshot /tmp/chat-list-full.png --selector '[data-testid="chat-list"]'
```

`full-screenshot` first checks whether the document itself scrolls. If it does,
it uses browser-native full-page capture. If the document is fixed-height but a
dominant visible scroll container exists, it scrolls and stitches that internal
container, preserving the fixed header for whole-page captures. This avoids the
common false success where `screenshot --full` returns only one viewport for
apps built with nested scroll panes.

For a selected scroll container, pass `--selector`; the output is the full
selected region rather than the full viewport. Use `--settle-ms` when content
virtualizes or lazy-renders while scrolling.

## Area Screenshots

Use this when the user needs a specific part of the page:

```bash
"$REALBROWSER_CLI" snapshot --annotate
"$REALBROWSER_CLI" area-screenshot /tmp/button.png --uid 1_23
"$REALBROWSER_CLI" area-screenshot /tmp/search.png --selector 'input[type="search"]'
```

Prefer `--uid` when a recent snapshot exposes a stable target. Use `--selector`
when the region has a reliable CSS selector or when the current real-profile
session cannot use MCP element screenshots without an approval prompt.

## Exact Viewport Rules

Viewport and screenshots are page-scoped in Chrome DevTools. When exact sizes
matter:

1. Get the selected page id or CDP `targetId`.
2. Pass `--page <id>` or `--target-id <id>` to exact screenshot commands.
3. Verify `window.innerWidth` / `innerHeight`.
4. Verify PNG dimensions from the PNG header.

Do not trust `Emulating viewport: ...` alone.

## Portable Exact-Size Loop

```bash
REALBROWSER_CLI="$HOME/.codex/skills/realbrowser/scripts/realbrowser"
SESSION="site-check"
OUTDIR="/tmp/site-shots"
mkdir -p "$OUTDIR"

"$REALBROWSER_CLI" --session "$SESSION" device-screenshots "$OUTDIR/inbox" \
  --devices desktop:1440x900,tablet:768x1024,mobile:390x844 \
  --raw-size \
  --settle-ms 500
```

Use `view_image` on the saved PNGs when available. `device-screenshots`
sets each viewport and verifies the captured PNG dimensions.

## Atomic Mobile Screenshot

For one mobile screenshot, prefer the built-in flow:

```bash
"$REALBROWSER_CLI" mobile-screenshot https://example.com /tmp/site-mobile.png --session site-mobile --anonymous --viewport 390x844
"$REALBROWSER_CLI" mobile-screenshot https://example.com /tmp/site-mobile.png --handle-name site-mobile-handle --viewport 390x844
```

It opens or navigates the pinned tab, sets the requested viewport, waits for
network idle, captures a raw-size PNG, and verifies dimensions.

## Manual Mobile Flow

```bash
SESSION="site-mobile"
OUT="/tmp/site-mobile.png"

"$REALBROWSER_CLI" mobile-screenshot https://example.com "$OUT" \
  --session "$SESSION" \
  --anonymous \
  --viewport 390x844
```

## PowerShell Equivalent

```powershell
$RealbrowserCli = Join-Path $HOME ".codex/skills/realbrowser/scripts/realbrowser.ps1"
$Session = "site-mobile"
$Out = "/tmp/site-mobile.png"

& $RealbrowserCli mobile-screenshot https://example.com $Out `
  --session $Session `
  --anonymous `
  --viewport 390x844
```

## Screenshot Command Notes

- `screenshot <path>` captures a normalized screenshot for agent use.
- `screenshot <path> --raw-size` preserves exact physical browser pixels.
- `screenshot <path> --full` / `--full-page` captures full page when supported.
- `full-screenshot <path>` is preferred for user-facing full-size screenshots
  because it verifies fixed-body/internal-scroll layouts and stitches when
  needed.
- `area-screenshot <path> --uid <uid>|--selector <css>` captures a specific
  element or page region.
- `screenshot --uid <uid>` captures an element.
- `screenshot --labels` / `--annotate` overlays snapshot uid labels before
  capture and removes them afterward.
- `--max-side` and `--max-bytes` constrain normalized output size.

Use exact raw-size capture only when the user asks for viewport/device evidence
or when visual QA depends on pixel dimensions.

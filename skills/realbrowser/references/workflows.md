# Realbrowser Workflows

## Existing Tab In A Profile

```bash
realbrowser profile list --active
realbrowser tab list "ninzap.dev" --profile chrome:Default
realbrowser tab select "ninzap.dev" --profile chrome:Default --label ninzap
realbrowser read observe -t ninzap --profile chrome:Default
```

Use `tab list` first when the user asks to inspect a current/open tab. Use
`tab ensure` only when no usable tab exists.

If several tabs match, stop and disambiguate by URL, title, and a small
`read observe`; do not read console/network/content from several tabs and merge
the result. Follow-up instructions like "enter" or "select home" apply to the
currently selected/verified target unless the user changes scope.

If `profile list --active --json` reports `cdpScope: "browser"`, treat existing
tab ownership as unproven unless the tab was created by `realbrowser` through
that named profile. URL/title/content can disambiguate browser-wide debugging,
but it is not profile ownership proof. Creation is not silently promoted to OS
launch. `tab ensure/new --profile ... --background` uses background-safe paths
only; use `--best-effort-background` or `--front` only when you explicitly accept
profile app launch risk. On macOS, `--best-effort-background` restores the
previously active app after launch; only `--front` intentionally leaves Chrome
frontmost.

For named-profile opens, browser-scoped matches are not profile proof. If
`tab list "example.com" --profile chrome:Default` shows related tabs but none
was created by `realbrowser` through that profile, do not select a related tab
and navigate it. Create a new tab through the named profile:

```bash
realbrowser tab ensure https://example.com --profile chrome:Default --label app --best-effort-background
```

Use `--browser-url` or `--allow-browser-scope-target` only for intentional
browser-wide debugging where cross-profile risk is acceptable.

Direct WebSocket endpoints from `DevToolsActivePort` are preferred over HTTP
`/json/version` discovery. `profile list --active` is passive: it must not open
CDP WebSockets or cause Chrome approval prompts. If it reports no DevTools
profiles while `profile list` or `profile inspect` shows `userDataInUse: true`,
the browser has no discoverable direct endpoint yet. Do not retry `tab ensure ...
--best-effort-background`; that flag can launch a stopped profile but cannot
attach to an existing non-debuggable Chrome process.

When the task depends on signed-in state and direct attach still fails, ask for
approval to relaunch instead of ending with a manual instruction:

```bash
realbrowser profile relaunch chrome:Default --confirm
realbrowser tab ensure https://example.com --profile chrome:Default --label app --background
```

`profile relaunch` quits the browser app for that user data directory, starts it
with remote debugging, and is a last-resort recovery that should only be run
after the user approves that disruption.

Default context can remove repeated flags after the profile choice is clear:

```bash
realbrowser session use profile:chrome:Default
realbrowser tab list "ninzap.dev"
realbrowser read observe -t ninzap
realbrowser session clear
```

In multi-agent workflows, keep each project/session in its own owner namespace:

```bash
export REALBROWSER_OWNER=ninzap
realbrowser session use profile:chrome:Default
realbrowser tab ensure http://localhost:3000 --profile chrome:Default --label app --background
```

Labels, default context, and target leases are owner-aware. If one session has
leased a tab, another session should create/select its own target instead of
mutating that tab. Use `--take-lease` only when the user intentionally wants the
second session to take over the target.

## Current State Versus Fresh Capture

Use the live signed-in tab/profile for inboxes, social sites, admin dashboards,
console logs, account pages, and any task that depends on cookies or the current
UI. Start with `profile list --active`, `tab list <query>`, and `tab select`.
If the user names a profile such as "Tuyen" or provides a display-name hint,
resolve it through `profile list` / `profile inspect` instead of assuming
`chrome:Default`.

Use anonymous sessions for public-page screenshots, clean-state checks, and
responsive viewport captures unless the user explicitly asks for the current
logged-in browser. For viewport work on disposable targets, prefer `screenshot
device` because it captures and reports each output size in one command. On
signed-in/current profile tabs, use `screenshot capture`, `screenshot area`, or
`wait ready --screenshot` for progress checks; reserve `screenshot device` for
explicit responsive evidence because it temporarily applies CDP viewport
emulation. `action state --screenshot` and `wait ready --screenshot` are visible
checkpoints; `screenshot area/full` are explicit tall-artifact commands. Default
checkpoint artifacts are normalized JPEGs for agent use even when `--out` ends
in `.png`; the returned `screenshot.path` is authoritative and may change to
`.jpg`. Pass `--raw-size`, `--no-normalize`, or `--format png` when exact browser
pixels/PNG output are required. `screenshot device` uses DPR 1 by default for
exact CSS viewport PNGs. `screenshot full` uses document full-page capture when
the document scrolls, and stitches a dominant internal scroll container when an
app shell keeps the document fixed-height. Whole-page stitched captures preserve
visible UI above and below the scroll container, such as headers and reply
composers; `--selector <scroll-container>` captures only the selected panel.

For inspection-only tasks, preserve state. If you change filters, sort, scroll,
or selected panels to inspect something, restore them when practical and say so
in the result.

## Anonymous Browse

```bash
realbrowser tab ensure https://example.com --anonymous --session check --label page --background
realbrowser read observe -t page --anonymous --session check
realbrowser session stop check
```

Anonymous means isolated temporary browser state, not network anonymity and not
Chrome's visible Incognito UI. Use `--incognito` or `--private` only when the
visible browser must look like a real Chrome Incognito window:

```bash
realbrowser tab ensure https://example.com --anonymous --session private --label page --front --incognito
```

Do not use a shell-only command such as `open -na "Google Chrome" --args
--incognito ...` as the normal workflow: it may create a visible Incognito
window, but it loses `realbrowser` target labels, daemon reuse, screenshots,
console/network capture, and guarded actions.

## Repeated Content And Huge Pages

```bash
realbrowser read size -t group
realbrowser read items -t group --collection auto --direct-children --limit 8 --max-text-chars 700
realbrowser read item -t group --collection auto --direct-children --index 4 --max-text-chars 4000
realbrowser read query -t group 'article,[role=article],[role=listitem],li,tr,.card' --visible --fields ref,tag,text --limit 12 --json
realbrowser read snapshot -t group --selector '<small-container>' --urls --cursor-interactive --diff
```

Do not dump full HTML for huge feeds, inboxes, chats, tables, dashboards,
notifications, or search result pages. Use `read size` first; when the page is
large/huge, prefer `read item`, `read items`, or scoped `read query`.
Keep reusable workflows structural and site-neutral: collection roots,
landmarks, roles, list/table rows, links, buttons, form fields, refs, and
network entries. Use site-specific selectors only after a scoped read proves
they are needed for this one page, and keep them out of shared examples.

When exact order matters, verify the surface and order before reading the item:
current sort/filter, heading, top-level collection root, direct children, and
whether collapsed text needs expansion. Broad article selectors can include
comments, sidebars, and nested cards; use direct children or message blocks to
confirm top-level order. Reserve `read snapshot --selector` for small verified
containers or interaction refs, not as the default parser for a large root.

Expansion is explicit and selector-based. Use `read item --expand-selector <css>`
only after a scoped read shows a local expander inside the target item.

If the page offers a stable sort URL/filter that changes "most relevant" into a
chronological/current order, apply that early and verify the heading once before
spending tokens on deeper DOM exploration.

## ARIA Tree (Compact Interaction Planning)

`read tree` fetches Chrome's accessibility tree via CDP. It is 5-20x more compact
than DOM-based snapshots and is the primary tool for interaction planning.

```bash
realbrowser read tree -t app -i -c
realbrowser read tree -t app --interactive --compact --depth 4
realbrowser read tree -t app --selector main -i -c
```

Composable short flags: `-i` (interactive only), `-c` (compact: skip unnamed
structural nodes), `-d N` (depth limit), `-D` (diff against previous snapshot).

After an action, use `--diff` to see only what changed:

```bash
realbrowser action click -t app b3
realbrowser read tree -t app -i -c -D
```

The diff output shows only added/removed lines, saving tokens on verify steps.
Refs from `read tree` (`b1`, `l1`, `e1`) work with all action commands (`action
click`, `action fill`, `action type`, `action submit`).

For large pages, combine flags: `read tree -i -c -d 3 --selector main` gives
the interactive elements in the main landmark, limited to depth 3. This is
typically 20-50 lines instead of 200+ for a full DOM snapshot.

Boolean state checks are available via `read is`:

```bash
realbrowser read is visible e1 -t app
realbrowser read is enabled b3 -t app
realbrowser read is checked e5 -t app
```

Each returns bare `true` or `false` (2 tokens).

## Form, Upload, Submit

```bash
realbrowser action state -t app --root active --compact
realbrowser action state -t app --root active --compact --screenshot --annotate-refs
realbrowser action fill -t app e1 "caption"
realbrowser action type -t app e1 "caption"
realbrowser action upload -t app --root active --input-ref e2 ~/Downloads/media.png
realbrowser wait ready -t app --visual-stable --screenshot --out tmp/upload-ready.png
realbrowser action submit -t app --root active --text "Submit"
realbrowser wait ready -t app --timeout 10000
```

Upload verification uses visible app state such as filename text, previews,
image/video dimensions, enabled final controls, and loading markers. Do not rely
on `input.files` after the app ingests the file.
Upload and submit fail when the active root cannot contain the chosen control;
do not switch to global selectors unless the task explicitly asks for page-wide
debugging and you pass `--root page`.

For final-action flows, first enumerate the active root and button-like
candidates, then fill/upload using refs from that root. Click the final control
once by exact text or by ref. Verify with passive state such as URL/title,
enabled/disabled state, preview/status text, network activity, or a scoped read;
do not double-click to test success.

Use `action state --screenshot --annotate-refs` when visual state changes the
decision: modal boundaries, file previews, covered controls, disabled buttons,
canvas/media, crop areas, or multiple visually similar final controls. It returns
the same refs plus a visible-root/viewport screenshot path, not the full scroll
height of a feed/root. The overlay marks the active root boundary and visible
refs; JSON exposes `screenshot.annotation` metadata. Inspect that image before
the next mutating action when the visual state affects which ref is safe;
otherwise the path alone is not evidence.

For uploads, never use standalone `action click` on visible media, attachment,
or file-picker controls. Use `action upload --input-ref <ref> <file>` when a
file input ref exists. Use `action upload --trigger-ref <ref> <file>` when the
page requires clicking a picker control to create/open the file input; this
follows OpenClaw's file-chooser hook pattern by arming the chooser before the
click and setting files through the browser protocol. Standalone click uses a
short CDP file-chooser guard and reports `file_dialog_would_open` instead of
letting the native picker block the desktop.

`fill` replaces values and works for normal inputs. `type <ref> <text>` focuses
the ref and sends native CDP text input, which is safer for rich
contenteditable/React editors that reject synthetic replacement. If an overlay,
picker, or menu owns the active root, press `Escape`, re-run `action state`, and
continue from the corrected root.

`submit --text` requires an exact accessible label/text match inside the active
root. When multiple controls contain similar words or the exact label is not
listed, submit by the enumerated button ref, for example `action submit -t app
b4`, rather than widening to global selectors.
Labels such as `Submit`, `Save`, `Send`, `Post`, `Next`, or localized strings
are page data, not workflow assumptions. A reusable flow should either read the
current root and pass the exact observed label, or select the enumerated ref.

## Console And Network

```bash
realbrowser tab list "<url-or-title-fragment>" --profile chrome:Default
realbrowser tab select "<exact-match>" --profile chrome:Default --label app
realbrowser console list -t app --errors --limit 80
realbrowser console capture -t app --clear --reload --duration 3000 --out tmp/console.json
realbrowser network capture -t app --reload --duration 5000 --out tmp/network.json
realbrowser network capture -t app --include-body --out tmp/network-with-bodies.json
realbrowser network list -t app --filter "/api/" --json
realbrowser network get -t app req_12 --out tmp/req_12.json
realbrowser network body -t app req_12 --response --out tmp/req_12-response.json --full
realbrowser network export -t app --format har --out tmp/app.har
realbrowser perf trace -t app start
realbrowser perf trace -t app stop --out tmp/trace.json
realbrowser state headers set -t app --header "X-Debug: 1"
realbrowser state clipboard read -t app --values
```

For "check console log" or "copy console output", the deliverable is the exact
tab's DevTools Console lines. Select one tab, verify it, and paste the lines
back verbatim. If `console list` is empty but startup logs are expected, arm
`console capture --reload`; old buffers may not replay. Do not broaden into a
general browser summary.

No repeated approval prompts: use the selected target through the existing
`DevToolsActivePort` WebSocket and `realbrowser` daemon. If multiple Chrome
profiles report the same browser-scoped WebSocket, choose the intended profile
and avoid parallel profile probes; the daemon is shared per browser endpoint.
After `tab ensure --label app`, later `-t app` commands can infer the label's
context instead of falling back to a separate endpoint daemon. If Chrome is waiting
for Allow debugging, wait on that starting daemon and retry the same command;
do not spawn another controller. Do not switch to other Chrome DevTools MCP
controllers or foreground Chrome just to read logs. If a profile lacks a direct
WebSocket endpoint, use the profile recovery hint instead of opening extra
controllers.

After Chrome or the computer restarts, a real signed-in Chrome profile may still
show Chrome's debugging approval once. The durable optimization is daemon/endpoint
reuse while the browser lives; anonymous managed sessions avoid signed-in-profile
approval but do not contain the user's logged-in state.

Capture network before reload/action when response bodies matter.

Use `daemon monitor --json` when debugging CDP health, stale daemons, or buffer
growth. Use `network export --out` or `network body --out --full` when the
response is too large for stdout and should be inspected with `jq`, `rg`, or an
editor.

Use `network capture --include-body --out tmp/network.json` only for explicit
debug sessions; body capture requires `--out` unless `--force` is explicit.
Otherwise keep body reads targeted with `network body`.

For large read/debug surfaces, use `--out` instead of stdout:

```bash
realbrowser read size -t app --out tmp/page-size.json
realbrowser read query -t app "button,input,a" --limit 100 --out tmp/controls.json
realbrowser read snapshot -t app --selector main --out tmp/main-snapshot.txt
realbrowser read text -t app --max-chars 50000 --out tmp/page-text.txt
```

## Screenshots, Download, PDF

```bash
realbrowser screenshot capture -t app tmp/app.png
realbrowser screenshot capture -t app tmp/app.jpg --max-side 1600 --max-bytes 2mb
realbrowser screenshot capture -t app --raw-size tmp/app.png
realbrowser screenshot capture -t app --selector '[role=dialog]' tmp/dialog.png --annotate-refs
realbrowser screenshot full -t app tmp/app-full.png
realbrowser screenshot full -t app --selector '[data-scroll-root]' tmp/panel-full.png
realbrowser screenshot area -t app b2 tmp/button.png --annotate-refs
realbrowser screenshot area -t app --selector main tmp/app-main.png
realbrowser screenshot device -t page --anonymous --session responsive --devices desktop:1440x900,tablet:768x1024,mobile:390x844 --visual-stable --settle-ms 300 tmp/page
realbrowser download click -t app e7 --out ~/Downloads/export.csv
realbrowser export pdf -t app ~/Downloads/page.pdf --print-background
```

Do not run a reload/capture command in parallel with screenshot/PDF/export on
the same target.

For exact viewport evidence, use `screenshot device`; it sets each viewport,
waits/settles when requested, clears viewport emulation afterward, saves PNGs,
and reports path, dimensions, viewport, and expected dimensions in JSON. The
output dimensions match the requested CSS viewport by default; use raw CDP/dev
tools paths only when physical DPR pixels are explicitly wanted. Inspect saved
images with `view_image` when the visual result matters. Avoid it as a routine
checkpoint on a live signed-in tab; use visible checkpoint screenshots for
progress and `screenshot area/full` only when the large artifact is the
requested output.

## Portable Batch

```bash
realbrowser chain -t app --from flow.json --return summary
realbrowser chain -t app --from - --return summary < flow.json
realbrowser chain --profile chrome:Default --foreach groups.json --var group --set media=~/Downloads/post.png --from flow.json
```

`chain` avoids Bash-only loops and PowerShell quoting differences. Steps are
normal CLI token arrays, and `$group.url`, `$group.label`, `$media`, and
`$index` are substituted per iteration. `chain` runs inside one browser
context, so put `--profile`, `--anonymous --session`, or `--browser-url` on the
chain command rather than switching profiles inside individual steps.

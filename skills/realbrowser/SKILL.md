---
name: realbrowser
description: Use for fast target-first local Chrome/Chromium browser control with stable labeled tabs, signed-in profiles, anonymous sessions, compact reads, screenshots, console logs, network request/response capture, root-scoped page actions, uploads, guarded submits, downloads, and PDF export. Use this skill whenever the task involves the user's actual Chrome browser — inspecting open tabs, reading console errors, capturing network traffic, taking screenshots of live pages, filling forms, uploading files, or any browser automation that needs signed-in state or existing browser context. Also use for anonymous page reads, responsive screenshots, and PDF generation via CDP.
---

# Realbrowser

Use `realbrowser` when a task needs the user's local browser state or a fast
managed browser. The contract is target-first: resolve or create one tab target,
then pass `-t <label>` or `--handle` on every read, action, screenshot, console,
network, state, dialog, performance, download, or export command.

The design is site-agnostic and OS-portable. Do not encode site names, UI copy,
or language-specific picker labels into the workflow. Use generic browser
state: profile/context, target, active root, refs, accessibility labels,
structural selectors, viewport/topmost checks, network entries, downloads, and
artifacts. Site-specific CSS or text is only a last-mile selector chosen after a
scoped read proves it is correct for the current page.

## Fast Start

The `realbrowser` CLI is bundled at `scripts/realbrowser` (Node entry:
`scripts/realbrowser.mjs`) relative to this skill's directory. Construct the
`REALBROWSER` variable from the skill base directory shown above.

macOS/Linux:

```bash
REALBROWSER="<skill-directory>/scripts/realbrowser"
```

Windows PowerShell:

```powershell
$Realbrowser = Join-Path "<skill-directory>" "scripts\realbrowser.ps1"
```

Anonymous page:

```bash
"$REALBROWSER" tab ensure https://example.com --anonymous --session check --label page --background
"$REALBROWSER" read observe -t page --anonymous --session check
```

Visible Chrome Incognito page:

```bash
"$REALBROWSER" tab ensure https://example.com --anonymous --session private --label page --front --incognito
"$REALBROWSER" read observe -t page --anonymous --session private
```

`--anonymous` means isolated temporary browser state, not network anonymity and
not Chrome's visible Incognito UI. Add `--incognito` or `--private` when the user
explicitly wants a visible Chrome Incognito window. Incognito/private mode is
only for anonymous managed sessions, not signed-in profiles.

Signed-in profile or existing Chrome:

```bash
"$REALBROWSER" profile list --active
"$REALBROWSER" tab list "ninzap.dev" --profile chrome:Default
# Creation stays background-safe; if profile app launch is required, the CLI
# asks for explicit --best-effort-background or --front.
"$REALBROWSER" tab ensure https://example.com --profile chrome:Default --label app --background
"$REALBROWSER" read observe -t app --profile chrome:Default
```

Do not run top-level `open`, `goto`, or selected-tab workflows. In
`realbrowser`, creation is `tab ensure` or `tab new`, navigation is
`tab navigate <target> <url>`, and reads/actions require a target.

Profile listing shows the CDP scope. `profile` means the endpoint is scoped to
that profile. `browser` means CDP can inspect existing browser tabs, but new
tabs for a named profile cannot be proven safe by CDP alone. Direct WebSocket
endpoints from `DevToolsActivePort` are the primary attach path; HTTP
`/json/version` discovery is only a fallback. `--background` uses only
background-safe CDP/browser paths. If profile app launch is required, the CLI
fails with a recovery hint unless `--best-effort-background` or `--front` is
explicit. `--best-effort-background` restores the previously active macOS app
after launch; `--front` is the only normal path that intentionally leaves Chrome
frontmost. Stale `DevToolsActivePort` files are ignored.

For repeated work, set a default context without dropping target safety:

```bash
"$REALBROWSER" session use profile:chrome:Default
"$REALBROWSER" tab list ninzap.dev
"$REALBROWSER" session clear
```

Default contexts, labels, and element refs are owner-scoped. When multiple
sessions are open, set a stable owner for the project/session if the environment
does not already provide one:

```bash
export REALBROWSER_OWNER=my-project
"$REALBROWSER" session use profile:chrome:Default
"$REALBROWSER" tab ensure http://localhost:3000 --profile chrome:Default --label app --background
```

Mutating commands claim a target lease. If another owner has leased the target,
do not navigate, click, close, focus, reload, clear buffers, change state, or
download from it unless the user explicitly wants that session to take over. Full
or responsive/device screenshots also require the lease because they temporarily
scroll or emulate the viewport. Annotated screenshots/checkpoints require the
lease because they temporarily draw page overlays. Use `--take-lease` for
intentional handoff.
Read-only commands can still inspect the target after it is explicitly selected.

## Operating Loop

1. Classify scope: existing tab, signed-in profile, anonymous page, screenshot,
   console/network debug, repeated-content read, or form/action workflow.
2. For current UI, logged-in state, console logs, inboxes, social sites, or
   "already open" wording, inspect tabs before creating: `profile list --active`
   then `tab list <query> --profile <profile>`.
3. Acquire one stable target: `tab select --label` for an existing tab or
   `tab ensure --label` only when no usable tab exists.
   If `tab list --profile` warns that CDP is browser-scoped, its targets are
   diagnostic only unless they were created by `realbrowser` through that
   profile. Do not select or navigate a related tab from that list to satisfy a
   named-profile open. If no proven matching tab exists, create a new tab through
   the named profile with `tab ensure <url> --profile <profile> --label <label>
   --best-effort-background` or ask for explicit `--front`.
4. If multiple tabs match, do not guess. Disambiguate by URL/title/visible page
   state before reading console, network, forms, or content.
5. Verify small state first: `read observe -t <label>` or
   `read size -t <label>`.
6. **One tree, many diffs.** Run `read tree -t <label> -i -c` ONCE per page
   state to capture the full interactive surface with refs (`b1`, `l1`, `e1`).
   After each action, run `read tree -t <label> -i -c -D` for a small delta
   (typically 2-10 lines). Do not follow `read tree` with `read snapshot`,
   `read query`, or `screenshot full` to find elements — the tree already has
   them. Do not re-read the full tree after a small action — use `--diff`.
   See "Efficiency Rules → Read cost" for token math.
   `read query` is only for a CSS selector you have already seen verbatim,
   accepts CSS only (no `:has-text()` / `:text()` Playwright syntax — use
   `--text-filter '<text>'` instead). Use `read items`/`read item` for feeds
   or repeated rows. Use `read text --out FILE` + file search for bulk text
   extraction (free of model tokens). Use `wait ready --visual-stable`
   instead of `sleep N && screenshot capture` for readiness checks.
7. For forms/uploads/submits, run `action state -t <label> --root active`, adding
   `--screenshot --annotate-refs` only when visual state can prevent a wrong
   click (modal boundaries, covered buttons, file previews, canvas/media). Do
   not screenshot on every action — `read tree --diff` is the default verify
   step and costs far fewer tokens. Checkpoint screenshots are bounded to the
   visible viewport/root; use `screenshot area` or `screenshot full` only when
   you explicitly need a tall artifact. If you request an annotated screenshot
   for action safety, inspect that image before the next mutating action. Act on
   refs inside that root, and submit once with
   `action submit --text <exact label>` or `action submit <button-ref>`.
8. After each action, verify with `read tree -i -c --diff` (preferred, 2-token
   delta), `wait ready --visual-stable`, a scoped read, or URL/state change.
   Reserve screenshot verification for visual-only state (image previews, layout
   shifts, canvas rendering). Do not screenshot after every click.
9. **Ephemeral UI (dropdowns, tooltips, autocomplete, modals):** When a click
   opens ephemeral UI, immediately `read tree -i -c` again to get fresh refs for
   the newly visible elements. Old refs from before the click are stale and will
   fail with "selector not found" or "not visible/topmost". Never retry a failed
   click/fill with the same stale ref — always re-read first.
10. **"No visible enabled topmost click candidate" / "covered-by:..." errors:**
    The element exists but failed safety checks (hidden, covered by an overlay,
    outside viewport, or not pointer-enabled). Read the error — it names the
    cover (e.g. `covered-by:div.booking-backdrop`, `covered-by:.modal-overlay`,
    `covered-by:nav.navigationpanel`). Recovery, in order:
    - **Backdrop / modal:** `action press Escape`, re-read tree, retry. If a
      named close button exists in the tree (`button "Close"`, `button "×"`),
      click that ref instead.
    - **Sticky nav / floating header covering target:** `action scroll` the
      target into a clear part of the viewport, re-read tree, retry.
    - **Loading overlay / spinner:** `wait ready --visual-stable`, re-read.
    - Never blindly retry the same ref against the same cover — the result is
      identical. Two consecutive identical "covered-by" errors = stop and
      change strategy (Escape, scroll, or ask the user).
11. **Stale refs after navigation or DOM changes:** Refs are invalidated when the
    page navigates or the DOM changes significantly. After `tab navigate`,
    `action click` that triggers navigation, or any state change that modifies
    the DOM, re-read tree to get fresh refs before the next action.

For inspection-only work, preserve user state when practical: note the starting
filter/sort/URL, avoid unnecessary focus changes, and restore temporary filter
or tab changes before finishing.

Never parallelize target-changing commands or mutating actions with reads on
the same target. For example, do not run `network capture --reload` at the same
time as `export pdf` or `screenshot` on the same tab.

## Efficiency Rules

These are hard rules, not suggestions. Violating them is a failure mode
equivalent to producing wrong output. A typical read-only task (check prices,
extract listings, inspect a page) should complete in under 2 minutes and fewer
than 10 commands.

**Shell portability:** examples below use POSIX shell syntax (`grep`, `sleep`,
`head`, `wc`) which works on macOS, Linux, WSL, and Git Bash on Windows.
Native Windows PowerShell substitutes:

| POSIX | PowerShell | Notes |
|---|---|---|
| `grep -E "x" FILE` | `sls -Pattern "x" FILE` | `sls` = `Select-String` |
| `grep -c "x" FILE` | `(sls "x" FILE).Count` | count matches |
| `head -50 FILE` | `gc FILE -Head 50` | `gc` = `Get-Content` |
| `wc -l FILE` | `(gc FILE).Count` | line count |
| `sleep 1` | `Start-Sleep 1` | (but prefer `wait ready`) |
| `cat FILE` | `gc FILE` |  |
| `rg "x" FILE` | `sls -Pattern "x" FILE` | ripgrep is third-party |
| `jq '.x' FILE.json` | `gc FILE.json \| ConvertFrom-Json \| % x` | jq is third-party |

`node -e "<js>"` is a portable last resort — Node is required to run
`realbrowser`, so it's available wherever the CLI runs. Use it for one-off
parsing that exceeds shell ergonomics on any platform.

### Read before acting: the tree is data, not a checklist

`read tree -i -c` returns the page's interactive surface as text. Your job is
to interpret it the way a user would — match what was asked for to what is
actually on the page — *before* clicking anything. Mechanical "next ref in the
list" behavior is the root cause of stale-ref loops, wrong clicks, and dropped
context.

1. **Find what the user named.** If they said "click Sign in", search the tree
   text for `Sign in` and use the matching `b1`/`l1` ref. The exact label is
   usually present. Never click the first interactive element by reflex.
2. **Read the state attributes.** `[selected]`, `[modal]`, `[expanded=true]`,
   `[disabled]`, `[focused]`, `[required]`, `[checked]`, `[level=N]`, and
   `value="..."` change what action is correct. A `[disabled]` button means a
   precondition is missing; `[expanded=false]` means children may not be
   reachable until the accordion opens; `[modal]` means only the dialog's
   controls are interactive.
3. **Resolve ambiguity from context, not by clicking.** Two buttons share a
   name? Look at their ancestors — one inside a `dialog`, one inside `main`.
   Still unsure? Ask the user. Do not click options to see which is right.
4. **Recognize blocking state.** Modal/`alertdialog` covers the page; its
   controls are the only valid targets. `aria-busy`, spinner roles, or a tree
   with zero interactives mean the page is mid-load — `wait ready
   --visual-stable` before the next action. Auth wall pages have a single
   sign-in form and no app surface.
5. **Plan the whole flow from one tree.** A booking page shows origin,
   destination, dates, passengers, search button — all in one read. Plan all
   the fills, then act. Don't discover inputs one click at a time.
6. **When an action fails, re-read first; don't retry.** "Not topmost",
   "covered", "ref stale" almost always mean the page changed since the tree
   was captured (a dropdown opened, an overlay appeared, the route swapped).
   `read tree -i -c -D` shows what's different. Retrying the same ref against
   the same stale picture loops forever.

The ARIA tree output is structured, named text. It contains the answer to
"what should I click" in almost every case — the failure mode is not having
too little data, it is not reading what's there.

**ABSOLUTE RULE:** Never guess CSS selectors. If you have not seen the exact
selector string in a prior command's output, the codebase, or the `forms`
command, you MUST use refs instead. There are no exceptions.

**Stay on the user's site.** If the user named a specific site (or implied one
through "my Gmail", "the booking page I had open", "VNAirlines"), do not
substitute a different site or service when you hit friction. The user picked
that site for a reason — they have an account there, the data lives there, the
booking belongs there. If the page proves unworkable after the failure budget,
report the specific blocker back to the user with the page state you observed.
Let them decide whether to retry, switch sites, or give up. Do not make that
choice on their behalf.

**Refs live in memory, scoped to the most recent tree read.** Each `read tree`
on a target replaces the ref store for that target — old refs become stale.
Refs that appear in a tree-file written with `--out` are only usable until the
next `read tree` on that target. If you read a `--out` file and then run any
other tree read, the refs in the file are stale. Recovery for "ref stale or
unknown": run `read tree -t <target> -i -c` again (without `--out`) and use
refs from that output directly.

### If it's on disk, search the file — don't ask the browser again

Once any reader has written page content to disk via `--out`, the next search
MUST be on the file using whatever search tool your shell provides, never
another browser round-trip. This rule is universal — flights, products,
articles, dashboards, social feeds, internal apps — any reader that produces
a file:

| Captured to disk | Search with (POSIX / PowerShell) | Don't run |
|---|---|---|
| `read tree --out FILE` | `grep -nE 'pat' FILE` / `sls -Pattern 'pat' FILE` | `read query --text-filter '...'` |
| `read text --out FILE` | `grep -n 'pat' FILE` / `sls 'pat' FILE` | another `read text` |
| `read html --out FILE` | `grep 'pat' FILE` / `sls 'pat' FILE` | another `read html` |
| `read items --out FILE` | `grep -n 'pat' FILE` / `sls 'pat' FILE` | another `read items` |
| any `--json --out FILE` | `node -e "JSON.parse(require('fs').readFileSync('FILE')).filter(...)"` | another reader |

**Why:** `read query --text-filter` is a CDP round-trip that re-evaluates the
page (~1-3 sec) and may return nothing if the label is in a different element
type than you guessed. The text was already captured to a file; labels are
exact strings; a local search finishes in milliseconds.

**Banned anti-pattern:** capture a tree/text to disk, then run 3+
`read query --text-filter` calls hunting for a label that is already in the
file. The first failed `read query` on captured content means the next step
is a file search, not another `read query` with a different selector.

`rg` (ripgrep), `jq`, `pup`, `htmlq` are convenient but not universally
installed — fall back to `grep`/`sls`/`node -e` rather than asking the user
to install tools.

### Don't sleep — wait for the page

`sleep N` is dead time. The page may settle in 200ms or take 8 seconds —
either way, a fixed sleep is wrong. Use one of:

- `wait ready --visual-stable` — page network + DOM stable (default verify)
- `wait selector <css>` — wait for a specific known element to appear
- `wait text "<exact text>"` — wait for known text to appear in DOM
- `wait url --contains <fragment>` — wait for navigation

Chained `sleep 1` between commands is the worst pattern: it adds seconds of
waste per task and still misses pages that need longer than 1s. The only
acceptable `sleep` is bracketing a non-deterministic visual animation (rare).

### Vision is for visual state, never for content

Screenshots are for visual-only decisions: did the modal open, is the
spinner gone, does the chart render, is layout broken. Reading **text**
(prices, dates, labels, addresses, names, anything copy-pasteable) from
screenshots is banned — vision tokens are 5-20× more expensive per byte
and misread small text. Cycling `screenshot → Read → screenshot → Read` to
read content where `read text --out` would work is the worst-cost path
available, and the model often misreads digits anyway.

**Rule:**
- Task asks to extract or check named information → `read tree`/`read text`/
  `read items` to a file, then `grep`.
- Task asks to confirm a visual state (modal opened, image rendered,
  layout correct) → one `screenshot capture`. Stop after one.

### Pick the reader for the task

Match the task to the right first reader. This applies to any site — SPAs,
static pages, dashboards, e-commerce, news, docs, social, internal apps:

| Task | First reader | Then |
|---|---|---|
| Interact (click, fill, submit, navigate) | `read tree -i -c` | `read tree -i -c -D` after each action |
| Bulk text content (article, docs, FAQ, terms) | `read text --out FILE` + file search | none — file is searchable |
| Repeated rows (feed, table, search results, listings) | `read items` or `read tree -i -c` | `read item --index N` for one row |
| Visual check (layout, image, canvas, color) | `screenshot capture` | none — pixels are the answer |
| "What page am I on?" / load check | `read observe` | proceed to task-specific reader |
| Console errors / network requests | `console list` / `network list` | scoped reader if needed |

### The canonical read pattern (interaction): one tree, many diffs

For any interaction task — clicking, filling, submitting, navigating UI:

```bash
# Once per page state — captures the full interactive surface with refs
"$REALBROWSER" read tree -t app -i -c

# After every action — returns only what changed (typically 2–10 lines)
"$REALBROWSER" read tree -t app -i -c -D
```

A "page state" is a tab whose visible interactive surface has not changed
materially since the last full tree read. Re-read the full tree (drop `-D`) on:
- New page load (`tab navigate`, top-level navigation, full reload)
- Major layout swap (route change in an SPA, switching to a different view/tab)
- Modal or full-screen overlay opens or closes

For minor changes inside the same view (a dropdown opens, a value fills, a
button enables), use `-D` — never the full tree.

`read tree -i -c` IS the "one big read" that some agents reach for full HTML or
full screenshot to get. It returns the entire interactive surface (buttons,
links, inputs, tabs, dropdowns) in compact ARIA form with refs (`b1`, `l1`, `e1`)
ready for `action click/fill/type/submit`. There is nothing to find with HTML or
vision that this read does not already give you with refs attached.

### When the tree is not enough

Rare cases where `read tree -i -c` alone is insufficient:

- Element has no ARIA role/name and is not in the interactive set —
  `read tree -c` (drop `-i`) or `read snapshot --selector <css>` for DOM.
- You need text content from non-interactive nodes (article body, table cells)
  and the tree's labels do not include it — `read text --out FILE` + file search.
- You need raw HTML structure (data attributes, custom elements, source view)
  — `read html --out FILE` for offline grep.
- You need to extract many similar rows from a feed/list with consistent
  structure — `read items` returns each row as a structured entry.

### Read cost (input tokens, typical web page)

| Reader | Tokens | Refs? | Use when |
|---|---|---|---|
| `read tree -i -c` | 300–2,000 | yes | **Default for interaction** |
| `read tree -i -c -D` | 0–200 | yes (delta) | **Verify after action** |
| `read tree -i -c --selector main` | 100–500 | yes | Scope to a landmark |
| `read text --out FILE` then `grep`/`sls` | ~0 (file) | no | Bulk text extraction |
| `read items / read item` | 200–2,000 | yes | Feeds, lists, repeated rows |
| `read query <css>` | 50–500 | yes | One known CSS selector |
| `read snapshot --selector <css>` | 5,000–50,000 | yes | Tree inadequate (rare) |
| `read html --out FILE` | ~0 (file) | no | Offline HTML grep only |
| `screenshot capture` | ~600 image tokens | no | Visual state decision |
| `screenshot full` then vision | 2,000–4,000 image tokens | no | **Never for parsing** |

### Wrong choices that look like shortcuts

These all feel like "one big read" but cost dramatically more than `read tree`:

- **Full HTML to find elements.** Modern web apps routinely ship 100k–1M
  tokens of HTML (inline scripts, styles, lazy data, hidden states). Even
  after parsing, you still need refs to click — `read tree` already returns
  them. `read html` is for offline grep on a downloaded file, never for
  interaction planning.

- **Full screenshot + vision to read content.** Vision tokens are 5–20× more
  expensive per byte than text and misread small text (form labels, dates,
  dropdown options). You cannot `action click` a screenshot — Chrome needs a
  DOM ref. `read tree` returns refs and labels at a fraction of the cost.

- **`read query` to find elements `read tree` already showed.** `read tree -i -c`
  returns every interactive element with role, name, state, and ref. Use
  `read query` only for a CSS selector you have already seen verbatim.

- **Multiple readers on the same page state.** One `read tree` is the snapshot.
  Following it with `read snapshot`, `read query`, or `read items` on the same
  unchanged page is duplication. Act, then `read tree -D` for the delta.

- **Re-reading the full tree after a small action.** Use `--diff`. A click that
  opens a dropdown adds 5 lines; a full re-read pays for the whole tree again.

### Command-count checkpoint

At command 5, ask: "Am I making real progress or stuck in a guess-and-retry
loop?" If more than 1 command did not advance toward the goal, you are in a
loop. Re-read the page with `read tree -i -c` and use refs.

At command 10, if the task is not nearly complete, you have taken a wrong
approach. Do not continue — reassess fundamentally.

### Set default context first

When working with a profile, set it once before any other command:

```bash
"$REALBROWSER" session use profile:chrome:Default
"$REALBROWSER" tab ensure https://example.com --label app --background
# all subsequent commands: just -t app, no --profile flag
```

### Refs first, CSS only when known

After `read tree -i -c`, you have refs (`b1`, `l1`, `e1`) for every interactive
element. Use them for all interactions:

```bash
# CORRECT — use refs from the most recent tree read
"$REALBROWSER" action click -t app b3
"$REALBROWSER" action fill -t app e2 "value"
"$REALBROWSER" action type -t app e1 "search text"

# WRONG — guessing CSS selectors to find elements
"$REALBROWSER" read query -t app '[class*="dropdown"] li'
"$REALBROWSER" read snapshot -t app --selector '[class*="result"]'
"$REALBROWSER" read query -t app 'div[role="option"]' --text-filter 'item'
```

**CSS selectors are allowed** in these specific cases:
- `read tree -i -c --selector main` — scoping a tree read to a known landmark
- `read query` with a known selector from `read observe` or page source
- `action scroll --selector '[data-scroll-root]'` — scrolling a known container
- `wait selector` — waiting for a known element to appear

**You MUST NOT use CSS selectors for:**
- Guessing class names (`[class*="..."]`) — even if you saw a similar class
- Iterating through selectors until one matches
- Any interaction that has a ref alternative
- Reading/querying elements to derive new CSS selectors from screenshots

A selector is "known" ONLY if:
- It appeared **verbatim** in a prior command's output
- It is from the application's source code that you have read
- It is a standard landmark (`main`, `nav`, `[role="dialog"]`)

A selector is a "guess" if:
- You are using `[class*="..."]` substring matching on a class you inferred
- You modified a seen selector (saw `.results-list`, trying `.results-item`)
- You are using common patterns from other websites

**The test:** before writing ANY CSS selector, answer: "Where exactly did I see
this selector?" If you cannot point to a specific prior command output line,
it is a guess. Do not use it. Run `read tree -i -c` and use refs instead.

### Banned pattern: iterative selector hunting

This is the single most common efficiency failure and is explicitly banned:

```bash
# BANNED — this sequence is never acceptable
"$REALBROWSER" read query -t app '[class*="dropdown"] li'      # nothing
"$REALBROWSER" read snapshot --selector '[class*="select"]'    # nothing
"$REALBROWSER" read query -t app '[role="listbox"]'            # nothing
"$REALBROWSER" read query -t app '[class*="option"]'           # nothing
# 4 wasted commands. Run read tree -i -c and use refs.
```

Each guess feels like "trying something new." It is not — it is the same failed
strategy repeated. After the FIRST failed or empty CSS result, switch to refs.
Do not use screenshots to derive CSS selectors either.

### Plan before clicking

Before the first interaction, spend one `read tree -i -c` to map the page:
what controls exist, what needs filling, what the multi-step flow looks like.
Do not discover the page structure one click at a time.

### Data extraction: one read, never scroll+screenshot in a loop

When the goal is extracting structured data (prices, flight schedules, search
results, product listings, tables) — the data lives below the fold and on
some sites loads lazily as you scroll:

- One `read tree -i -c` captures **all** interactive elements regardless of
  fold position — labels, values, refs, everything. CDP reads the full DOM,
  not just the rendered viewport.
- One `read text --selector main --out tmp/data.txt` captures all text in
  one shot, free of model tokens — `grep`/`sls` it for prices, times, names.
- Use `--out` for pages with 50+ elements to avoid flooding context.
- **Never** scroll + screenshot in a loop to read data. If a tree/text read
  returned it, use it. Screenshots are 5-20× more expensive per byte and
  misread small digits.

```bash
# BAD: 13 commands, ~10 minutes — scroll-and-screenshot loop
screenshot capture → scroll → screenshot → scroll → screenshot → ...

# GOOD: 2 commands, ~3 seconds — one bulk text capture, then local search
"$REALBROWSER" read text -t app --selector main --out tmp/results.txt
grep -E "from|VN [0-9]|[0-9]{2}:[0-9]{2}" tmp/results.txt   # POSIX
sls -Pattern "from|VN \d|\d{2}:\d{2}" tmp/results.txt       # PowerShell
```

### Lazy-loaded content (infinite scroll, virtualized lists)

A small subset of sites only render rows into the DOM as you scroll past
them (virtualized lists, infinite-scroll feeds). For these, `read tree` /
`read text` only see the rendered subset. Symptoms: tree shows 5 results
when the page advertises 30; `read text` text contains "Showing 1-5 of 30".

When you confirm virtualization (not just below-the-fold-but-rendered):
- Issue 2-3 progressively-deeper scrolls (`action scroll down 2000`),
  re-reading text or tree once after the last scroll — not after each.
- Or, if the URL supports a `?page=N` / `?limit=100` query, prefer
  `tab navigate` to a deeper page over scroll.
- Cap at 3 scrolls. If results still incomplete, report what you have —
  do not loop indefinitely.

Most sites are NOT virtualized. Try one tree read first; if it shows the
expected number of items, scrolling is unnecessary.

### Visual verification: one full screenshot, never a viewport loop

Screenshots are for visual decisions (modal opened, image rendered, layout
correct, error toast visible). When a visual decision needs the **whole long
page** (a results page, a long form, a confirmation receipt that scrolls
beyond the viewport):

- **Right tool:** `screenshot full` — one call, captures the entire scrollable
  page in a single image (~2-4k image tokens).
- **Wrong tool:** `screenshot capture` + `action scroll` + `screenshot
  capture` + ... — N viewport shots cost N× ~600 tokens (often more than
  one full shot) plus N× round-trip latency, and gives a fragmented view.

`screenshot full` is the right answer when you need ONE picture of a long
page. It is the wrong answer for reading text or prices off the page —
that's `read text --out FILE` + grep, every time.

| Goal | Tool |
|---|---|
| "What does the whole results page look like?" | `screenshot full` (one shot) |
| "Did the modal open?" / "Is the spinner gone?" | `screenshot capture` (viewport) |
| "What flights are listed?" | `read text --selector main --out` + grep |
| "What buttons exist on the long form?" | `read tree -i -c --out` + grep |

### Dropdowns, pickers, and autocomplete: type-first

When a click opens a dropdown/picker/autocomplete with a search input:

1. **Immediately:** `action type -t <label> "search text"` — type into the
   already-focused input without targeting a ref. The dropdown search input is
   usually auto-focused after the trigger click.
2. **If no input is focused:** `read tree -i -c` for fresh refs, then
   `action type -t <label> <fresh-ref> "text"`.
3. **If typing does not filter:** `action press Escape`, re-read tree, try a
   different UI path (direct navigation, clicking a different control).

Do **not**: cycle through `read query` or `read snapshot` with increasingly
exotic CSS selectors hoping to find a clickable element inside a tooltip/popover.
Tooltip children are frequently "not topmost" because an overlay covers them.
Typing into the search input bypasses this entirely.

### Verify with `--diff`, not screenshots

After each action:

```bash
"$REALBROWSER" read tree -t app -i -c --diff
```

This returns only what changed — typically 2-5 lines (~50 tokens). Each
screenshot capture costs ~600 image tokens — 12× more — and the model still
has to interpret pixels. Use `--diff` as the default verify step.

Screenshot verification is for **visual-only state** (modal opened, spinner
gone, image rendered, layout shift, canvas/chart drew correctly) — things a
text tree cannot represent. **Anti-pattern:** taking a `screenshot capture`
after every click "to confirm it worked" — `read tree --diff` already tells
you whether the click changed the DOM, in 5% of the tokens.

### After-submit waits: one wait, never sleep + wait + sleep + sleep

Submitting a search, login, or navigation that triggers a network round-trip:

```bash
# RIGHT — one wait, returns as soon as the page settles
"$REALBROWSER" action click <submit-ref>
"$REALBROWSER" wait ready -t app --visual-stable --timeout 30000
"$REALBROWSER" read tree -t app -i -c --diff      # verify the new state
```

```bash
# WRONG — stacked sleeps + wait + more sleeps; agent waits 25-60 sec for a
# page that probably settled in 3 sec
"$REALBROWSER" action click <submit-ref>
sleep 8
"$REALBROWSER" wait ready -t app --visual-stable --timeout 30000
sleep 15                  # ← this never helps; wait already returned
"$REALBROWSER" tab focus -t app --front      # ← undoes background mode
```

`wait ready --visual-stable` already waits for network + DOM stability up to
its timeout. Adding `sleep` before or after it is dead time. Do not chain
`tab focus --front` to "make the page work" — the page works in the
background; visual focus is a user-experience concern, not a correctness
concern.

### Failure budget

| Failure type | Max attempts | Then |
|---|---|---|
| Ref stale/covered/not topmost | 1 | Re-read tree for fresh refs |
| Dropdown item not clickable | 1 | Type into search input instead |
| CSS selector guess (not from prior output) | 0 | Use refs — never guess selectors |
| CSS selector from prior output, not found | 1 | Fall back to `read tree -i -c` + refs |
| URL navigation 404 | 1 | Go back, use the UI path |
| Any single interaction | 3 total | Stop. Switch strategy entirely. |

Three failed commands on the same interaction = wrong approach. Do not continue
guessing. Escalate in this order — all within the user's specified site:

1. `read tree -t <target> -i -c` — fresh view of the full page state, refs reset
2. `action press Escape` then re-read tree — close any blocking overlay/modal
3. `action scroll` to bring the target into view, then re-read tree
4. Keyboard navigation: `action press Tab`, then `action press Enter`
5. A different UI path to the same goal **on the same site** (e.g., from the
   homepage menu instead of a homepage hero button)
6. `network list --filter "/api/"` — check if the data is available via XHR
   you can read without further interaction
7. Direct URL navigation **on the same site** if the site supports deep links

If all seven fail, stop and report the blocker to the user. Do not silently
switch to a different site or service.

### Multi-page flows: capture then advance

For multi-step flows (booking, checkout, wizards):

1. Capture each page's data with one `read tree -i -c` before advancing.
2. Advance by clicking the correct ref from the tree data.
3. Verify page transition with `read tree --diff` or `read observe`, not a
   full screenshot.
4. If advancing requires selecting an option you don't care about (e.g.,
   choosing a fare class just to see the next page), pick the first available
   option by ref and move on.

### Never truncate tree output

`read tree` returns the full interactive element set. Truncating it discards
elements you need — applies equally to POSIX (`| head -60`, `| tail -30`)
and PowerShell (`| Select-Object -First 60`, `gc -Head 60`). If the output
is too large for context, write it with `--out tmp/tree.txt` and read the
file, or scope the read at the source with `--selector <css>` /
`--depth N` / `--limit N`. Never truncate tree output downstream.

## No Repeated Allow Prompts

`profile list --active` is passive: it reads `DevToolsActivePort` and checks the
loopback port, but it must not open a CDP WebSocket or trigger Chrome's Allow
debugging prompt. The first real CDP attach belongs to the selected
target/context daemon.

`realbrowser` should reuse the existing `DevToolsActivePort` direct WebSocket
and its per-browser-endpoint daemon instead of starting extra browser controllers. This
matches the `chrome-cdp`/`realbrowser` attach model: if Chrome shows an Allow
debugging prompt, wait for the existing starting daemon rather than spawning
another controller. Use `daemon monitor --json` to check target count, sessions,
and buffer sizes before retrying.

Chrome owns the real signed-in-profile approval boundary. The skill can make the
approval one-per-browser-endpoint while the browser/daemon survives, but it
cannot guarantee a one-time approval forever after Chrome or the computer
restarts. For low-approval clean-state work, prefer anonymous managed sessions;
for logged-in state, attach to the real profile and reuse the same daemon.

Do not probe several profiles in parallel when they report the same
browser-scoped WebSocket. Pick the intended profile first, then run one
target-acquisition command. After a labeled target is created, later `-t
<label>` commands can infer that label's context; still passing `--profile` is
fine, but falling back to a separate endpoint controller is not.

If `profile list --active` returns no DevTools profiles but `profile list` shows
the target Chrome user data is running, first check whether Chrome is showing a
debugging approval prompt and retry the same target after approval. If there is
still no direct WebSocket endpoint, `--best-effort-background` cannot attach to
that existing non-debuggable browser.

Relaunch is the last-resort recovery, not the default. For signed-in tasks, do
not end by asking the user to quit Chrome manually; ask for explicit approval to
quit/relaunch the target browser, then continue the original task:

```bash
"$REALBROWSER" profile relaunch chrome:Default --confirm
"$REALBROWSER" tab ensure https://example.com --profile chrome:Default --label app --background
```

Do not use `--front` unless the user explicitly wants visual handoff or hidden
interaction is impossible. Use `--best-effort-background` only when profile app
launch is needed; it still records provenance and tries to return focus to the
previous app.

## Common Workflows

Read one item from a huge feed without dumping HTML:

```bash
"$REALBROWSER" read size -t group --json
"$REALBROWSER" read items -t group --collection auto --direct-children --limit 8 --max-text-chars 700 --json
"$REALBROWSER" read item -t group --collection auto --direct-children --index 4 --max-text-chars 4000
"$REALBROWSER" read snapshot -t group --selector '<small-container>' --urls --cursor-interactive
```

Copy console logs from one exact tab:

```bash
"$REALBROWSER" tab select "ninzap.dev" --profile chrome:Default --label ninzap
"$REALBROWSER" console list -t ninzap --errors --limit 80
"$REALBROWSER" console capture -t ninzap --reload --duration 3000 --out tmp/console.json
```

For "copy console output" tasks, paste DevTools-style console lines verbatim
from the exact selected tab. Do not summarize, mix multiple matching tabs, or
return empty output without checking whether capture needs to be armed before a
reload.

Capture network requests and a response body:

```bash
"$REALBROWSER" network capture -t app --reload --duration 5000 --out tmp/app-network.json
"$REALBROWSER" network capture -t app --include-body --out tmp/app-network-with-bodies.json
"$REALBROWSER" network list -t app --filter "/api/" --json
"$REALBROWSER" network body -t app req_12 --response --out tmp/req_12-response.json --full
```

Scroll and navigate large pages:

```bash
"$REALBROWSER" action scroll -t app down 500
"$REALBROWSER" action scroll -t app up 300
"$REALBROWSER" action scroll -t app --selector '[data-scroll-root]' down 800
"$REALBROWSER" action scroll -t app e1 down 400
```

`action scroll` scrolls the window or a specific element by pixel amount.
Directions: `up`, `down`, `left`, `right`. Default: `down 500`. Use
`--selector` or a ref to scroll a specific container instead of the window.

Upload and submit:

```bash
"$REALBROWSER" action state -t app --root active --compact --screenshot --annotate-refs
"$REALBROWSER" action fill -t app e1 "caption text"
"$REALBROWSER" action type -t app e1 "additional text"
"$REALBROWSER" action press -t app Escape
"$REALBROWSER" action upload -t app --root active --input-ref e2 ~/Downloads/media.png
"$REALBROWSER" action upload -t app --root active --trigger-ref b7 ~/Downloads/media.png
"$REALBROWSER" wait ready -t app --visual-stable --screenshot --out tmp/upload-ready.png
"$REALBROWSER" action submit -t app --root active --text "Submit"
```

`action fill` replaces an input/editor value. `action type <ref> <text>` first
focuses the ref, then sends native CDP text input; use it when a rich editor does
not accept synthetic value replacement. `action submit --text` requires an exact
accessible label from the current active root, such as `Submit`, `Save`, `Send`,
`Post`, or the localized label actually shown by the app. Do not hardcode those
labels in reusable flows; enumerate with `action state` and submit by ref when
labels are ambiguous. If the root is wrong or a media picker/dialog is active,
use `action press -t <label> Escape`, re-run `action state`, then continue.

For uploads, do not use standalone `action click` on visible media, attachment,
or file-picker controls; that can open the OS file picker and block the user.
Prefer `action upload --input-ref <file-input-ref> <file>`. When the app only
creates the file input after a visible picker control is clicked, use
`action upload --trigger-ref <picker-control-ref> <file>` so `realbrowser` arms
and intercepts the file chooser before clicking. Plain `action click` also uses
a short CDP file-chooser guard and reports `file_dialog_would_open` if the click
would open a native picker.

Screenshots are visual checkpoints, not page parsers. Use `action state
--screenshot --annotate-refs` for modals, editors, upload previews, covered
buttons, disabled controls, canvas/media, and ambiguous active roots. When you
request annotated refs, open/read the screenshot before relying on those refs for
the next click/upload/submit. Skip screenshots for simple text/query/console/
network reads unless visual state is the actual evidence. Checkpoint screenshots
capture the visible viewport/root, not the full scroll height of a feed or page.
Annotations mark the active root boundary plus visible refs, report skipped
refs at `screenshot.annotation`, and can be bounded with `--max-labels <n>`.
Default screenshot artifacts are normalized for agent use, matching OpenClaw's
shape without adding image dependencies: JPEG quality 85, max side 2000px, max
bytes 5mb, with a browser-canvas fallback when CDP's JPEG output is still too
large. Use `--raw-size`, `--format png`, or an explicit `.png` path when exact
browser pixels are required.

Use `screenshot capture`, `screenshot area`, or `wait ready --screenshot` on
signed-in/current profile tabs. `screenshot device` temporarily applies CDP
viewport emulation; use it for responsive viewport evidence on anonymous or
disposable tabs, or only on a live profile tab when the user explicitly asks for
that target's responsive viewport output. Do not use `screenshot device` as a
routine progress checkpoint while composing, posting, uploading, or reading a
live signed-in tab. Use `screenshot area` or `screenshot full` when the large
artifact itself is the requested output. Device screenshots use DPR 1 by
default so `mobile:390x844` writes a `390x844` PNG, not a physical 2x Retina
image. `screenshot full` first tries document full-page capture; when the
document is fixed-height but a dominant visible scroll container exists, it
stitches that container and preserves visible header/footer UI outside it, so
app-shell pages do not produce a false one-viewport "full" artifact or drop a
bottom composer. Pass `--selector <scroll-container>` when you already know the
specific panel/list to stitch and want only that panel.

Screenshots and PDF:

```bash
"$REALBROWSER" screenshot capture -t app --selector '[role=dialog]' tmp/dialog.png --annotate-refs
"$REALBROWSER" screenshot capture -t app tmp/app.jpg --max-side 1600 --max-bytes 2mb
"$REALBROWSER" screenshot full -t app --selector '[data-scroll-root]' tmp/panel-full.png
"$REALBROWSER" screenshot device -t page --anonymous --session responsive --devices desktop:1440x900,tablet:768x1024,mobile:390x844 --visual-stable --settle-ms 300 tmp/page
"$REALBROWSER" export pdf -t app tmp/app.pdf --print-background
```

## References

Open these only when the task needs detail:

- `references/commands.md`: command tree, output, errors, and JSON contract.
- `references/workflows.md`: profile, anonymous, feed, action, upload, network,
  screenshot, download, and PDF workflows.
- `references/design-notes.md`: what was copied from chrome-cdp, gstack, and
  OpenClaw and the long-term daemon/API model.

## Safety Rules

- `--background` means safe CDP/background creation. Use `--front` only for
  explicit handoff or when hidden/unfocused interaction is impossible.
- Signed-in profile mutation requires a proven target label or handle.
- Browser-scoped CDP is not treated as proof of existing-tab profile ownership.
  Prefer labels/handles and verify URL/title before actions.
- Uploads and final actions stay inside the active root. Do not use global
  selectors for file upload or submit.
- Screenshots are target-bound visual evidence. Use them early when visual state
  affects action safety, but do not replace scoped DOM/query readers with
  screenshot parsing on huge pages.
- Final actions enumerate button-like candidates inside the active root. Label
  submits are exact-match by default; prefer a button ref when several controls
  contain similar words. Click once, then verify passively.
- Cookies/storage/headers are redacted unless `--values` is explicit.
- Large HTML, network bodies, HAR, console dumps, traces, screenshots, PDFs,
  and downloads should go to `--out` or artifact paths, not stdout.

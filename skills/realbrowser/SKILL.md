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

**Read the full SKILL.md once before the first browser action.** Read it end
to end (no `head`/`tail`/`sed -n '1,N p'` slices) the first time this skill
loads in a session. The Efficiency Rules and Operating Loop near the end
contain non-negotiable rules whose absence drives cost and failure loops.

## Fast Start

The `realbrowser` CLI is bundled at `scripts/realbrowser` (Node entry:
`scripts/realbrowser.mjs`). Construct the `REALBROWSER` variable from this
skill's base directory:

```bash
# macOS/Linux
REALBROWSER="<skill-directory>/scripts/realbrowser"
```
```powershell
# Windows PowerShell
$Realbrowser = Join-Path "<skill-directory>" "scripts\realbrowser.ps1"
```

Anonymous (isolated temporary state, not visible Incognito):
```bash
"$REALBROWSER" tab ensure https://example.com --anonymous --session check --label page --background
"$REALBROWSER" read observe -t page --anonymous --session check
```

Visible Chrome Incognito (add `--incognito` / `--private` only when the user
explicitly wants a visible Incognito window; not for signed-in profiles):
```bash
"$REALBROWSER" tab ensure <url> --anonymous --session private --label page --front --incognito
```

Signed-in profile or existing Chrome:
```bash
"$REALBROWSER" profile list --active
"$REALBROWSER" tab list "<query>" --profile chrome:Default
"$REALBROWSER" tab ensure <url> --profile chrome:Default --label app --background
"$REALBROWSER" read observe -t app --profile chrome:Default
```

Creation is `tab ensure`/`tab new`; navigation is `tab navigate <target> <url>`;
reads/actions require a target. Profile listing reports CDP scope: `profile`
endpoint is scoped to one profile; `browser` endpoint can inspect existing
tabs but cannot prove a *new* named-profile tab is safe via CDP alone. Direct
WebSocket from `DevToolsActivePort` is the primary attach; HTTP discovery is
fallback. `--background` uses only background-safe paths. If profile app
launch is required, the CLI fails unless `--best-effort-background` (restores
prior foreground app after launch) or `--front` (intentional handoff) is
explicit.

Default context for repeated work, plus owner scoping for parallel sessions:
```bash
"$REALBROWSER" session use profile:chrome:Default
export REALBROWSER_OWNER=my-project   # if running parallel sessions
"$REALBROWSER" tab ensure <url> --label app --background
```

Mutating commands claim a target lease. If another owner holds the lease, do
not navigate/click/close/focus/reload/download from it without `--take-lease`
or explicit user handoff. Full/responsive/device/annotated screenshots also
require the lease (they temporarily emulate viewport or draw overlays).
Read-only commands can still inspect after explicit selection.

## Operating Loop

1. **Classify scope:** existing tab, signed-in profile, anonymous, debug,
   read-only, or form/action.
2. **Inspect before creating** (for current UI, logged-in state, "already
   open" wording): `profile list --active`, `tab list <query> --profile`.
   If CDP is browser-scoped, those targets are diagnostic only — create a
   new tab through the named profile with `tab ensure --best-effort-background`.
3. **Acquire one stable target:** `tab select --label` for existing,
   `tab ensure --label` to create. If multiple tabs match, disambiguate by
   URL/title — never guess.
4. **One tree, many diffs.** `read tree -t <label> -i -c` once per page
   state; `read tree -i -c -D` after every action. The tree returns every
   interactive element with refs (`b1`, `l1`, `e1`) — do not follow it with
   `read snapshot`/`read query`/`screenshot full` to find elements. Use
   `read items`/`read item` for feeds, `read text --out FILE` for bulk text,
   `wait ready --visual-stable` (never `sleep`) for readiness.
5. **Forms/uploads/submits:** `action state -t <label> --root active` for the
   form context. Add `--screenshot --annotate-refs` only when a visual check
   can prevent a wrong click (modal boundaries, covered buttons, file
   previews). Act on refs inside that root; submit once with
   `action submit --text <exact label>` or `action submit <button-ref>`.
6. **Verify after action:** `read tree -i -c --diff` (preferred, ~50 tokens)
   or `wait ready --visual-stable`. Screenshots only when the verification is
   visual-only (image rendered, canvas drew, layout shift).
7. **Ephemeral UI** (dropdowns, tooltips, autocomplete, modals): a click
   that opens ephemeral UI invalidates prior refs. Re-read tree before the
   next action — never retry a failed click/fill with the same ref.
8. **"covered-by:..." / "not topmost" errors** — the error names the cover.
   Recovery in order: `action press Escape` (modal/backdrop), `action scroll`
   (sticky nav covering target), `wait ready --visual-stable` (loading
   overlay). Two identical "covered-by" errors = stop and change strategy.
9. **After navigation:** `tab navigate` or any click that swaps the route
   invalidates all refs. Re-read tree before the next action.
10. **End-of-turn tab cleanup.** Close tabs *you created* that aren't part
    of the deliverable. Keep tabs only when they fall into one of two
    statuses:
    - **deliverable** — the tab IS the user-facing output: a created/edited
      doc, a checkout cart, a submitted form result, a dashboard the user
      asked to inspect, or a page the user explicitly asked to keep open.
    - **handoff** — the task is in progress and the user (or a later turn)
      must continue from this tab: waiting for login, approval, payment,
      CAPTCHA, an unfinished workflow.
    Otherwise close it: `tab close -t <label>`. Never close a tab the
    user already had open before the task — those belong to them, even if
    you used them as inputs (claimed via `tab select`).

For inspection-only work, preserve user state when practical: avoid focus
changes, restore temporary filter/sort/tab changes before finishing.

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

`read tree -i -c` returns the interactive surface as text. Interpret it the
way a user would — match the user's request to what's actually on the page,
*before* clicking. Mechanical "next ref in the list" is the root cause of
stale-ref loops, wrong clicks, and dropped context.

1. **Find what the user named.** Search the tree text for the exact label
   ("Sign in", "Submit", "Buy now") and use the matching ref. Don't click
   the first interactive element by reflex.
2. **Read state attributes.** `[disabled]` means precondition missing;
   `[expanded=false]` means children may not be reachable; `[modal]` means
   only that dialog's controls are valid; `[required]`, `[checked]`,
   `[focused]`, `value="..."` all change what action is correct.
3. **Disambiguate by ancestor.** Two buttons share a name? One in a
   `dialog`, one in `main` — pick the one in the right context. Still
   unsure? Ask the user; don't click to find out.
4. **Recognize blocking state.** Modal/`alertdialog` covers the page;
   `aria-busy` or zero interactives means mid-load — `wait ready
   --visual-stable` first.
5. **Plan the whole flow from one tree.** A form usually shows every
   input + submit in one read. Plan all the fills, then act.
6. **On failure: re-read, don't retry.** "Not topmost", "covered", "ref
   stale" mean the page changed since the tree was captured. `read tree
   -i -c -D` shows what's different. Retrying the same ref loops forever.

**ABSOLUTE RULE:** Never guess CSS selectors. If you haven't seen the exact
selector verbatim in prior output, source you read, or `forms`, use refs.

**Stay on the user's site.** If the user named a site, don't substitute a
different one when you hit friction — they picked it for account, data, or
context reasons. After the failure budget, report the blocker; let the user
decide whether to retry, switch, or give up.

**Refs are scoped to the most recent tree read.** Each `read tree` replaces
the ref store; refs in a `--out` file are valid only until the next read on
that target. Recovery for "ref stale or unknown": `read tree -t <target>
-i -c` (no `--out`) and use refs from that fresh output.

### If it's on disk, search the file — don't ask the browser again

Once any reader has written content to disk via `--out`, the next search MUST
be on the file (`grep`/`sls`/`node -e`), never a browser round-trip. After
`read tree --out FILE` or `read text --out FILE` or `read html --out FILE` or
`read items --out FILE`, run `grep -nE 'pat' FILE` (POSIX) or `sls -Pattern
'pat' FILE` (PowerShell) instead of another `read query --text-filter` —
labels are already in the file as exact strings.

**Banned anti-pattern:** capture to disk → 3+ `read query --text-filter`
calls hunting for a label that's in the file. After the first failed
`read query` on captured content, switch to file search.

`rg`/`jq`/`pup`/`htmlq` are convenient but not universal — fall back to
`grep`/`sls`/`node -e` instead of asking the user to install tools.

### Don't sleep — wait for the page

`sleep N` is dead time — pages may settle in 200ms or 8s, fixed sleeps are
always wrong. Use `wait ready --visual-stable` (default), `wait selector`,
`wait text`, or `wait url --contains`. Chained `sleep 1` between commands
is the worst form: seconds wasted per task, and still misses slow pages.

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

### One tree, many diffs

`read tree -i -c` once per page state, `read tree -i -c -D` after every
action (typically 2-10 lines of delta). A "page state" changes (drop `-D`)
on a new page load, major SPA route swap, or a modal opening/closing. A
dropdown opening, a value filling, or a button enabling is a delta — use
`-D`, never the full tree.

`read tree -i -c` IS the "one big read" agents reach for full HTML or full
screenshot to get — it returns every interactive element with refs ready for
`action click/fill/type/submit`. Rare cases the tree is insufficient:
- Element has no ARIA role/name → `read tree -c` (drop `-i`) or
  `read snapshot --selector <css>`.
- Non-interactive text content (article body, table cells) →
  `read text --out FILE`.
- Raw HTML (data attributes, custom elements) → `read html --out FILE`.
- Many similar rows from a feed → `read items`.

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

- **Full HTML / full screenshot to find elements.** Both are 10-1000× more
  expensive than `read tree -i -c` and you still need a DOM ref to click.
  `read html` is for offline grep on text content, not for interaction.
- **`read query` to find what `read tree` already showed.** Tree returns
  every interactive element with refs; `read query` is only for a CSS
  selector you have seen verbatim.
- **Multiple readers on the same page state.** One tree is the snapshot.
  Act, then `read tree -D` for the delta — never re-read full + read snapshot
  + read query on the same unchanged page.

### Command-count checkpoint

At command 5, ask: "Am I making real progress or stuck in a guess-and-retry
loop?" If more than 1 command did not advance toward the goal, you are in a
loop. Re-read the page with `read tree -i -c` and use refs.

At command 10, if the task is not nearly complete, you have taken a wrong
approach. Do not continue — reassess fundamentally.

### Refs first, CSS only when known

After `read tree -i -c`, every interactive element has a ref (`b1` button,
`l1` link, `e1` editable/other; `read autocomplete` adds `o1, o2, …` for
floating-layer items).
Use refs for actions: `action click b3`, `action fill e2 "value"`,
`action type e1 "text"`.

CSS selectors are allowed only when the selector is *known* — verbatim from a
prior command's output, the app's source you read, or a standard landmark
(`main`, `nav`, `[role="dialog"]`). Allowed uses: `read tree --selector main`
(scoping), `read query` (with a known selector), `action scroll --selector`,
`wait selector`.

A selector is a *guess* (banned) if you used `[class*="..."]`, modified a
seen selector (`.results-list` → `.results-item`), or copied from another
site. The test: "Where exactly did I see this selector?" — if you can't
point to a specific prior output line, it's a guess.

**Banned: iterative selector hunting.** After the first failed or empty CSS
result, switch to refs. Do not run a second `read query` with a different
selector. Do not derive selectors from screenshots.

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

### Screenshots: visual state only, one shot

Screenshots are for visual-only decisions (modal opened, spinner gone, image
rendered, layout shift, canvas/chart drew correctly). Reading text from
screenshots is banned — vision tokens are 5-20× more expensive per byte and
misread small digits. Pick the right shot:

| Goal | Tool |
|---|---|
| "What does the whole long page look like?" | `screenshot full` (one shot) |
| "Did the modal open?" / "Is the spinner gone?" | `screenshot capture` (viewport) |
| "What flights / items / values are listed?" | `read text --selector main --out` + grep |
| "What buttons exist on the long form?" | `read tree -i -c --out` + grep |
| "Did my click change the DOM?" | `read tree -i -c --diff` (~50 tokens, no screenshot) |

**Anti-patterns:**
- `screenshot capture` after every click "to confirm it worked" — `read tree
  --diff` is 12× cheaper and tells you exactly what changed.
- `screenshot capture` + scroll + `screenshot capture` + scroll loop —
  one `screenshot full` is cheaper and not fragmented.
- Vision to read prices/dates/labels — use `read text --out` + grep.

### Dropdowns, pickers, and autocomplete: type-first

When a click opens a dropdown/picker/autocomplete with a search input, type
immediately — the input is usually auto-focused: `action type "search text"`.

If the dropdown items don't show up in `read tree` (custom autocomplete
without `role=listbox/option`), run `read autocomplete -t <label>` — it
enumerates the floating layer's visible items as `o1, o2, …` refs that work
with `action click <ref>`. No selector hunting.

**Anchor with `--near <ref>` for click-then-popup widgets** — when the
dropdown opens after clicking a button (not typing into an input), pass
`read autocomplete -t <label> --near <button-ref>`. Without `--near`, the
reader uses `document.activeElement`, which lies for custom popovers and can
return an unrelated layer (e.g. a "Login/Register" pill in the corner).
Use `--near` whenever you opened the picker via `action click` rather than
`action type`.

The reader also picks up `role="tooltip|listbox|combobox|menu|dialog"` even
when the element isn't `position:fixed/absolute` (some sites use
`position:relative` + transforms). The output header shows `role-layer` and
`dist=<N>` (Manhattan distance to anchor) so you can verify the right
layer was chosen.

If `read autocomplete` returns `(no eligible layer near anchor)`, the
dropdown likely closed — re-click the field, then retry with `--near`.

**Detecting silent fill no-ops on custom widgets.** Custom datepickers and
masked inputs often accept `el.value = "..."` programmatically but render
the placeholder back, so the form submits with stale data. Pass
`action fill <ref> "<value>" --require-change` to make the CLI exit
non-zero when the visible value didn't change after fill. Then pivot to
the picker UI (calendar widget, dropdown) instead of typing.

If typing does nothing, `action press Escape`, re-read tree, try a different
UI path. Do not cycle CSS selectors hoping to find a clickable item inside a
tooltip/popover — tooltip children are frequently "not topmost".

### After-submit: one wait, no stacked sleeps

```bash
"$REALBROWSER" action click <submit-ref>
"$REALBROWSER" wait ready -t app --visual-stable --timeout 30000
"$REALBROWSER" read tree -t app -i -c --diff   # verify new state
```

`wait ready --visual-stable` already waits for network + DOM stability. Do
not chain `sleep N` before or after it (dead time), and do not chain
`tab focus --front` to "make the page work" (undoes the background goal —
the page works fine in the background).

### One authoritative signal = answer; stop verifying

When the page exposes one authoritative signal for the fact you need —
selected option, `[checked]` state, success modal/toast, line item visible
in the cart, current URL parameter, the value attribute on an input — treat
that as the answer unless another signal directly contradicts it. Don't
re-verify through header badges, alternate surfaces, or repeated full-page
snapshots once the authoritative signal is present.

Examples of authoritative signals:
- After `action fill e1 "SGN"`: the tree's `value="SGN"` on `e1` is proof.
- After clicking a date: the form's date input shows the date you picked.
- After clicking "Add to cart": the cart count badge or the success toast.
- After navigation: the URL or page title changed as expected.

If you have one of these, stop. Do not also screenshot, scroll to a header,
re-read the full tree, or query a related field "to make sure".

### Talk to the user every 5+ tool calls

If you've made 5 or more tool calls without emitting any text to the user,
emit a one-sentence progress note. Don't go silent for 8+ minutes of
back-to-back tool use — the user has no idea whether you're making progress
or stuck. A single line ("captured outbound flights, fetching return leg
now" / "stuck on date picker, trying calendar widget") is enough.

This applies even when the next tool call is "obvious." Silent runs ending
in `[Request interrupted by user]` are failure modes the user pays for in
real time.

### Report partial success and stop

When the user asks for multi-part data — round-trip flights, a comparison,
"both A and B", a summary across pages — and you have already captured at
least one part with confidence, **report what you have first**. Don't
navigate away from a working results page to re-fetch the rest.

Why: SPA results pages frequently lose state on back/forward, direct nav,
or full reload. A 6-minute happy path becomes a 12-minute timeout when you
abandon a captured result to chase the next one and the page resets. The
user can ask you to continue from the partial answer; they cannot get back
the time burned in a doom loop.

Concrete examples:
- Round-trip search, captured outbound list → report outbound times+prices
  *now*, then continue to return leg.
- Compare two products, scraped product A → report A's spec *now*, then
  navigate to B (in a new tab if practical, so A stays available).
- Multi-step form with progress saved at step 3/5 → if the user asked about
  step 3, answer it before pushing further.

A partial answer with a clear "still pending: X" note is always better than
silence followed by a timeout.

### Failure budget

| Failure type | Max attempts | Then |
|---|---|---|
| Ref stale/covered/not topmost | 1 | Re-read tree for fresh refs |
| Click error contains `covered-by:<sel>` | 1 | `action scroll down 400` then retry; if still covered, retry with `action click <ref> --bypass-overlay` (dispatches events directly to the element, ignores hit-test) |
| `action fill` reports `accepted: false` or you suspect silent no-op (custom datepicker, masked input) | 1 | Re-fill with `--require-change` to fail loudly; if it errors, switch to the picker UI (calendar widget / dropdown / role=combobox) and click your way through |
| Dropdown item not in tree | 1 | `read autocomplete -t <label>` then `action click <o-ref>` |
| Dropdown item not clickable | 1 | Type into search input instead |
| CSS selector guess (not from prior output) | 0 | Use refs — never guess selectors |
| CSS selector from prior output, not found | 1 | Fall back to `read tree -i -c` + refs |
| `tab navigate` shows `WARN: page title looks like an error page` | 1 | The URL is wrong — go back / use the UI path. Don't retry the same URL. |
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

### Multi-page flows

For wizards/checkouts/bookings: one `read tree -i -c` per page, advance by
the correct ref, verify the transition with `read tree --diff` or
`read observe`. If advancing requires picking a placeholder option (fare
class to unlock the next step), pick the first by ref and move on.

### Never truncate tree output

Truncating with `| head` / `| tail` (POSIX) or `| Select-Object -First` /
`gc -Head` (PowerShell) discards elements you need. If the output is too
large for context, use `--out tmp/tree.txt` and read the file, or scope at
the source with `--selector` / `--depth N` / `--limit N`.

## Profile Approval And Daemon Reuse

`profile list --active` is passive — reads `DevToolsActivePort` without opening
a CDP socket. The first real attach belongs to the selected target. Reuse the
existing `DevToolsActivePort` WebSocket and its per-browser-endpoint daemon;
do not spawn extra controllers. If Chrome shows an Allow-debugging prompt,
wait for the existing daemon (`daemon monitor --json`) rather than retrying.

Chrome owns the approval boundary — the skill can make it one-per-endpoint
while the browser survives, but cannot persist approval across restarts. For
low-approval clean-state work, prefer anonymous sessions; for signed-in
state, attach to the real profile and reuse the same daemon.

Don't probe multiple profiles in parallel when they share a browser-scoped
WebSocket. Pick one profile, run one target-acquisition command. Once a label
is created, `-t <label>` infers context.

If `profile list --active` returns nothing but `profile list` shows the user
data is running, Chrome is likely waiting on the approval prompt — retry
after the user approves. With no direct WebSocket endpoint at all,
`--best-effort-background` cannot attach.

Relaunch is the last resort; ask explicitly before quitting Chrome:
```bash
"$REALBROWSER" profile relaunch chrome:Default --confirm
"$REALBROWSER" tab ensure <url> --profile chrome:Default --label app --background
```

Use `--front` only when the user wants visual handoff or hidden interaction
is impossible. `--best-effort-background` is only for profile app launch and
still tries to return focus to the previous app.

## Common Workflows

Minimal skeletons here. Detailed patterns (form/upload, console/network,
screenshots, PDF, anonymous, responsive, infinite feeds) live in
`references/workflows.md`.

Read items from a feed without dumping HTML:
```bash
"$REALBROWSER" read items -t app --collection auto --limit 8 --max-text-chars 700 --json
"$REALBROWSER" read item -t app --collection auto --index 4 --max-text-chars 4000
```

Console logs (one exact tab, never mixed):
```bash
"$REALBROWSER" tab select "<query>" --profile chrome:Default --label app
"$REALBROWSER" console list -t app --errors --limit 80
"$REALBROWSER" console capture -t app --reload --duration 3000 --out tmp/console.json
```

Network capture + body:
```bash
"$REALBROWSER" network capture -t app --reload --duration 5000 --out tmp/net.json
"$REALBROWSER" network list -t app --filter "/api/" --json
"$REALBROWSER" network body -t app req_12 --response --out tmp/req_12.json --full
```

Upload and submit (active root keeps interactions scoped):
```bash
"$REALBROWSER" action state -t app --root active --compact
"$REALBROWSER" action upload -t app --root active --input-ref e2 ~/file.png
"$REALBROWSER" action upload -t app --root active --trigger-ref b7 ~/file.png  # picker control
"$REALBROWSER" action submit -t app --root active --text "Submit"
```

`action fill` replaces a value; `action type <ref> <text>` focuses then sends
native CDP input (use for rich editors that reject synthetic value replacement).
Never use `action click` on a file-picker control — `action upload --trigger-ref`
arms the file chooser before clicking. `action submit --text` requires an exact
accessible label; submit by ref when labels are ambiguous.

Screenshots and PDF:
```bash
"$REALBROWSER" screenshot capture -t app --selector '[role=dialog]' tmp/dialog.png --annotate-refs
"$REALBROWSER" screenshot full -t app --selector '[data-scroll-root]' tmp/panel.png
"$REALBROWSER" screenshot device -t page --anonymous --session r --devices mobile:390x844 tmp/p
"$REALBROWSER" export pdf -t app tmp/app.pdf --print-background
```

Default screenshot output: JPEG q85, max side 2000px, max 5mb, browser-canvas
fallback when CDP output is too large. Use `--format png` / explicit `.png` path
for exact browser pixels. `screenshot full` falls back to scroll-container
stitching when the document is fixed-height — pass `--selector` to target a
specific panel.

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

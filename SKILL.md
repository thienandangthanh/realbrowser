---
name: realbrowser
description: Use when you need fast local real-browser automation from Codex, including listing/selecting Chrome profiles, named browser sessions, anonymous clean-state sessions, network/performance capture, opening tabs, taking snapshots or screenshots, clicking, typing, filling forms, reading console/network data, or debugging localhost/browser UI with Chrome DevTools MCP.
---

# Realbrowser

Use this skill for local browser checks when a real or managed Chrome session is
more direct than generic browser tooling. Keep the first pass small: read this
file, run the task, and open references only when the task needs their detail.

## Quick Start

```bash
REALBROWSER_CLI="$HOME/.codex/skills/realbrowser/scripts/realbrowser"
REALBROWSER_HELPER="$HOME/.codex/skills/realbrowser/scripts/realbrowser-helper.mjs"
"$REALBROWSER_CLI" open https://example.com --anonymous --session task --select --timeout 20000
"$REALBROWSER_CLI" --session task observe --max-chars 2000
```

Do not run `doctor` by default. Use it when setup is uncertain or a browser
command fails.

## Screenshot Task Fast Path

For requests like "check staging site, log in if needed, open inbox, take
desktop/tablet/mobile screenshots":

1. Use a clean anonymous session unless the user explicitly needs existing
   Chrome cookies:
   ```bash
   "$REALBROWSER_CLI" open https://site.example --anonymous --session site-check --select --timeout 30000
   ```
2. Read compact state:
   ```bash
   "$REALBROWSER_CLI" --session site-check observe --max-chars 2000
   ```
3. If login is needed, use `snapshot --efficient`, `fill-form`, `click`, then
   wait for the post-login page with `wait --domcontentloaded` or visible text.
4. Navigate directly to the requested page when the route is known.
5. For exact default desktop/tablet/mobile PNG screenshots, run:
   ```bash
   "$REALBROWSER_CLI" --session site-check device-screenshots /tmp/site-inbox
   ```
6. If the layout hydrates slowly, add a readiness guard such as
   `--selector main --visual-stable --settle-ms 500`.
7. For custom device sizes or one-off mobile captures, read
   `references/screenshots.md`.
8. Inspect saved images with `view_image` when available, then
   `detach --session site-check`.

## Decision Matrix

- Public page or clean login test: use `--anonymous --session <task> --select`.
- Existing user cookies, a named Chrome profile, or `--no-fallback`: read
  `references/profiles.md`.
- Focus-gated or lazy social/feed pages that do not hydrate in a background tab:
  use explicit `--foreground-until-ready` plus `wait-ready` criteria.
- Exact viewport, mobile screenshot, raw PNG dimensions, or responsive capture:
  read `references/screenshots.md`.
- Console errors, failed network requests, HAR/performance, cache/header proof,
  or large HTML/text extraction: read `references/debugging.md`.
- Full command syntax, global flags, or less common commands: read
  `references/commands.md`.

## Operating Loop

1. Reuse existing context before opening duplicates: `sessions`, then
   `find-tab <url-or-title> --all-sessions` when prior attempts may exist.
2. Open or claim one stable target. Use `--session <name>` for isolated flows
   and `claim ... --handle-name <task>` for longer workflows.
3. Read before acting. Use `observe --max-chars 1500-2500` for page state and
   `snapshot --efficient` only when clickable `uid` refs are needed.
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
"$REALBROWSER_CLI" claim https://app.example/feed \
  --profile "chrome:Default" \
  --handle-name app-feed \
  --no-fallback \
  --foreground-until-ready \
  --selector '[role="feed"]' \
  --min-cards 3 \
  --timeout 20000
"$REALBROWSER_CLI" --handle app-feed wait-ready --selector '[role="feed"]' --min-cards 3 --visual-stable
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
  `network --failed --limit 30`, `posts --limit <n> --max-chars 2000`.
- Use `posts` for repeated cards, `blocks` for dashboards/search results,
  `screenshot` for visual evidence, and `html --out <path>` for selector/debug
  work.
- Do not use `--full-stdout` for large or unknown output. Prefer artifacts and
  targeted local inspection.
- Use `--raw-size` only when exact browser pixels matter. Default screenshots
  are normalized for agent use.

## Safety Notes

Chrome DevTools MCP/CDP can inspect and modify browser state. Avoid sensitive
tabs unless the user explicitly wants that. The local daemon binds to
`127.0.0.1` and uses the bearer token in the state file for command calls.

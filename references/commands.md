# Realbrowser Command Reference

Read this when you need command syntax beyond the common recipes in `SKILL.md`.

## Session And Tab State

- `doctor [--deep]`: check Node, npm/npx, daemon, MCP tools, and optionally live
  tabs.
- `status [--deep]`: show daemon/control state, including whether the running
  daemon script matches the current skill script. `--deep` attaches and includes
  tab count plus selected tab.
- `sessions`: list running realbrowser sessions and modes. The `*` row is the
  active session.
- `active-session` / `current-session`: show the remembered active session.
- `use-session <name> [--force]`: make a running named session active.
- `clear-session`: forget the active session pointer without stopping daemons.
- `claim [url] [--handle-out <path>|--handle-name <name>]
  [--foreground-until-ready] [--selector <css>] [--min-cards <n>] [--force]`:
  claim the selected page or open a URL and write a reusable tab handle.
- `handles` / `list-handles`: list saved tab handles.
- `release-handle <path-or-name>`: delete a saved tab handle without closing the
  browser tab.
- `find-tab [query] [--browser <key>] [--session <name>|--all-sessions]` /
  `tabs-all [query]`: search debuggable tabs across profiles/endpoints and
  running sessions.
- `select-tab <query> [--browser <key>] [--session <name>|--all-sessions]
  [--front] [--no-activate-session]`: select a unique matching tab.
- `tabs`: list open pages with compact targets such as `t1`.
- `select <target>` / `tab <target>`: select a page for later commands.
- `focus <target>`: select a page and bring Chrome to the front.
- `close <target>` / `closetab <target>`: close a tab.

## Navigation

- `open <url>` / `newtab <url>`: open a URL in a background page.
- `open|claim|goto ... --foreground-until-ready`: explicitly activate the tab
  and wait for content readiness. Use for focus-gated pages only.
- `open-profile <profile-query> <url> [--select] [--no-fallback]
  [--timeout <ms>]`: open a URL in a selected browser UI profile when a safe
  endpoint route exists.
- `open <url> --profile <profile-query> [--select]`: use an existing endpoint
  route for a profile, then attach to the matching page.
- On real signed-in profiles, prefer an existing endpoint tab plus `goto` when
  avoiding focus matters. Profile-specific app launches can still foreground the
  browser on desktop OSes, so non-front launches are blocked by default. Pass
  `--best-effort-background` only when that focus risk is acceptable, or
  `--front` for explicit visual handoff. Omit `--select` unless follow-up
  commands must immediately target the new tab; `--select` should not imply
  foregrounding, but it can require a controller attach.
- `open <url> --profile <profile-query> --anonymous --session <name> --select`:
  open profile-bound Incognito and keep later commands on the named session.
- `navigate <url>` / `goto <url>`: navigate the selected page.
- `back`, `forward`, `reload`: browser navigation.
- `url`: print current URL.

## Reading

- `observe [--screenshot] [--limit <n>] [--max-chars <n>]`: compact overview
  with title, URL, headings, controls, fields, console errors, and recent failed
  network lines.
- `snapshot` / `accessibility [--selector <css>] [--efficient]
  [--interactive] [--compact] [--depth <n>] [--max-chars <n>]
  [--max-nodes <n>] [--labels|--annotate] [--out <path>]
  [--raw|--verbose]`: role-style snapshot with actionable `uid` refs.
  `--efficient` is the normal agent preset.
- `text`, `html`, `forms`, `cookies`, `storage`, `perf`, `url`: JS-backed read
  helpers. Use `--out <path>` for large output. Cookie/storage values are
  redacted unless `--values` is passed.
- `links [selector|uid] [--limit <n>] [--filter <text>]
  [--text-filter <text>] [--href-filter <text>] [--visible]`: deduped links.
- `extract-items [root-selector] [--item-selector <css>|--card-selector <css>]
  [--limit <n>|--max-items <n>] [--min-text-chars <n>]
  [--max-text-chars <n>] [--link-limit <n>] [--out <path>]`: one-eval
  repeated-content reader. It uses the CDP fast path when available and the MCP
  evaluate fallback otherwise. Use it before broader snapshots for feeds, chats,
  dashboards, search results, and other nested dynamic lists.
- `snapshot-aria [--limit <n>] [--out <path>]`: structured AX node records over
  CDP.
- `snapshot-dom [--selector <css>] [--limit <n>|--max-nodes <n>]
  [--max-text-chars <n>] [--out <path>]`: structured DOM element records over
  CDP. Use `--selector` when a stable container is known.
- `query-selector <selector> [--limit <n>] [--max-text-chars <n>]
  [--max-html-chars <n>] [--out <path>]`: structured selector matches over CDP.
- If `extract-items`, `snapshot-dom`, `snapshot-aria`, or `query-selector`
  reports that the daemon does not support the command, run `status` and
  `sessions`. The command may exist in the current skill script while an older
  daemon is still running. Do not detour into unrelated source trees or
  full-page HTML parsing before checking that daemon/script mismatch.

## Interaction

- `click <uid> [--page <id>]`: click a ref from the latest snapshot.
- `hover <uid> [--page <id>]`: hover a snapshot ref.
- `drag <fromUid> <toUid> [--page <id>]`: drag between refs.
- `type <text> [--page <id>]`: type into the focused element.
- `fill <uid> <value> [--page <id>]`: fill one input/select ref.
- `fill-form '[{"uid":"...","value":"..."}]' [--page <id>]`: fill multiple
  refs.
- `press <key> [--page <id>]`: press a key or chord, such as `Enter` or
  `Meta+L`.
- `click-coords <x> <y> [--page <id>]`: click viewport CSS coordinates.
- `highlight <uid|selector> [--page <id>]`: highlight what a ref/selector
  resolves to.
- `upload <uid> <file> [--page <id>]`: upload through a file input ref.
- `select <uid|selector> <value> [--page <id>]`: select an option.
- `scroll [selector|uid] [--page <id>]`: scroll an element into view or page to
  bottom.
- `wait <text> [more text...] [--visible] [--selector <css>] [--timeout <ms>]
  [--page <id>]`: wait for text/selector visibility.
- `wait --load`, `wait --domcontentloaded`, `wait --networkidle`: page readiness
  waits.
- `wait-ready [text] [--selector <css>] [--min-cards <n>]
  [--card-selector <css>] [--visual-stable] [--no-skeletons] [--screenshot]`:
  wait for real visible content. This checks DOM visibility, repeated-card
  counts, loading markers, image counts, and optional content stability instead
  of trusting `readyState` alone. Use `--min-cards` with `--card-selector`
  unless generic card detection has already been verified for the page.

## Visual, Debug, And Files

- `viewport <WxH|reset> [--page <id>]`: emulate viewport size.
- `mobile-screenshot [url] [path] [--viewport <WxH>] [--handle <path-or-name>]
  [--handle-out <path>] [--force]`: page-scoped mobile screenshot flow with
  viewport, network-idle wait, raw-size capture, and PNG dimension verification.
- `device-screenshots [url] [path-prefix] [--devices
  desktop:1440x900,tablet:768x1024,mobile:390x844] [--settle-ms <ms>]
  [--selector <css>] [--visual-stable] [--mobile-emulation] [--full]
  [--target-id <cdp-target-id>] [--handle <path-or-name>]`:
  capture exact raw PNG screenshots for several named viewports and verify PNG
  dimensions. It fails on ambiguous tab matches instead of guessing. Aliases:
  `exact-screenshots`, `responsive-exact`.
- `screenshot [path] [--full|--full-page] [--uid <uid>] [--labels|--annotate]
  [--format png|jpeg|webp] [--max-side <px>] [--max-bytes <bytes|5mb>]
  [--raw-size|--no-normalize]`: save a screenshot.
- `full-screenshot [path] [--viewport <WxH>] [--selector <css>]
  [--mobile|--mobile-emulation] [--settle-ms <ms>] [--page <id>]`: save a
  full-size screenshot. It uses browser-native full-page capture when the
  document scrolls; when the document is fixed-height but a dominant internal
  scroll container exists, it scrolls and stitches that container. Aliases:
  `full-size-screenshot`, `fullpage-screenshot`.
- `area-screenshot [path] (--uid <uid>|--selector <css>) [--page <id>]
  [--raw-size]`: save a specific element/region. Use `--uid` from a snapshot
  when available, or `--selector` for a CSS-selected box. Aliases:
  `element-screenshot`, `part-screenshot`.
- `responsive <path-prefix>`: save mobile, tablet, and desktop screenshots in
  one daemon call.
- `capture-network [url] [--anonymous|--profile <profile-query>|--browser-url
  <url>] [--reload] [--duration <ms>] [--har <path>]`: capture
  network/performance data.
- `capture-console [url] [--anonymous|--profile <profile-query>] [--reload]
  [--duration <ms>] [--out <path>] [--errors] [--filter <text>]
  [--no-network]`: capture console logs and failed network rows.
- `console [get <msgid>] [--errors] [--filter <text>] [--limit <n>] [--clear]
  [--preserve]`: list or fetch console messages.
- `network [get <reqid>] [--failed] [--filter <text>] [--limit <n>] [--clear]
  [--preserve] [--request-file path] [--response-file path]`: list or fetch
  network requests.
- `errors` / `requests`: aliases for `console --errors` and `network`.
- `download <uid> [path] [--cdp-url <url>] [--download-dir <dir>]
  [--timeout <ms>]`: click a ref and save the resulting download.
- `wait-download [path] [--cdp-url <url>] [--download-dir <dir>]
  [--timeout <ms>]`: wait for the next download event/file.
- `diff <url1> <url2>`: navigate and produce a simple text diff.

## Miscellaneous

- `emulate`: set/reset network, CPU, user agent, color scheme, geolocation.
- `useragent <ua|reset>`: shortcut for user-agent emulation.
- `cookie <name=value>`: set a cookie on the current page path.
- `dialog arm accept|dismiss [text]`, `dialog --accept|--dismiss [text]`,
  `dialog-accept [text]`, `dialog-dismiss`: pre-arm or handle dialogs.
- `eval <js>` / `js <js> [--page <id>]`: run JavaScript in the page. Output is
  capped; use `--out <path>` for large raw results.
- `css <selector|uid> <property>`, `attrs <selector|uid>`,
  `is <state> <selector|uid>`: inspect element state.
- `handoff [pageId]`: bring a page to the front and print a fresh snapshot.
- `resume [pageId] [--page <id>]`: print a fresh snapshot without focusing.
- `trace start|stop`, `trace analyze <insightSetId> <insightName>`: Chrome
  performance tracing.
- `tools`: list available Chrome DevTools MCP tools.
- `tool <mcpToolName> [jsonArgs]`: raw MCP call for unsupported features.
- `chain '[["observe"],["snapshot","--efficient"]]' [--return
  summary|final|all] [--trace <path>]`: run multiple commands in one daemon RPC.

## Global Flags

- `--json`, `--quiet`, `--verbose`, `--raw`, `--mode compact|normal|verbose|raw`.
- `--mcp` / `--no-fast`: bypass direct fast paths when needed.
- `--`: stop option parsing before literal text or JavaScript that starts with a
  flag-like token.
- `--session <name>`, `--state-file <path>`, `--no-active-session`,
  `--no-activate-session`, `--all-sessions`.
- `--backend real|dev`, `--browser-url <url>`, `--cdp-url <url>`,
  `--profile <profile-query>`, `--browser <key>`, `--select`, `--front`,
  `--foreground-until-ready`, `--best-effort-background`.
- `--anonymous`, `--headless`, `--headed`, `--keep-anonymous`.
- `--force`: only where documented, especially handle replacement.
- `--restart-daemon` / `--reload-daemon`, `--allow-profile-reattach`.
- `--reload`, `--duration <ms>`, `--har <path>`, `--timeout <ms>`,
  `--out <path>`, `--full-stdout`, `--auto-out` / `--no-auto-out`.
- `--no-network`, `--dedicated`, `--no-fallback`, `--dismiss-banner`.

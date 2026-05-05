#!/usr/bin/env node
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_STATE_FILE = path.join(os.homedir(), ".realbrowser", "state.json");
const DEFAULT_SESSION_DIR = path.join(os.homedir(), ".realbrowser", "sessions");
const ACTIVE_SESSION_FILE = path.join(os.homedir(), ".realbrowser", "active-session.json");
const DEFAULT_HANDLE_DIR = path.join(os.homedir(), ".realbrowser", "handles");
const REAL_PROFILE_ATTACH_LOCK_FILE = path.join(os.homedir(), ".realbrowser", "real-profile-attach.lock");
const DEFAULT_PROFILE_DIR = path.join(os.homedir(), ".realbrowser", "profile");
const DEFAULT_SCREENSHOT_DIR = path.join(os.homedir(), ".realbrowser", "screenshots");
const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), ".realbrowser", "outputs");
const DEFAULT_DOWNLOAD_DIR = path.join(os.homedir(), ".realbrowser", "downloads");
const DEFAULT_DOWNLOAD_SOURCE_DIR = path.join(os.homedir(), "Downloads");
const DEFAULT_SCREENSHOT_MAX_SIDE = parseOptionalIntegerEnv("REALBROWSER_SCREENSHOT_MAX_SIDE", 2000);
const DEFAULT_SCREENSHOT_MAX_BYTES = parseOptionalBytesEnv("REALBROWSER_SCREENSHOT_MAX_BYTES", 5 * 1024 * 1024);
const DEFAULT_MANAGED_IDLE_TIMEOUT_MS = parseOptionalIntegerEnv("REALBROWSER_IDLE_TIMEOUT_MS", 30 * 60 * 1000);
const START_TIMEOUT_MS = Number.parseInt(process.env.REALBROWSER_START_TIMEOUT_MS ?? "20000", 10);
const MCP_START_TIMEOUT_MS = Number.parseInt(process.env.REALBROWSER_MCP_TIMEOUT_MS ?? "30000", 10);
const CDP_CONSOLE_BUFFER_LIMIT = 1000;
const PACKAGE_SPEC = process.env.REALBROWSER_MCP_PACKAGE ?? "chrome-devtools-mcp@latest";
const CLI_VERSION = "0.1.0";
const SCRIPT_HASH = crypto.createHash("sha256").update(fs.readFileSync(SCRIPT_PATH)).digest("hex").slice(0, 16);
const DAEMON_CAPABILITIES = Object.freeze([
  "bounded-raw-output",
  "chain-step-durations",
  "device-screenshots",
  "endpoint-session-manager",
  "area-screenshot",
  "filtered-links",
  "full-screenshot",
  "foreground-readiness",
  "managed-headless",
  "managed-idle-timeout",
  "page-local-wait",
  "persistent-cdp-page-sessions",
  "persistent-cdp-ws-target-list",
  "cdp-console-buffer",
  "query-selector",
  "snapshot-aria",
  "snapshot-dom",
  "snapshot-selector",
  "visible-wait",
]);
const AUTO_MODE = "auto";
const DEDICATED_MODE = "dedicated";
const ANONYMOUS_MODE = "anonymous";
const LABEL_OVERLAY_ATTR = "data-realbrowser-labels";
const DEFAULT_SNAPSHOT_MAX_CHARS = 8_000;
const DEFAULT_READ_MAX_CHARS = 12_000;
const DEFAULT_HTML_MAX_CHARS = 3_000;
const DEFAULT_CHAIN_STEP_MAX_CHARS = 4_000;
const READ_STDOUT_HARD_MAX_CHARS = 40_000;
const DEFAULT_LINE_LIMIT = 50;
const DEFAULT_OBSERVE_LIMIT = 30;
const DEFAULT_OBSERVE_TEXT_CHARS = 900;
const DEFAULT_SCREENSHOT_JPEG_QUALITY = 85;
const SCREENSHOT_QUALITY_STEPS = [85, 75, 65, 55, 45, 35];
const SCREENSHOT_SCALE_STEPS = [1, 0.82, 0.67, 0.55];
const DEFAULT_NETWORK_CAPTURE_DURATION_MS = 5000;
const DEFAULT_NETWORK_CAPTURE_TIMEOUT_MS = 30000;
const DEFAULT_CONSOLE_CAPTURE_DURATION_MS = 3000;
const DEFAULT_CONSOLE_CAPTURE_TIMEOUT_MS = 30000;
const DEFAULT_CONSOLE_CAPTURE_LIMIT = 100;
const NPX_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";
const CONTROLLED_BANNER_TEXT = "Chrome is being controlled by automated test software";
const REMOTE_DEBUGGING_SETTINGS_URL = "chrome://inspect/#remote-debugging";
const BANNER_X_INSTRUCTION = `click the banner X to hide it; this does not turn off Chrome remote debugging.`;
const MAC_CONTROLLED_BANNER_DISMISS_RIGHT_OFFSET = 42;
const MAC_CONTROLLED_BANNER_DISMISS_TOP_OFFSET = 167;
const MAC_BROWSER_PROCESS_NAMES = [
  "Google Chrome",
  "Google Chrome Beta",
  "Google Chrome for Testing",
  "Chromium",
  "Brave Browser",
  "Microsoft Edge",
  "Vivaldi",
];
const MAC_BROWSER_USER_DATA_PATHS = [
  ["Google", "Chrome"],
  ["Google", "Chrome Beta"],
  ["Google", "Chrome for Testing"],
  ["Chromium"],
  ["BraveSoftware", "Brave-Browser"],
  ["Microsoft Edge"],
  ["Vivaldi"],
];
const WINDOWS_BROWSER_USER_DATA_PATHS = [
  ["Google", "Chrome", "User Data"],
  ["Google", "Chrome Beta", "User Data"],
  ["Google", "Chrome for Testing", "User Data"],
  ["Chromium", "User Data"],
  ["BraveSoftware", "Brave-Browser", "User Data"],
  ["Microsoft", "Edge", "User Data"],
  ["Vivaldi", "User Data"],
];
const LINUX_BROWSER_CONFIG_PATHS = [
  ["google-chrome"],
  ["google-chrome-beta"],
  ["chrome-for-testing"],
  ["chromium"],
  ["chromium-browser"],
  ["BraveSoftware", "Brave-Browser"],
  ["microsoft-edge"],
  ["vivaldi"],
  ["vivaldi-snapshot"],
];
const LINUX_FLATPAK_BROWSER_CONFIG_PATHS = [
  ["com.google.Chrome", ["google-chrome"]],
  ["org.chromium.Chromium", ["chromium"]],
  ["com.brave.Browser", ["BraveSoftware", "Brave-Browser"]],
  ["com.microsoft.Edge", ["microsoft-edge"]],
  ["com.vivaldi.Vivaldi", ["vivaldi"]],
];
const MAC_BROWSER_PROFILE_SOURCES = [
  { key: "chrome", name: "Google Chrome", appName: "Google Chrome", userDataPath: ["Google", "Chrome"] },
  { key: "chrome-beta", name: "Google Chrome Beta", appName: "Google Chrome Beta", userDataPath: ["Google", "Chrome Beta"] },
  { key: "chrome-for-testing", name: "Google Chrome for Testing", appName: "Google Chrome for Testing", userDataPath: ["Google", "Chrome for Testing"] },
  { key: "chromium", name: "Chromium", appName: "Chromium", userDataPath: ["Chromium"] },
  { key: "brave", name: "Brave Browser", appName: "Brave Browser", userDataPath: ["BraveSoftware", "Brave-Browser"] },
  { key: "edge", name: "Microsoft Edge", appName: "Microsoft Edge", userDataPath: ["Microsoft Edge"] },
  { key: "vivaldi", name: "Vivaldi", appName: "Vivaldi", userDataPath: ["Vivaldi"] },
];
const WINDOWS_BROWSER_PROFILE_SOURCES = [
  {
    key: "chrome",
    name: "Google Chrome",
    userDataPath: ["Google", "Chrome", "User Data"],
    executablePaths: [
      ["ProgramFiles", "Google", "Chrome", "Application", "chrome.exe"],
      ["ProgramFiles(x86)", "Google", "Chrome", "Application", "chrome.exe"],
      ["LOCALAPPDATA", "Google", "Chrome", "Application", "chrome.exe"],
    ],
    commands: ["chrome.exe"],
  },
  {
    key: "chrome-beta",
    name: "Google Chrome Beta",
    userDataPath: ["Google", "Chrome Beta", "User Data"],
    executablePaths: [
      ["ProgramFiles", "Google", "Chrome Beta", "Application", "chrome.exe"],
      ["ProgramFiles(x86)", "Google", "Chrome Beta", "Application", "chrome.exe"],
      ["LOCALAPPDATA", "Google", "Chrome Beta", "Application", "chrome.exe"],
    ],
    commands: ["chrome.exe"],
  },
  {
    key: "chrome-for-testing",
    name: "Google Chrome for Testing",
    userDataPath: ["Google", "Chrome for Testing", "User Data"],
    executablePaths: [
      ["ProgramFiles", "Google", "Chrome for Testing", "Application", "chrome.exe"],
      ["ProgramFiles(x86)", "Google", "Chrome for Testing", "Application", "chrome.exe"],
      ["LOCALAPPDATA", "Google", "Chrome for Testing", "Application", "chrome.exe"],
    ],
    commands: ["chrome.exe"],
  },
  {
    key: "chromium",
    name: "Chromium",
    userDataPath: ["Chromium", "User Data"],
    executablePaths: [
      ["LOCALAPPDATA", "Chromium", "Application", "chrome.exe"],
      ["ProgramFiles", "Chromium", "Application", "chrome.exe"],
      ["ProgramFiles(x86)", "Chromium", "Application", "chrome.exe"],
    ],
    commands: ["chromium.exe", "chrome.exe"],
  },
  {
    key: "brave",
    name: "Brave Browser",
    userDataPath: ["BraveSoftware", "Brave-Browser", "User Data"],
    executablePaths: [
      ["ProgramFiles", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
      ["ProgramFiles(x86)", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
      ["LOCALAPPDATA", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
    ],
    commands: ["brave.exe"],
  },
  {
    key: "edge",
    name: "Microsoft Edge",
    userDataPath: ["Microsoft", "Edge", "User Data"],
    executablePaths: [
      ["ProgramFiles(x86)", "Microsoft", "Edge", "Application", "msedge.exe"],
      ["ProgramFiles", "Microsoft", "Edge", "Application", "msedge.exe"],
      ["LOCALAPPDATA", "Microsoft", "Edge", "Application", "msedge.exe"],
    ],
    commands: ["msedge.exe"],
  },
  {
    key: "vivaldi",
    name: "Vivaldi",
    userDataPath: ["Vivaldi", "User Data"],
    executablePaths: [
      ["LOCALAPPDATA", "Vivaldi", "Application", "vivaldi.exe"],
      ["ProgramFiles", "Vivaldi", "Application", "vivaldi.exe"],
      ["ProgramFiles(x86)", "Vivaldi", "Application", "vivaldi.exe"],
    ],
    commands: ["vivaldi.exe"],
  },
];
const LINUX_BROWSER_PROFILE_SOURCES = [
  { key: "chrome", name: "Google Chrome", userDataPath: ["google-chrome"], commands: ["google-chrome", "google-chrome-stable"] },
  { key: "chrome-beta", name: "Google Chrome Beta", userDataPath: ["google-chrome-beta"], commands: ["google-chrome-beta"] },
  { key: "chrome-for-testing", name: "Google Chrome for Testing", userDataPath: ["chrome-for-testing"], commands: ["chrome-for-testing", "google-chrome-for-testing"] },
  { key: "chromium", name: "Chromium", userDataPath: ["chromium"], commands: ["chromium", "chromium-browser"] },
  { key: "chromium-browser", name: "Chromium Browser", userDataPath: ["chromium-browser"], commands: ["chromium-browser", "chromium"] },
  { key: "brave", name: "Brave Browser", userDataPath: ["BraveSoftware", "Brave-Browser"], commands: ["brave-browser", "brave"] },
  { key: "edge", name: "Microsoft Edge", userDataPath: ["microsoft-edge"], commands: ["microsoft-edge", "microsoft-edge-stable"] },
  { key: "vivaldi", name: "Vivaldi", userDataPath: ["vivaldi"], commands: ["vivaldi"] },
  { key: "vivaldi-snapshot", name: "Vivaldi Snapshot", userDataPath: ["vivaldi-snapshot"], commands: ["vivaldi-snapshot"] },
];
const LINUX_FLATPAK_BROWSER_PROFILE_SOURCES = [
  { key: "flatpak-chrome", name: "Google Chrome Flatpak", appId: "com.google.Chrome", userDataPath: ["google-chrome"] },
  { key: "flatpak-chromium", name: "Chromium Flatpak", appId: "org.chromium.Chromium", userDataPath: ["chromium"] },
  { key: "flatpak-brave", name: "Brave Browser Flatpak", appId: "com.brave.Browser", userDataPath: ["BraveSoftware", "Brave-Browser"] },
  { key: "flatpak-edge", name: "Microsoft Edge Flatpak", appId: "com.microsoft.Edge", userDataPath: ["microsoft-edge"] },
  { key: "flatpak-vivaldi", name: "Vivaldi Flatpak", appId: "com.vivaldi.Vivaldi", userDataPath: ["vivaldi"] },
];

const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

const CONTENT_ROLES = new Set([
  "article",
  "cell",
  "columnheader",
  "gridcell",
  "heading",
  "listitem",
  "main",
  "navigation",
  "region",
  "rowheader",
]);

const STRUCTURAL_ROLES = new Set([
  "application",
  "directory",
  "document",
  "generic",
  "grid",
  "group",
  "ignored",
  "list",
  "menu",
  "menubar",
  "none",
  "presentation",
  "row",
  "rowgroup",
  "table",
  "tablist",
  "toolbar",
  "tree",
  "treegrid",
]);

const CLI_COMMAND_GROUPS = [
  {
    title: "Daily workflow",
    commands: [
      { name: "status", usage: "realbrowser status [--deep] [--json]", summary: "Show current daemon and Chrome control state." },
      { name: "claim", aliases: ["claim-tab", "handle-claim"], usage: "realbrowser claim [url] [--handle-out <path>|--handle-name <name>] [--foreground-until-ready] [--selector <css>] [--min-cards <n>] [--force] [--session <name>] [--json]", summary: "Claim a tab and write a reusable handle." },
      { name: "handles", aliases: ["list-handles", "handle-list"], usage: "realbrowser handles [--json]", summary: "List saved tab handles." },
      { name: "release-handle", aliases: ["handle-release", "delete-handle"], usage: "realbrowser release-handle <path-or-name> [--json]", summary: "Delete a saved tab handle.", minArgs: 1 },
      { name: "mobile-screenshot", usage: "realbrowser mobile-screenshot [url] [path] [--viewport <WxH>] [--handle <path-or-name>] [--handle-out <path>] [--force] [--session <name>]", summary: "Capture a page-scoped mobile screenshot with dimension checks.", handle: true },
      { name: "device-screenshots", aliases: ["exact-screenshots", "responsive-exact"], usage: "realbrowser device-screenshots [url] [path-prefix] [--devices desktop:1440x900,tablet:768x1024,mobile:390x844] [--settle-ms <ms>] [--mobile-emulation] [--full] [--handle <path-or-name>] [--session <name>]", summary: "Capture exact desktop/tablet/mobile PNG screenshots with dimension checks.", handle: true },
      { name: "screenshot", usage: "realbrowser screenshot [path] [--full|--full-page] [--uid <uid>] [--labels|--annotate] [--format png|jpeg|webp] [--quality <0-100>] [--max-side <px>] [--max-bytes <bytes|5mb>] [--raw-size|--no-normalize] [--page <id>]", summary: "Capture a screenshot.", handle: true },
      { name: "full-screenshot", aliases: ["full-size-screenshot", "fullpage-screenshot"], usage: "realbrowser full-screenshot [path] [--viewport <WxH>] [--selector <css>] [--mobile|--mobile-emulation] [--settle-ms <ms>] [--page <id>]", summary: "Capture a full page, or stitch a dominant internal scroll container when the document itself does not scroll.", handle: true },
      { name: "area-screenshot", aliases: ["element-screenshot", "part-screenshot"], usage: "realbrowser area-screenshot [path] (--uid <uid>|--selector <css>) [--page <id>] [--raw-size]", summary: "Capture a specific element or selector area.", handle: true },
      { name: "observe", usage: "realbrowser observe [--screenshot] [--limit <n>] [--max-chars <n>] [--page <id>] [--json]", summary: "Read a compact page observation.", handle: true },
      { name: "snapshot", aliases: ["accessibility"], usage: "realbrowser snapshot [--page <id>] [--selector <css>] [--efficient] [--interactive] [--compact] [--depth <n>] [--max-chars <n>] [--max-nodes <n>] [--labels|--annotate] [--out <path>] [--raw|--verbose] [--json]", summary: "Read the accessibility tree.", handle: true },
    ],
  },
  {
    title: "Sessions and profiles",
    commands: [
      { name: "doctor", usage: "realbrowser doctor [--deep] [--json]", summary: "Check runtime dependencies and browser attach readiness." },
      { name: "profiles", aliases: ["profile-list", "list-profiles"], usage: "realbrowser profiles [query] [--browser <key>] [--active] [--json]", summary: "List local Chromium-family profiles." },
      { name: "sessions", aliases: ["session-list", "list-sessions"], usage: "realbrowser sessions [--json]", summary: "List running realbrowser sessions." },
      { name: "active-session", aliases: ["current-session", "session-current"], usage: "realbrowser active-session [--json]", summary: "Show the active session pointer." },
      { name: "use-session", aliases: ["session-use"], usage: "realbrowser use-session <name> [--force] [--json]", summary: "Set the active session pointer.", minArgs: 1 },
      { name: "clear-session", aliases: ["session-clear", "clear-active-session"], usage: "realbrowser clear-session [--json]", summary: "Clear the active session pointer." },
      { name: "find-tab", aliases: ["tabs-all", "search-tabs"], usage: "realbrowser find-tab [query] [--browser <key>] [--all-sessions] [--json]", summary: "Search tabs across browser/session inventory." },
      { name: "select-tab", aliases: ["attach-tab"], usage: "realbrowser select-tab <query> [--browser <key>] [--all-sessions] [--front] [--no-activate-session] [--json]", summary: "Select a matching tab for automation.", minArgs: 1 },
      { name: "open-profile", aliases: ["profile-open"], usage: "realbrowser open-profile <profile-query> <url> [--browser <key>] [--select] [--no-fallback] [--timeout <ms>] [--front|--foreground-until-ready] [--json]", summary: "Open a URL in a specific browser UI profile.", minArgs: 2 },
      { name: "cleanup-remote-debugging", aliases: ["cleanup"], usage: "realbrowser cleanup-remote-debugging [--allow-attach] [--json]", summary: "Turn off Chrome remote-debugging when possible." },
      { name: "stop", aliases: ["detach"], usage: "realbrowser stop|detach [--all-sessions] [--dismiss-banner] [--cleanup-remote-debugging] [--json]", summary: "Stop realbrowser session state." },
    ],
  },
  {
    title: "Navigation and page actions",
    commands: [
      { name: "tabs", usage: "realbrowser tabs [--json]", summary: "List pages in the current session." },
      { name: "open", aliases: ["newtab"], usage: "realbrowser open <url> [--front|--foreground-until-ready] [--selector <css>] [--min-cards <n>] [--anonymous|--profile <profile-query>] [--browser <key>] [--select] [--no-fallback] [--timeout <ms>] [--json]", summary: "Open a URL.", handle: false, minArgs: 1 },
      { name: "navigate", aliases: ["goto"], usage: "realbrowser navigate <url> [--page <id>]", summary: "Navigate the selected page.", handle: true, minArgs: 1 },
      { name: "back", usage: "realbrowser back [--page <id>]", summary: "Navigate back.", handle: true },
      { name: "forward", usage: "realbrowser forward [--page <id>]", summary: "Navigate forward.", handle: true },
      { name: "reload", usage: "realbrowser reload [--page <id>]", summary: "Reload the page.", handle: true },
      { name: "select", usage: "realbrowser select <target>|<uid|selector> [value] [--page <id>] [--front]", summary: "Select a page/target or option.", minArgs: 1 },
      { name: "tab", usage: "realbrowser tab <target> [--front]", summary: "Select a page target.", minArgs: 1 },
      { name: "focus", usage: "realbrowser focus <target>", summary: "Bring a page target to front.", minArgs: 1 },
      { name: "close", aliases: ["closetab"], usage: "realbrowser close <target>", summary: "Close a page target.", handle: false, minArgs: 1 },
      { name: "click", usage: "realbrowser click <uid|ref> [--page <id>]", summary: "Click an accessibility uid or CDP role ref.", handle: true, minArgs: 1 },
      { name: "hover", usage: "realbrowser hover <uid|ref> [--page <id>]", summary: "Hover an accessibility uid or CDP role ref.", handle: true, minArgs: 1 },
      { name: "drag", usage: "realbrowser drag <fromUid> <toUid> [--page <id>]", summary: "Drag between accessibility uids.", handle: true, minArgs: 2 },
      { name: "type", usage: "realbrowser type <text> [--page <id>]", summary: "Type text.", handle: true, minArgs: 1 },
      { name: "fill", usage: "realbrowser fill <uid|ref> <value> [--page <id>]", summary: "Fill one field.", handle: true, minArgs: 2 },
      { name: "fill-form", usage: "realbrowser fill-form '[{\"uid\":\"...\",\"value\":\"...\"}]' [--page <id>]", summary: "Fill several fields.", handle: true, minArgs: 1 },
      { name: "press", usage: "realbrowser press <key> [--page <id>]", summary: "Press a key.", handle: true, minArgs: 1 },
      { name: "click-coords", usage: "realbrowser click-coords <x> <y> [--page <id>]", summary: "Click screen coordinates.", handle: true, minArgs: 2 },
      { name: "highlight", usage: "realbrowser highlight <uid|selector> [--page <id>]", summary: "Highlight a target.", handle: true, minArgs: 1 },
      { name: "upload", usage: "realbrowser upload <uid> <file> [--page <id>]", summary: "Upload a file.", handle: true, minArgs: 2 },
      { name: "wait", usage: "realbrowser wait [<text>|--load|--domcontentloaded|--networkidle] [--visible] [--selector <css>] [--timeout <ms>] [--page <id>]", summary: "Wait for text, visible content, selector, or page readiness.", handle: true },
      { name: "wait-ready", aliases: ["ready"], usage: "realbrowser wait-ready [text] [--selector <css>] [--min-cards <n>] [--card-selector <css>] [--visual-stable] [--no-skeletons] [--screenshot] [--timeout <ms>] [--page <id>]", summary: "Wait for real visible page content, not just readyState.", handle: true },
      { name: "scroll", usage: "realbrowser scroll [selector|uid] [--page <id>]", summary: "Scroll the page or target.", handle: true },
      { name: "viewport", aliases: ["resize"], usage: "realbrowser viewport <WxH|reset> [--page <id>]", summary: "Set or reset viewport size.", handle: true, minArgs: 1 },
    ],
  },
  {
    title: "Inspection and diagnostics",
    commands: [
      { name: "eval", aliases: ["js"], usage: "realbrowser eval <js> [--page <id>] [--max-chars <n>] [--out <path>] [--raw] [--json]", summary: "Run JavaScript in the page.", handle: true, minArgs: 1 },
      { name: "text", usage: "realbrowser text [selector|uid] [--page <id>] [--max-chars <n>] [--out <path>] [--raw]", summary: "Read text.", handle: true },
      { name: "snapshot-aria", usage: "realbrowser snapshot-aria [--limit <n>] [--out <path>] [--json]", summary: "Read OpenClaw-style AX node snapshot over CDP.", handle: true },
      { name: "snapshot-dom", usage: "realbrowser snapshot-dom [--limit <n>|--max-nodes <n>] [--max-text-chars <n>] [--out <path>] [--json]", summary: "Read OpenClaw-style DOM element snapshot over CDP.", handle: true },
      { name: "query-selector", usage: "realbrowser query-selector <selector> [--limit <n>] [--max-text-chars <n>] [--max-html-chars <n>] [--out <path>] [--json]", summary: "Read OpenClaw-style selector matches over CDP.", handle: true, minArgs: 1 },
      { name: "html", usage: "realbrowser html [selector|uid] [--page <id>] [--max-chars <n>] [--out <path>] [--raw]", summary: "Read HTML.", handle: true },
      { name: "links", usage: "realbrowser links [selector|uid] [--page <id>] [--limit <n>] [--filter <text>] [--text-filter <text>] [--href-filter <text>] [--visible] [--json]", summary: "Read links.", handle: true },
      { name: "forms", usage: "realbrowser forms [selector|uid] [--page <id>] [--json]", summary: "Read forms.", handle: true },
      { name: "cookies", usage: "realbrowser cookies [--page <id>] [--json]", summary: "Read cookies.", handle: true },
      { name: "storage", usage: "realbrowser storage [--page <id>] [--json]", summary: "Read storage.", handle: true },
      { name: "perf", usage: "realbrowser perf [--page <id>] [--json]", summary: "Read performance timings.", handle: true },
      { name: "url", usage: "realbrowser url [--page <id>]", summary: "Read current URL.", handle: true },
      { name: "css", usage: "realbrowser css <selector|uid> <property> [--page <id>]", summary: "Read CSS property.", handle: true, minArgs: 2 },
      { name: "attrs", usage: "realbrowser attrs <selector|uid> [--page <id>]", summary: "Read element attributes.", handle: true, minArgs: 1 },
      { name: "is", usage: "realbrowser is <visible|hidden|enabled|disabled|checked|editable|focused> <selector|uid> [--page <id>]", summary: "Check element state.", handle: true, minArgs: 2 },
      { name: "console", usage: "realbrowser console [get <msgid>] [--errors] [--filter <text>] [--limit <n>] [--clear] [--preserve] [--json]", summary: "Read captured console messages.", handle: true },
      { name: "network", usage: "realbrowser network [get <reqid>] [--failed] [--filter <text>] [--limit <n>] [--clear] [--preserve] [--request-file <path>] [--response-file <path>] [--json]", summary: "Read captured network requests.", handle: true },
      { name: "errors", usage: "realbrowser errors [--clear] [--limit <n>] [--page <id>]", summary: "Read console errors.", handle: true },
      { name: "requests", usage: "realbrowser requests [--failed] [--filter <text>] [--clear] [--limit <n>] [--page <id>]", summary: "Read network requests.", handle: true },
      { name: "capture-network", aliases: ["network-capture", "capture-requests"], usage: "realbrowser capture-network [url] [--anonymous|--profile <profile-query>|--browser-url <url>] [--reload] [--duration <ms>] [--har <path>] [--json]", summary: "Capture network traffic.", handle: true },
      { name: "capture-console", aliases: ["console-capture", "capture-logs", "logs-capture"], usage: "realbrowser capture-console [url] [--anonymous|--profile <profile-query>|--reload] [--duration <ms>] [--out <path>] [--errors] [--no-network] [--json]", summary: "Capture console messages.", handle: true },
    ],
  },
  {
    title: "Advanced",
    commands: [
      { name: "emulate", usage: "realbrowser emulate [--network <name|Offline|reset>] [--cpu <rate>] [--user-agent <ua|reset>] [--color-scheme dark|light|auto] [--geolocation <lat>x<long>] [--page <id>]", summary: "Set emulation options.", handle: true },
      { name: "useragent", usage: "realbrowser useragent <ua|reset> [--page <id>]", summary: "Set user agent.", handle: true, minArgs: 1 },
      { name: "cookie", usage: "realbrowser cookie <name=value> [--page <id>]", summary: "Set a cookie.", handle: true, minArgs: 1 },
      { name: "dialog", usage: "realbrowser dialog [list|arm accept|arm dismiss|--accept|--dismiss|current accept|current dismiss] [text] [--page <id>]", summary: "Handle browser dialogs.", handle: true },
      { name: "dialog-accept", usage: "realbrowser dialog-accept [text] [--page <id>]", summary: "Arm dialog acceptance.", handle: true },
      { name: "dialog-dismiss", usage: "realbrowser dialog-dismiss [--page <id>]", summary: "Arm dialog dismissal.", handle: true },
      { name: "responsive", usage: "realbrowser responsive <path-prefix> [--page <id>]", summary: "Capture common responsive screenshots.", minArgs: 1 },
      { name: "diff", usage: "realbrowser diff <url1> <url2> [--page <id>]", summary: "Compare two URLs visually.", minArgs: 2 },
      { name: "download", usage: "realbrowser download <uid> [path] [--cdp-url <url>] [--download-dir <dir>] [--timeout <ms>] [--page <id>]", summary: "Trigger and wait for a download.", handle: true, minArgs: 1 },
      { name: "wait-download", aliases: ["waitfordownload"], usage: "realbrowser wait-download [path] [--cdp-url <url>] [--download-dir <dir>] [--timeout <ms>]", summary: "Wait for an external download." },
      { name: "handoff", usage: "realbrowser handoff [pageId]", summary: "Print handoff context.", handle: true },
      { name: "resume", usage: "realbrowser resume [pageId] [--page <id>]", summary: "Resume from handoff context.", handle: true },
      { name: "trace", usage: "realbrowser trace start|stop|analyze <insightSetId> <insightName> [--page <id>]", summary: "Use DevTools trace tools.", handle: true, minArgs: 1 },
      { name: "tool", usage: "realbrowser tool <mcpToolName> [jsonArgs]", summary: "Call a raw MCP tool.", minArgs: 1 },
      { name: "tools", usage: "realbrowser tools [--json]", summary: "List MCP tools." },
      { name: "chain", usage: "realbrowser chain '[[\"snapshot\",\"--page\",\"1\"],[\"console\",\"--errors\",\"--page\",\"1\"]]' [--return summary|final|all] [--trace <path>] [--json]", summary: "Run several realbrowser commands in one daemon RPC.", handle: true, minArgs: 1 },
      { name: "restart", usage: "realbrowser restart [--json]", summary: "Restart the MCP backend." },
    ],
  },
];

const HIDDEN_CLI_COMMANDS = [
  { name: "help", usage: "realbrowser help [command]", summary: "Show realbrowser help." },
  { name: "version", usage: "realbrowser version", summary: "Print the realbrowser CLI version." },
  { name: "daemon", usage: "realbrowser daemon" },
  { name: "self-test", usage: "realbrowser self-test" },
];

const CLI_GLOBAL_FLAGS = [
  "-h, --help",
  "--version",
  "--json",
  "-q, --quiet",
  "--verbose",
  "--raw",
  "--mode compact|normal|verbose|raw",
  "--session <name>",
  "--handle <path-or-name>",
  "--handle-out <path>",
  "--handle-name <name>",
  "--no-active-session",
  "--no-activate-session",
  "--all-sessions",
  "--state-file <path>",
  "--backend real|dev",
  "--browser-url <url>",
  "--cdp-url <url>",
  "--profile <profile-query>",
  "--browser <browser-key>",
  "--page <id-or-target>",
  "--target-id <cdp-target-id>",
  "--select",
  "--front",
  "--foreground-until-ready",
  "--front-until-ready",
  "--ready-text <text>",
  "--min-cards <n>",
  "--card-selector <css>",
  "--stable-ms <ms>",
  "--settle-ms <ms>",
  "--visual-stable",
  "--no-skeletons",
  "--mobile-emulation",
  "--mobile",
  "--no-mobile",
  "--headless",
  "--headed",
  "--no-headless",
  "--anonymous",
  "--keep-anonymous",
  "--force",
  "--restart-daemon",
  "--reload-daemon",
  "--reload",
  "--duration <ms>",
  "--har <path>",
  "--timeout <ms>",
  "-o, --output <path>",
  "--out <path>",
  "--auto-out",
  "--full-stdout",
  "--no-auto-out",
  "--no-network",
  "--dedicated",
  "--no-fallback",
  "--mcp",
  "--no-fast",
  "--cleanup-remote-debugging",
  "--dismiss-banner",
  "--allow-attach",
  "--allow-profile-reattach",
];

function allCliCommandSpecs({ includeHidden = false } = {}) {
  const visible = CLI_COMMAND_GROUPS.flatMap((group) => group.commands.map((command) => ({ ...command, group: group.title })));
  return includeHidden ? [...visible, ...HIDDEN_CLI_COMMANDS] : visible;
}

function commandNames(spec) {
  return [spec.name, ...(spec.aliases ?? [])];
}

function commandSpecFor(commandName, options = {}) {
  const normalized = String(commandName ?? "").trim();
  if (!normalized) {
    return null;
  }
  return allCliCommandSpecs(options).find((spec) => commandNames(spec).includes(normalized)) ?? null;
}

function usage(commandName = "") {
  const requestedCommand = String(commandName ?? "").trim();
  if (requestedCommand) {
    return commandUsage(requestedCommand);
  }
  const lines = [
    "realbrowser",
    "",
    "Usage:",
    "  realbrowser [global flags] <command> [args]",
    "  realbrowser help <command>",
    "",
    "Common examples:",
    "  realbrowser status",
    "  realbrowser claim https://app.example.com --handle-name app --json",
    "  realbrowser --handle app screenshot tmp/app.png",
    "  realbrowser mobile-screenshot https://app.example.com tmp/app-mobile.png --viewport 390x844",
    "  realbrowser device-screenshots https://app.example.com tmp/app-inbox",
    "  realbrowser handles",
    "",
    "Commands:",
  ];
  for (const group of CLI_COMMAND_GROUPS) {
    lines.push("", `${group.title}:`);
    for (const command of group.commands) {
      const aliases = command.aliases?.length ? ` (${command.aliases.join(", ")})` : "";
      lines.push(`  ${command.name}${aliases}`);
      lines.push(`      ${command.summary}`);
    }
  }
  lines.push(
    "",
    "Global flags:",
    ...CLI_GLOBAL_FLAGS.map((flag) => `  ${flag}`),
    "",
    "Use `realbrowser help <command>` for command-specific syntax.",
  );
  return lines.join("\n");
}

function commandUsage(commandName) {
  const spec = commandSpecFor(commandName, { includeHidden: true });
  if (!spec) {
    return `Unknown command: ${commandName}\n\n${usage()}`;
  }
  const lines = [
    spec.name,
    "",
    "Usage:",
    `  ${spec.usage}`,
  ];
  if (spec.aliases?.length) {
    lines.push("", `Aliases: ${spec.aliases.join(", ")}`);
  }
  if (spec.summary) {
    lines.push("", spec.summary);
  }
  lines.push("", "Global flags:", ...CLI_GLOBAL_FLAGS.map((flag) => `  ${flag}`));
  return lines.join("\n");
}

function validateCommandArgs(commandName, args) {
  const spec = commandSpecFor(commandName, { includeHidden: true });
  const minArgs = spec?.minArgs ?? 0;
  if (args.length < minArgs) {
    throw usageError(`${commandName} requires ${minArgs} argument${minArgs === 1 ? "" : "s"}.`);
  }
}

function applyModeFlag(flags, mode) {
  flags.mode = mode;
  if (flags.mode === "efficient") {
    flags.efficient = true;
  } else if (flags.mode === "raw") {
    flags.raw = true;
  } else if (flags.mode === "verbose") {
    flags.verbose = true;
  }
}

function applyBackendFlag(flags, backend) {
  flags.backend = backend;
  if (flags.backend === "dev" || flags.backend === "dedicated") {
    flags.dedicated = true;
  }
  if (flags.backend === "real" || flags.backend === "auto") {
    flags.dedicated = false;
  }
}

const FLAG_VALUE_NAMES = new Set([
  "-d",
  "-o",
  "--backend",
  "--browser",
  "--browser-url",
  "--cdp-url",
  "--color-scheme",
  "--cpu",
  "--depth",
  "--devices",
  "--download-dir",
  "--duration",
  "--filter",
  "--format",
  "--geolocation",
  "--handle",
  "--handle-name",
  "--handle-out",
  "--har",
  "--limit",
  "--min-cards",
  "--max-bytes",
  "--max-chars",
  "--max-html-chars",
  "--max-labels",
  "--max-nodes",
  "--max-side",
  "--max-text",
  "--max-text-chars",
  "--mode",
  "--name",
  "--out",
  "--output",
  "--page",
  "--profile",
  "--quality",
  "--ready-text",
  "--request-file",
  "--response-file",
  "--return",
  "--selector",
  "--settle-ms",
  "--session",
  "--text-chars",
  "--stable-ms",
  "--state-file",
  "--submit",
  "--target-id",
  "--text-filter",
  "--timeout",
  "--trace",
  "--uid",
  "--user-agent",
  "--viewport",
  "--viewports",
  "--href-filter",
  "--card-selector",
]);

const OPTIONAL_VALUE_FLAGS = new Set(["--network"]);

const BOOLEAN_FLAG_NAMES = new Set([
  "-a",
  "-h",
  "-i",
  "-q",
  "--activate-session",
  "--active",
  "--all-browser-sessions",
  "--all-session",
  "--all-sessions",
  "--allow-attach",
  "--allow-profile-reattach",
  "--allow-real-profile-reattach",
  "--anonymous",
  "--annotate",
  "--attach",
  "--auto-out",
  "--bring-to-front",
  "--clean-profile",
  "--cleanup-remote-debugging",
  "--clear",
  "--compact",
  "--dedicated",
  "--deep",
  "--disable-remote-debugging",
  "--dismiss-banner",
  "--efficient",
  "--errors",
  "--failed",
  "--force",
  "--foreground-until-ready",
  "--front",
  "--front-until-ready",
  "--full",
  "--full-page",
  "--full-stdout",
  "--headless",
  "--headed",
  "--help",
  "--ignore-active-session",
  "--interactive",
  "--isolated",
  "--json",
  "--keep-anonymous",
  "--keep-isolated",
  "--labels",
  "--mcp",
  "--mobile",
  "--mobile-emulation",
  "--no-active-session",
  "--no-auto-out",
  "--no-dismiss-banner",
  "--no-fallback",
  "--no-headless",
  "--no-fast",
  "--no-network",
  "--no-normalize",
  "--no-mobile",
  "--no-mobile-emulation",
  "--no-reload",
  "--no-screenshot",
  "--no-skeletons",
  "--no-select",
  "--no-summary",
  "--no-activate-session",
  "--normalize",
  "--preserve",
  "--quiet",
  "--raw",
  "--raw-size",
  "--reload",
  "--reload-daemon",
  "--restart-daemon",
  "--screenshot",
  "--select",
  "--summary",
  "--turn-off-remote-debugging",
  "--values",
  "--verbose",
  "--visible",
  "--visual-stable",
  "--version",
  "--unsafe-full-stdout",
]);

const COMMAND_ARGUMENT_OPTION_TOKENS_BY_COMMAND = new Map([
  ["dialog", new Set(["--accept", "--dismiss"])],
  ["wait", new Set(["--domcontentloaded", "--load", "--networkidle"])],
]);

const KNOWN_FLAG_NAMES = new Set([
  ...FLAG_VALUE_NAMES,
  ...OPTIONAL_VALUE_FLAGS,
  ...BOOLEAN_FLAG_NAMES,
]);

function cliError(message, code = "error", exitCode = 1) {
  const error = new Error(message);
  error.code = code;
  error.exitCode = exitCode;
  return error;
}

function usageError(message) {
  return cliError(message, "usage", 2);
}

function flagName(token) {
  const text = String(token ?? "");
  const equalsIndex = text.indexOf("=");
  return equalsIndex === -1 ? text : text.slice(0, equalsIndex);
}

function isOptionLike(token) {
  const text = String(token ?? "");
  return text.startsWith("--") || /^-[A-Za-z]/.test(text);
}

function argvBeforeDoubleDash(argv) {
  const marker = argv.indexOf("--");
  return marker === -1 ? argv : argv.slice(0, marker);
}

function outputFlagsFromArgv(argv) {
  const controlArgv = argvBeforeDoubleDash(argv);
  const output = process.env.REALBROWSER_OUTPUT;
  return {
    json: controlArgv.includes("--json"),
    quiet: controlArgv.includes("-q") || controlArgv.includes("--quiet") || output === "quiet",
    raw: controlArgv.includes("--raw") || output === "raw",
    verbose: controlArgv.includes("--verbose") || output === "verbose",
    fullStdout: controlArgv.includes("--full-stdout") ||
      controlArgv.includes("--unsafe-full-stdout") ||
      output === "full" ||
      process.env.REALBROWSER_FULL_STDOUT === "1",
  };
}

function positionalTokensFromArgv(argv) {
  const tokens = [];
  const controlArgv = argvBeforeDoubleDash(argv);
  for (let index = 0; index < controlArgv.length; index += 1) {
    const arg = controlArgv[index];
    if (isOptionLike(arg)) {
      const name = flagName(arg);
      if (FLAG_VALUE_NAMES.has(name) && !arg.includes("=")) {
        const next = controlArgv[index + 1];
        if (next !== undefined && !isOptionLike(next)) {
          index += 1;
        }
      }
      continue;
    }
    tokens.push(arg);
  }
  return tokens;
}

function validateArgv(argv) {
  const commandName = positionalTokensFromArgv(argv)[0] ?? "";
  const allowedCommandTokens = COMMAND_ARGUMENT_OPTION_TOKENS_BY_COMMAND.get(commandName) ?? new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      return;
    }
    if (!isOptionLike(arg) || allowedCommandTokens.has(arg)) {
      continue;
    }
    const name = flagName(arg);
    if (!KNOWN_FLAG_NAMES.has(name)) {
      throw usageError(`Unknown flag: ${name}`);
    }
    if (FLAG_VALUE_NAMES.has(name)) {
      if (arg.includes("=")) {
        if (arg.slice(arg.indexOf("=") + 1) === "") {
          throw usageError(`${name} requires a value.`);
        }
        continue;
      }
      const next = argv[index + 1];
      if (next === undefined || isOptionLike(next)) {
        throw usageError(`${name} requires a value.`);
      }
      index += 1;
    }
  }
}

function parseHelpArgv(argv) {
  const flags = {
    json: false,
    deep: false,
    full: false,
    verbose: false,
    ...outputFlagsFromArgv(argv),
    help: true,
  };
  const positional = positionalTokensFromArgv(argv);
  if (positional[0] === "help") {
    return { command: "help", args: positional[1] ? [positional[1]] : [], flags };
  }
  return { command: positional[0] ?? "help", args: [], flags };
}

function parseArgv(argv) {
  const controlArgv = argvBeforeDoubleDash(argv);
  const wantsHelp = controlArgv.includes("--help") || controlArgv.includes("-h") || controlArgv[0] === "help";
  if (wantsHelp) {
    return parseHelpArgv(argv);
  }
  if (controlArgv.includes("--version")) {
    return {
      command: "version",
      args: [],
      flags: {
        json: false,
        deep: false,
        full: false,
        verbose: false,
        ...outputFlagsFromArgv(argv),
        version: true,
      },
    };
  }
  validateArgv(argv);
  const args = [];
  const flags = { json: false, deep: false, full: false, verbose: false, ...outputFlagsFromArgv(argv) };
  const commandName = positionalTokensFromArgv(argv)[0] ?? "";
  const allowedCommandTokens = COMMAND_ARGUMENT_OPTION_TOKENS_BY_COMMAND.get(commandName) ?? new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      args.push(...argv.slice(index + 1));
      break;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "-q" || arg === "--quiet") {
      flags.quiet = true;
    } else if (arg === "--raw") {
      flags.raw = true;
    } else if (arg === "--full-stdout" || arg === "--unsafe-full-stdout") {
      flags.fullStdout = true;
    } else if (arg === "--no-auto-out") {
      flags.autoOut = false;
    } else if (arg === "--auto-out") {
      flags.autoOut = true;
    } else if (arg === "--efficient") {
      flags.efficient = true;
      flags.mode = "efficient";
    } else if (arg === "--compact") {
      flags.compact = true;
    } else if (arg === "-i" || arg === "--interactive") {
      flags.interactive = true;
    } else if (arg === "-d" || arg === "--depth") {
      flags.depth = argv[++index];
    } else if (arg?.startsWith("--depth=")) {
      flags.depth = arg.slice("--depth=".length);
    } else if (arg === "--max-chars") {
      flags.maxChars = argv[++index];
    } else if (arg?.startsWith("--max-chars=")) {
      flags.maxChars = arg.slice("--max-chars=".length);
    } else if (arg === "--max-html-chars") {
      flags.maxHtmlChars = argv[++index];
    } else if (arg?.startsWith("--max-html-chars=")) {
      flags.maxHtmlChars = arg.slice("--max-html-chars=".length);
    } else if (arg === "--max-nodes") {
      flags.maxNodes = argv[++index];
    } else if (arg?.startsWith("--max-nodes=")) {
      flags.maxNodes = arg.slice("--max-nodes=".length);
    } else if (arg === "--max-text-chars" || arg === "--max-text" || arg === "--text-chars") {
      flags.maxTextChars = argv[++index];
    } else if (arg?.startsWith("--max-text-chars=")) {
      flags.maxTextChars = arg.slice("--max-text-chars=".length);
    } else if (arg?.startsWith("--max-text=")) {
      flags.maxTextChars = arg.slice("--max-text=".length);
    } else if (arg?.startsWith("--text-chars=")) {
      flags.maxTextChars = arg.slice("--text-chars=".length);
    } else if (arg === "--limit") {
      flags.limit = argv[++index];
    } else if (arg?.startsWith("--limit=")) {
      flags.limit = arg.slice("--limit=".length);
    } else if (arg === "--min-cards") {
      flags.minCards = argv[++index];
    } else if (arg?.startsWith("--min-cards=")) {
      flags.minCards = arg.slice("--min-cards=".length);
    } else if (arg === "--card-selector") {
      flags.cardSelector = argv[++index];
    } else if (arg?.startsWith("--card-selector=")) {
      flags.cardSelector = arg.slice("--card-selector=".length);
    } else if (arg === "--ready-text") {
      flags.readyText = argv[++index];
    } else if (arg?.startsWith("--ready-text=")) {
      flags.readyText = arg.slice("--ready-text=".length);
    } else if (arg === "--stable-ms") {
      flags.stableMs = argv[++index];
    } else if (arg?.startsWith("--stable-ms=")) {
      flags.stableMs = arg.slice("--stable-ms=".length);
    } else if (arg === "--settle-ms") {
      flags.settleMs = argv[++index];
    } else if (arg?.startsWith("--settle-ms=")) {
      flags.settleMs = arg.slice("--settle-ms=".length);
    } else if (arg === "--filter") {
      flags.filter = argv[++index];
    } else if (arg?.startsWith("--filter=")) {
      flags.filter = arg.slice("--filter=".length);
    } else if (arg === "--text-filter") {
      flags.textFilter = argv[++index];
    } else if (arg?.startsWith("--text-filter=")) {
      flags.textFilter = arg.slice("--text-filter=".length);
    } else if (arg === "--href-filter") {
      flags.hrefFilter = argv[++index];
    } else if (arg?.startsWith("--href-filter=")) {
      flags.hrefFilter = arg.slice("--href-filter=".length);
    } else if (arg === "--selector") {
      flags.selector = argv[++index];
    } else if (arg?.startsWith("--selector=")) {
      flags.selector = arg.slice("--selector=".length);
    } else if (arg === "--visible") {
      flags.visible = true;
    } else if (arg === "--clear") {
      flags.clear = true;
    } else if (arg === "--failed") {
      flags.failed = true;
    } else if (arg === "--screenshot") {
      flags.screenshot = true;
    } else if (arg === "--no-screenshot") {
      flags.screenshot = false;
    } else if (arg === "--return") {
      flags.return = argv[++index];
    } else if (arg?.startsWith("--return=")) {
      flags.return = arg.slice("--return=".length);
    } else if (arg === "--trace") {
      flags.trace = argv[++index];
    } else if (arg?.startsWith("--trace=")) {
      flags.trace = arg.slice("--trace=".length);
    } else if (arg === "--mode") {
      applyModeFlag(flags, argv[++index]);
    } else if (arg?.startsWith("--mode=")) {
      applyModeFlag(flags, arg.slice("--mode=".length));
    } else if (arg === "-a" || arg === "--annotate") {
      flags.annotate = true;
      flags.labels = true;
    } else if (arg === "--labels") {
      flags.labels = true;
    } else if (arg === "--deep") {
      flags.deep = true;
    } else if (arg === "--full" || arg === "--full-page") {
      flags.full = true;
    } else if (arg === "--errors") {
      flags.errors = true;
    } else if (arg === "--preserve") {
      flags.preserve = true;
    } else if (arg === "--mcp" || arg === "--no-fast") {
      flags.mcp = true;
      flags.fast = false;
    } else if (arg === "--verbose") {
      flags.verbose = true;
    } else if (arg === "-o" || arg === "--output") {
      flags.output = argv[++index];
    } else if (arg?.startsWith("--output=")) {
      flags.output = arg.slice("--output=".length);
    } else if (arg === "--out") {
      flags.out = argv[++index];
    } else if (arg?.startsWith("--out=")) {
      flags.out = arg.slice("--out=".length);
    } else if (arg === "--max-labels") {
      flags.maxLabels = argv[++index];
    } else if (arg?.startsWith("--max-labels=")) {
      flags.maxLabels = arg.slice("--max-labels=".length);
    } else if (arg === "--session") {
      flags.session = argv[++index];
    } else if (arg?.startsWith("--session=")) {
      flags.session = arg.slice("--session=".length);
    } else if (arg === "--handle") {
      flags.handle = argv[++index];
    } else if (arg?.startsWith("--handle=")) {
      flags.handle = arg.slice("--handle=".length);
    } else if (arg === "--handle-out") {
      flags.handleOut = argv[++index];
    } else if (arg?.startsWith("--handle-out=")) {
      flags.handleOut = arg.slice("--handle-out=".length);
    } else if (arg === "--handle-name" || arg === "--name") {
      flags.handleName = argv[++index];
    } else if (arg?.startsWith("--handle-name=")) {
      flags.handleName = arg.slice("--handle-name=".length);
    } else if (arg?.startsWith("--name=")) {
      flags.handleName = arg.slice("--name=".length);
    } else if (arg === "--no-active-session" || arg === "--ignore-active-session") {
      flags.noActiveSession = true;
    } else if (arg === "--no-activate-session") {
      flags.activateSession = false;
    } else if (arg === "--activate-session") {
      flags.activateSession = true;
    } else if (arg === "--active") {
      flags.active = true;
    } else if (arg === "--all-sessions" || arg === "--all-session" || arg === "--all-browser-sessions") {
      flags.allSessions = true;
    } else if (arg === "--front" || arg === "--bring-to-front") {
      flags.front = true;
    } else if (arg === "--foreground-until-ready" || arg === "--front-until-ready") {
      flags.foregroundUntilReady = true;
      flags.front = true;
    } else if (arg === "--visual-stable") {
      flags.visualStable = true;
    } else if (arg === "--no-skeletons") {
      flags.noSkeletons = true;
    } else if (arg === "--mobile") {
      flags.mobile = true;
    } else if (arg === "--no-mobile") {
      flags.mobile = false;
    } else if (arg === "--mobile-emulation") {
      flags.mobileEmulation = true;
    } else if (arg === "--no-mobile-emulation") {
      flags.mobileEmulation = false;
    } else if (arg === "--headless") {
      flags.headless = true;
    } else if (arg === "--headed" || arg === "--no-headless") {
      flags.headless = false;
      flags.headed = true;
    } else if (arg === "--restart-daemon" || arg === "--reload-daemon") {
      flags.restartDaemon = true;
    } else if (arg === "--select") {
      flags.select = true;
    } else if (arg === "--no-select") {
      flags.select = false;
    } else if (arg === "--anonymous" || arg === "--isolated" || arg === "--clean-profile") {
      flags.anonymous = true;
      flags.dedicated = false;
    } else if (arg === "--keep-anonymous" || arg === "--keep-isolated") {
      flags.keepAnonymous = true;
    } else if (arg === "--force") {
      flags.force = true;
    } else if (arg === "--reload") {
      flags.reload = true;
    } else if (arg === "--no-reload") {
      flags.reload = false;
    } else if (arg === "--network") {
      const next = argv[index + 1];
      if (next !== undefined && !isOptionLike(next)) {
        flags.network = next;
        index += 1;
      } else {
        flags.network = true;
      }
    } else if (arg?.startsWith("--network=")) {
      flags.network = arg.slice("--network=".length);
    } else if (arg === "--no-network") {
      flags.network = false;
    } else if (arg === "--duration") {
      flags.duration = argv[++index];
    } else if (arg?.startsWith("--duration=")) {
      flags.duration = arg.slice("--duration=".length);
    } else if (arg === "--har") {
      flags.har = argv[++index];
    } else if (arg?.startsWith("--har=")) {
      flags.har = arg.slice("--har=".length);
    } else if (arg === "--summary") {
      flags.summary = true;
    } else if (arg === "--no-summary") {
      flags.summary = false;
    } else if (arg === "--no-fallback") {
      flags.noFallback = true;
    } else if (
      arg === "--cleanup-remote-debugging" ||
      arg === "--turn-off-remote-debugging" ||
      arg === "--disable-remote-debugging"
    ) {
      flags.cleanupRemoteDebugging = true;
    } else if (arg === "--dismiss-banner") {
      flags.dismissBanner = true;
    } else if (arg === "--no-dismiss-banner") {
      flags.dismissBanner = false;
    } else if (arg === "--allow-attach" || arg === "--attach") {
      flags.allowAttach = true;
    } else if (arg === "--allow-profile-reattach" || arg === "--allow-real-profile-reattach") {
      flags.allowProfileReattach = true;
    } else if (arg === "--dedicated") {
      flags.dedicated = true;
    } else if (arg === "--backend") {
      applyBackendFlag(flags, argv[++index]);
    } else if (arg?.startsWith("--backend=")) {
      applyBackendFlag(flags, arg.slice("--backend=".length));
    } else if (arg === "--state-file") {
      flags.stateFile = argv[++index];
    } else if (arg?.startsWith("--state-file=")) {
      flags.stateFile = arg.slice("--state-file=".length);
    } else if (arg === "--browser-url") {
      flags.browserUrl = argv[++index];
    } else if (arg?.startsWith("--browser-url=")) {
      flags.browserUrl = arg.slice("--browser-url=".length);
    } else if (arg === "--profile") {
      flags.profile = argv[++index];
    } else if (arg?.startsWith("--profile=")) {
      flags.profile = arg.slice("--profile=".length);
    } else if (arg === "--browser") {
      flags.browser = argv[++index];
    } else if (arg?.startsWith("--browser=")) {
      flags.browser = arg.slice("--browser=".length);
    } else if (arg === "--cdp-url") {
      flags.cdpUrl = argv[++index];
    } else if (arg?.startsWith("--cdp-url=")) {
      flags.cdpUrl = arg.slice("--cdp-url=".length);
    } else if (arg === "--page") {
      flags.page = argv[++index];
    } else if (arg?.startsWith("--page=")) {
      flags.page = arg.slice("--page=".length);
    } else if (arg === "--target-id") {
      flags.targetId = argv[++index];
    } else if (arg?.startsWith("--target-id=")) {
      flags.targetId = arg.slice("--target-id=".length);
    } else if (arg === "--viewport") {
      flags.viewport = argv[++index];
    } else if (arg?.startsWith("--viewport=")) {
      flags.viewport = arg.slice("--viewport=".length);
    } else if (arg === "--devices" || arg === "--viewports") {
      flags.devices = argv[++index];
    } else if (arg?.startsWith("--devices=")) {
      flags.devices = arg.slice("--devices=".length);
    } else if (arg?.startsWith("--viewports=")) {
      flags.devices = arg.slice("--viewports=".length);
    } else if (arg === "--uid") {
      flags.uid = argv[++index];
    } else if (arg?.startsWith("--uid=")) {
      flags.uid = arg.slice("--uid=".length);
    } else if (arg === "--format") {
      flags.format = argv[++index];
    } else if (arg?.startsWith("--format=")) {
      flags.format = arg.slice("--format=".length);
    } else if (arg === "--quality") {
      flags.quality = argv[++index];
    } else if (arg?.startsWith("--quality=")) {
      flags.quality = arg.slice("--quality=".length);
    } else if (arg === "--max-side") {
      flags.maxSide = argv[++index];
    } else if (arg?.startsWith("--max-side=")) {
      flags.maxSide = arg.slice("--max-side=".length);
    } else if (arg === "--max-bytes") {
      flags.maxBytes = argv[++index];
    } else if (arg?.startsWith("--max-bytes=")) {
      flags.maxBytes = arg.slice("--max-bytes=".length);
    } else if (arg === "--raw-size") {
      flags.rawSize = true;
    } else if (arg === "--no-normalize") {
      flags.noNormalize = true;
    } else if (arg === "--normalize") {
      flags.normalize = true;
    } else if (arg === "--timeout") {
      flags.timeout = argv[++index];
    } else if (arg?.startsWith("--timeout=")) {
      flags.timeout = arg.slice("--timeout=".length);
    } else if (arg === "--submit") {
      flags.submit = argv[++index];
    } else if (arg?.startsWith("--submit=")) {
      flags.submit = arg.slice("--submit=".length);
    } else if (arg === "--values") {
      flags.values = true;
    } else if (arg === "--cpu") {
      flags.cpu = argv[++index];
    } else if (arg?.startsWith("--cpu=")) {
      flags.cpu = arg.slice("--cpu=".length);
    } else if (arg === "--user-agent") {
      flags.userAgent = argv[++index];
    } else if (arg?.startsWith("--user-agent=")) {
      flags.userAgent = arg.slice("--user-agent=".length);
    } else if (arg === "--color-scheme") {
      flags.colorScheme = argv[++index];
    } else if (arg?.startsWith("--color-scheme=")) {
      flags.colorScheme = arg.slice("--color-scheme=".length);
    } else if (arg === "--geolocation") {
      flags.geolocation = argv[++index];
    } else if (arg?.startsWith("--geolocation=")) {
      flags.geolocation = arg.slice("--geolocation=".length);
    } else if (arg === "--request-file") {
      flags.requestFile = argv[++index];
    } else if (arg?.startsWith("--request-file=")) {
      flags.requestFile = arg.slice("--request-file=".length);
    } else if (arg === "--response-file") {
      flags.responseFile = argv[++index];
    } else if (arg?.startsWith("--response-file=")) {
      flags.responseFile = arg.slice("--response-file=".length);
    } else if (arg === "--download-dir") {
      flags.downloadDir = argv[++index];
    } else if (arg?.startsWith("--download-dir=")) {
      flags.downloadDir = arg.slice("--download-dir=".length);
    } else if (allowedCommandTokens.has(arg)) {
      args.push(arg);
    } else if (isOptionLike(arg)) {
      throw usageError(`Unknown flag: ${flagName(arg)}`);
    } else {
      args.push(arg);
    }
  }
  const envOutput = process.env.REALBROWSER_OUTPUT;
  if (!flags.raw && !flags.verbose && !flags.quiet && envOutput) {
    if (envOutput === "raw") flags.raw = true;
    if (envOutput === "verbose") flags.verbose = true;
    if (envOutput === "quiet") flags.quiet = true;
  }
  const command = args[0] ?? "help";
  return { command, args: args.slice(1), flags };
}

function stateFileFromFlags(flags = {}) {
  if (flags.stateFile || process.env.REALBROWSER_STATE_FILE) {
    return path.resolve(flags.stateFile ?? process.env.REALBROWSER_STATE_FILE);
  }
  const sessionName = effectiveSessionNameFromFlags(flags);
  if (sessionName) {
    return stateFileForSessionName(sessionName);
  }
  return path.resolve(
    DEFAULT_STATE_FILE,
  );
}

function stateDir(stateFile) {
  return path.dirname(stateFile);
}

function sessionNameFromFlags(flags = {}) {
  const name = flags.session ?? process.env.REALBROWSER_SESSION;
  const normalized = String(name ?? "").trim();
  return normalized || "";
}

function effectiveSessionNameFromFlags(flags = {}) {
  if (flags.stateFile || process.env.REALBROWSER_STATE_FILE) {
    return sessionNameFromFlags(flags);
  }
  return sessionNameFromFlags(flags) || activeSessionNameFromFlags(flags);
}

function activeSessionNameFromFlags(flags = {}) {
  if (flags.noActiveSession || process.env.REALBROWSER_NO_ACTIVE_SESSION === "1") {
    return "";
  }
  const record = readJsonSync(ACTIVE_SESSION_FILE);
  const name = String(record?.session ?? "").trim();
  if (!name) {
    return "";
  }
  const state = readJsonSync(stateFileForSessionName(name));
  if (!state || !isProcessAlive(state.pid)) {
    return "";
  }
  return name;
}

async function readActiveSessionRecord(flags = {}) {
  const record = await readJson(ACTIVE_SESSION_FILE);
  const name = String(record?.session ?? "").trim();
  if (!name) {
    return {
      name: "",
      active: false,
      running: false,
      stateFile: null,
      updatedAt: record?.updatedAt ?? null,
    };
  }
  const stateFile = stateFileForSessionName(name);
  const state = await readJson(stateFile);
  const running = Boolean(state?.pid && isProcessAlive(state.pid));
  return {
    name,
    active: !flags.noActiveSession,
    running,
    stateFile,
    updatedAt: record?.updatedAt ?? null,
  };
}

async function writeActiveSessionName(name) {
  const normalized = String(name ?? "").trim();
  if (!normalized) {
    throw new Error("active session name is empty");
  }
  await writeJson(ACTIVE_SESSION_FILE, {
    session: normalized,
    updatedAt: new Date().toISOString(),
  });
  return normalized;
}

async function clearActiveSessionName() {
  await fsp.rm(ACTIVE_SESSION_FILE, { force: true });
}

function shouldActivateSession(flags = {}) {
  return flags.activateSession !== false;
}

function sessionStateFile(name) {
  return path.join(DEFAULT_SESSION_DIR, `${encodeURIComponent(String(name).trim())}.json`);
}

function stateFileForSessionName(name) {
  return String(name ?? "").trim() === "default" ? DEFAULT_STATE_FILE : sessionStateFile(name);
}

function sessionNameFromStateFile(filePath) {
  const resolved = path.resolve(filePath);
  if (resolved === path.resolve(DEFAULT_STATE_FILE)) {
    return "default";
  }
  if (path.dirname(resolved) !== path.resolve(DEFAULT_SESSION_DIR)) {
    return path.basename(resolved, path.extname(resolved)) || "custom";
  }
  try {
    return decodeURIComponent(path.basename(resolved, ".json"));
  } catch {
    return path.basename(resolved, ".json");
  }
}

function handlePathFromValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  if (
    path.isAbsolute(raw) ||
    raw.includes("/") ||
    raw.includes("\\") ||
    raw.startsWith(".") ||
    raw.endsWith(".json")
  ) {
    return path.resolve(raw);
  }
  return path.join(DEFAULT_HANDLE_DIR, `${encodeURIComponent(raw)}.json`);
}

function handlePathFromFlags(flags = {}) {
  return handlePathFromValue(flags.handle ?? process.env.REALBROWSER_HANDLE);
}

function handleOutputPathFromFlags(flags = {}) {
  if (flags.handleOut) {
    return handlePathFromValue(flags.handleOut);
  }
  if (flags.handleName) {
    return handlePathFromValue(flags.handleName);
  }
  return path.join(DEFAULT_HANDLE_DIR, `rb-${crypto.randomBytes(6).toString("hex")}.json`);
}

async function readHandleFile(filePath) {
  const resolved = handlePathFromValue(filePath);
  const handle = await readJson(resolved);
  if (!handle || handle.kind !== "realbrowser-tab-handle") {
    throw new Error(`Invalid realbrowser handle: ${resolved}`);
  }
  if (handle.pageId === undefined || handle.pageId === null) {
    throw new Error(`Realbrowser handle is missing pageId: ${resolved}`);
  }
  if (!handle.session && !handle.stateFile) {
    throw new Error(`Realbrowser handle is missing session/stateFile: ${resolved}`);
  }
  return {
    path: resolved,
    session: String(handle.session ?? "").trim(),
    stateFile: handle.stateFile ? path.resolve(String(handle.stateFile)) : "",
    pageId: parsePageId(handle.pageId),
    targetId: handle.targetId === undefined ? "" : String(handle.targetId),
    url: String(handle.url ?? ""),
    createdAt: handle.createdAt ?? null,
    updatedAt: handle.updatedAt ?? null,
    raw: handle,
  };
}

function explicitStateFileFromFlags(flags = {}) {
  const value = flags.stateFile ?? process.env.REALBROWSER_STATE_FILE;
  return value ? path.resolve(value) : "";
}

function stateFileFromHandle(handle) {
  if (handle.stateFile) {
    return path.resolve(handle.stateFile);
  }
  if (handle.session) {
    return stateFileForSessionName(handle.session);
  }
  throw new Error(`Realbrowser handle is missing session/stateFile: ${handle.path}`);
}

function handleTargetDescription(handle) {
  const target = handle.targetId ? ` page ${handle.pageId} target ${handle.targetId}` : ` page ${handle.pageId}`;
  return handle.session
    ? `session "${handle.session}"${target}`
    : `state file "${handle.stateFile}"${target}`;
}

function staleHandleError(handle, reason) {
  return new Error([
    `Stale realbrowser handle: ${handle.path}`,
    `Target: ${handleTargetDescription(handle)}.`,
    reason,
    "Run `realbrowser claim ... --handle-name <name>` again, or release the stale handle.",
  ].join("\n"));
}

async function validateHandleTarget(handle) {
  const stateFile = stateFileFromHandle(handle);
  const state = await readJson(stateFile);
  if (!state?.pid || !isProcessAlive(state.pid)) {
    throw staleHandleError(handle, `The recorded daemon is not running for ${stateFile}.`);
  }
  try {
    await health(state);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw staleHandleError(handle, `The recorded daemon is not healthy: ${reason}`);
  }
  const pagesResult = await daemonRpc(state, { command: "tabs", args: [], flags: {} });
  const pages = parseListPagesResult(pagesResult);
  const page = handle.targetId
    ? pages.find((entry) => entry.targetId === handle.targetId) ?? pages.find((entry) => entry.id === handle.pageId)
    : pages.find((entry) => entry.id === handle.pageId);
  if (!page) {
    throw staleHandleError(handle, `Page ${handle.pageId} is no longer open in the recorded daemon.`);
  }
  return { state, stateFile, page };
}

function handleAwareCommands() {
  return new Set(
    allCliCommandSpecs()
      .filter((spec) => spec.handle)
      .flatMap((spec) => commandNames(spec)),
  );
}

async function applyHandleToFlags(command, flags = {}) {
  if (!handleAwareCommands().has(command)) {
    return null;
  }
  const handlePath = handlePathFromFlags(flags);
  if (!handlePath) {
    return null;
  }
  const handle = await readHandleFile(handlePath);
  const requestedSession = sessionNameFromFlags(flags);
  if (requestedSession && handle.session && requestedSession !== handle.session) {
    throw new Error(`--handle session mismatch: handle uses "${handle.session}", command passed "${requestedSession}"`);
  }
  const requestedStateFile = explicitStateFileFromFlags(flags);
  if (requestedStateFile && handle.stateFile && requestedStateFile !== handle.stateFile) {
    throw new Error(`--handle state-file mismatch: handle uses "${handle.stateFile}", command passed "${requestedStateFile}"`);
  }
  if (flags.page !== undefined && parsePageId(flags.page) !== handle.pageId) {
    throw new Error(`--handle page mismatch: handle uses page ${handle.pageId}, command passed page ${flags.page}`);
  }
  await validateHandleTarget(handle);
  if (!flags.stateFile && handle.stateFile) {
    flags.stateFile = handle.stateFile;
  }
  if (!flags.session && handle.session) {
    flags.session = handle.session;
  }
  if (flags.page === undefined) {
    flags.page = String(handle.pageId);
  }
  if (!flags.targetId && handle.targetId) {
    flags.targetId = handle.targetId;
  }
  flags.resolvedHandle = handle.path;
  return handle;
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function readJsonSync(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(file, value, mode = 0o600, options = {}) {
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (options.overwrite === false) {
    await fsp.writeFile(file, body, { mode, flag: "wx" });
    await fsp.chmod(file, mode).catch(() => {});
    return;
  }
  const tempFile = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    await fsp.writeFile(tempFile, body, { mode });
    await fsp.chmod(tempFile, mode).catch(() => {});
    await fsp.rename(tempFile, file);
    await fsp.chmod(file, mode).catch(() => {});
  } catch (error) {
    await fsp.rm(tempFile, { force: true }).catch(() => {});
    throw error;
  }
}

function isProcessAlive(pid) {
  if (!pid || !Number.isInteger(pid)) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep the plain text body.
  }
  if (!response.ok) {
    const message = typeof body === "object" && body?.error ? body.error : text;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return body;
}

async function acquireLock(lockFile) {
  await fsp.mkdir(path.dirname(lockFile), { recursive: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const fd = fs.openSync(lockFile, "wx", 0o600);
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      return async () => {
        await fsp.rm(lockFile, { force: true });
      };
    } catch {
      const holder = Number.parseInt((await fsp.readFile(lockFile, "utf8").catch(() => "")).trim(), 10);
      if (!holder || !isProcessAlive(holder)) {
        await fsp.rm(lockFile, { force: true });
        continue;
      }
      await sleep(100);
    }
  }
  throw new Error(`Timed out waiting for daemon lock: ${lockFile}`);
}

async function health(state) {
  const body = await fetchJson(`http://127.0.0.1:${state.port}/health`, {
    signal: AbortSignal.timeout(2000),
  });
  if (state?.pid && body?.pid !== state.pid) {
    throw new Error(`daemon health pid mismatch: expected ${state.pid}, got ${body?.pid ?? "unknown"}`);
  }
  if (state && body && typeof body === "object") {
    state.__health = body;
  }
  return body;
}

function desiredMode(flags = {}) {
  if (flags.anonymous || process.env.REALBROWSER_ANONYMOUS === "1") {
    return ANONYMOUS_MODE;
  }
  if (flags.dedicated) {
    return DEDICATED_MODE;
  }
  const envMode = process.env.REALBROWSER_MODE;
  if (envMode === ANONYMOUS_MODE || envMode === DEDICATED_MODE || envMode === AUTO_MODE) {
    return envMode;
  }
  return AUTO_MODE;
}

function parseBooleanEnv(value) {
  if (value === undefined || value === "") {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

function hasExplicitHeadlessSelection(flags = {}) {
  return (
    typeof flags.headless === "boolean" ||
    flags.headed === true ||
    flags.front === true ||
    parseBooleanEnv(process.env.REALBROWSER_HEADLESS) !== null ||
    parseBooleanEnv(process.env.REALBROWSER_HEADED) !== null
  );
}

function desiredHeadless(flags = {}, mode = desiredMode(flags)) {
  if (flags.front || flags.headed === true) {
    return false;
  }
  if (typeof flags.headless === "boolean") {
    return flags.headless;
  }
  const envHeaded = parseBooleanEnv(process.env.REALBROWSER_HEADED);
  if (envHeaded === true) {
    return false;
  }
  const envHeadless = parseBooleanEnv(process.env.REALBROWSER_HEADLESS);
  if (envHeadless !== null) {
    return envHeadless;
  }
  return mode === ANONYMOUS_MODE || mode === DEDICATED_MODE;
}

function managedIdleTimeoutMsForMode(mode) {
  return mode === ANONYMOUS_MODE || mode === DEDICATED_MODE
    ? DEFAULT_MANAGED_IDLE_TIMEOUT_MS
    : 0;
}

function profileDirForMode(mode, flags = {}) {
  const configured = flags.profileDir ?? process.env.REALBROWSER_PROFILE_DIR;
  if (configured) {
    return path.resolve(configured);
  }
  if (
    mode === ANONYMOUS_MODE &&
    !flags.keepAnonymous &&
    process.env.REALBROWSER_KEEP_ANONYMOUS !== "1"
  ) {
    return "";
  }
  if (mode !== ANONYMOUS_MODE) {
    const sessionName = sessionNameFromFlags(flags);
    if (sessionName && sessionName !== "default") {
      return path.join(DEFAULT_PROFILE_DIR, "sessions", encodeURIComponent(sessionName));
    }
  }
  return mode === ANONYMOUS_MODE ? "" : DEFAULT_PROFILE_DIR;
}

function modeKey(flags = {}) {
  const mode = desiredMode(flags);
  return JSON.stringify({
    mode,
    browserUrl: flags.browserUrl ?? process.env.REALBROWSER_BROWSER_URL ?? "",
    profileDir: profileDirForMode(mode, flags),
    headless: desiredHeadless(flags, mode),
    packageSpec: PACKAGE_SPEC,
    noFallback: Boolean(flags.noFallback || process.env.REALBROWSER_NO_FALLBACK === "1"),
    keepAnonymous: Boolean(flags.keepAnonymous || process.env.REALBROWSER_KEEP_ANONYMOUS === "1"),
  });
}

function hasExplicitBrowserTargetSelection(flags = {}) {
  const envMode = process.env.REALBROWSER_MODE;
  return Boolean(
    flags.anonymous ||
    flags.dedicated ||
    flags.backend ||
    flags.browserUrl ||
    flags.profileDir ||
    hasExplicitHeadlessSelection(flags) ||
    flags.keepAnonymous ||
    (envMode && envMode !== AUTO_MODE) ||
    process.env.REALBROWSER_ANONYMOUS === "1" ||
    process.env.REALBROWSER_BROWSER_URL ||
    process.env.REALBROWSER_PROFILE_DIR ||
    parseBooleanEnv(process.env.REALBROWSER_HEADLESS) !== null ||
    parseBooleanEnv(process.env.REALBROWSER_HEADED) !== null ||
    process.env.REALBROWSER_KEEP_ANONYMOUS === "1",
  );
}

function hasExplicitDaemonSelection(flags = {}) {
  return Boolean(
    hasExplicitBrowserTargetSelection(flags) ||
    flags.noFallback ||
    process.env.REALBROWSER_NO_FALLBACK === "1",
  );
}

async function anonymousProfileDirForStart(flags = {}) {
  const configured = flags.profileDir ?? process.env.REALBROWSER_PROFILE_DIR;
  if (configured) {
    return path.resolve(configured);
  }
  return await fsp.mkdtemp(path.join(os.tmpdir(), "realbrowser-anonymous-"));
}

function shouldReplaceExistingDaemon(state, expectedModeKey, flags = {}, explicitSelection = false) {
  if (state && flags.restartDaemon) {
    return true;
  }
  if (!state || state.modeKey === expectedModeKey) {
    return false;
  }
  if (!explicitSelection) {
    return false;
  }
  if (
    desiredMode(flags) === AUTO_MODE &&
    isRealProfileSessionMode(modeFromState(state)) &&
    !hasExplicitBrowserTargetSelection(flags)
  ) {
    return false;
  }
  if (
    desiredMode(flags) === ANONYMOUS_MODE &&
    !flags.profileDir &&
    !process.env.REALBROWSER_PROFILE_DIR &&
    !hasExplicitHeadlessSelection(flags) &&
    modeFromState(state) === ANONYMOUS_MODE
  ) {
    return false;
  }
  return true;
}

function applyRestartDaemonInheritance(flags = {}, state = null) {
  if (!flags.restartDaemon || !state?.modeKey || hasExplicitBrowserTargetSelection(flags)) {
    return flags;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(state.modeKey);
  } catch {
    return flags;
  }
  if (parsed.browserUrl) {
    flags.browserUrl = String(parsed.browserUrl);
  }
  if (parsed.mode === ANONYMOUS_MODE) {
    flags.anonymous = true;
    flags.dedicated = false;
  } else if (parsed.mode === DEDICATED_MODE) {
    flags.dedicated = true;
  }
  if (parsed.profileDir) {
    flags.profileDir = String(parsed.profileDir);
  }
  if (parsed.keepAnonymous === true) {
    flags.keepAnonymous = true;
  }
  if (parsed.noFallback === true) {
    flags.noFallback = true;
  }
  if (typeof parsed.headless === "boolean") {
    flags.headless = parsed.headless;
    flags.headed = parsed.headless === false;
  }
  return flags;
}

async function stopState(state) {
  if (!state?.pid || !isProcessAlive(state.pid)) {
    return;
  }
  try {
    await health(state);
  } catch {
    return;
  }
  try {
    await fetchJson(`http://127.0.0.1:${state.port}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify({ command: "stop" }),
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {
      // Best effort.
    }
  }
}

async function listKnownSessions(flags = {}) {
  const candidates = new Map();
  const active = await readActiveSessionRecord(flags);
  const addCandidate = (filePath, fallbackName) => {
    if (!filePath) {
      return;
    }
    candidates.set(path.resolve(filePath), fallbackName);
  };
  addCandidate(DEFAULT_STATE_FILE, "default");
  const sessionFiles = await fsp.readdir(DEFAULT_SESSION_DIR).catch(() => []);
  for (const fileName of sessionFiles) {
    if (fileName.endsWith(".json")) {
      const filePath = path.join(DEFAULT_SESSION_DIR, fileName);
      addCandidate(filePath, sessionNameFromStateFile(filePath));
    }
  }
  if (flags.stateFile) {
    addCandidate(stateFileFromFlags(flags), sessionNameFromStateFile(stateFileFromFlags(flags)));
  }
  if (flags.session) {
    addCandidate(stateFileForSessionName(flags.session), String(flags.session));
  }

  const sessions = [];
  for (const [stateFile, fallbackName] of candidates) {
    const state = await readJson(stateFile);
    if (!state || !isProcessAlive(state.pid)) {
      continue;
    }
    const healthBody = await health(state).catch(() => null);
    if (!healthBody?.ok) {
      continue;
    }
    const name = state.session ?? fallbackName;
    sessions.push({
      name,
      stateFile,
      pid: state.pid,
      startedAt: state.startedAt,
      mode: healthBody.mode ?? modeFromState(state) ?? "unknown",
      headless: healthBody.headless ?? headlessFromState(state),
      noFallback: healthBody.noFallback ?? noFallbackFromState(state),
      mcpConnected: Boolean(healthBody.mcpConnected),
      version: healthBody.version ?? state.version ?? null,
      scriptHash: healthBody.scriptHash ?? state.scriptHash ?? null,
      capabilities: Array.isArray(healthBody.capabilities) ? healthBody.capabilities : (state.capabilities ?? []),
      active: active.active && name === active.name && active.running,
      state,
    });
  }
  return sessions.sort((a, b) => (
    a.name.localeCompare(b.name) ||
    a.stateFile.localeCompare(b.stateFile)
  ));
}

function isRealProfileSessionMode(mode) {
  return mode === AUTO_MODE || mode === "browserUrl";
}

function allowsProfileReattach(flags = {}) {
  return Boolean(
    flags.allowProfileReattach ||
    process.env.REALBROWSER_ALLOW_PROFILE_REATTACH === "1" ||
    process.env.REALBROWSER_ALLOW_REAL_PROFILE_REATTACH === "1",
  );
}

function allowsProfileControllerStart(flags = {}, context = {}) {
  return Boolean(
    allowsProfileReattach(flags) ||
    flags.allowAttach ||
    process.env.REALBROWSER_ALLOW_PROFILE_CONTROL === "1" ||
    context.browserUrl ||
    context.reusedRealProfileSession ||
    flags.reusedRealProfileSession ||
    context.chromeRemoteDebugging?.userEnabled === true,
  );
}

async function allowsProfileControllerStartForCurrentChrome(flags = {}, context = {}) {
  if (allowsProfileControllerStart(flags, context)) {
    return true;
  }
  const chromeRemoteDebugging = await localChromeRemoteDebuggingStatus().catch(() => null);
  return allowsProfileControllerStart(flags, { ...context, chromeRemoteDebugging });
}

function wouldRestartLiveRealProfileDaemon(state, flags = {}) {
  return Boolean(
    flags.restartDaemon &&
    state?.pid &&
    isProcessAlive(state.pid) &&
    isRealProfileSessionMode(modeFromState(state)),
  );
}

function assertRealProfileRestartAllowed(state, flags = {}) {
  if (!wouldRestartLiveRealProfileDaemon(state, flags) || allowsProfileReattach(flags)) {
    return;
  }
  const session = state?.session ?? sessionNameFromStateFile(state?.stateFile ?? "");
  const sessionFlag = session ? ` --session "${session}"` : "";
  throw usageError([
    "Refusing to restart a live real Chrome profile daemon because Chrome may show another \"Allow remote debugging?\" approval dialog.",
    "Reuse the existing daemon for normal CDP-backed commands, or run only commands supported by the current daemon.",
    `If you intentionally want to replace this controller, rerun with \`--restart-daemon --allow-profile-reattach${sessionFlag}\`.`,
  ].join("\n"));
}

function shouldReuseExistingRealProfileSession(flags = {}) {
  if (desiredMode(flags) !== AUTO_MODE) {
    return false;
  }
  if (realProfileEndpointFromFlags(flags)) {
    return false;
  }
  const envMode = process.env.REALBROWSER_MODE;
  if (
    flags.stateFile ||
    flags.handle ||
    flags.profile ||
    flags.profileDir ||
    flags.keepAnonymous ||
    process.env.REALBROWSER_STATE_FILE ||
    process.env.REALBROWSER_HANDLE ||
    (envMode && envMode !== AUTO_MODE) ||
    process.env.REALBROWSER_ANONYMOUS === "1" ||
    process.env.REALBROWSER_PROFILE_DIR ||
    process.env.REALBROWSER_KEEP_ANONYMOUS === "1"
  ) {
    return false;
  }
  return true;
}

function realProfileEndpointFromFlags(flags = {}) {
  return (
    flags.browserUrl ??
    flags.cdpUrl ??
    process.env.REALBROWSER_BROWSER_URL ??
    process.env.REALBROWSER_CDP_URL ??
    ""
  ).trim();
}

function browserUrlFromState(state) {
  if (!state?.modeKey) {
    return "";
  }
  try {
    return String(JSON.parse(state.modeKey)?.browserUrl ?? "").trim();
  } catch {
    return "";
  }
}

function headlessFromState(state) {
  if (!state?.modeKey) {
    return null;
  }
  try {
    const value = JSON.parse(state.modeKey)?.headless;
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

function browserEndpointEquivalent(left, right) {
  const a = String(left ?? "").trim();
  const b = String(right ?? "").trim();
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  return normalizeCdpHttpUrl(a) !== null && normalizeCdpHttpUrl(a) === normalizeCdpHttpUrl(b);
}

function normalizeBrowserEndpoint(endpointOrUrl) {
  if (!endpointOrUrl) {
    return null;
  }
  if (typeof endpointOrUrl === "string") {
    return browserTabEndpoints([], { browserUrl: endpointOrUrl })[0] ?? null;
  }
  const httpUrl = normalizeCdpHttpUrl(endpointOrUrl.httpUrl ?? endpointOrUrl.browserUrl ?? endpointOrUrl.wsEndpoint);
  const wsEndpoint = normalizeCdpWsEndpoint(endpointOrUrl.wsEndpoint ?? endpointOrUrl.browserUrl);
  if (!httpUrl && !wsEndpoint) {
    return null;
  }
  return {
    ...endpointOrUrl,
    httpUrl,
    wsEndpoint,
  };
}

async function ensureEndpointSession(endpointOrUrl, flags = {}, options = {}) {
  const endpoint = normalizeBrowserEndpoint(endpointOrUrl);
  if (!endpoint || flags.stateFile || flags.handle) {
    return null;
  }
  const existing = await runningEndpointSession(endpoint);
  if (existing && reusableEndpointSessionMatchesFlags(existing, endpoint, flags)) {
    if (options.mutateFlags !== false) {
      flags.session = existing.name;
      flags.reusedRealProfileSession = existing.name;
    }
    return { ...existing, endpoint, started: false };
  }
  if (options.start === false) {
    return null;
  }
  const browserUrl = endpoint.wsEndpoint ?? endpoint.httpUrl;
  const attachFlags = {
    ...flags,
    browserUrl,
    noFallback: true,
  };
  if (!sessionNameFromFlags(attachFlags) && !attachFlags.stateFile) {
    attachFlags.session = autoSessionNameForBrowserTab({ browserUrl });
  }
  const state = await ensureDaemon(attachFlags);
  const name = sessionNameForState(state, attachFlags);
  if (options.mutateFlags !== false) {
    flags.session = name;
    flags.reusedRealProfileSession = name;
  }
  const healthBody = state.__health ?? await health(state).catch(() => null);
  return {
    name,
    stateFile: stateFileFromFlags({ ...attachFlags, session: name }),
    pid: state.pid,
    startedAt: state.startedAt,
    mode: healthBody?.mode ?? modeFromState(state) ?? "browserUrl",
    noFallback: healthBody?.noFallback ?? noFallbackFromState(state),
    mcpConnected: Boolean(healthBody?.mcpConnected),
    version: healthBody?.version ?? state.version ?? null,
    scriptHash: healthBody?.scriptHash ?? state.scriptHash ?? null,
    capabilities: Array.isArray(healthBody?.capabilities) ? healthBody.capabilities : (state.capabilities ?? []),
    active: false,
    state,
    endpoint,
    started: true,
  };
}

function reusableEndpointSessionMatchesFlags(session, endpoint, flags = {}) {
  if (!session?.state) {
    return false;
  }
  const requestedBrowserUrl = endpoint?.wsEndpoint ?? endpoint?.httpUrl ?? realProfileEndpointFromFlags(flags);
  if (!requestedBrowserUrl) {
    return true;
  }
  const expectedFlags = {
    ...flags,
    browserUrl: requestedBrowserUrl,
    noFallback: true,
  };
  if (!sessionNameFromFlags(expectedFlags) && session?.name) {
    expectedFlags.session = session.name;
  }
  const expectedModeKey = modeKey(expectedFlags);
  return session.state.modeKey === expectedModeKey;
}

async function reuseExistingEndpointSession(flags = {}) {
  const endpoint = realProfileEndpointFromFlags(flags);
  if (!endpoint || flags.force || flags.restartDaemon || flags.stateFile || flags.handle) {
    return null;
  }
  const sessions = await listKnownSessions({ noActiveSession: true });
  const reusable = sessions.find((session) =>
    isRealProfileSessionMode(session.mode) &&
    browserEndpointEquivalent(browserUrlFromState(session.state), endpoint)
  );
  if (!reusable) {
    return null;
  }
  const normalizedEndpoint = normalizeBrowserEndpoint(endpoint);
  if (!reusableEndpointSessionMatchesFlags(reusable, normalizedEndpoint, flags)) {
    return null;
  }
  if (flags.session !== reusable.name) {
    flags.session = reusable.name;
    flags.reusedRealProfileSession = reusable.name;
  }
  return reusable;
}

function shouldUseRealProfileAttachLock(flags = {}) {
  if (desiredMode(flags) !== AUTO_MODE) {
    return false;
  }
  return (
    shouldReuseExistingRealProfileSession(flags) || Boolean(realProfileEndpointFromFlags(flags))
  );
}

function applyEndpointScopedRealProfileSession(flags = {}) {
  if (desiredMode(flags) !== AUTO_MODE) {
    return;
  }
  if (
    flags.session ||
    flags.stateFile ||
    flags.handle ||
    process.env.REALBROWSER_SESSION ||
    process.env.REALBROWSER_STATE_FILE ||
    process.env.REALBROWSER_HANDLE
  ) {
    return;
  }
  const endpoint = realProfileEndpointFromFlags(flags);
  if (!endpoint) {
    return;
  }
  flags.session = autoSessionNameForBrowserTab({ browserUrl: endpoint });
}

async function prepareRealProfileSessionFlags(flags = {}) {
  if (desiredMode(flags) !== AUTO_MODE) {
    return null;
  }
  const endpoint = realProfileEndpointFromFlags(flags);
  if (endpoint && !flags.stateFile && !flags.handle) {
    if (!flags.force && !flags.restartDaemon) {
      const reusable = await ensureEndpointSession(endpoint, flags, { start: false });
      if (reusable) {
        return reusable;
      }
    }
    applyEndpointScopedRealProfileSession(flags);
    return null;
  }
  return await reuseExistingRealProfileSession(flags);
}

async function reuseExistingRealProfileSession(flags = {}) {
  if (flags.restartDaemon) {
    return null;
  }
  if (!shouldReuseExistingRealProfileSession(flags)) {
    return null;
  }
  const requestedSession = sessionNameFromFlags(flags);
  if (requestedSession) {
    const requestedState = await readJson(stateFileForSessionName(requestedSession));
    if (requestedState?.pid && isProcessAlive(requestedState.pid)) {
      const requestedHealth = await health(requestedState).catch(() => null);
      if (requestedHealth?.ok) {
        return null;
      }
    }
  } else if (activeSessionNameFromFlags(flags)) {
    return null;
  }
  const sessions = await listKnownSessions({ noActiveSession: true });
  const reusable =
    sessions.find((session) => session.name === "default" && isRealProfileSessionMode(session.mode)) ??
    sessions.find((session) => isRealProfileSessionMode(session.mode));
  if (!reusable) {
    return null;
  }
  if (reusable.name !== requestedSession && (requestedSession || reusable.name !== "default")) {
    flags.session = reusable.name;
    flags.reusedRealProfileSession = reusable.name;
  }
  return reusable;
}

async function ensureDaemon(flags = {}) {
  if (!shouldUseRealProfileAttachLock(flags)) {
    return await ensureDaemonUnlocked(flags);
  }
  const release = await acquireLock(REAL_PROFILE_ATTACH_LOCK_FILE);
  try {
    const endpointReusable = await reuseExistingEndpointSession(flags);
    if (endpointReusable?.state) {
      return endpointReusable.state;
    }
    const reusable = await reuseExistingRealProfileSession(flags);
    if (reusable?.state) {
      return reusable.state;
    }
    return await ensureDaemonUnlocked(flags);
  } finally {
    await release();
  }
}

async function ensureDaemonUnlocked(flags = {}) {
  const stateFile = stateFileFromFlags(flags);
  const existing = await readJson(stateFile);
  applyRestartDaemonInheritance(flags, existing);
  assertRealProfileRestartAllowed(existing, flags);
  const expectedModeKey = modeKey(flags);
  const explicitSelection = hasExplicitDaemonSelection(flags);
  if (shouldReplaceExistingDaemon(existing, expectedModeKey, flags, explicitSelection)) {
    await stopState(existing);
  } else if (existing && isProcessAlive(existing.pid)) {
    try {
      await health(existing);
      return existing;
    } catch {
      // Stale state. Start a replacement below.
    }
  }

  const release = await acquireLock(`${stateFile}.lock`);
  try {
    const afterLock = await readJson(stateFile);
    applyRestartDaemonInheritance(flags, afterLock);
    assertRealProfileRestartAllowed(afterLock, flags);
    const afterExpectedModeKey = modeKey(flags);
    const afterExplicitSelection = hasExplicitDaemonSelection(flags);
    if (shouldReplaceExistingDaemon(afterLock, afterExpectedModeKey, flags, afterExplicitSelection)) {
      await stopState(afterLock);
    } else if (afterLock && isProcessAlive(afterLock.pid)) {
      try {
        await health(afterLock);
        return afterLock;
      } catch {
        // Continue and replace.
      }
    }

    await fsp.rm(stateFile, { force: true });
    await fsp.mkdir(stateDir(stateFile), { recursive: true });
    const startMode = desiredMode(flags);
    const startHeadless = desiredHeadless(flags, startMode);
    const keepAnonymous = flags.keepAnonymous || process.env.REALBROWSER_KEEP_ANONYMOUS === "1";
    const startProfileDir = startMode === ANONYMOUS_MODE && keepAnonymous
      ? await anonymousProfileDirForStart(flags)
      : profileDirForMode(startMode, flags);
    const sessionName = effectiveSessionNameFromFlags(flags);
    const env = {
      ...process.env,
      REALBROWSER_STATE_FILE: stateFile,
      REALBROWSER_MODE: startMode,
      REALBROWSER_HEADLESS: startHeadless ? "1" : "0",
      REALBROWSER_PROFILE_DIR: startProfileDir,
      ...(sessionName ? { REALBROWSER_SESSION: sessionName } : {}),
      ...(flags.browserUrl ? { REALBROWSER_BROWSER_URL: flags.browserUrl } : {}),
      ...(flags.noFallback ? { REALBROWSER_NO_FALLBACK: "1" } : {}),
      ...(keepAnonymous ? { REALBROWSER_KEEP_ANONYMOUS: "1" } : {}),
    };
    const logFile = path.join(stateDir(stateFile), "daemon.log");
    const out = fs.openSync(logFile, "a");
    const child = spawn(process.execPath, [SCRIPT_PATH, "daemon"], {
      detached: true,
      stdio: ["ignore", out, out],
      env,
    });
    child.unref();

    const startedAt = Date.now();
    while (Date.now() - startedAt < START_TIMEOUT_MS) {
      const state = await readJson(stateFile);
      if (state && isProcessAlive(state.pid)) {
        await health(state);
        return state;
      }
      await sleep(100);
    }
    throw new Error(`Browser daemon did not start within ${START_TIMEOUT_MS}ms. See ${logFile}`);
  } finally {
    await release();
  }
}

async function daemonRpc(state, payload) {
  assertDaemonSupportsPayload(state, payload);
  return await fetchJson(`http://127.0.0.1:${state.port}/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(
      Number.parseInt(process.env.REALBROWSER_RPC_TIMEOUT_MS ?? "120000", 10),
    ),
  });
}

function isDeviceScreenshotsCommand(command) {
  return command === "device-screenshots" || command === "exact-screenshots" || command === "responsive-exact";
}

function screenshotUtilityCapability(command) {
  if (command === "full-screenshot" || command === "full-size-screenshot" || command === "fullpage-screenshot") {
    return "full-screenshot";
  }
  if (command === "area-screenshot" || command === "element-screenshot" || command === "part-screenshot") {
    return "area-screenshot";
  }
  return "";
}

function isMissingDaemonCapabilityError(error, capability) {
  return String(error?.message ?? error).includes(`does not support ${capability}`);
}

async function selectedCdpTargetIdFromDaemon(state, flags = {}) {
  if (flags.targetId) {
    return String(flags.targetId);
  }
  const result = await daemonRpc(state, { command: "tabs", args: [], flags: {} }).catch(() => null);
  const pages = parseListPagesResult(result);
  if (pages.length === 0) {
    return "";
  }
  if (flags.page !== undefined) {
    const requested = String(flags.page);
    const match = pages.find((page) =>
      String(page.id) === requested ||
      page.tabId === requested ||
      page.suggestedTargetId === requested ||
      page.targetId === requested
    );
    return match?.targetId ?? "";
  }
  const selected = pages.find((page) => page.selected);
  if (selected?.targetId) {
    return selected.targetId;
  }
  return pages.length === 1 ? pages[0].targetId ?? "" : "";
}

async function maybeRunDeviceScreenshotsWithTemporaryDaemon(state, payload, flags = {}, error) {
  if (!isDeviceScreenshotsCommand(payload?.command) || !isMissingDaemonCapabilityError(error, "device-screenshots")) {
    return null;
  }
  return await runPayloadWithTemporaryCurrentDaemon(state, payload, flags, "device-screenshots");
}

async function maybeRunScreenshotUtilityWithTemporaryDaemon(state, payload, flags = {}, error) {
  const capability = screenshotUtilityCapability(payload?.command);
  if (!capability || !isMissingDaemonCapabilityError(error, capability)) {
    return null;
  }
  return await runPayloadWithTemporaryCurrentDaemon(state, payload, flags, capability);
}

function isRoutineRealProfileCommand(command) {
  return new Set([
    "console",
    "errors",
    "network",
    "requests",
    "observe",
    "capture-console",
    "console-capture",
    "capture-logs",
    "logs-capture",
    "capture-network",
    "network-capture",
    "capture-requests",
    "screenshot",
    "device-screenshots",
    "exact-screenshots",
    "responsive-exact",
    "full-screenshot",
    "full-size-screenshot",
    "fullpage-screenshot",
    "area-screenshot",
    "element-screenshot",
    "part-screenshot",
  ]).has(command);
}

function shouldPreferSingleMcpController(command, args = []) {
  if ([
    "network",
    "requests",
    "capture-network",
    "network-capture",
    "capture-requests",
  ].includes(command)) {
    return true;
  }
  return false;
}

function preferSingleMcpControllerFlags(command, args = [], flags = {}, context = {}) {
  if (
    flags.mcp === true ||
    flags.fast === false ||
    context.mode === ANONYMOUS_MODE ||
    context.mode === DEDICATED_MODE ||
    !context.hasBrowserEndpoint ||
    !shouldPreferSingleMcpController(command, args)
  ) {
    return flags;
  }
  return {
    ...flags,
    mcp: true,
  };
}

function isCurrentCliDaemon(state) {
  const scriptHash = state?.__health?.scriptHash ?? state?.scriptHash ?? "";
  if (scriptHash && scriptHash !== SCRIPT_HASH) {
    return false;
  }
  const scriptPath = state?.__health?.script ?? state?.script ?? "";
  if (scriptPath && path.resolve(scriptPath) !== path.resolve(SCRIPT_PATH)) {
    return false;
  }
  return true;
}

function isProfileControllerStartRefusal(error) {
  const text = String(error?.message ?? error);
  return text.includes("Refusing to start a Chrome DevTools MCP controller for a real Chrome profile");
}

function isMissingRequiredCapabilityError(error, payload) {
  for (const capability of requiredCapabilitiesForPayload(payload)) {
    if (isMissingDaemonCapabilityError(error, capability)) {
      return true;
    }
  }
  return false;
}

function canRouteStaleRealProfileRoutineCommand(state, payload, flags = {}, context = {}) {
  if (!isRoutineRealProfileCommand(payload?.command)) {
    return false;
  }
  if (!isRealProfileSessionMode(modeFromState(state))) {
    return false;
  }
  if (isCurrentCliDaemon(state) && !context.profileControllerStartRefused) {
    return false;
  }
  return allowsProfileControllerStart(flags, {
    browserUrl: browserUrlFromState(state) || realProfileEndpointFromFlags(flags),
    reusedRealProfileSession: flags.reusedRealProfileSession,
    chromeRemoteDebugging: context.chromeRemoteDebugging,
  });
}

async function maybeRunRoutineCommandWithCurrentEndpointDaemon(state, payload, flags = {}, error = null) {
  const chromeRemoteDebugging = await localChromeRemoteDebuggingStatus().catch(() => null);
  if (!canRouteStaleRealProfileRoutineCommand(state, payload, flags, {
    chromeRemoteDebugging,
    profileControllerStartRefused: isProfileControllerStartRefusal(error),
  })) {
    return null;
  }
  try {
    const routed = await runPayloadWithEndpointSessionWhenAvailable(state, payload, flags);
    if (routed) {
      return routed;
    }
    const stableRouted = await runPayloadWithStableAutoConnectSession(state, payload, flags);
    if (stableRouted) {
      return stableRouted;
    }
  } catch (routeError) {
    if (!isProfileControllerStartRefusal(routeError) && !isMissingRequiredCapabilityError(routeError, payload)) {
      throw routeError;
    }
    const stableRouted = await runPayloadWithFreshEndpointSession(state, payload, flags).catch((freshError) => {
      if (!isProfileControllerStartRefusal(freshError) && !isMissingRequiredCapabilityError(freshError, payload)) {
        throw freshError;
      }
      return null;
    });
    if (stableRouted) {
      return stableRouted;
    }
    const autoConnectRouted = await runPayloadWithStableAutoConnectSession(state, payload, flags).catch((stableError) => {
      if (!isProfileControllerStartRefusal(stableError) && !isMissingRequiredCapabilityError(stableError, payload)) {
        throw stableError;
      }
      return null;
    });
    if (autoConnectRouted) {
      return autoConnectRouted;
    }
  }
  return await runPayloadWithTemporaryCurrentDaemon(state, payload, flags, "routine");
}

async function routingBrowserUrlForRealProfile(state, flags = {}) {
  const explicit = browserUrlFromState(state) || realProfileEndpointFromFlags(flags);
  if (explicit) {
    return explicit;
  }
  const profiles = await listBrowserProfiles({ browser: flags.browser, active: true }).catch(() => []);
  const endpoint = browserTabEndpoints(profiles, flags)[0] ?? null;
  return endpoint?.wsEndpoint ?? endpoint?.httpUrl ?? "";
}

async function runPayloadWithEndpointSessionWhenAvailable(state, payload, flags = {}) {
  const browserUrl = await routingBrowserUrlForRealProfile(state, flags);
  if (!browserUrl) {
    return null;
  }
  const routeFlags = {
    ...payload.flags,
    browserUrl,
    noFallback: true,
    noActiveSession: true,
  };
  if (!routeFlags.targetId) {
    const targetId = await selectedCdpTargetIdFromDaemon(state, flags);
    if (targetId) {
      routeFlags.targetId = targetId;
    }
  }
  const endpointSession = await ensureEndpointSession(browserUrl, routeFlags, { mutateFlags: false });
  if (!endpointSession?.state) {
    return null;
  }
  const result = await daemonRpc(endpointSession.state, {
    command: payload.command,
    args: payload.args,
    flags: routeFlags,
  });
  if (endpointSession.name && shouldActivateSession(flags)) {
    await writeActiveSessionName(endpointSession.name);
  }
  return result;
}

async function runPayloadWithFreshEndpointSession(state, payload, flags = {}) {
  const browserUrl = await routingBrowserUrlForRealProfile(state, flags);
  if (!browserUrl || flags.stateFile || flags.handle) {
    return null;
  }
  const endpoint = normalizeBrowserEndpoint(browserUrl);
  if (!endpoint) {
    return null;
  }
  const session = autoSessionNameForBrowserTab({ browserUrl: endpoint.wsEndpoint ?? endpoint.httpUrl });
  const routeFlags = {
    ...payload.flags,
    browserUrl: endpoint.wsEndpoint ?? endpoint.httpUrl,
    noFallback: true,
    noActiveSession: true,
    session,
  };
  if (!routeFlags.targetId) {
    const targetId = await selectedCdpTargetIdFromDaemon(state, flags);
    if (targetId) {
      routeFlags.targetId = targetId;
    }
  }
  const existing = await runningEndpointSession(endpoint);
  if (existing?.state && !isCurrentCliDaemon(existing.state)) {
    await stopState(existing.state).catch(() => {});
  }
  const freshState = await ensureDaemon(routeFlags);
  const result = await daemonRpc(freshState, {
    command: payload.command,
    args: payload.args,
    flags: routeFlags,
  });
  if (shouldActivateSession(flags)) {
    await writeActiveSessionName(session);
  }
  return result;
}

async function runPayloadWithStableAutoConnectSession(state, payload, flags = {}) {
  if (
    browserUrlFromState(state) ||
    realProfileEndpointFromFlags(flags) ||
    flags.stateFile ||
    flags.handle ||
    flags.noActiveSession ||
    !isRealProfileSessionMode(modeFromState(state))
  ) {
    return null;
  }
  const routeFlags = {
    ...payload.flags,
  };
  if (!isCurrentCliDaemon(state)) {
    await stopState(state).catch(() => {});
  }
  const stableState = await ensureDaemon(routeFlags);
  if (!isCurrentCliDaemon(stableState)) {
    return null;
  }
  const result = await daemonRpc(stableState, {
    command: payload.command,
    args: payload.args,
    flags: routeFlags,
  });
  const sessionName = sessionNameForState(stableState, routeFlags);
  if (sessionName && shouldActivateSession(flags)) {
    await writeActiveSessionName(sessionName);
  }
  return result;
}

async function runPayloadWithTemporaryCurrentDaemon(state, payload, flags = {}, capability = "command") {
  const browserUrl = browserUrlFromState(state) || realProfileEndpointFromFlags(flags);
  if (!isRealProfileSessionMode(modeFromState(state)) && !browserUrl) {
    return null;
  }
  const tempFlags = {
    ...payload.flags,
    noFallback: true,
    noActiveSession: true,
    session: "",
    stateFile: path.join(os.tmpdir(), `realbrowser-${capability}-${process.pid}-${Date.now()}.json`),
  };
  if (browserUrl) {
    tempFlags.browserUrl = browserUrl;
  }
  if (!tempFlags.targetId) {
    const targetId = await selectedCdpTargetIdFromDaemon(state, flags);
    if (targetId) {
      tempFlags.targetId = targetId;
    }
  }
  const tempState = await ensureDaemon(tempFlags);
  try {
    return await daemonRpc(tempState, {
      command: payload.command,
      args: payload.args,
      flags: tempFlags,
    });
  } finally {
    await stopState(tempState).catch(() => {});
  }
}

function daemonCapabilitiesFrom(value) {
  const capabilities = value?.__health?.capabilities ?? value?.capabilities;
  return new Set(Array.isArray(capabilities) ? capabilities.map((entry) => String(entry)) : []);
}

function daemonSupports(state, capability) {
  return daemonCapabilitiesFrom(state).has(capability);
}

function requiredCapabilitiesForCommand(command, args = []) {
  const needsForegroundReadiness = args.includes("--foreground-until-ready") ||
    args.includes("--front-until-ready") ||
    args.some((arg) => String(arg).startsWith("--foreground-until-ready=") || String(arg).startsWith("--front-until-ready="));
  switch (command) {
    case "open":
    case "newtab":
    case "claim":
    case "claim-tab":
    case "handle-claim":
      return needsForegroundReadiness ? new Set(["foreground-readiness"]) : new Set();
    case "wait":
      return args.includes("--visible") || args.includes("--selector") || args.some((arg) => String(arg).startsWith("--selector="))
        ? new Set(["visible-wait"])
        : new Set();
    case "wait-ready":
    case "ready":
      return new Set(["foreground-readiness"]);
    case "eval":
    case "js":
    case "text":
    case "html":
    case "url":
    case "forms":
    case "cookies":
    case "storage":
    case "perf":
    case "css":
    case "attrs":
    case "is":
      return args.includes("--raw") ? new Set(["bounded-raw-output"]) : new Set();
    case "snapshot-dom":
      return new Set(["snapshot-dom"]);
    case "snapshot-aria":
      return new Set(["snapshot-aria"]);
    case "snapshot":
    case "accessibility":
      return args.includes("--selector") || args.some((arg) => String(arg).startsWith("--selector="))
        ? new Set(["snapshot-selector"])
        : new Set();
    case "query-selector":
      return new Set(["query-selector"]);
    case "links":
      return new Set(["filtered-links"]);
    case "device-screenshots":
    case "exact-screenshots":
    case "responsive-exact":
      return new Set(["device-screenshots"]);
    case "full-screenshot":
    case "full-size-screenshot":
    case "fullpage-screenshot":
      return new Set(["full-screenshot"]);
    case "area-screenshot":
    case "element-screenshot":
    case "part-screenshot":
      return new Set(["area-screenshot"]);
    default:
      return new Set();
  }
}

function requiredCapabilitiesForPayload(payload) {
  const command = payload?.command;
  const required = requiredCapabilitiesForCommand(command, payload?.args ?? []);
  const flags = payload?.flags ?? {};
  if ((command === "wait") && (flags.visible || flags.selector)) {
    required.add("visible-wait");
  }
  if (flags.foregroundUntilReady) {
    required.add("foreground-readiness");
  }
  if ((command === "snapshot" || command === "accessibility") && flags.selector) {
    required.add("snapshot-selector");
  }
  if (
    (
      command === "eval" ||
      command === "js" ||
      command === "text" ||
      command === "html" ||
      command === "url" ||
      command === "forms" ||
      command === "cookies" ||
      command === "storage" ||
      command === "perf" ||
      command === "css" ||
      command === "attrs" ||
      command === "is"
    ) &&
    flags.raw
  ) {
    required.add("bounded-raw-output");
  }
  if (command !== "chain") {
    return required;
  }
  const rawSteps = Array.isArray(payload?.args) ? payload.args.join(" ") : "";
  try {
    const steps = JSON.parse(rawSteps);
    if (Array.isArray(steps)) {
      for (const step of steps) {
        if (Array.isArray(step) && step.length > 0) {
          for (const capability of requiredCapabilitiesForCommand(String(step[0]), step.slice(1))) {
            required.add(capability);
          }
        }
      }
    }
  } catch {
    // Let the daemon report malformed chain JSON.
  }
  return required;
}

function assertDaemonSupportsPayload(state, payload) {
  const required = requiredCapabilitiesForPayload(payload);
  if (required.size === 0) {
    return;
  }
  const missing = [...required].filter((capability) => !daemonSupports(state, capability));
  if (missing.length === 0) {
    return;
  }
  const session = state?.session ?? sessionNameFromStateFile(state?.stateFile ?? "");
  const command = payload?.command ?? "command";
  const detachCommand = session ? `realbrowser detach --session "${session}"` : "realbrowser detach";
  const realProfile = isRealProfileSessionMode(modeFromState(state));
  const reloadLine = realProfile
    ? "Because this daemon controls a real signed-in Chrome profile, do not restart it casually; a replacement controller may trigger another Chrome remote-debugging approval dialog. Reuse the current daemon when possible, or rerun with `--restart-daemon --allow-profile-reattach` only when you explicitly accept that prompt."
    : `Reload it explicitly with \`--restart-daemon\`, or run \`${detachCommand}\` and then rerun the command.`;
  throw new Error([
    `Running realbrowser daemon pid ${state?.pid ?? "unknown"} does not support ${missing.join(", ")} needed by ${command}.`,
    "It was started by an older copy of this skill, so sending the command would fail or trigger noisy fallbacks.",
    reloadLine,
  ].join(" "));
}

function printResult(value, flagsOrJson = false) {
  const flags = typeof flagsOrJson === "boolean" ? { json: flagsOrJson } : (flagsOrJson ?? {});
  if (flags.quiet) {
    const quiet = value?.quiet ?? value?.path ?? value?.filePath ?? value?.text;
    if (quiet) {
      console.log(formatStdoutText(quiet, READ_STDOUT_HARD_MAX_CHARS, flags));
    }
    return;
  }
  if (flags.json) {
    console.log(formatStdoutJson(value, READ_STDOUT_HARD_MAX_CHARS, flags));
    return;
  }
  if (typeof value === "string") {
    console.log(formatStdoutText(value, READ_STDOUT_HARD_MAX_CHARS, flags));
    return;
  }
  if (value?.text) {
    console.log(formatStdoutText(value.text, READ_STDOUT_HARD_MAX_CHARS, flags));
    return;
  }
  console.log(formatStdoutJson(value, READ_STDOUT_HARD_MAX_CHARS, flags));
}

function allowsFullStdout(flags = {}) {
  return Boolean(
    flags.fullStdout ||
    process.env.REALBROWSER_FULL_STDOUT === "1" ||
    process.env.REALBROWSER_OUTPUT === "full",
  );
}

function autoOutEnabled(flags = {}) {
  return flags.autoOut !== false && process.env.REALBROWSER_AUTO_OUT !== "0";
}

function formatStdoutText(value, maxChars = READ_STDOUT_HARD_MAX_CHARS, flags = {}) {
  const text = String(value ?? "");
  if (allowsFullStdout(flags) || !maxChars || text.length <= maxChars) {
    return text;
  }
  const artifactPath = writeOverflowArtifactSync(text, {
    command: "stdout",
    flags,
    extension: "txt",
  });
  const artifactHint = artifactPath ? ` Full output written to ${artifactPath}.` : "";
  const suffix = `[...STDOUT HARD CAPPED at ${maxChars} chars - use --full-stdout for known-small output, or use --out or another artifact flag for full output.${artifactHint}]`;
  const sliceLength = Math.max(0, maxChars - suffix.length - 2);
  return `${text.slice(0, sliceLength)}\n\n${suffix}`;
}

function formatStdoutJson(value, maxChars = READ_STDOUT_HARD_MAX_CHARS, flags = {}) {
  const direct = JSON.stringify(value, null, 2) ?? "null";
  if (allowsFullStdout(flags) || direct.length <= maxChars) {
    return direct;
  }
  const artifactPath = writeOverflowArtifactSync(direct, {
    command: "stdout-json",
    flags,
    extension: "json",
  });
  const sanitizedValue = sanitizeJsonForStdout(value);
  const sanitizedObject = sanitizedValue && typeof sanitizedValue === "object" && !Array.isArray(sanitizedValue)
    ? sanitizedValue
    : { value: sanitizedValue };
  const sanitized = {
    ...sanitizedObject,
    stdoutTruncated: true,
    originalJsonChars: direct.length,
    stdoutMaxChars: maxChars,
    ...(artifactPath ? { fullOutput: artifactPath } : {}),
    note: "JSON stdout exceeded the realbrowser safety cap; use --full-stdout for known-small output, or --out, --har, --request-file, or --response-file for full artifacts.",
  };
  const sanitizedJson = JSON.stringify(sanitized, null, 2);
  if (sanitizedJson.length <= maxChars) {
    return sanitizedJson;
  }
  return JSON.stringify({
    stdoutTruncated: true,
    originalJsonChars: direct.length,
    stdoutMaxChars: maxChars,
    ...(artifactPath ? { fullOutput: artifactPath } : {}),
    text: formatStdoutText(value?.text ?? direct, 2000, { ...flags, autoOut: false }),
    note: "JSON stdout exceeded the realbrowser safety cap; use an artifact flag for full output.",
  }, null, 2);
}

function sanitizeJsonForStdout(value, options = {}, depth = 0, seen = new WeakSet()) {
  const stringMaxChars = options.stringMaxChars ?? 4000;
  const arrayMaxItems = options.arrayMaxItems ?? 80;
  const depthMax = options.depthMax ?? 8;
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return formatStdoutText(value, stringMaxChars, { autoOut: false });
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  if (depth >= depthMax) {
    return summarizeJsonValueShape(value);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, arrayMaxItems).map((item) =>
        sanitizeJsonForStdout(item, options, depth + 1, seen),
      );
      if (value.length > arrayMaxItems) {
        items.push({ omittedItems: value.length - arrayMaxItems });
      }
      return items;
    }
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = sanitizeJsonForStdout(entry, options, depth + 1, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function summarizeJsonValueShape(value) {
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }
  if (value && typeof value === "object") {
    return `[Object(${Object.keys(value).length} keys)]`;
  }
  return String(value);
}

function printCliError(error, flags = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error?.code ?? "error";
  if (flags.json) {
    console.error(JSON.stringify({ error: { code, message } }, null, 2));
    return;
  }
  console.error(message);
  if (code === "usage") {
    console.error("Use `realbrowser --help` or `realbrowser help <command>`.");
  }
}

async function runCli() {
  const parsed = parseArgv(process.argv.slice(2));
  const { command, args, flags } = parsed;
  if (flags.version || command === "version") {
    printResult({ text: CLI_VERSION, version: CLI_VERSION }, flags);
    return;
  }
  if (command === "help") {
    const requestedCommand = args[0] ?? "";
    if (requestedCommand && !commandSpecFor(requestedCommand, { includeHidden: true })) {
      throw usageError(`Unknown command: ${requestedCommand}`);
    }
    printResult({ text: usage(requestedCommand) }, flags);
    return;
  }
  if (flags.help) {
    if (!commandSpecFor(command, { includeHidden: true })) {
      throw usageError(`Unknown command: ${command}`);
    }
    printResult({ text: usage(command) }, flags);
    return;
  }
  if (command === "self-test") {
    await runSelfTest();
    return;
  }
  if (command === "daemon") {
    await runDaemon();
    return;
  }
  if (!commandSpecFor(command, { includeHidden: true })) {
    throw usageError(`Unknown command: ${command}`);
  }
  validateCommandArgs(command, args);

  if (command === "profiles" || command === "profile-list" || command === "list-profiles") {
    const profiles = await listBrowserProfiles({ query: args[0], browser: flags.browser, active: flags.active });
    printResult({
      text: formatProfileListText(profiles),
      profiles: profiles.map(publicProfileInfo),
    }, flags);
    return;
  }

  if (command === "sessions" || command === "session-list" || command === "list-sessions") {
    const sessions = await listKnownSessions(flags);
    const activeSession = await readActiveSessionRecord(flags);
    printResult({
      text: formatSessionListText(sessions, activeSession),
      sessions: sessions.map(publicSessionInfo),
      activeSession,
    }, flags);
    return;
  }

  if (command === "active-session" || command === "current-session" || command === "session-current") {
    const activeSession = await readActiveSessionRecord(flags);
    printResult({
      text: formatActiveSessionText(activeSession),
      activeSession,
    }, flags);
    return;
  }

  if (command === "use-session" || command === "session-use") {
    requireArgs(command, args, 1);
    const requestedSession = String(args[0] ?? "").trim();
    const matches = await listKnownSessions({ session: requestedSession, noActiveSession: true });
    if (!flags.force && !matches.some((session) => session.name === requestedSession)) {
      throw new Error(`No running realbrowser session named "${requestedSession}". Run \`realbrowser sessions\`, or pass --force to remember it before it starts.`);
    }
    const sessionName = await writeActiveSessionName(requestedSession);
    const activeSession = await readActiveSessionRecord({ ...flags, session: sessionName });
    printResult({
      text: formatActiveSessionText(activeSession),
      activeSession,
    }, flags);
    return;
  }

  if (command === "clear-session" || command === "session-clear" || command === "clear-active-session") {
    await clearActiveSessionName();
    printResult({
      text: "Cleared active realbrowser session.",
      activeSession: {
        name: "",
        active: false,
        running: false,
        stateFile: null,
        updatedAt: null,
      },
    }, flags);
    return;
  }

  if (command === "claim" || command === "claim-tab" || command === "handle-claim") {
    printResult(await claimPageHandle(args, flags), flags);
    return;
  }

  if (command === "handles" || command === "list-handles" || command === "handle-list") {
    printResult(await listPageHandles(), flags);
    return;
  }

  if (command === "release-handle" || command === "handle-release" || command === "delete-handle") {
    printResult(await releasePageHandle(args), flags);
    return;
  }

  if (command === "find-tab" || command === "tabs-all" || command === "search-tabs") {
    await resolveProfileForAutomation(flags);
    const tabs = await findBrowserTabs({
      query: args.join(" "),
      browser: flags.browser,
      browserUrl: flags.browserUrl,
      cdpUrl: flags.cdpUrl,
      allSessions: flags.allSessions || command === "tabs-all",
      session: flags.session || activeSessionNameFromFlags(flags),
      stateFile: flags.stateFile,
    });
    printResult({
      text: formatBrowserTabListText(tabs),
      tabs: tabs.map(publicBrowserTabInfo),
    }, flags);
    return;
  }

  if (command === "select-tab" || command === "attach-tab") {
    requireArgs(command, args, 1);
    await resolveProfileForAutomation(flags);
    printResult(await selectBrowserTabForAutomation(args.join(" "), flags), flags);
    return;
  }

  if (command === "open-profile" || command === "profile-open") {
    requireArgs(command, args, 2);
    printResult(await openUrlInBrowserProfile(args[1], args[0], flags), flags);
    return;
  }

  if (command === "stop" || command === "detach") {
    if (flags.allSessions) {
      const sessions = await listKnownSessions(flags);
      for (const session of sessions) {
        await stopState(session.state).catch(() => {});
      }
      await clearActiveSessionName();
      printResult({
        text: sessions.length > 0
          ? `stopped ${sessions.length} realbrowser session${sessions.length === 1 ? "" : "s"}`
          : "No running realbrowser sessions found.",
        stopped: sessions.map((session) => publicSessionInfo(session)),
        count: sessions.length,
      }, flags);
      return;
    }
    const selectedStateFile = stateFileFromFlags(flags);
    const state = await readJson(selectedStateFile);
    if (!state || !isProcessAlive(state.pid)) {
      const bannerDismissal = flags.dismissBanner === true && !flags.cleanupRemoteDebugging
        ? await dismissChromeControlledBanner()
        : null;
      const lines = [
        "realbrowser daemon is not running",
        bannerDismissal?.text,
        bannerDismissal?.attempted && !bannerDismissal.dismissed
          ? `If Chrome still shows "${CONTROLLED_BANNER_TEXT}", ${BANNER_X_INSTRUCTION}`
          : "",
        !bannerDismissal
          ? `If Chrome still shows "${CONTROLLED_BANNER_TEXT}", ${BANNER_X_INSTRUCTION}`
          : "",
      ];
      if (flags.cleanupRemoteDebugging) {
        lines.push("No daemon is available for automatic cleanup; use Chrome's settings UI, or run `realbrowser cleanup-remote-debugging --allow-attach` if starting a fresh permission-gated attach is acceptable.");
      }
      printResult({
        text: lines.filter(Boolean).join("\n"),
        running: false,
        bannerDismissal,
      }, flags);
      return;
    }
    const healthBody = await health(state).catch(() => null);
    const mode = healthBody?.mode ?? modeFromState(state) ?? AUTO_MODE;
    let cleanup = null;
    if (flags.cleanupRemoteDebugging) {
      cleanup = await cleanupRemoteDebuggingViaDaemon(state);
    }
    await daemonRpc(state, { command: "stop" }).catch(() => null);
    const activeSession = await readActiveSessionRecord(flags);
    const stoppedSession = state.session ?? sessionNameFromStateFile(selectedStateFile);
    if (activeSession.name && activeSession.name === stoppedSession) {
      await clearActiveSessionName();
    }
    const shouldDismissBanner = shouldAttemptBannerDismissal({ flags, mode });
    const bannerDismissal = shouldDismissBanner
      ? await dismissChromeControlledBanner()
      : null;
    const lines = [
      `stopped daemon pid ${state.pid}`,
      cleanup?.text,
      bannerDismissal?.text,
      bannerDismissal?.attempted && !bannerDismissal.dismissed
        ? `If Chrome still shows "${CONTROLLED_BANNER_TEXT}", ${BANNER_X_INSTRUCTION}`
        : "",
    ].filter(Boolean);
    printResult({
      text: lines.join("\n"),
      stoppedPid: state.pid,
      cleanup,
      bannerDismissal,
    }, flags);
    return;
  }

  if (command === "status" && !flags.deep) {
    printResult(await localStatus(flags), flags);
    return;
  }

  if (command === "cleanup-remote-debugging" || command === "cleanup") {
    const stateFile = stateFileFromFlags(flags);
    const existing = await readJson(stateFile);
    const before = await localChromeRemoteDebuggingStatus();
    let state = existing && isProcessAlive(existing.pid) ? existing : null;
    if (!state && before.known && !before.userEnabled) {
      printResult({
        text: "Default local Chrome remote-debugging setting is already disabled, and no realbrowser daemon is running.",
        before,
        after: before,
      }, flags);
      return;
    }
    if (!state && flags.allowAttach) {
      state = await ensureDaemon(flags);
    }
    if (!state) {
      printResult({
        text: [
          "Chrome remote debugging cleanup was not attempted because no realbrowser daemon is running.",
          "Run `realbrowser detach --cleanup-remote-debugging` before the daemon is stopped, or use `realbrowser cleanup-remote-debugging --allow-attach` to start a fresh permission-gated attach.",
          `Manual cleanup: open ${REMOTE_DEBUGGING_SETTINGS_URL} and turn off remote debugging.`,
        ].join("\n"),
        before,
        after: before,
      }, flags);
      return;
    }
    const cleanup = await cleanupRemoteDebuggingViaDaemon(state);
    await stopState(state).catch(() => {});
    const activeSession = await readActiveSessionRecord(flags);
    const stoppedSession = state.session ?? sessionNameFromStateFile(stateFile);
    if (activeSession.name && activeSession.name === stoppedSession) {
      await clearActiveSessionName();
    }
    const mode = modeFromState(state) ?? desiredMode(flags);
    const after = mode === AUTO_MODE
      ? await waitForRemoteDebuggingSetting(false, 2000)
      : await localChromeRemoteDebuggingStatus();
    printResult({
      text: formatRemoteDebuggingCleanupText(cleanup, before, after, {
        mode,
        stoppedPid: state.pid,
      }),
      before,
      cleanup,
      after,
    }, flags);
    return;
  }

  if ((command === "open" || command === "newtab") && flags.profile) {
    requireArgs(command, args, 1);
    printResult(await openUrlInBrowserProfile(args[0], flags.profile, flags), flags);
    return;
  }

  if (command === "mobile-screenshot") {
    printResult(await mobileScreenshot(args, flags), flags);
    return;
  }

  await applyHandleToFlags(command, flags);
  await resolveProfileForAutomation(flags);
  await prepareRealProfileSessionFlags(flags);

  const state = await ensureDaemon(flags);
  const payload = daemonPayloadForCommand(command, args, flags, state);
  let response = await maybeRunRoutineCommandWithCurrentEndpointDaemon(state, payload, flags);
  try {
    response ??= await daemonRpc(state, payload);
  } catch (error) {
    response = await maybeRunRoutineCommandWithCurrentEndpointDaemon(state, payload, flags, error) ??
      await maybeRunDeviceScreenshotsWithTemporaryDaemon(state, payload, flags, error) ??
      await maybeRunScreenshotUtilityWithTemporaryDaemon(state, payload, flags, error);
    if (!response) {
      throw error;
    }
  }
  const explicitSessionName = sessionNameFromFlags(flags);
  if (explicitSessionName) {
    await writeActiveSessionName(explicitSessionName);
  }
  printResult(response, flags);
}

function daemonPayloadForCommand(command, args, flags = {}, state = null) {
  if (command === "chain") {
    return {
      command,
      args,
      flags,
    };
  }
  return { command, args, flags };
}

async function resolveProfileForAutomation(flags = {}) {
  if (flags.profile && !flags.browserUrl) {
    const profile = await resolveBrowserProfileSelection(flags.profile, flags);
    if (!profile.devtoolsHttpUrl && !profile.devtoolsWsEndpoint) {
      throw new Error(`Profile ${profile.id} is not exposing a DevTools endpoint. Open it with \`realbrowser open --profile "${profile.id}" <url>\`, enable Chrome remote debugging in that profile, then retry with \`--no-fallback\`.`);
    }
    flags.browserUrl = profile.devtoolsWsEndpoint ?? profile.devtoolsHttpUrl;
  }
}

function sessionNameForState(state, flags = {}) {
  return (
    String(state?.session ?? "").trim() ||
    sessionNameFromFlags(flags) ||
    sessionNameFromStateFile(stateFileFromFlags(flags))
  );
}

function publicHandle(handle) {
  return {
    path: handle.path,
    session: handle.session,
    stateFile: handle.stateFile || undefined,
    pageId: handle.pageId,
    targetId: handle.targetId || undefined,
    url: handle.url,
    createdAt: handle.createdAt,
    updatedAt: handle.updatedAt,
  };
}

async function writePageHandle({ state, flags, page, handlePath, overwrite = false }) {
  const now = new Date().toISOString();
  const session = sessionNameForState(state, flags);
  const resolvedPath = handlePath ?? handleOutputPathFromFlags(flags);
  const handle = {
    kind: "realbrowser-tab-handle",
    version: 1,
    session,
    stateFile: stateFileFromFlags({ ...flags, session }),
    pageId: page.id,
    targetId: page.targetId,
    url: page.url,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await writeJson(resolvedPath, handle, 0o600, { overwrite: flags.force === true || overwrite });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw usageError(`Handle already exists: ${resolvedPath}. Use --force to replace it, or choose a project-specific --handle-out path.`);
    }
    throw error;
  }
  return {
    path: resolvedPath,
    session,
    stateFile: handle.stateFile,
    pageId: page.id,
    targetId: page.targetId,
    url: page.url,
    createdAt: now,
    updatedAt: now,
    raw: handle,
  };
}

function pickClaimedPage(pages, targetUrl = "") {
  if (!Array.isArray(pages) || pages.length === 0) {
    return null;
  }
  if (targetUrl) {
    const exact = [...pages].reverse().find((page) => sameDocumentUrl(page.url, targetUrl));
    if (exact) {
      return exact;
    }
  }
  return pages.find((page) => page.selected) ?? pages[0] ?? null;
}

async function readHandleFileIfPresent(filePath) {
  try {
    await fsp.access(filePath);
  } catch {
    return null;
  }
  try {
    return await readHandleFile(filePath);
  } catch {
    return null;
  }
}

function formatClaimText(handle) {
  return [
    `Handle: ${handle.path}`,
    `Session: ${handle.session || "(custom state file)"}`,
    `Page: ${handle.pageId}`,
    `URL: ${handle.url || "(blank)"}`,
    "",
    `Use: realbrowser --handle "${handle.path}" screenshot out.png`,
  ].join("\n");
}

async function claimPageHandle(args, flags = {}) {
  const targetUrl = args[0] ?? "";
  const handlePath = handleOutputPathFromFlags(flags);
  const explicitHandlePath = Boolean(flags.handleOut || flags.handleName);
  const existingHandle = explicitHandlePath ? await readHandleFileIfPresent(handlePath) : null;
  await resolveProfileForAutomation(flags);
  await prepareRealProfileSessionFlags(flags);
  const state = await ensureDaemon(flags);

  let page = null;
  const beforePagesResult = await daemonRpc(state, { command: "tabs", args: [], flags: {} });
  const beforePages = parseListPagesResult(beforePagesResult);

  if (targetUrl) {
    page = [...beforePages].reverse().find((entry) => sameDocumentUrl(entry.url, targetUrl)) ?? null;
    if (!page && existingHandle) {
      page = beforePages.find((entry) => entry.id === existingHandle.pageId && sameDocumentUrl(entry.url, targetUrl)) ?? null;
    }
    if (!page) {
      const openFlags = { ...flags, select: true, foregroundUntilReady: false };
      if (flags.foregroundUntilReady) {
        openFlags.front = true;
      }
      await daemonRpc(state, daemonPayloadForCommand("open", [targetUrl], openFlags, state));
    }
  } else if (existingHandle) {
    page = beforePages.find((entry) => entry.id === existingHandle.pageId) ?? null;
  }

  if (!page) {
    const pagesResult = await daemonRpc(state, { command: "tabs", args: [], flags: {} });
    page = pickClaimedPage(parseListPagesResult(pagesResult), targetUrl);
  }
  if (!page) {
    throw new Error("Could not find a page to claim.");
  }
  const handle = await writePageHandle({
    state,
    flags,
    page,
    handlePath,
    overwrite: explicitHandlePath && Boolean(targetUrl),
  });
  const explicitSessionName = sessionNameFromFlags(flags);
  if (explicitSessionName) {
    await writeActiveSessionName(explicitSessionName);
  }
  let ready = null;
  if (flags.foregroundUntilReady) {
    const activation = await foregroundBrowserAppForProfile({ source: { appName: flags.browserAppName } }, flags);
    await daemonRpc(state, {
      command: "select",
      args: [String(page.id)],
      flags: { ...flags, front: true, foregroundUntilReady: false },
    }).catch(() => null);
    ready = await daemonRpc(state, {
      command: "wait-ready",
      args: readinessArgsFromFlags(flags),
      flags: { ...flags, page: String(page.id) },
    });
    return {
      text: [
        formatClaimText(handle),
        activation?.error ? `App foreground attempt failed: ${activation.error}` : activation ? `App foreground attempt: ${activation.command} ${activation.args?.join(" ") ?? ""}`.trim() : "",
        ready?.text ? `Readiness:\n${ready.text}` : "",
      ].filter(Boolean).join("\n"),
      handle: publicHandle(handle),
      path: handle.path,
      filePath: handle.path,
      ready,
      appActivation: activation,
    };
  }
  return {
    text: formatClaimText(handle),
    handle: publicHandle(handle),
    path: handle.path,
    filePath: handle.path,
  };
}

async function listPageHandles() {
  const entries = await fsp.readdir(DEFAULT_HANDLE_DIR).catch(() => []);
  const handles = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(DEFAULT_HANDLE_DIR, entry);
    try {
      handles.push(publicHandle(await readHandleFile(filePath)));
    } catch {
      // Ignore stale or non-handle JSON.
    }
  }
  handles.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return {
    text: handles.length === 0
      ? "No realbrowser handles found."
      : handles.map((handle) => `${handle.path}  session=${handle.session || "-"} page=${handle.pageId}  ${handle.url || ""}`).join("\n"),
    handles,
  };
}

async function releasePageHandle(args) {
  requireArgs("release-handle", args, 1);
  const handlePath = handlePathFromValue(args[0]);
  await fsp.rm(handlePath, { force: true });
  return {
    text: `Released realbrowser handle: ${handlePath}`,
    path: handlePath,
  };
}

function parseViewportSize(sizeText) {
  const size = String(sizeText ?? "390x844").trim();
  const [width, height] = size.split(/[x,]/).map((value) => Number.parseInt(value, 10));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("viewport expects a size like 390x844");
  }
  return {
    width,
    height,
    viewport: size.includes("x") && size.split("x").length >= 3 ? size : `${width}x${height}x1`,
    requested: `${width}x${height}`,
  };
}

const DEFAULT_DEVICE_SCREENSHOT_VIEWPORTS = Object.freeze([
  ["desktop", "1440x900"],
  ["tablet", "768x1024"],
  ["mobile", "390x844"],
]);

function safeDeviceScreenshotName(name, index = 0) {
  const cleaned = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || `device-${index + 1}`;
}

function parseDeviceScreenshotViewports(value = "") {
  const entries = String(value ?? "").trim()
    ? String(value).split(/[;,]/).map((entry) => entry.trim()).filter(Boolean)
    : DEFAULT_DEVICE_SCREENSHOT_VIEWPORTS.map(([name, size]) => `${name}:${size}`);
  if (entries.length === 0) {
    throw new Error("device-screenshots expects at least one viewport.");
  }
  return entries.map((entry, index) => {
    const match = entry.match(/^([^:=]+)[:=](.+)$/u);
    const name = safeDeviceScreenshotName(match ? match[1] : `device-${index + 1}`, index);
    const viewport = parseViewportSize(match ? match[2] : entry);
    return {
      name,
      ...viewport,
    };
  });
}

function isMobileDeviceScreenshotName(name) {
  return /(?:mobile|phone|iphone|android)/iu.test(String(name ?? ""));
}

function deviceScreenshotMobileMode(device, flags = {}) {
  if (flags.mobile === true) {
    return true;
  }
  if (flags.mobile === false || flags.mobileEmulation === false) {
    return false;
  }
  return Boolean(flags.mobileEmulation && isMobileDeviceScreenshotName(device.name));
}

function formatPageCandidates(pages) {
  return pages.map((page) => {
    const handle = page.tabId ?? page.suggestedTargetId ?? `page:${page.id}`;
    const target = page.targetId ? ` target=${String(page.targetId).slice(0, 12)}` : "";
    return `- ${handle}${target} ${page.title || "(untitled)"} ${page.url || "about:blank"}`;
  }).join("\n");
}

function looksLikeUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return false;
  }
  try {
    const parsed = new URL(text);
    return Boolean(parsed.protocol && parsed.host);
  } catch {
    return false;
  }
}

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`Not a PNG file: ${filePath}`);
  }
  return {
    pixelWidth: buffer.readUInt32BE(16),
    pixelHeight: buffer.readUInt32BE(20),
  };
}

function assertDeviceScreenshotDimensions(device, png, flags = {}) {
  if (!flags.full && (png.pixelWidth !== device.width || png.pixelHeight !== device.height)) {
    throw new Error(`${device.name} screenshot dimension mismatch: expected ${device.width}x${device.height}, got ${png.pixelWidth}x${png.pixelHeight}`);
  }
}

function deviceScreenshotCaptureResult({ device, outputPath, ready, png, mobile, extra = {} }) {
  return {
    name: device.name,
    requested: device.requested,
    filePath: path.resolve(outputPath),
    metrics: ready.metrics,
    ready: ready.ready,
    png,
    mobile,
    ...extra,
  };
}

function defaultMobileScreenshotPath() {
  return path.join(
    DEFAULT_SCREENSHOT_DIR,
    `mobile-screenshot-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.png`,
  );
}

function defaultFullScreenshotPath() {
  return path.join(
    DEFAULT_SCREENSHOT_DIR,
    `full-screenshot-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.png`,
  );
}

function defaultAreaScreenshotPath() {
  return path.join(
    DEFAULT_SCREENSHOT_DIR,
    `area-screenshot-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.png`,
  );
}

function defaultDeviceScreenshotsPrefix() {
  return path.join(
    DEFAULT_SCREENSHOT_DIR,
    `device-screenshots-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
  );
}

function resolveDeviceScreenshotsTarget(args = []) {
  const first = args[0] ?? "";
  if (args.length >= 2) {
    return {
      targetUrl: first,
      prefix: path.resolve(args[1]),
    };
  }
  if (first && looksLikeUrl(first)) {
    return {
      targetUrl: first,
      prefix: defaultDeviceScreenshotsPrefix(),
    };
  }
  return {
    targetUrl: "",
    prefix: path.resolve(first || defaultDeviceScreenshotsPrefix()),
  };
}

function deviceScreenshotPath(prefix, name) {
  return path.resolve(`${prefix}-${safeDeviceScreenshotName(name)}.png`);
}

async function findCurrentPage(state, flags = {}, targetUrl = "") {
  const pagesResult = await daemonRpc(state, { command: "tabs", args: [], flags: {} });
  const pages = parseListPagesResult(pagesResult);
  if (flags.page !== undefined) {
    const pageId = parsePageId(flags.page);
    return pages.find((page) => page.id === pageId) ?? { id: pageId, url: targetUrl };
  }
  return pickClaimedPage(pages, targetUrl);
}

async function mobileScreenshot(args, flags = {}) {
  const targetUrl = args[0] ?? "";
  const outputPath = path.resolve(args[1] ?? defaultMobileScreenshotPath());
  const viewport = parseViewportSize(flags.viewport ?? "390x844");
  await applyHandleToFlags("mobile-screenshot", flags);
  await resolveProfileForAutomation(flags);
  await prepareRealProfileSessionFlags(flags);
  const state = await ensureDaemon(flags);

  let page = null;
  if (targetUrl && flags.page !== undefined) {
    await daemonRpc(state, {
      command: "navigate",
      args: [targetUrl],
      flags: { page: flags.page },
    });
    page = await findCurrentPage(state, flags, targetUrl);
  } else if (targetUrl) {
    const openFlags = { ...flags, select: true };
    await daemonRpc(state, daemonPayloadForCommand("open", [targetUrl], openFlags, state));
    page = await findCurrentPage(state, flags, targetUrl);
  } else {
    page = await findCurrentPage(state, flags);
  }
  if (!page) {
    throw new Error("Could not find a page for mobile-screenshot.");
  }
  const pageFlags = { page: page.id };
  await daemonRpc(state, { command: "viewport", args: [viewport.requested], flags: pageFlags });
  const timeout = flags.timeout ?? "20000";
  await daemonRpc(state, { command: "wait", args: ["--networkidle"], flags: { ...pageFlags, timeout } });
  const metricsResult = await daemonRpc(state, {
    command: "js",
    args: ["({innerWidth,innerHeight,devicePixelRatio})"],
    flags: pageFlags,
  });
  const metrics = extractJsonFromToolText(metricsResult.text) ?? null;
  await daemonRpc(state, {
    command: "screenshot",
    args: [outputPath],
    flags: {
      ...pageFlags,
      rawSize: flags.rawSize !== false,
      full: Boolean(flags.full),
      format: flags.format,
      quality: flags.quality,
    },
  });
  const png = inferScreenshotFormat(outputPath, { ...flags, rawSize: true }) === "png"
    ? readPngDimensions(outputPath)
    : null;
  if (!flags.full && png && (png.pixelWidth !== viewport.width || png.pixelHeight !== viewport.height)) {
    throw new Error(`mobile-screenshot dimension mismatch: expected ${viewport.width}x${viewport.height}, got ${png.pixelWidth}x${png.pixelHeight}`);
  }
  let handle = null;
  if (flags.handleOut || flags.handleName) {
    handle = publicHandle(await writePageHandle({ state, flags, page }));
  }
  const text = [
    `Saved mobile screenshot to ${path.resolve(outputPath)}.`,
    `Page: ${page.id}`,
    `Viewport: ${viewport.requested}`,
    metrics ? `Browser: ${metrics.innerWidth}x${metrics.innerHeight} @ ${metrics.devicePixelRatio}` : "",
    png ? `PNG: ${png.pixelWidth}x${png.pixelHeight}` : "",
    handle ? `Handle: ${handle.path}` : "",
  ].filter(Boolean).join("\n");
  return {
    text,
    filePath: path.resolve(outputPath),
    path: path.resolve(outputPath),
    pageId: page.id,
    viewport: { width: viewport.width, height: viewport.height },
    metrics,
    png,
    handle,
  };
}

async function cleanupRemoteDebuggingViaDaemon(state) {
  const mode = modeFromState(state) ?? AUTO_MODE;
  if (mode === DEDICATED_MODE || mode === ANONYMOUS_MODE) {
    return {
      text: mode === ANONYMOUS_MODE
        ? "Remote-debugging settings cleanup skipped for the anonymous realbrowser profile; stopping the daemon closes the temporary browser session."
        : "Remote-debugging settings cleanup skipped for the dedicated realbrowser profile; stopping the daemon closes the managed browser session.",
      cleanupRemoteDebugging: {
        attempted: false,
        confirmed: true,
        reason: mode === ANONYMOUS_MODE ? "anonymous-managed-profile" : "dedicated-managed-profile",
      },
    };
  }
  return await daemonRpc(state, { command: "cleanup-remote-debugging" }).catch((error) => ({
    text: `remote debugging cleanup attempted, but the browser connection ended before confirmation: ${error instanceof Error ? error.message : String(error)}`,
    cleanupRemoteDebugging: { attempted: true, confirmed: false },
  }));
}

async function localStatus(flags = {}) {
  const stateFile = stateFileFromFlags(flags);
  const state = await readJson(stateFile);
  const alive = Boolean(state?.pid && isProcessAlive(state.pid));
  let healthBody = null;
  if (alive) {
    healthBody = await health(state).catch(() => null);
  }
  const running = Boolean(alive && healthBody?.ok);
  const mode = healthBody?.mode ?? modeFromState(state) ?? desiredMode(flags);
  const daemon = {
    running,
    pid: running ? state.pid : null,
    stateFile,
    session: running ? (state.session ?? sessionNameFromStateFile(stateFile)) : null,
    startedAt: running ? (state.startedAt ?? null) : null,
    version: running ? (healthBody?.version ?? state.version ?? null) : null,
    scriptHash: running ? (healthBody?.scriptHash ?? state.scriptHash ?? null) : null,
    currentScriptHash: SCRIPT_HASH,
    mode,
    browserUrl: browserUrlFromState(state),
    noFallback: Object.prototype.hasOwnProperty.call(healthBody ?? {}, "noFallback")
      ? Boolean(healthBody.noFallback)
      : noFallbackFromState(state),
    mcpConnected: Object.prototype.hasOwnProperty.call(healthBody ?? {}, "mcpConnected")
      ? Boolean(healthBody.mcpConnected)
      : null,
  };
  const chromeRemoteDebugging = await localChromeRemoteDebuggingStatus();
  const browserControl = browserControlStatus(daemon, chromeRemoteDebugging);
  return {
    text: formatLocalStatusText(daemon, browserControl, chromeRemoteDebugging),
    daemon,
    browserControl,
    chromeRemoteDebugging,
  };
}

async function localChromeRemoteDebuggingStatus() {
  const states = [];
  for (const userDataDir of chromeUserDataDirCandidates()) {
    const localState = await readJson(path.join(userDataDir, "Local State"));
    if (!localState) {
      continue;
    }
    const userEnabled = localState?.devtools?.remote_debugging?.["user-enabled"];
    states.push({
      userDataDir,
      userEnabled: typeof userEnabled === "boolean" ? userEnabled : null,
    });
  }
  return {
    known: states.length > 0,
    userEnabled: states.some((state) => state.userEnabled === true),
    states,
  };
}

async function waitForRemoteDebuggingSetting(userEnabled, timeoutMs) {
  const startedAt = Date.now();
  let latest = await localChromeRemoteDebuggingStatus();
  while (Date.now() - startedAt < timeoutMs) {
    latest = await localChromeRemoteDebuggingStatus();
    if (latest.known && latest.userEnabled === userEnabled) {
      return latest;
    }
    await sleep(100);
  }
  return latest;
}

function formatRemoteDebuggingCleanupText(cleanup, before, after, options = {}) {
  const lines = [];
  if (options.stoppedPid) {
    lines.push(`stopped daemon pid ${options.stoppedPid}`);
  }
  if (
    cleanup?.cleanupRemoteDebugging?.reason === "dedicated-managed-profile" ||
    cleanup?.cleanupRemoteDebugging?.reason === "anonymous-managed-profile"
  ) {
    lines.push(cleanup.text);
  } else if (before?.known && before.userEnabled === false && !cleanup?.cleanupRemoteDebugging?.attempted) {
    lines.push("Chrome remote debugging was already disabled.");
  } else {
    lines.push(cleanup?.text ?? "Chrome remote debugging cleanup attempted.");
  }
  const metadataLabel = remoteDebuggingMetadataLabel(options.mode);
  if (after?.known) {
    lines.push(`${metadataLabel}: ${formatMaybeBoolean(after.userEnabled)}`);
  } else {
    lines.push(`${metadataLabel}: unknown`);
  }
  if (options.mode && options.mode !== AUTO_MODE) {
    lines.push(remoteDebuggingMetadataCaveat(options.mode));
  }
  if (
    cleanup?.cleanupRemoteDebugging?.reason !== "dedicated-managed-profile" &&
    cleanup?.cleanupRemoteDebugging?.reason !== "anonymous-managed-profile" &&
    (!after?.known || after.userEnabled)
  ) {
    lines.push(`If the banner remains, turn off Chrome remote debugging from ${REMOTE_DEBUGGING_SETTINGS_URL}.`);
  }
  return lines.join("\n");
}

function remoteDebuggingMetadataLabel(mode) {
  return mode === AUTO_MODE
    ? "Default local Chrome remote-debugging setting"
    : "Default local Chrome remote-debugging metadata";
}

function remoteDebuggingMetadataCaveat(mode) {
  if (mode === DEDICATED_MODE) {
    return "That metadata is not used by the dedicated realbrowser profile.";
  }
  if (mode === ANONYMOUS_MODE) {
    return "That metadata is not used by the temporary anonymous realbrowser profile.";
  }
  if (mode === "browserUrl") {
    return "That metadata may not describe the configured browser URL backend.";
  }
  return "That metadata may not describe the active browser backend.";
}

function shouldAttemptBannerDismissal({ flags = {}, mode = AUTO_MODE } = {}) {
  return (
    !flags.cleanupRemoteDebugging &&
    mode !== DEDICATED_MODE &&
    flags.dismissBanner === true
  );
}

function chromeUserDataDirCandidates() {
  const candidates = [];
  if (process.env.REALBROWSER_CHROME_USER_DATA_DIR) {
    candidates.push(process.env.REALBROWSER_CHROME_USER_DATA_DIR);
  }
  if (process.env.REALBROWSER_BROWSER_USER_DATA_DIR) {
    candidates.push(process.env.REALBROWSER_BROWSER_USER_DATA_DIR);
  }
  const home = os.homedir();
  if (process.platform === "darwin") {
    appendPathCandidates(candidates, path.join(home, "Library", "Application Support"), MAC_BROWSER_USER_DATA_PATHS);
  } else if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      appendPathCandidates(candidates, localAppData, WINDOWS_BROWSER_USER_DATA_PATHS);
    }
  } else {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
    appendPathCandidates(candidates, configHome, LINUX_BROWSER_CONFIG_PATHS);
    for (const [appId, browserPath] of LINUX_FLATPAK_BROWSER_CONFIG_PATHS) {
      candidates.push(path.join(home, ".var", "app", appId, "config", ...browserPath));
    }
  }
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

function appendPathCandidates(candidates, baseDir, relativePaths) {
  for (const relativePath of relativePaths) {
    candidates.push(path.join(baseDir, ...relativePath));
  }
}

async function pathExists(file) {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

function browserProfileSourcesForPlatform() {
  const home = os.homedir();
  let sources;
  if (process.platform === "darwin") {
    const baseDir = path.join(home, "Library", "Application Support");
    sources = MAC_BROWSER_PROFILE_SOURCES.map((source) => ({
      ...source,
      platform: "darwin",
      userDataDir: path.join(baseDir, ...source.userDataPath),
    }));
  } else if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    sources = WINDOWS_BROWSER_PROFILE_SOURCES.map((source) => ({
      ...source,
      platform: "win32",
      userDataDir: path.join(localAppData, ...source.userDataPath),
    }));
  } else {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
    const normal = LINUX_BROWSER_PROFILE_SOURCES.map((source) => ({
      ...source,
      platform: process.platform,
      userDataDir: path.join(configHome, ...source.userDataPath),
    }));
    const flatpak = LINUX_FLATPAK_BROWSER_PROFILE_SOURCES.map((source) => ({
      ...source,
      platform: process.platform,
      userDataDir: path.join(home, ".var", "app", source.appId, "config", ...source.userDataPath),
    }));
    sources = [...normal, ...flatpak];
  }
  return withCustomBrowserProfileSources(sources);
}

function withCustomBrowserProfileSources(sources) {
  const seen = new Set(sources.map((source) => path.resolve(source.userDataDir)));
  const customDirs = [
    process.env.REALBROWSER_BROWSER_USER_DATA_DIR,
    process.env.REALBROWSER_CHROME_USER_DATA_DIR,
  ].filter(Boolean);
  const customSources = [];
  for (const customDir of customDirs) {
    const userDataDir = path.resolve(customDir);
    if (seen.has(userDataDir)) {
      continue;
    }
    seen.add(userDataDir);
    customSources.push({
      key: customSources.length === 0 ? "custom" : `custom-${customSources.length + 1}`,
      name: "Custom Chromium",
      platform: process.platform,
      userDataDir,
    });
  }
  return [...customSources, ...sources];
}

async function listBrowserProfiles(options = {}) {
  const browserFilter = options.browser ? normalizeProfileToken(options.browser) : "";
  const profiles = [];
  for (const source of browserProfileSourcesForPlatform()) {
    if (browserFilter && !profileSourceMatchesBrowser(source, browserFilter)) {
      continue;
    }
    if (!(await pathExists(source.userDataDir))) {
      continue;
    }
    const localState = await readJson(path.join(source.userDataDir, "Local State"));
    const profileDirs = await browserProfileDirectories(source.userDataDir);
    for (const profileDirectory of profileDirs) {
      const profilePath = path.join(source.userDataDir, profileDirectory);
      const preferences = await readJson(path.join(profilePath, "Preferences"));
      const activity = browserProfileActivityInfo(profileDirectory, localState);
      const info = browserProfileDisplayInfo(profileDirectory, preferences, localState);
      const devtools = await readDevToolsActivePort(source.userDataDir, profilePath);
      profiles.push({
        id: `${source.key}:${profileDirectory}`,
        browser: source.key,
        browserName: source.name,
        profileDirectory,
        displayName: info.displayName,
        email: info.email,
        accountName: info.accountName,
        lastUsed: activity.lastUsed,
        lastActive: activity.lastActive,
        activeTime: activity.activeTime,
        activeRank: activity.activeRank,
        userDataDir: source.userDataDir,
        profilePath,
        devtoolsPortFile: devtools?.portFile ?? null,
        devtoolsScope: devtools?.scope ?? null,
        devtoolsHttpUrl: devtools?.httpUrl ?? null,
        devtoolsWsEndpoint: devtools?.wsEndpoint ?? null,
        launchSupported: isBrowserProfileLaunchSupported(source),
        source,
      });
    }
  }
  profiles.sort((a, b) => (
    a.browserName.localeCompare(b.browserName) ||
    a.profileDirectory.localeCompare(b.profileDirectory, undefined, { numeric: true }) ||
    a.displayName.localeCompare(b.displayName)
  ));
  if (!options.query) {
    return filterProfilesByActivity(profiles, options);
  }
  return filterProfilesByActivity(
    profiles.filter((profile) => browserProfileMatchesQuery(profile, options.query)),
    options,
  );
}

function filterProfilesByActivity(profiles, options = {}) {
  if (!options.active) {
    return profiles;
  }
  return profiles.filter((profile) => profile.lastUsed || profile.lastActive);
}

async function browserProfileDirectories(userDataDir) {
  const entries = await fsp.readdir(userDataDir, { withFileTypes: true }).catch(() => []);
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    if (entry.name === "System Profile" || entry.name === "Guest Profile") {
      continue;
    }
    const preferencesPath = path.join(userDataDir, entry.name, "Preferences");
    if (entry.name === "Default" || /^Profile \d+$/u.test(entry.name) || await pathExists(preferencesPath)) {
      names.push(entry.name);
    }
  }
  return [...new Set(names)].sort((a, b) => {
    if (a === "Default") return -1;
    if (b === "Default") return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function browserProfileDisplayInfo(profileDirectory, preferences, localState) {
  const localInfo = localState?.profile?.info_cache?.[profileDirectory] ?? {};
  const accountInfo = Array.isArray(preferences?.account_info) ? preferences.account_info[0] : null;
  const email = stringOrNull(accountInfo?.email) ?? stringOrNull(localInfo.user_name);
  const accountName = stringOrNull(accountInfo?.full_name) ?? stringOrNull(localInfo.gaia_name);
  const displayName = (
    stringOrNull(localInfo.name) ??
    stringOrNull(localInfo.shortcut_name) ??
    stringOrNull(preferences?.profile?.name) ??
    email ??
    profileDirectory
  );
  return { displayName, email, accountName };
}

function browserProfileActivityInfo(profileDirectory, localState) {
  const profileState = localState?.profile ?? {};
  const lastUsed = profileState.last_used === profileDirectory;
  const lastActiveProfiles = Array.isArray(profileState.last_active_profiles)
    ? profileState.last_active_profiles
    : [];
  const activeRank = lastActiveProfiles.indexOf(profileDirectory);
  const localInfo = profileState.info_cache?.[profileDirectory] ?? {};
  return {
    lastUsed,
    lastActive: activeRank !== -1,
    activeRank: activeRank === -1 ? null : activeRank,
    activeTime: numberOrNull(localInfo.active_time),
  };
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readDevToolsActivePort(userDataDir, profilePath) {
  const candidates = [
    { portFile: path.join(profilePath, "DevToolsActivePort"), scope: "profile" },
    { portFile: path.join(userDataDir, "DevToolsActivePort"), scope: "browser" },
  ];
  for (const candidate of candidates) {
    const { portFile, scope } = candidate;
    const text = await fsp.readFile(portFile, "utf8").catch(() => "");
    const [port, browserPath] = text.trim().split(/\r?\n/u);
    if (!port || !browserPath) {
      continue;
    }
    const host = process.env.REALBROWSER_CDP_HOST || process.env.CDP_HOST || "127.0.0.1";
    return {
      portFile,
      scope,
      httpUrl: `http://${host}:${port}`,
      wsEndpoint: `ws://${host}:${port}${browserPath}`,
    };
  }
  return null;
}

function profileSourceMatchesBrowser(source, browserFilter) {
  return [
    source.key,
    source.name,
    source.appName,
    ...(source.commands ?? []),
    source.appId,
  ].filter(Boolean).some((value) => normalizeProfileToken(value) === browserFilter);
}

function browserProfileMatchesQuery(profile, query) {
  const needle = normalizeProfileToken(query);
  if (!needle) {
    return true;
  }
  const resolvedQuery = resolveProfilePathQuery(query);
  return [
    profile.id,
    profile.browser,
    profile.browserName,
    profile.profileDirectory,
    profile.displayName,
    profile.email,
    profile.accountName,
  ].filter(Boolean).some((value) => normalizeProfileToken(value).includes(needle)) ||
    (resolvedQuery && [profile.profilePath, profile.userDataDir].some((value) => path.resolve(value) === resolvedQuery));
}

async function resolveBrowserProfileSelection(query, flags = {}) {
  const profileQuery = query ?? flags.profile ?? process.env.REALBROWSER_BROWSER_PROFILE;
  if (!profileQuery) {
    throw new Error("Missing browser profile. Run `realbrowser profiles`, then pass `--profile <id>` or use `realbrowser open-profile <id> <url>`.");
  }
  const profiles = await listBrowserProfiles({ browser: flags.browser });
  const selected = selectBrowserProfile(profiles, profileQuery);
  if (!selected) {
    throw new Error(`No browser profile matched "${profileQuery}".\n${formatProfileListText(profiles)}`);
  }
  return selected;
}

function selectBrowserProfile(profiles, query) {
  const needle = normalizeProfileToken(query);
  const resolvedQuery = resolveProfilePathQuery(query);
  const exact = profiles.filter((profile) => [
    profile.id,
    profile.profileDirectory,
    profile.displayName,
    profile.email,
    profile.accountName,
  ].filter(Boolean).some((value) => normalizeProfileToken(value) === needle) ||
    (resolvedQuery && [profile.profilePath, profile.userDataDir].some((value) => path.resolve(value) === resolvedQuery)));
  if (exact.length === 1) {
    return exact[0];
  }
  if (exact.length > 1) {
    throw new Error(`Profile query "${query}" is ambiguous:\n${formatProfileCandidates(exact)}`);
  }
  const fuzzy = profiles.filter((profile) => browserProfileMatchesQuery(profile, query));
  if (fuzzy.length === 1) {
    return fuzzy[0];
  }
  if (fuzzy.length > 1) {
    throw new Error(`Profile query "${query}" is ambiguous:\n${formatProfileCandidates(fuzzy)}`);
  }
  return null;
}

function normalizeProfileToken(value) {
  return String(value ?? "").trim().toLowerCase();
}

function resolveProfilePathQuery(query) {
  const value = String(query ?? "");
  if (!value || (!value.includes(path.sep) && !(process.platform === "win32" && /[\\/]/u.test(value)))) {
    return null;
  }
  return path.resolve(value);
}

function formatProfileListText(profiles) {
  if (profiles.length === 0) {
    return "No Chromium-family browser profiles found. If the browser uses a custom user-data root, set REALBROWSER_BROWSER_USER_DATA_DIR or REALBROWSER_CHROME_USER_DATA_DIR.";
  }
  const rows = profiles.map((profile) => ({
    id: profile.id,
    browser: profile.browserName,
    profile: profile.profileDirectory,
    name: [profile.displayName, profile.email ? `<${profile.email}>` : ""].filter(Boolean).join(" "),
    activity: formatProfileActivity(profile),
    debug: profile.devtoolsHttpUrl ? `${profile.devtoolsHttpUrl}${profile.devtoolsScope === "browser" ? " (browser)" : ""}` : "-",
  }));
  const widths = {
    id: Math.max("ID".length, ...rows.map((row) => row.id.length)),
    browser: Math.max("Browser".length, ...rows.map((row) => row.browser.length)),
    profile: Math.max("Profile".length, ...rows.map((row) => row.profile.length)),
    name: Math.max("Name / account".length, ...rows.map((row) => row.name.length)),
    activity: Math.max("Activity".length, ...rows.map((row) => row.activity.length)),
  };
  const line = (row) => [
    row.id.padEnd(widths.id),
    row.browser.padEnd(widths.browser),
    row.profile.padEnd(widths.profile),
    row.name.padEnd(widths.name),
    row.activity.padEnd(widths.activity),
    row.debug,
  ].join("  ");
  return [
    line({ id: "ID", browser: "Browser", profile: "Profile", name: "Name / account", activity: "Activity", debug: "Debug endpoint" }),
    line({ id: "-".repeat(widths.id), browser: "-".repeat(widths.browser), profile: "-".repeat(widths.profile), name: "-".repeat(widths.name), activity: "-".repeat(widths.activity), debug: "--------------" }),
    ...rows.map(line),
    "",
    'Use: realbrowser open --profile "<id>" <url>',
    'Attach to a detected debugging endpoint with: realbrowser --profile "<id>" tabs',
  ].join("\n");
}

function formatProfileActivity(profile) {
  const labels = [];
  if (profile.lastUsed) {
    labels.push("last-used");
  }
  if (profile.lastActive) {
    labels.push(profile.activeRank === 0 ? "active#1" : `active#${Number(profile.activeRank) + 1}`);
  }
  return labels.join(",") || "-";
}

function formatProfileCandidates(profiles) {
  return profiles.map((profile) => `- ${profile.id} (${profile.browserName}, ${profile.displayName}${profile.email ? `, ${profile.email}` : ""})`).join("\n");
}

function formatSessionListText(sessions, activeSession = null) {
  if (sessions.length === 0) {
    return activeSession?.name
      ? `No running realbrowser sessions found. Last active session "${activeSession.name}" is not running.`
      : "No running realbrowser sessions found.";
  }
  const rows = sessions.map((session) => ({
    active: session.active ? "*" : "",
    name: session.name,
    mode: session.mode,
    headless: session.headless === null || session.headless === undefined ? "?" : session.headless ? "yes" : "no",
    pid: String(session.pid ?? ""),
    mcp: session.mcpConnected ? "yes" : "no",
    script: session.scriptHash ? (session.scriptHash === SCRIPT_HASH ? "current" : `old:${session.scriptHash}`) : "old",
    state: session.stateFile,
  }));
  const widths = {
    active: 1,
    name: Math.max("Session".length, ...rows.map((row) => row.name.length)),
    mode: Math.max("Mode".length, ...rows.map((row) => row.mode.length)),
    headless: Math.max("Headless".length, ...rows.map((row) => row.headless.length)),
    pid: Math.max("PID".length, ...rows.map((row) => row.pid.length)),
    mcp: Math.max("MCP".length, ...rows.map((row) => row.mcp.length)),
    script: Math.max("Script".length, ...rows.map((row) => row.script.length)),
  };
  const line = (row) => [
    row.active.padEnd(widths.active),
    row.name.padEnd(widths.name),
    row.mode.padEnd(widths.mode),
    row.headless.padEnd(widths.headless),
    row.pid.padEnd(widths.pid),
    row.mcp.padEnd(widths.mcp),
    row.script.padEnd(widths.script),
    row.state,
  ].join("  ");
  return [
    line({ active: "", name: "Session", mode: "Mode", headless: "Headless", pid: "PID", mcp: "MCP", script: "Script", state: "State file" }),
    line({ active: "-", name: "-".repeat(widths.name), mode: "-".repeat(widths.mode), headless: "-".repeat(widths.headless), pid: "-".repeat(widths.pid), mcp: "-".repeat(widths.mcp), script: "-".repeat(widths.script), state: "----------" }),
    ...rows.map(line),
    "",
    '* marks the active session used by commands without --session.',
    'Use: realbrowser use-session "<name>"',
    'Bypass the active session with: realbrowser --no-active-session <command>',
    'Search named sessions with: realbrowser find-tab <query> --all-sessions',
  ].join("\n");
}

function formatActiveSessionText(activeSession) {
  if (!activeSession?.name) {
    return "No active realbrowser session.";
  }
  return [
    `Active session: ${activeSession.name}`,
    `Running: ${activeSession.running ? "yes" : "no"}`,
    activeSession.stateFile ? `State file: ${activeSession.stateFile}` : "",
    activeSession.updatedAt ? `Updated: ${activeSession.updatedAt}` : "",
    activeSession.running
      ? "Plain commands now target this session. Use --no-active-session to bypass it."
      : "Start it again with --session, choose another with use-session, or clear it with clear-session.",
  ].filter(Boolean).join("\n");
}

function publicSessionInfo(session) {
  return {
    name: session.name,
    stateFile: session.stateFile,
    pid: session.pid,
    startedAt: session.startedAt,
    mode: session.mode,
    headless: session.headless,
    noFallback: session.noFallback,
    mcpConnected: session.mcpConnected,
    version: session.version,
    scriptHash: session.scriptHash,
    capabilities: session.capabilities,
    active: Boolean(session.active),
  };
}

function isBrowserProfileLaunchSupported(source) {
  if (process.platform === "darwin") {
    return Boolean(source.appName);
  }
  if (process.platform === "win32") {
    return Boolean(source.executablePaths?.length || source.commands?.length);
  }
  return Boolean(source.commands?.length || source.appId);
}

async function openUrlInBrowserProfile(url, profileQuery, flags = {}) {
  const profile = await resolveBrowserProfileSelection(profileQuery, flags);
  flags.browserAppName = profile.source?.appName ?? profile.browserName;
  flags.browserProfileId = profile.id;
  if (flags.foregroundUntilReady && flags.select !== false) {
    flags.select = true;
    flags.front = true;
  }
  if (flags.select && !profile.devtoolsHttpUrl && !profile.devtoolsWsEndpoint) {
    throw new Error(`Profile ${profile.id} is not exposing a DevTools endpoint, so realbrowser cannot auto-select the new tab. Enable Chrome remote debugging in that profile, or run without --select to only open the tab.`);
  }
  const endpointOpen = await openUrlInProfileEndpointSession(profile, url, flags);
  if (endpointOpen) {
    return endpointOpen;
  }
  const launch = await launchBrowserProfile(profile, url, flags);
  const selected = flags.select
    ? await waitAndSelectBrowserTab(url, {
      ...flags,
      browserUrl: profile.devtoolsWsEndpoint ?? profile.devtoolsHttpUrl,
      noFallback: true,
    })
    : null;
  const result = {
    text: [
      `Opened ${url} in ${profile.browserName} profile ${profile.profileDirectory} (${profile.displayName}).`,
      selected?.text,
      profile.devtoolsHttpUrl
        ? `Debug endpoint detected: ${profile.devtoolsHttpUrl}${profile.devtoolsScope === "browser" ? " (browser-level)" : ""}. Use \`realbrowser --profile "${profile.id}" tabs\` to attach, then verify/select the intended tab.`
        : `No DevToolsActivePort was found for that profile yet. If automation needs existing login state, enable Chrome remote debugging in that profile, then run \`realbrowser --profile "${profile.id}" tabs --no-fallback\`.`,
    ].filter(Boolean).join("\n"),
    quiet: profile.id,
    profile: publicProfileInfo(profile),
    launch,
    selected,
  };
  return await maybeRunForegroundReadinessForProfileOpen(result, profile, flags);
}

function readinessArgsFromFlags(flags = {}) {
  const text = normalizeOptionalString(flags.readyText);
  return text ? [text] : [];
}

function readinessPageFromResult(result) {
  return result?.page ?? result?.selected?.page ?? result?.opened?.page ?? null;
}

async function foregroundBrowserAppForProfile(profile, flags = {}) {
  if (!(flags.front || flags.foregroundUntilReady) || process.platform !== "darwin") {
    return null;
  }
  const appName = normalizeOptionalString(profile?.source?.appName ?? flags.browserAppName);
  if (!appName) {
    return null;
  }
  try {
    return await spawnDetached("open", ["-a", appName]);
  } catch (error) {
    return {
      command: "open",
      args: ["-a", appName],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function maybeRunForegroundReadinessForProfileOpen(result, profile, flags = {}) {
  if (!flags.foregroundUntilReady) {
    return result;
  }
  const activation = await foregroundBrowserAppForProfile(profile, flags);
  const endpoint = endpointForBrowserProfile(profile);
  if (!endpoint) {
    return {
      ...result,
      appActivation: activation,
      text: [
        result?.text,
        "Foreground readiness was requested, but no DevTools endpoint is available for readiness checks.",
      ].filter(Boolean).join("\n"),
    };
  }
  const daemonFlags = {
    ...flags,
    browserUrl: endpoint.wsEndpoint ?? endpoint.httpUrl,
    noFallback: true,
  };
  const state = await ensureDaemon(daemonFlags);
  const page = readinessPageFromResult(result);
  const readyFlags = {
    ...daemonFlags,
    ...(page?.tabId ? { page: page.tabId } : page?.id !== undefined ? { page: String(page.id) } : {}),
  };
  const ready = await daemonRpc(state, {
    command: "wait-ready",
    args: readinessArgsFromFlags(flags),
    flags: readyFlags,
  });
  return appendReadinessResult(result, ready, activation);
}

function appendReadinessResult(result, ready, activation = null) {
  const activationLine = activation?.error
    ? `App foreground attempt failed: ${activation.error}`
    : activation
      ? `App foreground attempt: ${activation.command} ${activation.args?.join(" ") ?? ""}`.trim()
      : "";
  return {
    ...result,
    appActivation: activation,
    ready,
    text: [
      result?.text,
      activationLine,
      ready?.text ? `Readiness:\n${ready.text}` : "",
    ].filter(Boolean).join("\n"),
  };
}

function endpointForBrowserProfile(profile) {
  return browserTabEndpoints([profile], {})[0] ?? null;
}

function comparablePageUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  try {
    const parsed = new URL(text);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return text.replace(/\/$/u, "");
  }
}

function pageUrlMatchesRequest(pageUrl, requestedUrl) {
  const page = comparablePageUrl(pageUrl);
  const requested = comparablePageUrl(requestedUrl);
  return Boolean(page && requested && page === requested);
}

function newestPage(pages) {
  return [...pages].sort((a, b) => Number(a.id) - Number(b.id)).at(-1) ?? null;
}

function openedPageCandidate(beforePages, afterPages, requestedUrl) {
  const beforeIds = new Set(beforePages.map((page) => String(page.id)));
  const newPages = afterPages.filter((page) => !beforeIds.has(String(page.id)));
  const matchingNewPages = newPages.filter((page) => pageUrlMatchesRequest(page.url, requestedUrl));
  if (matchingNewPages.length > 0) {
    return newestPage(matchingNewPages);
  }
  if (newPages.length === 1) {
    return newPages[0];
  }
  const matchingPages = afterPages.filter((page) => pageUrlMatchesRequest(page.url, requestedUrl));
  return newestPage(matchingPages);
}

async function openUrlViaEndpointSession(endpointSession, profile, url, flags = {}) {
  if (!endpointSession?.state) {
    return null;
  }
  const sessionName = endpointSession.name;
  if (!canOpenProfileUrlViaEndpoint(profile)) {
    return null;
  }
  const beforePages = parseListPagesResult(await daemonRpc(endpointSession.state, {
    command: "tabs",
    args: [],
    flags: {},
  }));
  const openFlags = {
    ...(flags.timeout ? { timeout: flags.timeout } : {}),
    front: Boolean(flags.front),
    select: Boolean(flags.select),
    ...(flags.foregroundUntilReady ? {
      foregroundUntilReady: true,
      browserAppName: flags.browserAppName,
      readyText: flags.readyText,
      selector: flags.selector,
      minCards: flags.minCards,
      cardSelector: flags.cardSelector,
      stableMs: flags.stableMs,
      visualStable: flags.visualStable,
      noSkeletons: flags.noSkeletons,
      screenshot: flags.screenshot,
    } : {}),
  };
  const opened = await daemonRpc(endpointSession.state, {
    command: "open",
    args: [url],
    flags: openFlags,
  });
  const afterPages = parseListPagesResult(await daemonRpc(endpointSession.state, {
    command: "tabs",
    args: [],
    flags: {},
  }));
  const page = opened?.page ?? openedPageCandidate(beforePages, afterPages, url);
  const selected = flags.select && page
    ? await daemonRpc(endpointSession.state, {
      command: "select",
      args: [String(page.id)],
      flags: { front: Boolean(flags.front) },
    })
    : null;
  if (flags.select && shouldActivateSession(flags)) {
    await writeActiveSessionName(sessionName);
  }
  return {
    text: [
      `Opened ${url} through realbrowser session ${sessionName} for ${profile.browserName} profile ${profile.profileDirectory} (${profile.displayName}).`,
      page ? `Page: ${page.id} ${page.url}` : "Opened page, but could not identify the new page id. Run `realbrowser tabs` to select it manually.",
      selected?.text,
      opened?.appActivation?.error ? `App foreground attempt failed: ${opened.appActivation.error}` : opened?.appActivation ? `App foreground attempt: ${opened.appActivation.command} ${opened.appActivation.args?.join(" ") ?? ""}`.trim() : "",
      opened?.ready?.text ? `Readiness:\n${opened.ready.text}` : "",
      flags.select ? `Activated session: ${sessionName}` : "",
      profile.devtoolsHttpUrl
        ? `Debug endpoint reused: ${profile.devtoolsHttpUrl}${profile.devtoolsScope === "browser" ? " (browser-level)" : ""}.`
        : "",
    ].filter(Boolean).join("\n"),
    quiet: page ? String(page.id) : endpointSession.name,
    profile: publicProfileInfo(profile),
    launch: {
      command: "realbrowser-session",
      args: ["open", url],
      fastPath: "cdp-or-mcp",
      session: sessionName,
      pid: endpointSession.pid,
    },
    opened,
    page,
    selected,
    session: sessionName,
  };
}

async function openUrlInProfileEndpointSession(profile, url, flags = {}) {
  if (!canOpenProfileUrlViaEndpoint(profile)) {
    return null;
  }
  const endpoint = endpointForBrowserProfile(profile);
  if (!endpoint) {
    return null;
  }
  const endpointSession = await ensureEndpointSession(endpoint, flags);
  return await openUrlViaEndpointSession(endpointSession, profile, url, flags);
}

function canOpenProfileUrlViaEndpoint(profile) {
  if (!profile?.devtoolsHttpUrl && !profile?.devtoolsWsEndpoint) {
    return false;
  }
  if (profile.devtoolsScope !== "browser") {
    return true;
  }
  return profile.lastUsed === true;
}

async function waitAndSelectBrowserTab(query, flags = {}) {
  const timeoutMs = parsePositiveInteger(flags.timeout ?? "10000", "timeout");
  const startedAt = Date.now();
  let lastTabs = [];
  await prepareEndpointSessionForTabPolling(flags);
  while (Date.now() - startedAt <= timeoutMs) {
    lastTabs = await findBrowserTabs({
      query,
      browser: flags.browser,
      browserUrl: flags.browserUrl,
      cdpUrl: flags.cdpUrl,
    });
    if (lastTabs.length > 0) {
      return await selectBrowserTabForAutomation(query, flags);
    }
    await sleep(1000);
  }
  throw new Error(`Opened the URL but no debuggable matching tab appeared within ${timeoutMs}ms.\n${formatBrowserTabListText(lastTabs)}`);
}

async function prepareEndpointSessionForTabPolling(flags = {}) {
  const browserUrl = flags.browserUrl ?? flags.cdpUrl;
  if (!browserUrl || flags.stateFile || flags.handle) {
    return null;
  }
  const endpoint = browserTabEndpoints([], { browserUrl })[0] ?? null;
  if (!endpoint) {
    return null;
  }
  return await ensureEndpointSession(endpoint, flags);
}

async function findBrowserTabs(options = {}) {
  const profiles = await listBrowserProfiles({ browser: options.browser });
  const endpointProfiles = profilesForBrowserTabSearch(profiles, options);
  const endpoints = browserTabEndpoints(endpointProfiles, options);
  const tabs = [];
  const endpointSessionNames = new Set();
  for (const endpoint of endpoints) {
    const endpointSession = await runningEndpointSession(endpoint);
    if (endpointSession) {
      const sessionTabs = await tabsForKnownSession(endpointSession, { endpoint });
      if (sessionTabs.length > 0) {
        endpointSessionNames.add(endpointSession.name);
        tabs.push(...sessionTabs);
        continue;
      }
    }
    if (shouldDiscoverTabsThroughEndpointSession(endpoint, options)) {
      const session = await ensureEndpointSession(endpoint, { noFallback: true }, { mutateFlags: false }).catch(() => null);
      if (session) {
        const sessionTabs = await tabsForKnownSession(session, { endpoint });
        endpointSessionNames.add(session.name);
        tabs.push(...sessionTabs);
        continue;
      }
    }
    let targets = await fetchCdpTargetList(endpoint, { allowWs: false }).catch(() => []);
    if (targets.length === 0 && endpoint.wsEndpoint) {
      const session = await ensureEndpointSession(endpoint, { noFallback: true }, { mutateFlags: false }).catch(() => null);
      if (session) {
        const sessionTabs = await tabsForKnownSession(session, { endpoint });
        if (sessionTabs.length > 0) {
          endpointSessionNames.add(session.name);
          tabs.push(...sessionTabs);
          continue;
        }
      }
    }
    for (const target of targets) {
      if (target?.type && target.type !== "page") {
        continue;
      }
      tabs.push({
        id: `${endpoint.index}:${String(target.id ?? target.targetId ?? "").slice(0, 12)}`,
        targetId: String(target.id ?? target.targetId ?? ""),
        browserUrl: endpoint.httpUrl,
        browserWsEndpoint: endpoint.wsEndpoint,
        webSocketDebuggerUrl: target.webSocketDebuggerUrl ?? null,
        url: String(target.url ?? ""),
        title: String(target.title ?? ""),
        browserNames: endpoint.browserNames,
        profileIds: endpoint.profileIds,
        profileNames: endpoint.profileNames,
      });
    }
  }
  if (options.allSessions || options.session || options.stateFile) {
    tabs.push(...await findSessionTabs(options, { skipSessionNames: endpointSessionNames }));
  }
  const filtered = options.query
    ? dedupeBrowserTabs(tabs).filter((tab) => browserTabMatchesQuery(tab, options.query))
    : dedupeBrowserTabs(tabs);
  return withBrowserTabHandles(filtered.sort((a, b) => (
    (a.sessionName || "").localeCompare(b.sessionName || "") ||
    (a.url || "").localeCompare(b.url || "") ||
    (a.title || "").localeCompare(b.title || "")
  )));
}

function explicitBrowserTabEndpointRequested(options = {}) {
  return Boolean(options.browserUrl || options.cdpUrl || process.env.REALBROWSER_BROWSER_URL || process.env.REALBROWSER_CDP_URL);
}

function profilesForBrowserTabSearch(profiles, options = {}) {
  if (explicitBrowserTabEndpointRequested(options)) {
    return [];
  }
  if ((options.session || options.stateFile) && !options.allSessions) {
    return [];
  }
  const debuggable = profiles.filter((profile) => profile.devtoolsHttpUrl || profile.devtoolsWsEndpoint);
  const preferred = debuggable.find((profile) => profile.lastUsed) ??
    debuggable
      .filter((profile) => profile.lastActive)
      .sort((a, b) => (a.activeRank ?? Number.MAX_SAFE_INTEGER) - (b.activeRank ?? Number.MAX_SAFE_INTEGER))[0] ??
    debuggable[0];
  if (!preferred) {
    return [];
  }
  const preferredEndpoint = preferred.devtoolsHttpUrl ?? normalizeCdpHttpUrl(preferred.devtoolsWsEndpoint);
  return debuggable.filter((profile) =>
    browserEndpointEquivalent(profile.devtoolsHttpUrl ?? profile.devtoolsWsEndpoint, preferredEndpoint)
  );
}

function shouldDiscoverTabsThroughEndpointSession(endpoint, options = {}) {
  return Boolean(
    endpoint?.httpUrl ||
    endpoint?.wsEndpoint ||
    options.browserUrl ||
    options.cdpUrl,
  );
}

async function runningSessionByName(name) {
  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) {
    return null;
  }
  const stateFile = stateFileForSessionName(normalizedName);
  const state = await readJson(stateFile);
  if (!state || !isProcessAlive(state.pid)) {
    return null;
  }
  const healthBody = await health(state).catch(() => null);
  if (!healthBody?.ok) {
    return null;
  }
  return {
    name: state.session ?? normalizedName,
    stateFile,
    pid: state.pid,
    startedAt: state.startedAt,
    mode: healthBody.mode ?? modeFromState(state) ?? "unknown",
    noFallback: healthBody.noFallback ?? noFallbackFromState(state),
    mcpConnected: Boolean(healthBody.mcpConnected),
    version: healthBody.version ?? state.version ?? null,
    scriptHash: healthBody.scriptHash ?? state.scriptHash ?? null,
    capabilities: Array.isArray(healthBody.capabilities) ? healthBody.capabilities : (state.capabilities ?? []),
    active: false,
    state,
  };
}

async function runningEndpointSession(endpoint) {
  const sessionName = autoSessionNameForBrowserTab({
    browserUrl: endpoint.wsEndpoint ?? endpoint.httpUrl,
  });
  const session = await runningSessionByName(sessionName);
  if (!session || !isRealProfileSessionMode(session.mode)) {
    const sessions = await listKnownSessions({ noActiveSession: true });
    return sessions.find((candidate) => sessionMatchesBrowserEndpoint(candidate, endpoint)) ?? null;
  }
  return session;
}

function sessionMatchesBrowserEndpoint(session, endpoint) {
  return isRealProfileSessionMode(session?.mode) &&
    browserEndpointEquivalent(
      browserUrlFromState(session.state),
      endpoint?.wsEndpoint ?? endpoint?.httpUrl,
    );
}

async function tabsForKnownSession(session, context = {}) {
  const pagesResult = await daemonRpc(session.state, {
    command: "tabs",
    args: [],
    flags: {},
  }).catch(() => null);
  if (!pagesResult) {
    return [];
  }
  const endpoint = context.endpoint ?? null;
  const pages = parseListPagesResult(pagesResult);
  return pages.map((page) => ({
    id: `${session.name}:${page.id}`,
    tabId: page.tabId,
    suggestedTargetId: page.suggestedTargetId ?? page.tabId,
    targetId: String(page.id),
    cdpTargetId: page.targetId,
    browserUrl: endpoint?.httpUrl ?? `session:${session.name}`,
    browserWsEndpoint: endpoint?.wsEndpoint ?? null,
    endpointHttpUrl: endpoint?.httpUrl ?? null,
    webSocketDebuggerUrl: null,
    url: page.url,
    title: page.title || (page.selected ? "(selected)" : ""),
    source: "session",
    sessionName: session.name,
    stateFile: session.stateFile,
    mode: session.mode,
    browserNames: endpoint?.browserNames ?? [],
    profileIds: endpoint?.profileIds ?? [],
    profileNames: [
      ...(endpoint?.profileNames ?? []),
      `session:${session.name}`,
      session.mode,
    ].filter(Boolean),
  }));
}

async function findSessionTabs(options = {}, context = {}) {
  const sessionFilter = String(options.session ?? "").trim();
  const stateFileFilter = options.stateFile ? path.resolve(options.stateFile) : "";
  const skipSessionNames = context.skipSessionNames ?? new Set();
  const sessions = (await listKnownSessions(options)).filter((session) => {
    if (skipSessionNames.has(session.name)) {
      return false;
    }
    if (options.allSessions || (!sessionFilter && !stateFileFilter)) {
      return true;
    }
    if (sessionFilter) {
      return session.name === sessionFilter;
    }
    return path.resolve(session.stateFile) === stateFileFilter;
  });
  const tabs = [];
  for (const session of sessions) {
    tabs.push(...await tabsForKnownSession(session));
  }
  return tabs;
}

function browserTabDedupeKey(tab) {
  const endpoint = normalizeCdpHttpUrl(tab.endpointHttpUrl ?? (
    tab.source === "session" ? "" : tab.browserUrl
  ));
  if (!endpoint || !tab.url) {
    return "";
  }
  return `${endpoint}\n${tab.url}`;
}

function dedupeBrowserTabs(tabs) {
  const byKey = new Map();
  const out = [];
  for (const tab of tabs) {
    const key = browserTabDedupeKey(tab);
    if (!key) {
      out.push(tab);
      continue;
    }
    const existingIndex = byKey.get(key);
    if (existingIndex === undefined) {
      byKey.set(key, out.length);
      out.push(tab);
      continue;
    }
    if (out[existingIndex]?.source !== "session" && tab.source === "session") {
      out[existingIndex] = tab;
    }
  }
  return out;
}

function withBrowserTabHandles(tabs) {
  return tabs.map((tab, index) => {
    const tabId = tab.tabId || `t${index + 1}`;
    const suggestedTargetId = tab.label || `t${index + 1}`;
    return {
      ...tab,
      tabId,
      suggestedTargetId,
    };
  });
}

function browserTabEndpoints(profiles, options = {}) {
  const endpoints = [];
  const byUrl = new Map();
  const addEndpoint = (httpUrl, profile = null, wsEndpoint = null) => {
    const normalized = normalizeCdpHttpUrl(httpUrl ?? wsEndpoint);
    if (!normalized) {
      return;
    }
    let endpoint = byUrl.get(normalized);
    if (!endpoint) {
      endpoint = {
        index: endpoints.length + 1,
        httpUrl: normalized,
        wsEndpoint: normalizeCdpWsEndpoint(wsEndpoint),
        profiles: [],
        profileIds: [],
        profileNames: [],
        browserNames: [],
      };
      byUrl.set(normalized, endpoint);
      endpoints.push(endpoint);
    }
    if (!endpoint.wsEndpoint && wsEndpoint) {
      endpoint.wsEndpoint = normalizeCdpWsEndpoint(wsEndpoint);
    }
    if (profile) {
      endpoint.profiles.push(profile);
      endpoint.profileIds.push(profile.id);
      endpoint.profileNames.push(profile.displayName);
      endpoint.browserNames.push(profile.browserName);
    }
  };
  for (const profile of profiles) {
    addEndpoint(profile.devtoolsHttpUrl, profile, profile.devtoolsWsEndpoint);
  }
  addEndpoint(options.browserUrl ?? process.env.REALBROWSER_BROWSER_URL, null, options.browserUrl ?? process.env.REALBROWSER_BROWSER_URL);
  addEndpoint(options.cdpUrl ?? process.env.REALBROWSER_CDP_URL, null, options.cdpUrl ?? process.env.REALBROWSER_CDP_URL);
  for (const endpoint of endpoints) {
    endpoint.profileIds = [...new Set(endpoint.profileIds)];
    endpoint.profileNames = [...new Set(endpoint.profileNames.filter(Boolean))];
    endpoint.browserNames = [...new Set(endpoint.browserNames.filter(Boolean))];
  }
  return endpoints;
}

function normalizeCdpHttpUrl(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
      parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    }
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

function normalizeCdpWsEndpoint(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return null;
    }
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      return null;
    }
    if (!/\/devtools\/(?:browser|page|worker|shared_worker|service_worker)\/[^/]/iu.test(parsed.pathname)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchCdpTargetList(endpoint, options = {}) {
  if (endpoint.httpUrl) {
    try {
      return await fetchCdpTargetListFromHttp(endpoint.httpUrl);
    } catch (error) {
      if (!endpoint.wsEndpoint && options.allowWs !== true) {
        throw error;
      }
    }
  }
  const wsEndpoint = endpoint.wsEndpoint || (
    endpoint.httpUrl && options.allowWs === true
      ? await resolveCdpBrowserWebSocketUrl(endpoint.httpUrl)
      : ""
  );
  if (!wsEndpoint) {
    return [];
  }
  if (options.allowWs !== true) {
    return [];
  }
  return await fetchCdpTargetListFromWs(wsEndpoint);
}

async function fetchCdpTargetListFromHttp(httpUrl) {
  const response = await fetch(`${httpUrl.replace(/\/$/u, "")}/json/list`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) {
    throw new Error(`CDP target list failed for ${httpUrl}: HTTP ${response.status}`);
  }
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}

async function fetchCdpTargetListFromWs(wsEndpoint) {
  const client = new CdpClient(wsEndpoint);
  await client.connect();
  try {
    const result = await client.request("Target.getTargets", {});
    return Array.isArray(result?.targetInfos) ? result.targetInfos : [];
  } finally {
    client.close();
  }
}

async function cdpHttpJson(baseUrl, route, options = {}) {
  const url = `${baseUrl.replace(/\/$/u, "")}${route}`;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Some DevTools HTTP endpoints return plain text.
  }
  if (!response.ok) {
    throw new Error(`CDP ${route} failed (${response.status}): ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function cdpCreateTargetViaHttp(baseUrl, targetUrl) {
  const route = `/json/new?${encodeURIComponent(targetUrl)}`;
  try {
    return await cdpHttpJson(baseUrl, route, { method: "PUT", timeoutMs: 5000 });
  } catch {
    return await cdpHttpJson(baseUrl, route, { method: "GET", timeoutMs: 5000 });
  }
}

function formatCdpPagesResult(pages) {
  const rows = pages.map((page) => ({
    target: page.suggestedTargetId ?? page.tabId ?? `t${page.id}`,
    page: String(page.id),
    title: truncateOneLine(page.title || "(untitled)", 36),
    url: page.url || "about:blank",
    selected: page.selected ? "*" : "",
  }));
  const widths = {
    target: Math.max("Target".length, ...rows.map((row) => row.target.length)),
    page: Math.max("Page".length, ...rows.map((row) => row.page.length)),
    title: Math.max("Title".length, ...rows.map((row) => row.title.length)),
  };
  const line = (row) => [
    row.selected.padEnd(1),
    row.target.padEnd(widths.target),
    row.page.padEnd(widths.page),
    row.title.padEnd(widths.title),
    row.url,
  ].join("  ");
  return {
    text: pages.length === 0
      ? "No CDP page targets found."
      : [
          line({ selected: "", target: "Target", page: "Page", title: "Title", url: "URL" }),
          line({
            selected: "-",
            target: "-".repeat(widths.target),
            page: "-".repeat(widths.page),
            title: "-".repeat(widths.title),
            url: "---",
          }),
          ...rows.map(line),
        ].join("\n"),
    structuredContent: {
      pages: pages.map((page) => ({
        id: page.id,
        tabId: page.tabId,
        suggestedTargetId: page.suggestedTargetId,
        targetId: page.targetId,
        title: page.title,
        url: page.url,
        selected: page.selected,
      })),
    },
    cdp: true,
  };
}

function formatCdpException(exceptionDetails = {}) {
  const description = exceptionDetails.exception?.description;
  const text = exceptionDetails.text;
  return description || text || "CDP Runtime.evaluate failed";
}

function isInvalidCdpSessionError(error) {
  const text = String(error?.message ?? error).toLowerCase();
  return [
    "session with given id not found",
    "no session with given id",
    "target closed",
    "target detached",
    "session closed",
  ].some((needle) => text.includes(needle));
}

function cdpRemoteObjectValue(remote = {}) {
  if (Object.hasOwn(remote, "value")) {
    return remote.value;
  }
  if (remote.subtype === "null") {
    return null;
  }
  if (remote.unserializableValue !== undefined) {
    return remote.unserializableValue;
  }
  if (remote.description !== undefined) {
    return remote.description;
  }
  return undefined;
}

function cdpConsoleMessageFromRuntimeEvent(params = {}, id) {
  const args = normalizeConsoleArgs(params.args ?? []);
  const text = args.map(formatConsoleArgPreview).filter(Boolean).join(" ");
  return {
    id,
    type: normalizeConsoleType(params.type),
    text: text || String(params.type ?? "console"),
    args,
    stackTrace: normalizeConsoleStackTrace(params.stackTrace),
    timestamp: params.timestamp,
    order: id,
    source: cdpConsoleSourceFromStack(params.stackTrace),
  };
}

function cdpConsoleMessageFromExceptionEvent(params = {}, id) {
  const details = params.exceptionDetails ?? {};
  return {
    id,
    type: "error",
    text: formatCdpException(details),
    args: details.exception ? [normalizeConsoleArg(details.exception)] : [],
    stackTrace: normalizeConsoleStackTrace(details.stackTrace),
    timestamp: params.timestamp,
    order: id,
    source: cdpConsoleSourceFromException(details),
  };
}

function cdpConsoleMessageFromLogEvent(entry = {}, id) {
  return {
    id,
    type: normalizeConsoleType(entry.level ?? entry.source),
    text: String(entry.text ?? entry.source ?? "log"),
    args: [],
    stackTrace: normalizeConsoleStackTrace(entry.stackTrace),
    timestamp: entry.timestamp,
    order: id,
    source: normalizeConsoleSource(entry),
  };
}

function cdpConsoleSourceFromStack(stackTrace) {
  const frame = stackTrace?.callFrames?.[0];
  if (!frame) {
    return undefined;
  }
  return {
    url: frame.url || undefined,
    lineNumber: parseOptionalNumber(frame.lineNumber) !== null ? parseOptionalNumber(frame.lineNumber) + 1 : undefined,
    columnNumber: parseOptionalNumber(frame.columnNumber) !== null ? parseOptionalNumber(frame.columnNumber) + 1 : undefined,
  };
}

function cdpConsoleSourceFromException(details = {}) {
  return {
    url: details.url || undefined,
    lineNumber: parseOptionalNumber(details.lineNumber) !== null ? parseOptionalNumber(details.lineNumber) + 1 : undefined,
    columnNumber: parseOptionalNumber(details.columnNumber) !== null ? parseOptionalNumber(details.columnNumber) + 1 : undefined,
  };
}

function formatCdpValue(value) {
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function axValue(value) {
  if (!value || typeof value !== "object") {
    return "";
  }
  const raw = value.value;
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  return "";
}

function formatAriaSnapshotNodes(nodes, limit) {
  const byId = new Map();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (node?.nodeId) {
      byId.set(node.nodeId, node);
    }
  }
  const referenced = new Set();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    for (const child of node?.childIds ?? []) {
      referenced.add(child);
    }
  }
  const root = (Array.isArray(nodes) ? nodes : []).find((node) => node?.nodeId && !referenced.has(node.nodeId)) ?? nodes?.[0];
  if (!root?.nodeId) {
    return [];
  }
  const out = [];
  const stack = [{ id: root.nodeId, depth: 0 }];
  while (stack.length && out.length < limit) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    const node = byId.get(current.id);
    if (!node) {
      continue;
    }
    const role = axValue(node.role);
    const name = axValue(node.name);
    const value = axValue(node.value);
    const description = axValue(node.description);
    out.push({
      ref: `ax${out.length + 1}`,
      role: role || "unknown",
      name: name || "",
      ...(value ? { value } : {}),
      ...(description ? { description } : {}),
      ...(typeof node.backendDOMNodeId === "number" ? { backendDOMNodeId: node.backendDOMNodeId } : {}),
      depth: current.depth,
    });
    const children = (node.childIds ?? []).filter((child) => byId.has(child));
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ id: children[index], depth: current.depth + 1 });
    }
  }
  return out;
}

async function snapshotAriaFromSession(send, options = {}) {
  const limit = Math.max(1, Math.min(5000, Math.floor(options.limit ?? 800)));
  const res = await send("Accessibility.getFullAXTree");
  return { nodes: formatAriaSnapshotNodes(Array.isArray(res?.nodes) ? res.nodes : [], limit) };
}

function buildCdpRoleTree(nodes) {
  const byId = new Map();
  const tree = [];
  for (const raw of Array.isArray(nodes) ? nodes : []) {
    const nodeId = String(raw?.nodeId ?? "");
    if (!nodeId) {
      continue;
    }
    byId.set(nodeId, tree.length);
    tree.push({
      raw,
      role: axValue(raw.role) || "unknown",
      name: axValue(raw.name),
      value: axValue(raw.value),
      backendDOMNodeId:
        typeof raw.backendDOMNodeId === "number" && raw.backendDOMNodeId > 0
          ? Math.floor(raw.backendDOMNodeId)
          : undefined,
      children: [],
      depth: 0,
    });
  }

  const childIndexes = new Set();
  for (let index = 0; index < tree.length; index += 1) {
    for (const childId of tree[index]?.raw?.childIds ?? []) {
      const childIndex = byId.get(childId);
      if (childIndex === undefined) {
        continue;
      }
      tree[index].children.push(childIndex);
      tree[childIndex].parent = index;
      childIndexes.add(childIndex);
    }
  }

  const roots = tree.map((_node, index) => index).filter((index) => !childIndexes.has(index));
  const stack = (roots.length ? roots : tree.length ? [0] : []).map((index) => ({ index, depth: 0 }));
  while (stack.length) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    tree[current.index].depth = current.depth;
    for (const child of [...(tree[current.index]?.children ?? [])].reverse()) {
      stack.push({ index: child, depth: current.depth + 1 });
    }
  }

  return { tree, roots: roots.length ? roots : tree.length ? [0] : [] };
}

function shouldIncludeCdpRoleNode(node, options = {}) {
  const role = String(node?.role ?? "").toLowerCase();
  if (options.maxDepth !== undefined && node.depth > options.maxDepth) {
    return false;
  }
  if (options.interactive) {
    return INTERACTIVE_ROLES.has(role) || role === "iframe" || Boolean(node.cursorInfo);
  }
  if (options.compact && STRUCTURAL_ROLES.has(role) && !node.name && !node.ref) {
    return false;
  }
  return true;
}

function cdpCursorSuffix(info) {
  if (!info) {
    return "";
  }
  const parts = [
    info.hasCursorPointer ? "cursor:pointer" : undefined,
    info.hasOnClick ? "onclick" : undefined,
    info.hasTabIndex ? "tabindex" : undefined,
    info.isEditable ? "contenteditable" : undefined,
    info.hiddenInputType ? `hidden-${info.hiddenInputType}` : undefined,
  ].filter(Boolean);
  return parts.length ? ` [${parts.join(", ")}]` : "";
}

function renderCdpRoleTree(tree, index, output, options = {}, indentOffset = 0) {
  const node = tree[index];
  if (!node) {
    return;
  }
  if (shouldIncludeCdpRoleNode(node, options)) {
    const indent = "  ".repeat(Math.max(0, node.depth + indentOffset));
    const name = node.name ? ` "${escapeQuoted(node.name)}"` : "";
    const ref = node.ref ? ` [ref=${node.ref}]` : "";
    const nth = node.nth !== undefined && node.nth > 0 ? ` [nth=${node.nth}]` : "";
    const value = node.value ? ` value="${escapeQuoted(node.value)}"` : "";
    const url = node.url ? ` [url=${node.url}]` : "";
    output.push(`${indent}- ${node.role}${name}${ref}${nth}${value}${url}${cdpCursorSuffix(node.cursorInfo)}`);
  }
  for (const child of node.children) {
    renderCdpRoleTree(tree, child, output, options, indentOffset);
  }
}

function cdpRoleSubtreeSize(tree, index) {
  const node = tree[index];
  if (!node) {
    return 0;
  }
  let total = 1;
  for (const child of node.children ?? []) {
    total += cdpRoleSubtreeSize(tree, child);
  }
  return total;
}

async function resolveCdpSelectorBackendNodeScope(send, selector) {
  const normalized = normalizeOptionalString(selector);
  if (!normalized) {
    return undefined;
  }
  const doc = await send("DOM.getDocument", { depth: 0 }).catch(() => null);
  const rootNodeId = doc?.root?.nodeId;
  if (typeof rootNodeId !== "number") {
    throw new Error("CDP DOM root is unavailable; cannot scope snapshot by selector.");
  }
  const found = await send("DOM.querySelector", {
    nodeId: rootNodeId,
    selector: normalized,
  }).catch((error) => {
    throw new Error(`Invalid or unsupported selector "${normalized}": ${error?.message || error}`);
  });
  const nodeId = found?.nodeId;
  if (typeof nodeId !== "number" || nodeId <= 0) {
    throw new Error(`Selector not found: ${normalized}`);
  }
  const described = await send("DOM.describeNode", { nodeId }).catch(() => null);
  const backendNodeId = described?.node?.backendNodeId;
  if (typeof backendNodeId !== "number" || backendNodeId <= 0) {
    throw new Error(`Selector has no backend DOM node: ${normalized}`);
  }
  const attr = "data-realbrowser-snapshot-scope";
  const evaluated = await send("Runtime.evaluate", {
    expression: `(() => {
      const attr = ${JSON.stringify(attr)};
      const selector = ${JSON.stringify(normalized)};
      document.querySelectorAll("[" + attr + "]").forEach((el) => el.removeAttribute(attr));
      const root = document.querySelector(selector);
      if (!root) return 0;
      const nodes = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : [];
      for (let index = 0; index < nodes.length; index += 1) {
        nodes[index].setAttribute(attr, String(index));
      }
      return nodes.length;
    })()`,
    returnByValue: true,
    awaitPromise: false,
  }).catch(() => null);
  const marked = Number(evaluated?.result?.value ?? 0);
  const backendNodeIds = new Set([backendNodeId]);
  if (marked > 0) {
    const queried = await send("DOM.querySelectorAll", {
      nodeId: rootNodeId,
      selector: `[${attr}]`,
    }).catch(() => null);
    await Promise.all((queried?.nodeIds ?? []).map(async (scopedNodeId) => {
      const scoped = await send("DOM.describeNode", { nodeId: scopedNodeId }).catch(() => null);
      const scopedBackendNodeId = scoped?.node?.backendNodeId;
      if (typeof scopedBackendNodeId === "number" && scopedBackendNodeId > 0) {
        backendNodeIds.add(Math.floor(scopedBackendNodeId));
      }
    }));
  }
  await send("Runtime.evaluate", {
    expression: `document.querySelectorAll("[${attr}]").forEach((el) => el.removeAttribute("${attr}"))`,
    returnByValue: true,
  }).catch(() => {});
  return { rootBackendNodeId: backendNodeId, backendNodeIds };
}

async function findCdpCursorInteractiveElements(send, options = {}) {
  const attr = "data-realbrowser-cdp-ci";
  const selectorExpr = options.selector ? JSON.stringify(String(options.selector)) : "null";
  const evaluated = await send("Runtime.evaluate", {
    expression: `(() => {
      const out = [];
      const rootSelector = ${selectorExpr};
      const roles = new Set(["button","link","textbox","checkbox","radio","combobox","listbox","menuitem","menuitemcheckbox","menuitemradio","option","searchbox","slider","spinbutton","switch","tab","treeitem"]);
      const tags = new Set(["a","button","input","select","textarea","details","summary"]);
      document.querySelectorAll("[${attr}]").forEach((el) => el.removeAttribute("${attr}"));
      const root = rootSelector ? document.querySelector(rootSelector) : document.body;
      if (!root) return out;
      const candidates = root instanceof HTMLElement
        ? [root, ...Array.from(root.querySelectorAll("*"))]
        : Array.from(root.querySelectorAll("*"));
      for (const el of candidates) {
        if (!(el instanceof HTMLElement) || el.closest("[hidden],[aria-hidden='true']")) continue;
        const tagName = el.tagName.toLowerCase();
        if (tags.has(tagName)) continue;
        const role = String(el.getAttribute("role") || "").toLowerCase();
        if (roles.has(role)) continue;
        const style = getComputedStyle(el);
        const hasCursorPointer = style.cursor === "pointer";
        const hasOnClick = el.hasAttribute("onclick") || el.onclick !== null;
        const tabIndex = el.getAttribute("tabindex");
        const hasTabIndex = tabIndex !== null && tabIndex !== "-1";
        const ce = el.getAttribute("contenteditable");
        const isEditable = ce === "" || ce === "true";
        if (!hasCursorPointer && !hasOnClick && !hasTabIndex && !isEditable) continue;
        if (hasCursorPointer && !hasOnClick && !hasTabIndex && !isEditable) {
          const parent = el.parentElement;
          if (parent && getComputedStyle(parent).cursor === "pointer") continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        let hiddenInputType = "";
        const hiddenInput = el.querySelector("input[type='radio'],input[type='checkbox']");
        if (hiddenInput instanceof HTMLInputElement) {
          const hiddenStyle = getComputedStyle(hiddenInput);
          if (hiddenInput.hidden || hiddenStyle.display === "none" || hiddenStyle.visibility === "hidden") {
            hiddenInputType = hiddenInput.type;
          }
        }
        el.setAttribute("${attr}", String(out.length));
        out.push({
          text: String(el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 100),
          tagName,
          hasCursorPointer,
          hasOnClick,
          hasTabIndex,
          isEditable,
          hiddenInputType,
        });
      }
      return out;
    })()`,
    returnByValue: true,
    awaitPromise: false,
  }).catch(() => null);
  const entries = Array.isArray(evaluated?.result?.value) ? evaluated.result.value : [];
  if (!entries.length) {
    return new Map();
  }

  const doc = await send("DOM.getDocument", { depth: 0 }).catch(() => null);
  const rootNodeId = doc?.root?.nodeId;
  if (typeof rootNodeId !== "number") {
    return new Map();
  }
  const queried = await send("DOM.querySelectorAll", { nodeId: rootNodeId, selector: `[${attr}]` }).catch(() => null);
  const out = new Map();
  await Promise.all((queried?.nodeIds ?? []).map(async (nodeId) => {
    const described = await send("DOM.describeNode", { nodeId }).catch(() => null);
    const attrs = described?.node?.attributes ?? [];
    const attrIndex = attrs.indexOf(attr);
    const rawIndex = attrIndex >= 0 ? attrs[attrIndex + 1] : undefined;
    const index = typeof rawIndex === "string" ? Number(rawIndex) : Number.NaN;
    const backendNodeId = described?.node?.backendNodeId;
    if (typeof backendNodeId === "number" && Number.isInteger(index) && entries[index]) {
      out.set(backendNodeId, entries[index]);
    }
  }));
  await send("Runtime.evaluate", {
    expression: `document.querySelectorAll("[${attr}]").forEach((el) => el.removeAttribute("${attr}"))`,
    returnByValue: true,
  }).catch(() => {});
  return out;
}

async function resolveCdpLinkUrls(send, refs) {
  const out = new Map();
  await Promise.all(Object.values(refs).map(async (ref) => {
    if (ref.role !== "link" || !ref.backendDOMNodeId) {
      return;
    }
    const resolved = await send("DOM.resolveNode", { backendNodeId: ref.backendDOMNodeId }).catch(() => null);
    const objectId = resolved?.object?.objectId;
    if (!objectId) {
      return;
    }
    const hrefResult = await send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: "function() { return this.href || ''; }",
      returnByValue: true,
    }).catch(() => null);
    const href = typeof hrefResult?.result?.value === "string" ? hrefResult.result.value : "";
    if (href) {
      out.set(ref.backendDOMNodeId, href);
    }
  }));
  return out;
}

async function resolveCdpIframeFrameIds(send, tree) {
  const out = new Map();
  await Promise.all(tree.map(async (node) => {
    if (String(node.role).toLowerCase() !== "iframe" || !node.backendDOMNodeId) {
      return;
    }
    const described = await send("DOM.describeNode", {
      backendNodeId: node.backendDOMNodeId,
      depth: 1,
    }).catch(() => null);
    const frameId = described?.node?.contentDocument?.frameId ?? described?.node?.frameId ?? "";
    if (frameId) {
      out.set(node.backendDOMNodeId, frameId);
    }
  }));
  return out;
}

async function buildCdpRoleSnapshotFromSession(params) {
  const selector = normalizeOptionalString(params.selector);
  const selectorScope = selector && !params.frameId
    ? await resolveCdpSelectorBackendNodeScope(params.send, selector)
    : undefined;
  const res = await params.send(
    "Accessibility.getFullAXTree",
    params.frameId ? { frameId: params.frameId } : {},
  );
  const { tree, roots } = buildCdpRoleTree(Array.isArray(res?.nodes) ? res.nodes : []);
  const scopedIndexes = selectorScope
    ? new Set(tree
      .map((node, index) => ({ node, index }))
      .filter((entry) => entry.node.backendDOMNodeId && selectorScope.backendNodeIds.has(entry.node.backendDOMNodeId))
      .map((entry) => entry.index))
    : undefined;
  const renderRoots = scopedIndexes
    ? [...scopedIndexes]
      .filter((index) => {
        let parent = tree[index]?.parent;
        while (parent !== undefined) {
          if (scopedIndexes.has(parent)) {
            return false;
          }
          parent = tree[parent]?.parent;
        }
        return true;
      })
      .sort((left, right) => cdpRoleSubtreeSize(tree, right) - cdpRoleSubtreeSize(tree, left))
    : roots;
  const cursorElements = await findCdpCursorInteractiveElements(params.send, { selector });
  for (const node of tree) {
    if (node.backendDOMNodeId && cursorElements.has(node.backendDOMNodeId)) {
      const cursorInfo = cursorElements.get(node.backendDOMNodeId);
      node.cursorInfo = cursorInfo;
      if (!node.name && cursorInfo?.text) {
        node.name = cursorInfo.text;
      }
    }
  }

  const counts = new Map();
  const refsByKey = new Map();
  const refs = {};
  for (let nodeIndex = 0; nodeIndex < tree.length; nodeIndex += 1) {
    const node = tree[nodeIndex];
    if (scopedIndexes && !scopedIndexes.has(nodeIndex)) {
      continue;
    }
    const role = String(node.role).toLowerCase();
    const shouldRef =
      INTERACTIVE_ROLES.has(role) ||
      (CONTENT_ROLES.has(role) && Boolean(node.name)) ||
      role === "iframe" ||
      Boolean(node.cursorInfo);
    if (!shouldRef) {
      continue;
    }
    const key = `${role}:${node.name}`;
    const nth = counts.get(key) ?? 0;
    counts.set(key, nth + 1);
    const ref = `e${params.nextRef.value}`;
    params.nextRef.value += 1;
    node.ref = ref;
    node.nth = nth;
    refsByKey.set(key, [...(refsByKey.get(key) ?? []), ref]);
    refs[ref] = {
      role,
      ...(node.name ? { name: node.name } : {}),
      ...(nth > 0 ? { nth } : {}),
      ...(node.backendDOMNodeId ? { backendDOMNodeId: node.backendDOMNodeId } : {}),
      ...(params.frameId ? { frameId: params.frameId } : {}),
    };
  }
  for (const refList of refsByKey.values()) {
    if (refList.length > 1) {
      continue;
    }
    const ref = refList[0];
    if (ref) {
      delete refs[ref]?.nth;
      const node = tree.find((entry) => entry.ref === ref);
      if (node) {
        delete node.nth;
      }
    }
  }

  const iframeFrameIds = await resolveCdpIframeFrameIds(params.send, tree);
  for (const node of tree) {
    if (node.backendDOMNodeId && iframeFrameIds.has(node.backendDOMNodeId)) {
      node.frameId = iframeFrameIds.get(node.backendDOMNodeId);
      if (node.ref && refs[node.ref]) {
        refs[node.ref].frameId = node.frameId;
      }
    }
  }

  if (params.urls) {
    const urls = await resolveCdpLinkUrls(params.send, refs);
    for (const node of tree) {
      if (node.backendDOMNodeId && urls.has(node.backendDOMNodeId)) {
        node.url = urls.get(node.backendDOMNodeId);
      }
    }
  }

  const lines = [];
  for (const root of (renderRoots.length ? renderRoots : roots)) {
    const indentOffset = selectorScope ? -(tree[root]?.depth ?? 0) : 0;
    renderCdpRoleTree(tree, root, lines, params.options ?? {}, indentOffset);
  }

  if (params.recurseIframes) {
    const iframeNodes = tree.filter((node) => node.ref && node.frameId);
    for (const iframe of iframeNodes) {
      const marker = `[ref=${iframe.ref}]`;
      const lineIndex = lines.findIndex((line) => line.includes(marker));
      if (lineIndex < 0 || !iframe.frameId) {
        continue;
      }
      const child = await buildCdpRoleSnapshotFromSession({
        ...params,
        frameId: iframe.frameId,
        selector: undefined,
        recurseIframes: false,
      }).catch(() => null);
      if (!child?.lines?.length) {
        continue;
      }
      Object.assign(refs, child.refs);
      lines.splice(lineIndex + 1, 0, ...child.lines.map((line) => `  ${line}`));
    }
  }

  const refValues = Object.values(refs);
  return {
    lines,
    refs,
    stats: {
      refs: refValues.length,
      interactive: refValues.filter((ref) => INTERACTIVE_ROLES.has(ref.role)).length,
    },
  };
}

async function prepareCdpPageSession(send) {
  await Promise.all([
    send("Page.enable").catch(() => null),
    send("Runtime.enable").catch(() => null),
    send("Log.enable").catch(() => null),
    send("Network.enable").catch(() => null),
    send("DOM.enable").catch(() => null),
    send("Accessibility.enable").catch(() => null),
  ]);
  await send("Runtime.runIfWaitingForDebugger").catch(() => null);
}

async function snapshotDomFromSession(send, options = {}) {
  const limit = Math.max(1, Math.min(5000, Math.floor(options.limit ?? 800)));
  const maxTextChars = Math.max(0, Math.min(5000, Math.floor(options.maxTextChars ?? 220)));
  const expression = `(() => {
    const maxNodes = ${JSON.stringify(limit)};
    const maxText = ${JSON.stringify(maxTextChars)};
    const lower = (value) => String(value || "").toLocaleLowerCase();
    const nodes = [];
    const root = document.documentElement;
    if (!root) return { nodes };
    const stack = [{ el: root, depth: 0, parentRef: null }];
    while (stack.length && nodes.length < maxNodes) {
      const cur = stack.pop();
      const el = cur.el;
      if (!el || el.nodeType !== 1) continue;
      const ref = "n" + String(nodes.length + 1);
      const tag = lower(el.tagName);
      const id = el.id ? String(el.id) : undefined;
      const className = el.className ? String(el.className).slice(0, 300) : undefined;
      const role = el.getAttribute && el.getAttribute("role") ? String(el.getAttribute("role")) : undefined;
      const name = el.getAttribute && el.getAttribute("aria-label") ? String(el.getAttribute("aria-label")) : undefined;
      let text = "";
      try { text = String(el.innerText || "").trim(); } catch {}
      if (maxText && text.length > maxText) text = text.slice(0, maxText) + "...";
      const href = (el.href !== undefined && el.href !== null) ? String(el.href) : undefined;
      const type = (el.type !== undefined && el.type !== null) ? String(el.type) : undefined;
      const value = (el.value !== undefined && el.value !== null) ? String(el.value).slice(0, 500) : undefined;
      nodes.push({
        ref,
        parentRef: cur.parentRef,
        depth: cur.depth,
        tag,
        ...(id ? { id } : {}),
        ...(className ? { className } : {}),
        ...(role ? { role } : {}),
        ...(name ? { name } : {}),
        ...(text ? { text } : {}),
        ...(href ? { href } : {}),
        ...(type ? { type } : {}),
        ...(value ? { value } : {}),
      });
      const children = el.children ? Array.from(el.children) : [];
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ el: children[i], depth: cur.depth + 1, parentRef: ref });
      }
    }
    return { nodes };
  })()`;
  const evaluated = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const nodes = evaluated?.result?.value?.nodes;
  return { nodes: Array.isArray(nodes) ? nodes : [] };
}

async function getDomTextFromSession(send, options = {}) {
  const maxChars = Math.max(0, Math.min(5_000_000, Math.floor(options.maxChars ?? 200_000)));
  const selectorExpr = options.selector ? JSON.stringify(options.selector) : "null";
  const format = options.format === "html" ? "html" : "text";
  const expression = `(() => {
    const fmt = ${JSON.stringify(format)};
    const max = ${JSON.stringify(maxChars)};
    const sel = ${selectorExpr};
    const pick = sel ? document.querySelector(sel) : null;
    let out = "";
    if (fmt === "text") {
      const el = pick || document.body || document.documentElement;
      try { out = String(el && el.innerText ? el.innerText : ""); } catch { out = ""; }
    } else {
      const el = pick || document.documentElement;
      try { out = String(el && el.outerHTML ? el.outerHTML : ""); } catch { out = ""; }
    }
    if (max && out.length > max) out = out.slice(0, max) + "\\n<!-- ...truncated... -->";
    return out;
  })()`;
  const evaluated = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const textValue = evaluated?.result?.value ?? "";
  const text =
    typeof textValue === "string"
      ? textValue
      : typeof textValue === "number" || typeof textValue === "boolean"
        ? String(textValue)
        : "";
  return { text };
}

async function querySelectorFromSession(send, options = {}) {
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 20)));
  const maxText = Math.max(0, Math.min(5000, Math.floor(options.maxTextChars ?? 500)));
  const maxHtml = Math.max(0, Math.min(20000, Math.floor(options.maxHtmlChars ?? 1500)));
  const expression = `(() => {
    const sel = ${JSON.stringify(options.selector ?? "")};
    const lim = ${JSON.stringify(limit)};
    const maxText = ${JSON.stringify(maxText)};
    const maxHtml = ${JSON.stringify(maxHtml)};
    const lower = (value) => String(value || "").toLocaleLowerCase();
    const els = Array.from(document.querySelectorAll(sel)).slice(0, lim);
    return els.map((el, i) => {
      const tag = lower(el.tagName);
      const id = el.id ? String(el.id) : undefined;
      const className = el.className ? String(el.className).slice(0, 300) : undefined;
      let text = "";
      try { text = String(el.innerText || "").trim(); } catch {}
      if (maxText && text.length > maxText) text = text.slice(0, maxText) + "...";
      const value = (el.value !== undefined && el.value !== null) ? String(el.value).slice(0, 500) : undefined;
      const href = (el.href !== undefined && el.href !== null) ? String(el.href) : undefined;
      let outerHTML = "";
      try { outerHTML = String(el.outerHTML || ""); } catch {}
      if (maxHtml && outerHTML.length > maxHtml) outerHTML = outerHTML.slice(0, maxHtml) + "...";
      return {
        index: i + 1,
        tag,
        ...(id ? { id } : {}),
        ...(className ? { className } : {}),
        ...(text ? { text } : {}),
        ...(value ? { value } : {}),
        ...(href ? { href } : {}),
        ...(outerHTML ? { outerHTML } : {}),
      };
    });
  })()`;
  const evaluated = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const matches = evaluated?.result?.value;
  return { matches: Array.isArray(matches) ? matches : [] };
}

function browserTabMatchesQuery(tab, query) {
  const needle = normalizeProfileToken(query);
  if (!needle) {
    return true;
  }
  return [
    tab.id,
    tab.suggestedTargetId,
    tab.tabId,
    tab.label,
    tab.targetId,
    tab.url,
    tab.title,
    tab.browserUrl,
    tab.source,
    tab.sessionName,
    tab.mode,
    ...(tab.browserNames ?? []),
    ...(tab.profileIds ?? []),
    ...(tab.profileNames ?? []),
  ].filter(Boolean).some((value) => normalizeProfileToken(value).includes(needle));
}

function selectBrowserTabCandidate(tabs, query) {
  const exactUrl = tabs.filter((tab) => tab.url === query);
  if (exactUrl.length === 1) {
    return exactUrl[0];
  }
  if (exactUrl.length > 1) {
    throw new Error(`Tab query "${query}" matched multiple exact URLs:\n${formatBrowserTabCandidates(exactUrl)}`);
  }
  const exactId = tabs.filter((tab) =>
    tab.id === query ||
    tab.targetId === query ||
    tab.suggestedTargetId === query ||
    tab.tabId === query ||
    tab.label === query
  );
  if (exactId.length === 1) {
    return exactId[0];
  }
  if (exactId.length > 1) {
    throw new Error(`Tab query "${query}" matched multiple target IDs:\n${formatBrowserTabCandidates(exactId)}`);
  }
  if (tabs.length === 1) {
    return tabs[0];
  }
  if (tabs.length > 1) {
    throw new Error(`Tab query "${query}" is ambiguous:\n${formatBrowserTabCandidates(tabs)}`);
  }
  return null;
}

function isAbsoluteUrl(value) {
  try {
    const parsed = new URL(String(value ?? ""));
    return Boolean(parsed.protocol && parsed.hostname);
  } catch {
    return false;
  }
}

function pageCandidatesForBrowserTab(pages, tab, query) {
  const idMatches = pages.filter((page) => String(page.id) === String(tab.targetId));
  if (idMatches.length > 0) {
    return idMatches;
  }
  const exactUrlMatches = pages.filter((page) => page.url === tab.url);
  if (exactUrlMatches.length > 0) {
    return exactUrlMatches;
  }
  const queryText = String(query ?? "").trim();
  if (!queryText || isAbsoluteUrl(queryText)) {
    return [];
  }
  return pages.filter((page) => page.url.includes(queryText));
}

async function selectBrowserTabForAutomation(query, flags = {}) {
  const tabs = await findBrowserTabs({
    query,
    browser: flags.browser,
    browserUrl: flags.browserUrl,
    cdpUrl: flags.cdpUrl,
    allSessions: flags.allSessions,
    session: flags.session || activeSessionNameFromFlags(flags),
    stateFile: flags.stateFile,
  });
  const tab = selectBrowserTabCandidate(tabs, query);
  if (!tab) {
    throw new Error(`No debuggable tab matched "${query}". Run \`realbrowser find-tab "${query}" --all-sessions\`; if nothing appears, open the URL with \`realbrowser open --profile <id> <url>\` and enable remote debugging for that profile.`);
  }
  if (tab.source === "session") {
    return await selectSessionTabForAutomation(tab, query, flags);
  }
  const autoSessionName = !flags.stateFile && !sessionNameFromFlags(flags) ? autoSessionNameForBrowserTab(tab) : "";
  const attachFlags = {
    ...flags,
    ...(autoSessionName ? { session: autoSessionName } : {}),
    browserUrl: tab.browserWsEndpoint ?? tab.browserUrl,
    noFallback: true,
  };
  const state = await ensureDaemon(attachFlags);
  const pagesResult = await daemonRpc(state, { command: "tabs", args: [], flags: {} });
  const pages = parseListPagesResult(pagesResult);
  const candidates = pageCandidatesForBrowserTab(pages, tab, query);
  if (candidates.length !== 1) {
    return ambiguousTabSelectionResult(
      tab,
      pages,
      [
        `Attached to ${tab.browserUrl}, but could not map the CDP target to a single MCP page.`,
        `Matched tab: ${tab.title || "(untitled)"} ${tab.url}`,
        "Run `realbrowser tabs`, then `realbrowser select <pageId>` for the intended page.",
      ],
    );
  }
  const selected = await daemonRpc(state, {
    command: "select",
    args: [String(candidates[0].id)],
    flags: { front: Boolean(flags.front) },
  });
  const sessionName = effectiveSessionNameFromFlags(attachFlags);
  if (sessionName && shouldActivateSession(flags)) {
    await writeActiveSessionName(sessionName);
  }
  return {
    text: [
      `Selected tab ${candidates[0].id} on ${tab.browserUrl}.`,
      `${tab.title || "(untitled)"}`,
      tab.url,
      autoSessionName ? `Activated session: ${autoSessionName}` : "",
      autoSessionName ? `Continue with: realbrowser observe` : "",
      tab.profileNames?.length ? `Possible profiles: ${tab.profileNames.join(", ")}` : "",
    ].filter(Boolean).join("\n"),
    quiet: String(candidates[0].id),
    tab: publicBrowserTabInfo(tab),
    page: candidates[0],
    selected,
    session: sessionName,
  };
}

function autoSessionNameForBrowserTab(tab) {
  const url = normalizeCdpHttpUrl(tab.browserUrl);
  if (!url) {
    return "cdp-browser";
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/[^a-zA-Z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "localhost";
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    return `cdp-${host}-${port}`;
  } catch {
    return "cdp-browser";
  }
}

function ambiguousTabSelectionResult(tab, pages, lines) {
  return {
    text: lines.join("\n"),
    tab: publicBrowserTabInfo(tab),
    pages,
    selected: null,
  };
}

async function selectSessionTabForAutomation(tab, query, flags = {}) {
  const state = await readJson(tab.stateFile);
  if (!state || !isProcessAlive(state.pid)) {
    throw new Error(`Session ${tab.sessionName} is no longer running.`);
  }
  await health(state);
  const pagesResult = await daemonRpc(state, { command: "tabs", args: [], flags: {} });
  const pages = parseListPagesResult(pagesResult);
  const candidates = pageCandidatesForBrowserTab(pages, tab, query);
  if (candidates.length !== 1) {
    return ambiguousTabSelectionResult(
      tab,
      pages,
      [
        `Attached to session ${tab.sessionName}, but could not map the tab to a single page.`,
        `Matched tab: ${tab.title || "(untitled)"} ${tab.url}`,
        `Run \`realbrowser --session "${tab.sessionName}" tabs\`, then \`realbrowser --session "${tab.sessionName}" select <pageId>\`.`,
      ],
    );
  }
  const selected = await daemonRpc(state, {
    command: "select",
    args: [String(candidates[0].id)],
    flags: { front: Boolean(flags.front) },
  });
  if (shouldActivateSession(flags)) {
    await writeActiveSessionName(tab.sessionName);
  }
  return {
    text: [
      `Selected tab ${candidates[0].id} in session ${tab.sessionName}.`,
      tab.url,
      `Activated session: ${tab.sessionName}`,
      "Continue with: realbrowser observe",
    ].join("\n"),
    quiet: `--session ${tab.sessionName}`,
    tab: publicBrowserTabInfo(tab),
    page: candidates[0],
    selected,
    session: tab.sessionName,
  };
}

function formatBrowserTabListText(tabs) {
  if (tabs.length === 0) {
    return "No debuggable tabs found. Enable remote debugging in the target browser/profile, search named sessions with `--all-sessions`, or open a URL with `realbrowser open --profile <id> <url>` first.";
  }
  const rows = tabs.map((tab) => ({
    id: tab.suggestedTargetId ?? tab.tabId ?? tab.id,
    context: tab.sessionName ? `session:${tab.sessionName}` : compactList(tab.profileNames, 32) || "-",
    title: truncateOneLine(tab.title || "(untitled)", 42),
    url: tab.url || "-",
  }));
  const widths = {
    id: Math.max("ID".length, ...rows.map((row) => row.id.length)),
    context: Math.max("Context".length, ...rows.map((row) => row.context.length)),
    title: Math.max("Title".length, ...rows.map((row) => row.title.length)),
  };
  const line = (row) => [
    row.id.padEnd(widths.id),
    row.context.padEnd(widths.context),
    row.title.padEnd(widths.title),
    row.url,
  ].join("  ");
  return [
    line({ id: "Target", context: "Context", title: "Title", url: "URL" }),
    line({ id: "-".repeat(widths.id), context: "-".repeat(widths.context), title: "-".repeat(widths.title), url: "---" }),
    ...rows.map(line),
    "",
    'Use: realbrowser select-tab "<target-or-url-fragment>"',
    'For named anonymous sessions: realbrowser select-tab "<query>" --all-sessions. A unique match becomes the active session for plain follow-up commands.',
  ].join("\n");
}

function formatBrowserTabCandidates(tabs) {
  return tabs.map((tab) => {
    const handle = tab.suggestedTargetId ?? tab.tabId ?? tab.id;
    return `- ${handle} (${tab.id}) ${tab.sessionName ? `[session:${tab.sessionName}] ` : ""}${tab.title || "(untitled)"} ${tab.url}`;
  }).join("\n");
}

function publicBrowserTabInfo(tab) {
  return {
    suggestedTargetId: tab.suggestedTargetId,
    tabId: tab.tabId,
    label: tab.label,
    id: tab.id,
    targetId: tab.targetId,
    cdpTargetId: tab.cdpTargetId,
    browserUrl: tab.browserUrl,
    browserWsEndpoint: tab.browserWsEndpoint,
    endpointHttpUrl: tab.endpointHttpUrl,
    webSocketDebuggerUrl: tab.webSocketDebuggerUrl,
    title: tab.title,
    url: tab.url,
    source: tab.source,
    sessionName: tab.sessionName,
    stateFile: tab.stateFile,
    mode: tab.mode,
    browserNames: tab.browserNames,
    profileIds: tab.profileIds,
    profileNames: tab.profileNames,
  };
}

function compactList(values, maxChars) {
  const text = [...new Set((values ?? []).filter(Boolean))].join(", ");
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1))}...`;
}

function truncateOneLine(value, maxChars) {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1))}...`;
}

async function launchBrowserProfile(profile, url, flags = {}) {
  const profileArg = `--profile-directory=${profile.profileDirectory}`;
  const modeArgs = flags.anonymous ? ["--incognito"] : ["--new-tab"];
  if (process.platform === "darwin") {
    return await spawnDetached(...macBrowserProfileLaunchCommand(profile, [
      profileArg,
      ...modeArgs,
      url,
    ], flags));
  }
  if (process.platform === "win32") {
    const executable = await firstExistingPath(windowsBrowserExecutableCandidates(profile.source)) ??
      findCommandOnPath(profile.source.commands ?? []);
    if (!executable) {
      throw new Error(`Cannot find an executable for ${profile.browserName}. Open the browser manually with ${profileArg}, or pass --browser-url after enabling remote debugging.`);
    }
    return await spawnDetached(executable, [profileArg, ...modeArgs, url]);
  }
  if (profile.source.appId) {
    const flatpak = findCommandOnPath(["flatpak"]);
    if (flatpak) {
      return await spawnDetached(flatpak, ["run", profile.source.appId, profileArg, ...modeArgs, url]);
    }
  }
  const command = findCommandOnPath(profile.source.commands ?? []);
  if (!command) {
    throw new Error(`Cannot find a launcher for ${profile.browserName}. Open the browser manually with ${profileArg}, or pass --browser-url after enabling remote debugging.`);
  }
  return await spawnDetached(command, [profileArg, ...modeArgs, url]);
}

function macBrowserProfileLaunchCommand(profile, args, flags = {}) {
  const openArgs = [
    ...(flags.front ? [] : ["-g"]),
    "-a",
    profile.source.appName,
    "--args",
    ...args,
  ];
  return ["open", openArgs];
}

function publicProfileInfo(profile) {
  return {
    id: profile.id,
    browser: profile.browser,
    browserName: profile.browserName,
    profileDirectory: profile.profileDirectory,
    displayName: profile.displayName,
    email: profile.email,
    accountName: profile.accountName,
    lastUsed: Boolean(profile.lastUsed),
    lastActive: Boolean(profile.lastActive),
    activeRank: profile.activeRank,
    activeTime: profile.activeTime,
    userDataDir: profile.userDataDir,
    profilePath: profile.profilePath,
    devtoolsScope: profile.devtoolsScope,
    devtoolsHttpUrl: profile.devtoolsHttpUrl,
    devtoolsWsEndpoint: profile.devtoolsWsEndpoint,
    launchSupported: profile.launchSupported,
  };
}

function windowsBrowserExecutableCandidates(source) {
  const candidates = [];
  for (const candidate of source.executablePaths ?? []) {
    const [envName, ...relativePath] = candidate;
    const base = process.env[envName];
    if (base) {
      candidates.push(path.join(base, ...relativePath));
    }
  }
  return candidates;
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates ?? []) {
    if (candidate && await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findCommandOnPath(commands) {
  for (const command of commands) {
    const resolved = findExecutableOnPath(command);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function findExecutableOnPath(command) {
  if (!command) {
    return null;
  }
  if (command.includes(path.sep) || (process.platform === "win32" && /[\\/]/u.test(command))) {
    return fs.existsSync(command) ? command : null;
  }
  const pathEntries = String(process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const extensions = process.platform === "win32"
    ? String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const fullPath = path.join(entry, process.platform === "win32" && !path.extname(command) ? `${command}${extension.toLowerCase()}` : command);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

function spawnDetached(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve({ command, args, pid: child.pid ?? null });
    });
  });
}

function modeFromState(state) {
  if (!state?.modeKey) {
    return null;
  }
  try {
    const parsed = JSON.parse(state.modeKey);
    if (parsed.browserUrl) {
      return "browserUrl";
    }
    return parsed.mode ?? null;
  } catch {
    return null;
  }
}

function noFallbackFromState(state) {
  if (!state?.modeKey) {
    return false;
  }
  try {
    const parsed = JSON.parse(state.modeKey);
    return parsed.noFallback === true;
  } catch {
    return false;
  }
}

async function dismissChromeControlledBanner() {
  if (process.platform === "darwin") {
    return await dismissChromeControlledBannerMac();
  }
  return {
    attempted: false,
    dismissed: false,
    platform: process.platform,
    reason: "unsupported-platform",
    text: `Banner dismissal is not automated on ${process.platform}; click the banner X to hide it. Remote debugging remains enabled.`,
  };
}

async function dismissChromeControlledBannerMac() {
  const configuredProcess = process.env.REALBROWSER_BROWSER_PROCESS_NAME?.trim();
  const processNames = configuredProcess
    ? [configuredProcess, ...MAC_BROWSER_PROCESS_NAMES.filter((name) => name !== configuredProcess)]
    : MAC_BROWSER_PROCESS_NAMES;
  const processList = processNames.map((name) => JSON.stringify(name)).join(", ");
  const script = `
tell application "System Events"
  set browserProcessName to missing value
  repeat with candidateName in {${processList}}
    if exists process (candidateName as text) then
      set browserProcessName to (candidateName as text)
      exit repeat
    end if
  end repeat
  if browserProcessName is missing value then return "not-running"
  tell process browserProcessName
    if not (exists window 1) then return "no-window"
    set frontmost to true
    set targetWindow to window 1
    set windowPosition to position of targetWindow
    set windowSize to size of targetWindow
    set clickX to (item 1 of windowPosition) + (item 1 of windowSize) - ${MAC_CONTROLLED_BANNER_DISMISS_RIGHT_OFFSET}
    set clickY to (item 2 of windowPosition) + ${MAC_CONTROLLED_BANNER_DISMISS_TOP_OFFSET}
    click at {clickX, clickY}
    return "clicked"
  end tell
end tell
`;
  const result = await runOsaScript(script, 1500).catch((error) => ({
    ok: false,
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error),
  }));
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  const dismissed = result.ok === true && /clicked/i.test(output);
  return {
    attempted: true,
    dismissed,
    platform: "darwin",
    reason: dismissed ? "clicked-banner-close" : "click-failed",
    text: dismissed
      ? "Dismissed the visible Chrome automation banner X. Remote debugging remains enabled."
      : `Tried to dismiss the Chrome automation banner X, but it was not confirmed. ${output ? `Detail: ${output}` : ""}`.trim(),
  };
}

function runOsaScript(script, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn("osascript", [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("osascript timed out"));
    }, timeoutMs);
    timer.unref?.();
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
    child.stdin.end(script);
  });
}

function browserControlStatus(daemon, chromeRemoteDebugging = null) {
  const mode = daemon?.mode ?? AUTO_MODE;
  const realProfile = mode === AUTO_MODE || mode === "browserUrl";
  const mcpKnown = typeof daemon?.mcpConnected === "boolean";
  const mcpConnected = daemon?.mcpConnected === true;
  const running = Boolean(daemon?.running);
  const chromeRemoteDebuggingUserEnabled = chromeRemoteDebugging?.known ? chromeRemoteDebugging.userEnabled : null;
  const cliProfileAttachPromptRequired = realProfile && !mcpConnected && !chromeRemoteDebuggingUserEnabled && !daemon?.browserUrl;
  return {
    chromeBannerText: CONTROLLED_BANNER_TEXT,
    chromeBannerExpectedNow: mcpKnown ? mcpConnected : null,
    mayAppearOnNextBrowserCommand: running && (!mcpKnown || !mcpConnected),
    realSignedInProfileMayBeControlled: realProfile && (running || mcpConnected),
    realbrowserMcpConnected: mcpKnown ? mcpConnected : null,
    defaultLocalChromeRemoteDebuggingUserEnabled: chromeRemoteDebuggingUserEnabled,
    chromeRemoteDebuggingUserEnabled,
    chromeRemoteDebuggingMetadataAppliesToActiveBrowser: mode === AUTO_MODE ? true : null,
    cliProfileAttachPromptRequired,
    canSafelySuppressBanner: false,
    canDismissBannerAfterDetach: process.platform === "darwin",
    reason: !running
      ? "No running realbrowser daemon was detected."
      : mcpKnown
        ? mcpConnected
          ? "realbrowser is connected to Chrome through Chrome DevTools MCP."
          : "realbrowser daemon is warm; page-inspection commands may attach through Chrome DevTools MCP."
        : "realbrowser daemon is running, but this daemon version did not report whether Chrome DevTools MCP is connected.",
    stopRealbrowserCommand: "realbrowser detach",
    turnOffChromeRemoteDebugging: REMOTE_DEBUGGING_SETTINGS_URL,
    note: "The Chrome banner is a browser safety indicator while attached. Plain detach closes realbrowser's session only; --dismiss-banner is the explicit best-effort browser-UI cleanup path.",
  };
}

function formatLocalStatusText(daemon, browserControl, chromeRemoteDebugging = null) {
  const metadataLine = chromeRemoteDebugging?.known
    ? `${remoteDebuggingMetadataLabel(daemon.mode)}: ${formatMaybeBoolean(chromeRemoteDebugging.userEnabled)}`
    : `${remoteDebuggingMetadataLabel(daemon.mode)}: unknown`;
  const metadataCaveat = daemon.mode && daemon.mode !== AUTO_MODE
    ? remoteDebuggingMetadataCaveat(daemon.mode)
    : "";
  if (!daemon.running) {
    const bannerLine = "Chrome banner: not attributable to a running realbrowser daemon.";
    const cleanupLine = chromeRemoteDebugging?.known && !chromeRemoteDebugging.userEnabled
      ? "Cleanup: no realbrowser cleanup needed; if a banner remains, another tool/session may still be attached."
      : `Cleanup: click the banner X to hide it, or open ${browserControl.turnOffChromeRemoteDebugging} only if you want to disable Chrome remote debugging.`;
    return [
      "realbrowser daemon: not running",
      bannerLine,
      metadataLine,
      metadataCaveat,
      cleanupLine,
    ].filter(Boolean).join("\n");
  }
  return [
    `realbrowser daemon: running pid ${daemon.pid} mode ${daemon.mode}`,
    daemon.session ? `Session: ${daemon.session}` : "",
    daemon.scriptHash ? `Daemon script: ${daemon.scriptHash}${daemon.scriptHash !== daemon.currentScriptHash ? ` (current ${daemon.currentScriptHash}; reload needed for new skill code)` : ""}` : "",
    `Chrome DevTools MCP connected: ${formatMaybeBoolean(daemon.mcpConnected)}`,
    `Dedicated fallback disabled: ${formatMaybeBoolean(daemon.noFallback)}`,
    metadataLine,
    metadataCaveat,
    `Chrome banner: ${browserControl.chromeBannerExpectedNow === true ? "expected now" : browserControl.chromeBannerExpectedNow === false ? "may appear when the next browser command attaches" : "unknown; this daemon predates banner status reporting"}`,
    `Real signed-in profile may be controlled: ${browserControl.realSignedInProfileMayBeControlled ? "yes" : "no"}`,
    browserControl.realSignedInProfileMayBeControlled && browserControl.cliProfileAttachPromptRequired === false
      ? "Profile attach: CLI reattach flag not required for routine commands; Chrome may still show its own browser-level approval prompt."
      : browserControl.realSignedInProfileMayBeControlled
        ? "Profile attach: MCP-only commands may need Chrome remote debugging enabled or explicit --allow-profile-reattach."
        : "",
    daemon.scriptHash && daemon.scriptHash !== daemon.currentScriptHash && browserControl.realSignedInProfileMayBeControlled
      ? "Reload guard: real-profile daemon restart requires --allow-profile-reattach because Chrome may show another approval dialog."
      : "",
    `Cleanup: run \`${browserControl.stopRealbrowserCommand}\` to stop realbrowser only. Add \`--dismiss-banner\` only when you explicitly want a best-effort banner-X click. Use \`${browserControl.stopRealbrowserCommand} --cleanup-remote-debugging\` only when you want to disable Chrome remote debugging too.`,
  ].filter(Boolean).join("\n");
}

function formatMaybeBoolean(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

class McpClient {
  constructor(config) {
    this.config = config;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.stderr = "";
  }

  start() {
    const args = buildMcpArgs(this.config);
    this.proc = spawn(NPX_COMMAND, args, {
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
      env: {
        ...process.env,
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1",
        CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1",
      },
    });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this.onData(chunk));
    this.proc.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-12000);
    });
    this.proc.on("exit", (code, signal) => {
      const err = new Error(`chrome-devtools-mcp exited (${code ?? signal ?? "unknown"}): ${this.stderr.trim()}`);
      for (const { reject } of this.pending.values()) {
        reject(err);
      }
      this.pending.clear();
    });
  }

  async initialize() {
    this.start();
    await withTimeout(
      this.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "realbrowser", version: CLI_VERSION },
      }),
      MCP_START_TIMEOUT_MS,
      "MCP initialize timed out",
    );
    this.notify("notifications/initialized", {});
  }

  notify(method, params) {
    this.write({ jsonrpc: "2.0", method, params });
  }

  request(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.write({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  callTool(name, args = {}) {
    return this.request("tools/call", { name, arguments: args });
  }

  async listTools() {
    const result = await this.request("tools/list", {});
    return result.tools ?? [];
  }

  write(message) {
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  onData(chunk) {
    this.buffer += chunk;
    while (true) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd === -1) {
        return;
      }
      const raw = this.buffer.slice(0, lineEnd).trim();
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (!raw) continue;
      this.handleMessage(JSON.parse(raw));
    }
  }

  handleMessage(message) {
    if (message.id === undefined) {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
    } else {
      pending.resolve(message.result);
    }
  }

  async close() {
    if (!this.proc) {
      return;
    }
    try {
      process.kill(-this.proc.pid, "SIGTERM");
    } catch {
      this.proc.kill("SIGTERM");
    }
    await sleep(100);
    if (this.proc.exitCode === null) {
      try {
        process.kill(-this.proc.pid, "SIGKILL");
      } catch {
        this.proc.kill("SIGKILL");
      }
    }
  }
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
  }

  connect() {
    if (typeof WebSocket === "undefined") {
      throw new Error("This Node runtime does not provide WebSocket; CDP WebSocket operations are unavailable.");
    }
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener("message", (event) => this.handleMessage(String(event.data)));
    this.ws.addEventListener("close", () => {
      this.closed = true;
      const error = new Error("CDP socket closed");
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP socket open timed out")), 5000);
      timeout.unref?.();
      this.ws.addEventListener("open", () => {
        clearTimeout(timeout);
        this.closed = false;
        resolve();
      }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error(`CDP socket failed to open: ${this.wsUrl}`));
      }, { once: true });
    });
  }

  request(method, params = {}, options = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const message = { id, method, params };
    if (options.sessionId) {
      message.sessionId = options.sessionId;
    }
    const timeoutMs = Number.parseInt(
      String(options.timeoutMs ?? process.env.REALBROWSER_CDP_REQUEST_TIMEOUT_MS ?? "15000"),
      10,
    );
    let timer = null;
    const promise = new Promise((resolve, reject) => {
      timer = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;
      timer?.unref?.();
      this.pending.set(id, { resolve, reject, timer });
    });
    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this.pending.delete(id);
      clearTimeout(timer);
      return Promise.reject(error);
    }
    return promise;
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  handleMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  close() {
    try {
      this.closed = true;
      this.ws?.close();
    } catch {
      // Best effort.
    }
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

function buildMcpArgs(config) {
  const args = ["-y", PACKAGE_SPEC];
  if (config.browserUrl) {
    const directWsEndpoint = normalizeCdpWsEndpoint(config.browserUrl);
    if (directWsEndpoint) {
      args.push(`--wsEndpoint=${directWsEndpoint}`);
    } else {
      args.push(`--browserUrl=${normalizeCdpHttpUrl(config.browserUrl) ?? config.browserUrl}`);
    }
  } else if (config.mode === AUTO_MODE) {
    args.push("--autoConnect");
  } else if (config.mode === ANONYMOUS_MODE) {
    if (config.keepAnonymous && config.profileDir) {
      args.push(`--userDataDir=${config.profileDir}`);
    } else {
      args.push("--isolated=true");
    }
    args.push("--chromeArg=--incognito");
  } else {
    args.push(`--userDataDir=${config.profileDir}`);
  }
  if (config.headless && !config.browserUrl && config.mode !== AUTO_MODE) {
    args.push("--headless=true");
  }
  args.push("--experimentalStructuredContent");
  args.push("--experimental-page-id-routing");
  args.push("--no-usage-statistics");
  args.push("--no-performance-crux");
  return args;
}

function isAttachFailure(error) {
  const message = String(error?.message ?? error).toLowerCase();
  return [
    "autoconnect",
    "auto-connect",
    "could not connect",
    "failed to connect",
    "econnrefused",
    "browser is not running",
    "remote debugging",
    "permission",
    "no browser",
    "target closed",
  ].some((needle) => message.includes(needle));
}

function normalizeToolResult(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  const text = content
    .map((entry) => {
      if (entry?.type === "text") {
        return entry.text ?? "";
      }
      if (entry?.type === "image") {
        return `[image/${entry.mimeType ?? "unknown"} ${entry.data?.length ?? 0} base64 chars]`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
  return {
    text,
    structuredContent: result?.structuredContent,
    raw: result,
  };
}

function parseListPagesResult(result) {
  const pages = [];
  const structuredPages = result?.structuredContent?.pages;
  if (Array.isArray(structuredPages)) {
    for (const entry of structuredPages) {
      if (entry?.id === undefined) {
        continue;
      }
      pages.push({
        id: parsePageId(entry.id),
        tabId: entry.tabId === undefined ? undefined : String(entry.tabId),
        suggestedTargetId: entry.suggestedTargetId === undefined ? undefined : String(entry.suggestedTargetId),
        targetId: entry.targetId === undefined ? undefined : String(entry.targetId),
        title: entry.title === undefined ? "" : String(entry.title),
        url: String(entry.url ?? ""),
        selected: entry.selected === true,
      });
    }
  }
  if (pages.length > 0) {
    return pages;
  }
  const text = String(result?.text ?? "");
  const pattern = /^\s*(\d+):\s+(.+?)(?:\s+\[(selected)\])?\s*$/gim;
  let match;
  while ((match = pattern.exec(text))) {
    pages.push({
      id: parsePageId(match[1]),
      url: match[2]?.trim() ?? "",
      selected: Boolean(match[3]),
    });
  }
  return pages;
}

function isBlankPageUrl(url) {
  const value = String(url ?? "").trim().toLowerCase();
  return !value || value === "about:blank" || value === "chrome://newtab/" || value === "chrome://new-tab-page/";
}

function sameDocumentUrl(left, right) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right, leftUrl.origin);
    leftUrl.hash = "";
    rightUrl.hash = "";
    return leftUrl.href === rightUrl.href;
  } catch {
    return String(left ?? "").replace(/#.*$/u, "") === String(right ?? "").replace(/#.*$/u, "");
  }
}

function matchingMcpPagesForCdpPage(mcpPages, cdpPage) {
  const targetUrl = String(cdpPage?.url ?? "");
  const exactMatches = mcpPages.filter((page) => page.url === targetUrl);
  return exactMatches.length > 0
    ? exactMatches
    : mcpPages.filter((page) => sameDocumentUrl(page.url, targetUrl));
}

function toolError(result, name) {
  if (!result?.isError) {
    return null;
  }
  const normalized = normalizeToolResult(result);
  return new Error(normalized.text || `Tool ${name} failed`);
}

class BrowserDaemon {
  constructor(stateFile) {
    this.stateFile = stateFile;
    this.mode = process.env.REALBROWSER_MODE === ANONYMOUS_MODE
      ? ANONYMOUS_MODE
      : process.env.REALBROWSER_MODE === DEDICATED_MODE
        ? DEDICATED_MODE
        : AUTO_MODE;
    this.browserUrl = process.env.REALBROWSER_BROWSER_URL?.trim() || "";
    this.profileDir = process.env.REALBROWSER_PROFILE_DIR ?? (this.mode === ANONYMOUS_MODE ? "" : DEFAULT_PROFILE_DIR);
    this.noFallback = process.env.REALBROWSER_NO_FALLBACK === "1";
    this.keepAnonymous = process.env.REALBROWSER_KEEP_ANONYMOUS === "1";
    this.headless = parseBooleanEnv(process.env.REALBROWSER_HEADLESS) ?? desiredHeadless({}, this.mode);
    this.mcp = null;
    this.tools = null;
    this.hiddenConsoleLines = new Set();
    this.hiddenNetworkLines = new Set();
    this.selectedCdpTargetId = null;
    this.cdpTargetAliases = new Map();
    this.cdpTargetHandles = new Map();
    this.cdpRoleRefsByTarget = new Map();
    this.nextCdpTargetHandle = 1;
    this.cdpBrowserClient = null;
    this.cdpBrowserClientPromise = null;
    this.cdpPageSessions = new Map();
    this.cdpPageSessionPromises = new Map();
    this.cdpSessionTargets = new Map();
    this.cdpConsoleBuffers = new Map();
    this.nextCdpConsoleMessageId = 1;
  }

  async ensureMcp() {
    if (this.mcp) {
      return this.mcp;
    }
    const commandFlags = this.activeCommandFlags ?? {};
    const controllerAllowed = await allowsProfileControllerStartForCurrentChrome(commandFlags, {
      browserUrl: this.browserUrl,
      reusedRealProfileSession: commandFlags.reusedRealProfileSession,
    });
    if (isRealProfileSessionMode(this.currentMode()) && !controllerAllowed) {
      throw usageError([
        "Refusing to start a Chrome DevTools MCP controller for a real Chrome profile because Chrome may show an \"Allow remote debugging?\" approval dialog.",
        `If Chrome remote debugging is already enabled, open ${REMOTE_DEBUGGING_SETTINGS_URL}, allow Chrome's browser prompt if shown, then rerun the same command without adding CLI approval flags.`,
        "Use `--allow-profile-reattach` only when you intentionally accept a fresh controller attach or replacement.",
      ].join("\n"));
    }
    if (this.profileDir) {
      await fsp.mkdir(this.profileDir, { recursive: true });
    }
    const mode = this.browserUrl ? "browserUrl" : this.mode;
    const client = new McpClient({
      mode: this.browserUrl ? DEDICATED_MODE : this.mode,
      browserUrl: this.browserUrl,
      profileDir: this.profileDir,
      headless: this.headless,
      keepAnonymous: this.keepAnonymous,
    });
    await client.initialize();
    this.mcp = client;
    this.activeMode = mode;
    return client;
  }

  currentMode() {
    return this.activeMode ?? (this.browserUrl ? "browserUrl" : this.mode);
  }

  browserControlStatus() {
    return browserControlStatus({
      running: true,
      mode: this.currentMode(),
      mcpConnected: Boolean(this.mcp),
    });
  }

  cdpEndpoint() {
    const rawBrowserUrl = this.browserUrl.trim();
    const httpUrl = normalizeCdpHttpUrl(rawBrowserUrl);
    const wsEndpoint = normalizeCdpWsEndpoint(rawBrowserUrl);
    if (!httpUrl && !wsEndpoint) {
      return null;
    }
    return {
      httpUrl,
      wsEndpoint,
      browserUrl: this.browserUrl,
    };
  }

  async cdpBrowserWebSocketUrl() {
    const endpoint = this.cdpEndpoint();
    if (endpoint?.wsEndpoint) {
      return endpoint.wsEndpoint;
    }
    if (endpoint?.httpUrl) {
      return await resolveCdpBrowserWebSocketUrl(endpoint.httpUrl);
    }
    throw new Error("No CDP browser endpoint configured");
  }

  async ensureCdpBrowserClient() {
    if (this.cdpBrowserClient && !this.cdpBrowserClient.closed) {
      return this.cdpBrowserClient;
    }
    if (this.cdpBrowserClientPromise) {
      return await this.cdpBrowserClientPromise;
    }
    this.cdpBrowserClientPromise = (async () => {
      const client = new CdpClient(await this.cdpBrowserWebSocketUrl());
      await client.connect();
      client.onEvent((message) => this.handleCdpEvent(message));
      this.cdpBrowserClient = client;
      return client;
    })();
    try {
      return await this.cdpBrowserClientPromise;
    } finally {
      this.cdpBrowserClientPromise = null;
    }
  }

  closeCdpBrowserClient() {
    this.cdpBrowserClient?.close();
    this.cdpBrowserClient = null;
    this.cdpBrowserClientPromise = null;
    this.cdpPageSessions.clear();
    this.cdpPageSessionPromises.clear();
    this.cdpSessionTargets.clear();
  }

  clearCdpPageSession(targetId) {
    const normalizedTargetId = String(targetId ?? "").trim();
    if (!normalizedTargetId) {
      return;
    }
    const sessionId = this.cdpPageSessions.get(normalizedTargetId);
    if (sessionId) {
      this.cdpSessionTargets.delete(sessionId);
    }
    this.cdpPageSessions.delete(normalizedTargetId);
    this.cdpPageSessionPromises.delete(normalizedTargetId);
  }

  handleCdpEvent(message) {
    if (message?.method === "Target.detachedFromTarget") {
      const sessionId = String(message.params?.sessionId ?? "");
      const targetId = this.cdpSessionTargets.get(sessionId);
      if (targetId) {
        this.clearCdpPageSession(targetId);
      }
      return;
    }
    if (message?.method === "Target.targetDestroyed") {
      this.clearCdpPageSession(message.params?.targetId);
      return;
    }
    const targetId = this.cdpSessionTargets.get(String(message?.sessionId ?? ""));
    if (!targetId) {
      return;
    }
    if (message.method === "Runtime.consoleAPICalled") {
      this.pushCdpConsoleMessage(targetId, cdpConsoleMessageFromRuntimeEvent(message.params ?? {}, this.nextCdpConsoleMessageId));
      this.nextCdpConsoleMessageId += 1;
    } else if (message.method === "Runtime.exceptionThrown") {
      this.pushCdpConsoleMessage(targetId, cdpConsoleMessageFromExceptionEvent(message.params ?? {}, this.nextCdpConsoleMessageId));
      this.nextCdpConsoleMessageId += 1;
    } else if (message.method === "Log.entryAdded") {
      this.pushCdpConsoleMessage(targetId, cdpConsoleMessageFromLogEvent(message.params?.entry ?? {}, this.nextCdpConsoleMessageId));
      this.nextCdpConsoleMessageId += 1;
    }
  }

  pushCdpConsoleMessage(targetId, message) {
    if (!message) {
      return;
    }
    const normalizedTargetId = String(targetId ?? "").trim();
    const buffer = this.cdpConsoleBuffers.get(normalizedTargetId) ?? [];
    buffer.push({ ...message, targetId: normalizedTargetId });
    if (buffer.length > CDP_CONSOLE_BUFFER_LIMIT) {
      buffer.splice(0, buffer.length - CDP_CONSOLE_BUFFER_LIMIT);
    }
    this.cdpConsoleBuffers.set(normalizedTargetId, buffer);
  }

  async cdpBrowserRequest(method, params = {}, options = {}, retry = true) {
    const client = await this.ensureCdpBrowserClient();
    try {
      return await client.request(method, params, options);
    } catch (error) {
      if (retry && client.closed) {
        this.closeCdpBrowserClient();
        return await this.cdpBrowserRequest(method, params, options, false);
      }
      throw error;
    }
  }

  shouldUseFastCdp(flags = {}) {
    return flags.mcp !== true && flags.fast !== false && Boolean(this.cdpEndpoint());
  }

  shouldFallbackToMcpAfterCdp(flags = {}) {
    if (flags.mcp === true || flags.allowProfileReattach === true) {
      return true;
    }
    if (flags.noFallback === true || this.noFallback) {
      return false;
    }
    return !isRealProfileSessionMode(this.currentMode());
  }

  async cdpTargets() {
    const endpoint = this.cdpEndpoint();
    if (!endpoint) {
      return [];
    }
    if (endpoint.httpUrl) {
      try {
        const targets = await fetchCdpTargetListFromHttp(endpoint.httpUrl);
        return targets.filter((target) => !target?.type || target.type === "page");
      } catch (error) {
        if (!endpoint.wsEndpoint) {
          const wsUrl = await resolveCdpBrowserWebSocketUrl(endpoint.httpUrl).catch(() => "");
          if (wsUrl) {
            const targets = await fetchCdpTargetListFromWs(wsUrl);
            return targets.filter((target) => !target?.type || target.type === "page");
          }
          throw error;
        }
      }
    }
    if (endpoint.wsEndpoint) {
      const result = await this.cdpBrowserRequest("Target.getTargets", {});
      const targets = Array.isArray(result?.targetInfos) ? result.targetInfos : [];
      return targets.filter((target) => !target?.type || target.type === "page");
    }
    return [];
  }

  async cdpPages() {
    const targets = await this.cdpTargets();
    const currentTargetIds = new Set();
    const pages = targets.map((target, index) => {
      const targetId = String(target.id ?? target.targetId ?? "");
      currentTargetIds.add(targetId);
      let tabId = this.cdpTargetHandles.get(targetId);
      if (!tabId) {
        tabId = `t${this.nextCdpTargetHandle}`;
        this.nextCdpTargetHandle += 1;
        this.cdpTargetHandles.set(targetId, tabId);
      }
      const id = Number.parseInt(tabId.slice(1), 10) || index + 1;
      return {
        id,
        tabId,
        suggestedTargetId: tabId,
        targetId,
        url: String(target.url ?? ""),
        title: String(target.title ?? ""),
        webSocketDebuggerUrl: target.webSocketDebuggerUrl ?? null,
        selected: Boolean(this.selectedCdpTargetId && targetId === this.selectedCdpTargetId),
      };
    });
    for (const targetId of this.cdpTargetHandles.keys()) {
      if (!currentTargetIds.has(targetId)) {
        this.cdpTargetHandles.delete(targetId);
        this.cdpRoleRefsByTarget.delete(targetId);
        this.clearCdpPageSession(targetId);
      }
    }
    if (this.selectedCdpTargetId && !pages.some((page) => page.targetId === this.selectedCdpTargetId)) {
      this.selectedCdpTargetId = null;
    }
    this.cdpTargetAliases = new Map();
    for (const page of pages) {
      for (const alias of [String(page.id), page.tabId, page.suggestedTargetId, page.targetId]) {
        if (alias) {
          this.cdpTargetAliases.set(alias, page.targetId);
        }
      }
    }
    return pages;
  }

  async handleTabs(flags = {}) {
    if (this.shouldUseFastCdp(flags)) {
      try {
        const pages = await this.cdpPages();
        return formatCdpPagesResult(pages);
      } catch (error) {
        if (!this.shouldFallbackToMcpAfterCdp(flags)) {
          throw error;
        }
        // Fall through to MCP when the current session policy allows it.
      }
    }
    return await this.callTool("list_pages", {});
  }

  async resolveCdpTargetId(flags = {}) {
    if (!this.shouldUseFastCdp(flags)) {
      return null;
    }
    const pages = await this.cdpPages();
    if (pages.length === 0) {
      throw new Error("No CDP page targets found");
    }
    const requestedTargetId = String(flags.targetId ?? "").trim();
    if (requestedTargetId) {
      const direct = pages.find((page) => page.targetId === requestedTargetId);
      if (direct) {
        return direct.targetId;
      }
      throw new Error(`No CDP page target matched target id ${requestedTargetId}`);
    }
    const requested = flags.page !== undefined ? String(flags.page) : "";
    if (requested) {
      const targetId = this.cdpTargetAliases.get(requested);
      if (targetId) {
        return targetId;
      }
      const exactUrl = pages.filter((page) => page.url === requested);
      if (exactUrl.length === 1) {
        return exactUrl[0].targetId;
      }
      throw new Error(`No CDP page target matched ${requested}`);
    }
    if (this.selectedCdpTargetId && pages.some((page) => page.targetId === this.selectedCdpTargetId)) {
      return this.selectedCdpTargetId;
    }
    const selected = pages.find((page) => page.selected) ?? pages[0];
    this.selectedCdpTargetId = selected.targetId;
    return selected.targetId;
  }

  async cdpPageForTargetId(targetId) {
    const pages = await this.cdpPages();
    return pages.find((page) => page.targetId === targetId) ?? null;
  }

  async ensureCdpPageSession(targetId) {
    const normalizedTargetId = String(targetId ?? "").trim();
    if (!normalizedTargetId) {
      throw new Error("CDP page session requires a target id");
    }
    const client = await this.ensureCdpBrowserClient();
    const existing = this.cdpPageSessions.get(normalizedTargetId);
    if (existing && !client.closed) {
      return existing;
    }
    const pending = this.cdpPageSessionPromises.get(normalizedTargetId);
    if (pending) {
      return await pending;
    }
    const promise = (async () => {
      const attached = await client.request("Target.attachToTarget", {
        targetId: normalizedTargetId,
        flatten: true,
      });
      const sessionId = String(attached?.sessionId ?? "");
      if (!sessionId) {
        throw new Error(`CDP attach did not return a session id for target ${normalizedTargetId}`);
      }
      this.cdpPageSessions.set(normalizedTargetId, sessionId);
      this.cdpSessionTargets.set(sessionId, normalizedTargetId);
      const send = async (method, params = {}) => await client.request(method, params, { sessionId });
      await prepareCdpPageSession(send);
      return sessionId;
    })();
    this.cdpPageSessionPromises.set(normalizedTargetId, promise);
    try {
      return await promise;
    } catch (error) {
      this.clearCdpPageSession(normalizedTargetId);
      throw error;
    } finally {
      this.cdpPageSessionPromises.delete(normalizedTargetId);
    }
  }

  async cdpPageRequest(targetId, method, params = {}, options = {}, retry = true) {
    const client = await this.ensureCdpBrowserClient();
    const sessionId = await this.ensureCdpPageSession(targetId);
    try {
      return await client.request(method, params, { ...options, sessionId });
    } catch (error) {
      if (retry && isInvalidCdpSessionError(error)) {
        this.clearCdpPageSession(targetId);
        return await this.cdpPageRequest(targetId, method, params, options, false);
      }
      throw error;
    }
  }

  async withCdpPageSession(targetId, callback) {
    const client = await this.ensureCdpBrowserClient();
    const sessionId = await this.ensureCdpPageSession(targetId);
    try {
      return await callback(client, sessionId);
    } catch (error) {
      if (isInvalidCdpSessionError(error)) {
        this.clearCdpPageSession(targetId);
      }
      throw error;
    }
  }

  async cdpRoleSnapshotData(flags = {}) {
    const targetId = await this.resolveCdpTargetId(flags);
    const efficient = flags.efficient || flags.mode === "efficient";
    const maxDepth =
      flags.depth !== undefined
        ? parsePositiveInteger(flags.depth, "depth")
        : efficient
          ? 6
          : undefined;
    const options = {
      interactive: Boolean(flags.interactive || efficient),
      compact: Boolean(flags.compact || efficient),
      ...(maxDepth !== undefined ? { maxDepth } : {}),
    };
    const built = await this.withCdpPageSession(targetId, async (client, sessionId) => {
      const send = async (method, params = {}) => await client.request(method, params, { sessionId });
      await prepareCdpPageSession(send);
      return await buildCdpRoleSnapshotFromSession({
        send,
        options,
        selector: flags.selector,
        urls: Boolean(flags.urls),
        recurseIframes: true,
        nextRef: { value: 1 },
      });
    });
    this.cdpRoleRefsByTarget.set(targetId, built.refs);
    return { built, options, targetId };
  }

  async cdpRoleSnapshot(flags = {}) {
    const { built, options, targetId } = await this.cdpRoleSnapshotData(flags);
    const snapshot = built.lines.join("\n").trim() || (options.interactive ? "(no interactive elements)" : "(empty page)");
    return {
      snapshot,
      refs: built.refs,
      stats: {
        lines: snapshot.split("\n").length,
        chars: snapshot.length,
        refs: built.stats.refs,
        interactive: built.stats.interactive,
      },
      targetId,
      cdp: true,
    };
  }

  async snapshotAria(flags = {}) {
    const targetId = await this.resolveCdpTargetId(flags);
    const requestedLimit = flags.limit;
    return await this.withCdpPageSession(targetId, async (client, sessionId) => {
      const send = async (method, params = {}) => await client.request(method, params, { sessionId });
      await prepareCdpPageSession(send);
      const snap = await snapshotAriaFromSession(send, {
        limit: requestedLimit ? parsePositiveInteger(requestedLimit, "limit") : undefined,
      });
      return { ...snap, targetId, cdp: true };
    });
  }

  async snapshotDom(flags = {}) {
    const targetId = await this.resolveCdpTargetId(flags);
    const requestedLimit = flags.domLimit ?? flags.nodes ?? flags.limit;
    const requestedMaxText = flags.maxTextChars ?? flags.maxText ?? flags.textChars;
    return await this.withCdpPageSession(targetId, async (client, sessionId) => {
      const send = async (method, params = {}) => await client.request(method, params, { sessionId });
      await prepareCdpPageSession(send);
      const snap = await snapshotDomFromSession(send, {
        limit: requestedLimit ? parsePositiveInteger(requestedLimit, "dom-limit") : undefined,
        maxTextChars: requestedMaxText ? parsePositiveInteger(requestedMaxText, "max-text-chars") : undefined,
      });
      return { ...snap, targetId, cdp: true };
    });
  }

  async getDomText(format, flags = {}, selector = undefined) {
    const targetId = await this.resolveCdpTargetId(flags);
    const requestedMaxChars = flags.maxChars;
    return await this.withCdpPageSession(targetId, async (client, sessionId) => {
      const send = async (method, params = {}) => await client.request(method, params, { sessionId });
      await prepareCdpPageSession(send);
      const result = await getDomTextFromSession(send, {
        format,
        selector,
        maxChars: requestedMaxChars ? parsePositiveInteger(requestedMaxChars, "max-chars") : undefined,
      });
      return { ...result, targetId, cdp: true };
    });
  }

  async querySelector(selector, flags = {}) {
    const targetId = await this.resolveCdpTargetId(flags);
    return await this.withCdpPageSession(targetId, async (client, sessionId) => {
      const send = async (method, params = {}) => await client.request(method, params, { sessionId });
      await prepareCdpPageSession(send);
      const result = await querySelectorFromSession(send, {
        selector,
        limit: flags.limit ? parsePositiveInteger(flags.limit, "limit") : undefined,
        maxTextChars: flags.maxTextChars ? parsePositiveInteger(flags.maxTextChars, "max-text-chars") : undefined,
        maxHtmlChars: flags.maxHtmlChars ? parsePositiveInteger(flags.maxHtmlChars, "max-html-chars") : undefined,
      });
      return { ...result, targetId, cdp: true };
    });
  }

  async cdpRoleRefInfo(ref, flags = {}) {
    const targetId = await this.resolveCdpTargetId(flags);
    const normalized = normalizeCdpRoleRef(ref);
    if (!normalized) {
      throw new Error(`Not a CDP role ref: ${ref}`);
    }
    const refs = this.cdpRoleRefsByTarget.get(targetId);
    const info = refs?.[normalized];
    if (!info) {
      throw new Error(`Unknown CDP role ref "${normalized}". Run snapshot first and use a current [ref=eN] value.`);
    }
    if (typeof info.backendDOMNodeId !== "number") {
      throw new Error(`CDP role ref "${normalized}" is not backed by a DOM node.`);
    }
    return { targetId, ref: normalized, info };
  }

  async callFunctionOnCdpRoleRef(ref, flags = {}, functionDeclaration, callArguments = []) {
    const { targetId, ref: normalized, info } = await this.cdpRoleRefInfo(ref, flags);
    return await this.withCdpPageSession(targetId, async (client, sessionId) => {
      const send = async (method, params = {}) => await client.request(method, params, { sessionId });
      await prepareCdpPageSession(send);
      const resolved = await send("DOM.resolveNode", { backendNodeId: info.backendDOMNodeId });
      const objectId = resolved?.object?.objectId;
      if (!objectId) {
        throw new Error(`Could not resolve CDP role ref "${normalized}" to a runtime object.`);
      }
      const evaluated = await send("Runtime.callFunctionOn", {
        objectId,
        functionDeclaration,
        ...(callArguments.length ? { arguments: callArguments } : {}),
        awaitPromise: true,
        returnByValue: true,
      });
      if (evaluated?.exceptionDetails) {
        throw new Error(formatCdpException(evaluated.exceptionDetails));
      }
      return { targetId, ref: normalized, value: evaluated?.result?.value };
    });
  }

  async cdpRoleRefElementBox(ref, flags = {}) {
    const { targetId, ref: normalized, value: box } = await this.callFunctionOnCdpRoleRef(ref, flags, `function() {
      if (!(this instanceof Element)) return null;
      this.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      const rect = this.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        tag: this.tagName ? this.tagName.toLowerCase() : "",
        text: String(this.innerText || this.textContent || this.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim().slice(0, 160),
      };
    }`);
    if (!box || !(box.width > 0) || !(box.height > 0)) {
      throw new Error(`CDP role ref "${normalized}" is not visible or has no box.`);
    }
    return { targetId, ref: normalized, box };
  }

  async clickCdpRoleRef(ref, flags = {}) {
    const { targetId, ref: normalized, box } = await this.cdpRoleRefElementBox(ref, flags);
    await this.withCdpPageSession(targetId, async (client, sessionId) => {
      const send = async (method, params = {}) => await client.request(method, params, { sessionId });
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
    });
    return { text: `clicked ${normalized}`, cdp: true, targetId, ref: normalized };
  }

  async hoverCdpRoleRef(ref, flags = {}) {
    const { targetId, ref: normalized, box } = await this.cdpRoleRefElementBox(ref, flags);
    await this.withCdpPageSession(targetId, async (client, sessionId) => {
      const send = async (method, params = {}) => await client.request(method, params, { sessionId });
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
    });
    return { text: `hovered ${normalized}`, cdp: true, targetId, ref: normalized };
  }

  async fillCdpRoleRef(ref, value, flags = {}) {
    const stringValue = String(value ?? "");
    const { targetId, ref: normalized } = await this.callFunctionOnCdpRoleRef(ref, flags, `function(value) {
      if (!(this instanceof HTMLElement)) throw new Error("Target is not an HTMLElement");
      this.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      this.focus();
      if (this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement || this instanceof HTMLSelectElement) {
        this.value = value;
        this.dispatchEvent(new Event("input", { bubbles: true }));
        this.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      if (this.isContentEditable) {
        this.textContent = value;
        this.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        this.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      throw new Error("Target is not fillable");
    }`, [{ value: stringValue }]);
    return { text: `filled ${normalized}`, cdp: true, targetId, ref: normalized };
  }

  async cdpActivateTarget(targetId) {
    const endpoint = this.cdpEndpoint();
    await this.cdpPageRequest(targetId, "Page.bringToFront", {}).catch(() => null);
    if (endpoint?.httpUrl) {
      const activated = await cdpHttpJson(endpoint.httpUrl, `/json/activate/${encodeURIComponent(targetId)}`, {
        timeoutMs: 3000,
      }).then(() => true).catch(() => false);
      if (activated) {
        return;
      }
    }
    try {
      await this.cdpBrowserRequest("Target.activateTarget", { targetId }, { timeoutMs: 3000 });
    } catch {
      // Best effort.
    }
  }

  async cdpCreateTarget(url, flags = {}) {
    const endpoint = this.cdpEndpoint();
    if (!endpoint) {
      throw new Error("No CDP endpoint configured");
    }
    let targetId = "";
    if (endpoint.httpUrl) {
      const created = await cdpCreateTargetViaHttp(endpoint.httpUrl, url).catch(() => null);
      targetId = String(created?.id ?? created?.targetId ?? "");
    }
    if (!targetId) {
      const result = await this.cdpBrowserRequest("Target.createTarget", {
        url,
        background: !flags.front,
      });
      targetId = String(result?.targetId ?? "");
    }
    if (!targetId) {
      throw new Error("CDP target creation did not return a target id");
    }
    this.selectedCdpTargetId = targetId;
    if (flags.front) {
      await this.cdpActivateTarget(targetId);
    }
    const timeoutMs = parsePositiveInteger(flags.timeout ?? "10000", "timeout");
    const page = await this.waitForCdpPage(targetId, url, timeoutMs);
    return page ?? { id: null, tabId: null, targetId, url, title: "" };
  }

  async waitForCdpPage(targetId, url, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const pages = await this.cdpPages();
      const page =
        pages.find((entry) => entry.targetId === targetId) ??
        pages.find((entry) => pageUrlMatchesRequest(entry.url, url));
      if (page) {
        return page;
      }
      await sleep(100);
    }
    return null;
  }

  async openCdpPage(url, flags = {}, command = "open") {
    const page = await this.cdpCreateTarget(url, flags);
    return {
      text: [
        `${command === "newtab" ? "Opened new tab" : "Opened"} ${url}`,
        page.id ? `Page: ${page.tabId ?? `t${page.id}`} ${page.url || url}` : `Target: ${page.targetId}`,
        flags.front ? "Focused browser tab: yes" : "Focused browser tab: no",
        "Fast path: CDP",
      ].join("\n"),
      quiet: page.tabId ?? String(page.id ?? page.targetId),
      page,
      cdp: true,
    };
  }

  async navigateCdpPage(type, url, flags = {}) {
    const targetId = await this.resolveCdpTargetId(flags);
    if (flags.front) {
      await this.cdpActivateTarget(targetId);
    }
    if (type === "url") {
      await this.cdpPageRequest(targetId, "Page.navigate", { url });
      this.selectedCdpTargetId = targetId;
      return {
        text: `navigated ${targetId} to ${url}`,
        targetId,
        cdp: true,
      };
    }
    if (type === "reload") {
      await this.cdpPageRequest(targetId, "Page.reload", { ignoreCache: Boolean(flags.ignoreCache) });
      return { text: `reloaded ${targetId}`, targetId, cdp: true };
    }
    const history = await this.cdpPageRequest(targetId, "Page.getNavigationHistory", {});
    const offset = type === "back" ? -1 : 1;
    const entry = history.entries?.[history.currentIndex + offset];
    if (!entry) {
      throw new Error(`No ${type} history entry for ${targetId}`);
    }
    await this.cdpPageRequest(targetId, "Page.navigateToHistoryEntry", { entryId: entry.id });
    return { text: `${type}: ${entry.url}`, targetId, cdp: true };
  }

  async evaluateCdpFunction(fnString, flags = {}) {
    const targetId = await this.resolveCdpTargetId(flags);
    const expression = `(${fnString})()`;
    const requestedTimeout = Number.parseInt(String(flags.timeout ?? ""), 10);
    const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
      ? Math.max(15000, requestedTimeout + 1000)
      : undefined;
    const result = await this.cdpPageRequest(targetId, "Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, timeoutMs ? { timeoutMs } : {});
    if (result?.exceptionDetails) {
      throw new Error(formatCdpException(result.exceptionDetails));
    }
    const value = cdpRemoteObjectValue(result?.result);
    return {
      text: formatCdpValue(value),
      structuredContent: { result: value, targetId },
      cdp: true,
    };
  }

  async restartDedicated() {
    this.closeCdpBrowserClient();
    if (this.mcp) {
      await this.mcp.close().catch(() => {});
    }
    this.mcp = null;
    this.tools = null;
    this.mode = DEDICATED_MODE;
    this.browserUrl = "";
    return await this.ensureMcp();
  }

  async listTools() {
    if (this.tools) {
      return this.tools;
    }
    const mcp = await this.ensureMcp();
    this.tools = await mcp.listTools();
    return this.tools;
  }

  async callTool(name, args = {}, options = {}) {
    const mcp = await this.ensureMcp();
    try {
      const result = await mcp.callTool(name, args);
      const err = toolError(result, name);
      if (err) {
        throw err;
      }
      return normalizeToolResult(result);
    } catch (error) {
      if (
        !options.noFallback &&
        !this.noFallback &&
        this.mode === AUTO_MODE &&
        !this.browserUrl &&
        isAttachFailure(error)
      ) {
        const dedicated = await this.restartDedicated();
        const result = await dedicated.callTool(name, args);
        const err = toolError(result, name);
        if (err) {
          throw err;
        }
        const normalized = normalizeToolResult(result);
        normalized.fallback = "dedicated-profile";
        return normalized;
      }
      throw error;
    }
  }

  async selectPage(pageId, bringToFront = false, flags = {}) {
    if (this.shouldUseFastCdp(flags)) {
      try {
        const targetId = await this.resolveCdpTargetId({ ...flags, page: pageId });
        this.selectedCdpTargetId = targetId;
        if (bringToFront) {
          await this.cdpActivateTarget(targetId);
        }
        const page = await this.cdpPageForTargetId(targetId);
        return {
          text: [
            `Selected ${page?.tabId ?? pageId} for automation.`,
            page?.url ?? targetId,
            bringToFront ? "Focused browser tab: yes" : "Focused browser tab: no",
            "Fast path: CDP",
          ].join("\n"),
          quiet: page?.tabId ?? String(pageId),
          page,
          cdp: true,
        };
      } catch (error) {
        if (!this.shouldFallbackToMcpAfterCdp(flags)) {
          throw error;
        }
        // Fall through to MCP when the current session policy allows it.
      }
    }
    return await this.callTool("select_page", {
      pageId: parsePageId(pageId),
      ...(bringToFront ? { bringToFront: true } : {}),
    });
  }

  pageArgs(flags = {}) {
    return flags.page !== undefined ? { pageId: parsePageId(flags.page) } : {};
  }

  async mcpPageIdForFlags(flags = {}) {
    if (flags.mcp === true || !this.shouldUseFastCdp(flags)) {
      return await this.resolvePageId(flags);
    }
    const hasCdpSelection = flags.page !== undefined || flags.targetId || this.selectedCdpTargetId;
    if (!hasCdpSelection) {
      return await this.resolvePageId(flags);
    }
    let targetId = "";
    let cdpPage = null;
    try {
      targetId = await this.resolveCdpTargetId(flags);
      cdpPage = targetId ? await this.cdpPageForTargetId(targetId) : null;
    } catch (error) {
      if (flags.page !== undefined || flags.targetId) {
        throw error;
      }
      return await this.resolvePageId(flags);
    }
    if (!cdpPage?.url) {
      if (flags.page !== undefined || flags.targetId) {
        throw new Error(`Could not resolve a URL for CDP target ${targetId || "(unknown)"}`);
      }
      return await this.resolvePageId(flags);
    }
    const mcpPages = parseListPagesResult(await this.callTool("list_pages", {}));
    const sameDocumentMatches = matchingMcpPagesForCdpPage(mcpPages, cdpPage);
    if (sameDocumentMatches.length === 1) {
      return sameDocumentMatches[0].id;
    }
    const targetLabel = `${cdpPage.tabId ?? cdpPage.id ?? targetId} ${cdpPage.title || "(untitled)"} ${cdpPage.url}`;
    if (sameDocumentMatches.length > 1) {
      throw new Error(`CDP target maps to multiple MCP pages; use --mcp --page with the intended page from \`realbrowser --mcp tabs\`.\nTarget: ${targetLabel}\n${formatPageCandidates(sameDocumentMatches)}`);
    }
    if (flags.page !== undefined || flags.targetId || this.selectedCdpTargetId) {
      throw new Error(`Could not map selected CDP target to a DevTools MCP page; use --mcp --page with the intended page from \`realbrowser --mcp tabs\`.\nTarget: ${targetLabel}\nMCP pages:\n${formatPageCandidates(mcpPages)}`);
    }
    return await this.resolvePageId(flags);
  }

  async mcpPageArgs(flags = {}) {
    return { pageId: await this.mcpPageIdForFlags(flags) };
  }

  async handle(command, args, flags = {}) {
    flags = preferSingleMcpControllerFlags(command, args, flags, {
      mode: this.currentMode(),
      hasBrowserEndpoint: Boolean(this.cdpEndpoint()),
    });
    const previousCommandFlags = this.activeCommandFlags;
    this.activeCommandFlags = flags;
    try {
      switch (command) {
      case "doctor":
        return await this.doctor(Boolean(flags.deep));
      case "status":
        return await this.status();
      case "restart":
        return await this.restart(flags);
      case "tools":
        return { tools: (await this.listTools()).map((tool) => tool.name).sort() };
      case "tool":
        return await this.handleRawTool(args, flags);
      case "chain":
        return await this.handleChain(args, flags);
      case "tabs":
        return await this.handleTabs(flags);
      case "open":
      case "newtab":
        requireArgs(command, args, 1);
        return await this.handleOpen(args, flags, command);
      case "navigate":
      case "goto":
        requireArgs(command, args, 1);
        if (flags.foregroundUntilReady) {
          flags.front = true;
        }
        if (this.shouldUseFastCdp(flags)) {
          try {
            return await this.maybeWaitReadyAfterPageResult(
              await this.navigateCdpPage("url", args[0], flags),
              flags,
            );
          } catch (error) {
            if (!this.shouldFallbackToMcpAfterCdp(flags)) {
              throw error;
            }
            // Fall through to MCP only for non-real-profile sessions or explicit reattach.
          }
        }
        return await this.maybeWaitReadyAfterPageResult(await this.callTool("navigate_page", {
          ...this.pageArgs(flags),
          type: "url",
          url: args[0],
        }), flags);
      case "back":
      case "forward":
      case "reload":
        if (flags.foregroundUntilReady) {
          flags.front = true;
        }
        if (this.shouldUseFastCdp(flags)) {
          try {
            return await this.maybeWaitReadyAfterPageResult(
              await this.navigateCdpPage(command, undefined, flags),
              flags,
            );
          } catch (error) {
            if (!this.shouldFallbackToMcpAfterCdp(flags)) {
              throw error;
            }
            // Fall through to MCP when the current session policy allows it.
          }
        }
        return await this.maybeWaitReadyAfterPageResult(await this.callTool("navigate_page", {
          ...this.pageArgs(flags),
          type: command,
        }), flags);
      case "select":
        requireArgs(command, args, 1);
        if (args.length >= 2) {
          return await this.handleSelectOption(args, flags);
        }
        return await this.selectPage(args[0], Boolean(flags.front), flags);
      case "tab":
        requireArgs(command, args, 1);
        return await this.selectPage(args[0], Boolean(flags.front), flags);
      case "focus":
        requireArgs(command, args, 1);
        return await this.selectPage(args[0], true, flags);
      case "close":
      case "closetab":
        requireArgs(command, args, 1);
        if (this.shouldUseFastCdp(flags)) {
          try {
            const targetId = await this.resolveCdpTargetId({ ...flags, page: args[0] });
            const endpoint = this.cdpEndpoint();
            if (endpoint?.httpUrl) {
              const closed = await cdpHttpJson(endpoint.httpUrl, `/json/close/${encodeURIComponent(targetId)}`, {
                timeoutMs: 3000,
              }).then(() => true).catch(() => false);
              if (!closed) {
                await this.cdpBrowserRequest("Target.closeTarget", { targetId }, { timeoutMs: 3000 });
              }
            } else {
              await this.cdpBrowserRequest("Target.closeTarget", { targetId }, { timeoutMs: 3000 });
            }
            if (this.selectedCdpTargetId === targetId) {
              this.selectedCdpTargetId = null;
            }
            return { text: `closed ${args[0]}`, targetId, cdp: true };
          } catch (error) {
            if (!this.shouldFallbackToMcpAfterCdp(flags)) {
              throw error;
            }
            // Fall through to MCP when the current session policy allows it.
          }
        }
        return await this.callTool("close_page", { pageId: parsePageId(args[0]) });
      case "snapshot":
      case "accessibility":
        return await this.handleSnapshot(args, flags);
      case "snapshot-aria":
        return await this.handleSnapshotAria(args, flags);
      case "snapshot-dom":
        return await this.handleSnapshotDom(args, flags);
      case "query-selector":
        requireArgs(command, args, 1);
        return await this.handleQuerySelector(args, flags);
      case "observe":
        return await this.handleObserve(args, flags);
      case "click":
        requireArgs(command, args, 1);
        if (this.shouldUseFastCdp(flags) && isCdpRoleRef(args[0])) {
          return await this.clickCdpRoleRef(args[0], flags);
        }
        if (isCdpRoleRef(args[0])) {
          throw new Error("CDP role refs require a current CDP-backed session. Run snapshot again or use a uid ref.");
        }
        return await this.callTool("click", { ...this.pageArgs(flags), uid: args[0] });
      case "hover":
        requireArgs(command, args, 1);
        if (this.shouldUseFastCdp(flags) && isCdpRoleRef(args[0])) {
          return await this.hoverCdpRoleRef(args[0], flags);
        }
        if (isCdpRoleRef(args[0])) {
          throw new Error("CDP role refs require a current CDP-backed session. Run snapshot again or use a uid ref.");
        }
        return await this.callTool("hover", { ...this.pageArgs(flags), uid: args[0] });
      case "drag":
        requireArgs(command, args, 2);
        return await this.callTool("drag", {
          ...this.pageArgs(flags),
          from_uid: args[0],
          to_uid: args[1],
        });
      case "type":
        requireArgs(command, args, 1);
        return await this.callTool("type_text", {
          ...this.pageArgs(flags),
          text: args.join(" "),
          ...(flags.submit ? { submitKey: flags.submit } : {}),
        });
      case "fill":
        requireArgs(command, args, 2);
        if (this.shouldUseFastCdp(flags) && isCdpRoleRef(args[0])) {
          return await this.fillCdpRoleRef(args[0], args.slice(1).join(" "), flags);
        }
        if (isCdpRoleRef(args[0])) {
          throw new Error("CDP role refs require a current CDP-backed session. Run snapshot again or use a uid ref.");
        }
        return await this.callTool("fill", {
          ...this.pageArgs(flags),
          uid: args[0],
          value: args.slice(1).join(" "),
        });
      case "fill-form":
        requireArgs(command, args, 1);
        return await this.callTool("fill_form", {
          ...this.pageArgs(flags),
          elements: parseJsonArg(args.join(" "), "fill-form"),
        });
      case "press":
        requireArgs(command, args, 1);
        return await this.callTool("press_key", {
          ...this.pageArgs(flags),
          key: args.join(" "),
        });
      case "click-coords":
        requireArgs(command, args, 2);
        return await this.handleClickCoords(args, flags);
      case "highlight":
        requireArgs(command, args, 1);
        return await this.handleHighlight(args, flags);
      case "upload":
        requireArgs(command, args, 2);
        return await this.callTool("upload_file", {
          ...this.pageArgs(flags),
          uid: args[0],
          filePath: path.resolve(args[1]),
        });
      case "wait":
        return await this.handleWait(args, flags);
      case "wait-ready":
      case "ready":
        return await this.handleWaitReady(args, flags);
      case "scroll":
        return await this.handleScroll(args, flags);
      case "viewport":
      case "resize":
        requireArgs(command, args, 1);
        return await this.handleViewport(args[0], flags);
      case "emulate":
        return await this.handleEmulate(flags);
      case "useragent":
        requireArgs(command, args, 1);
        return await this.handleEmulate({ ...flags, userAgent: args.join(" ") });
      case "cookie":
        requireArgs(command, args, 1);
        return await this.handleCookie(args.join(" "), flags);
      case "dialog":
        return await this.handleDialog(args, flags);
      case "dialog-accept":
        return await this.armDialog("accept", args, flags);
      case "dialog-dismiss":
        return await this.armDialog("dismiss", args, flags);
      case "eval":
      case "js":
        requireArgs(command, args, 1);
        return await this.handleEval(args, flags);
      case "url":
      case "text":
      case "html":
      case "links":
      case "forms":
      case "cookies":
      case "storage":
      case "perf":
      case "css":
      case "attrs":
      case "is":
        return await this.handleRead(command, args, flags);
      case "console":
        return await this.handleConsole(args, flags);
      case "network":
        return await this.handleNetwork(args, flags);
      case "errors":
        return await this.handleConsole(args, { ...flags, errors: true });
      case "requests":
        return await this.handleNetwork(args, flags);
      case "capture-network":
      case "network-capture":
      case "capture-requests":
        return await this.handleCaptureNetwork(args, flags);
      case "capture-console":
      case "console-capture":
      case "capture-logs":
      case "logs-capture":
        return await this.handleCaptureConsole(args, flags);
      case "screenshot":
        return await this.handleScreenshot(args, flags);
      case "full-screenshot":
      case "full-size-screenshot":
      case "fullpage-screenshot":
        return await this.handleFullScreenshot(args, flags);
      case "area-screenshot":
      case "element-screenshot":
      case "part-screenshot":
        return await this.handleAreaScreenshot(args, flags);
      case "device-screenshots":
      case "exact-screenshots":
      case "responsive-exact":
        return await this.handleDeviceScreenshots(args, flags);
      case "responsive":
        return await this.handleResponsive(args, flags);
      case "diff":
        return await this.handleDiff(args, flags);
      case "download":
        return await this.handleDownload(args, flags);
      case "wait-download":
      case "waitfordownload":
        return await this.handleWaitDownload(args, flags);
      case "handoff":
        return await this.handleHandoff(args, flags);
      case "resume":
        return await this.handleResume(args, flags);
      case "trace":
        return await this.handleTrace(args, flags);
      case "cleanup-remote-debugging":
        return await this.handleCleanupRemoteDebugging(flags);
      case "stop":
        this.closeCdpBrowserClient();
        await this.mcp?.close().catch(() => {});
        if (this.mode === ANONYMOUS_MODE && !this.keepAnonymous && this.profileDir) {
          await fsp.rm(this.profileDir, { recursive: true, force: true }).catch(() => {});
        }
        await fsp.rm(this.stateFile, { force: true }).catch(() => {});
        setTimeout(() => process.exit(0), 10).unref();
        return { text: "stopping" };
      default:
        throw new Error(`Unknown command: ${command}\n\n${usage()}`);
      }
    } finally {
      this.activeCommandFlags = previousCommandFlags;
    }
  }

  async handleCleanupRemoteDebugging(flags = {}) {
    const settingsPage = await this.openRemoteDebuggingSettingsPage(flags);
    let cleanup = null;
    let errorText = "";
    try {
      const result = await this.callTool(
        "evaluate_script",
        {
          pageId: settingsPage.pageId,
          function: `async () => {
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            let checkbox = null;
            for (let attempt = 0; attempt < 30; attempt += 1) {
              checkbox = document.querySelector("#remote-debugging-enabled");
              if (checkbox) break;
              await sleep(100);
            }
            if (!checkbox) {
              return {
                attempted: false,
                confirmed: false,
                reason: "checkbox-not-found",
                url: location.href,
                title: document.title,
              };
            }
            const before = Boolean(checkbox.checked);
            if (!before) {
              return { attempted: false, confirmed: true, before, after: false, reason: "already-disabled" };
            }
            if (checkbox.disabled) {
              return { attempted: false, confirmed: false, before, after: before, reason: "checkbox-disabled" };
            }
            checkbox.click();
            await sleep(500);
            checkbox = document.querySelector("#remote-debugging-enabled");
            const after = Boolean(checkbox?.checked);
            return { attempted: true, confirmed: !after, before, after, reason: after ? "still-enabled" : "disabled" };
          }`,
        },
        { noFallback: true },
      );
      cleanup = extractJsonFromToolText(result.text);
    } catch (error) {
      errorText = error instanceof Error ? error.message : String(error);
      cleanup = { attempted: true, confirmed: false, reason: "connection-ended-before-confirmation" };
    }
    if (settingsPage.openedByCleanup) {
      await this.callTool("close_page", { pageId: settingsPage.pageId }).catch(() => {});
    }
    if (cleanup?.confirmed) {
      return {
        text: "Chrome remote debugging cleanup completed.",
        cleanupRemoteDebugging: cleanup,
      };
    }
    return {
      text: [
        "Chrome remote debugging cleanup was not confirmed.",
        cleanup?.reason ? `Reason: ${cleanup.reason}` : "",
        errorText ? `Error: ${errorText}` : "",
        `Manual cleanup: open ${REMOTE_DEBUGGING_SETTINGS_URL} and turn off remote debugging.`,
      ].filter(Boolean).join("\n"),
      cleanupRemoteDebugging: cleanup,
    };
  }

  async openRemoteDebuggingSettingsPage(flags = {}) {
    const beforePages = await this.listPagesForCleanup();
    const beforeIds = new Set(beforePages.map((page) => page.id));
    await this.callTool(
      "new_page",
      {
        url: REMOTE_DEBUGGING_SETTINGS_URL,
        background: !flags.front,
      },
      { noFallback: true },
    );
    await sleep(500);
    const afterPages = await this.listPagesForCleanup();
    const inspectPages = afterPages.filter((page) => page.url.startsWith("chrome://inspect/"));
    const newInspectPage =
      inspectPages.find((page) => !beforeIds.has(page.id)) ??
      inspectPages.find((page) => page.selected) ??
      null;
    if (newInspectPage) {
      return {
        pageId: newInspectPage.id,
        openedByCleanup: !beforeIds.has(newInspectPage.id),
      };
    }
    const existingInspectPage = beforePages.find((page) => page.url.startsWith("chrome://inspect/"));
    if (existingInspectPage) {
      return {
        pageId: existingInspectPage.id,
        openedByCleanup: false,
      };
    }
    throw new Error(`Could not find ${REMOTE_DEBUGGING_SETTINGS_URL} after opening it`);
  }

  async listPagesForCleanup() {
    const result = await this.callTool("list_pages", {}, { noFallback: true });
    return parseListPagesResult(result);
  }

  async findPageIdByUrlPrefix(prefix) {
    const page = (await this.listPagesForCleanup()).find((entry) => entry.url.startsWith(prefix));
    if (page) {
      return page.id;
    }
    return null;
  }

  daemonInfo() {
    return {
      pid: process.pid,
      stateFile: this.stateFile,
      mode: this.currentMode(),
      browserUrl: this.browserUrl || "",
    };
  }

  async doctor(deep) {
    const tools = await this.listTools();
    const out = {
      daemon: this.daemonInfo(),
      browserControl: this.browserControlStatus(),
      runtime: {
        node: process.version,
        npx: await commandVersion(NPX_COMMAND, ["--version"]),
        chromeDevtoolsMcp: PACKAGE_SPEC,
      },
      tools: tools.map((tool) => tool.name).sort(),
    };
    if (deep) {
      out.tabs = await this.callTool("list_pages", {});
    }
    return out;
  }

  async status() {
    if (this.shouldUseFastCdp({})) {
      const pages = await this.cdpPages().catch(() => []);
      const selected = pages.find((page) => page.selected) ?? null;
      return {
        daemon: this.daemonInfo(),
        browserControl: this.browserControlStatus(),
        tabs: pages.length,
        selected,
        fastPath: "cdp",
      };
    }
    const tabs = await this.callTool("list_pages", {});
    const pages = parseListPagesResult(tabs);
    const selected = pages.find((page) => page.selected) ?? null;
    return {
      daemon: this.daemonInfo(),
      browserControl: this.browserControlStatus(),
      tabs: pages.length,
      selected,
    };
  }

  async restart(flags = {}) {
    if (isRealProfileSessionMode(this.currentMode()) && !allowsProfileReattach(flags)) {
      throw usageError([
        "Refusing to restart the Chrome DevTools MCP controller for a real Chrome profile because Chrome may show another \"Allow remote debugging?\" approval dialog.",
        "Reuse the existing controller, or rerun with `restart --allow-profile-reattach` only when you explicitly accept that prompt.",
      ].join("\n"));
    }
    this.closeCdpBrowserClient();
    if (this.mcp) {
      await this.mcp.close().catch(() => {});
    }
    this.mcp = null;
    this.tools = null;
    await this.ensureMcp();
    return await this.status();
  }

  async handleRawTool(args, flags = {}) {
    requireArgs("tool", args, 1);
    const [name, ...jsonParts] = args;
    const params = jsonParts.length > 0 ? parseJsonArg(jsonParts.join(" "), "tool") : {};
    return await this.callTool(name, { ...this.pageArgs(flags), ...params });
  }

  async handleChain(args, flags = {}) {
    requireArgs("chain", args, 1);
    const steps = parseJsonArg(args.join(" "), "chain");
    if (!Array.isArray(steps)) {
      throw new Error("chain expects a JSON array of command arrays");
    }
    const returnMode = normalizeReturnMode(flags.return ?? (flags.summary ? "summary" : "summary"));
    const stepMaxCharsInfo = stdoutMaxCharsFromFlags(flags, String(DEFAULT_CHAIN_STEP_MAX_CHARS));
    const stepMaxChars = stepMaxCharsInfo.value;
    const results = [];
    const chainStartedAt = Date.now();
    for (const [index, step] of steps.entries()) {
      if (!Array.isArray(step) || step.length === 0) {
        results.push({ index, ok: false, durationMs: 0, error: "step must be a non-empty command array" });
        continue;
      }
      const parsed = parseArgv(step.map((value) => String(value)));
      const stepStartedAt = Date.now();
      try {
        const result = await this.handle(parsed.command, parsed.args, { ...flags, ...parsed.flags });
        results.push({
          index,
          command: parsed.command,
          ok: true,
          durationMs: Date.now() - stepStartedAt,
          result,
          summary: summarizeResult(parsed.command, result, stepMaxChars),
        });
      } catch (error) {
        results.push({
          index,
          command: parsed.command,
          ok: false,
          durationMs: Date.now() - stepStartedAt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const totalDurationMs = Date.now() - chainStartedAt;
    if (flags.trace) {
      await writeTextFile(flags.trace, `${JSON.stringify({ totalDurationMs, results }, null, 2)}\n`);
    }
    if (flags.json) {
      if (flags.raw || returnMode === "all") {
        return { totalDurationMs, results, trace: flags.trace };
      }
      return {
        ok: results.every((entry) => entry.ok),
        returnMode,
        totalDurationMs,
        trace: flags.trace,
        results: results.map((entry) =>
          entry.ok
            ? { index: entry.index, command: entry.command, ok: true, durationMs: entry.durationMs, summary: entry.summary }
            : { index: entry.index, command: entry.command, ok: false, durationMs: entry.durationMs, error: entry.error },
        ),
      };
    }
    const final = [...results].reverse().find((entry) => entry.ok);
    if (returnMode === "final" && final) {
      return {
        text: resultText(final.result, stepMaxChars),
        chain: {
          ok: results.every((entry) => entry.ok),
          totalDurationMs,
          results: results.map(chainStepTiming),
          trace: flags.trace,
          requestedMaxChars: stepMaxCharsInfo.requested,
          stdoutMaxChars: stepMaxCharsInfo.value,
        },
      };
    }
    if (returnMode === "all") {
      const text = results
        .map((entry) => {
          if (!entry.ok) {
            return `[${entry.index}] ${entry.command ?? "?"} (${formatMs(entry.durationMs)}): ERROR ${entry.error}`;
          }
          return `[${entry.index}] ${entry.command} (${formatMs(entry.durationMs)}): ${resultText(entry.result, stepMaxChars)}`;
        })
        .concat(`total: ${formatMs(totalDurationMs)}`)
        .join("\n\n");
      return {
        text: formatStdoutText(text, READ_STDOUT_HARD_MAX_CHARS, flags),
      };
    }
    return {
      text: results
        .map((entry) => {
          if (!entry.ok) {
            return `[${entry.index}] ${entry.command ?? "?"} (${formatMs(entry.durationMs)}): ERROR ${entry.error}`;
          }
          return `[${entry.index}] ${entry.command} (${formatMs(entry.durationMs)}): ${entry.summary}`;
        })
        .concat(`total: ${formatMs(totalDurationMs)}`)
        .concat(flags.trace ? [`trace: ${flags.trace}`] : [])
        .join("\n"),
    };
  }

  async handleSnapshot(args, flags = {}) {
    if (this.shouldUseFastCdp(flags) && !flags.labels && !flags.annotate) {
      try {
        const snap = await this.cdpRoleSnapshot(flags);
        const rawPayload = {
          snapshot: snap.snapshot,
          refs: snap.refs,
          stats: snap.stats,
          targetId: snap.targetId,
          cdp: true,
        };
        if (flags.raw) {
          const outPath = flags.out ?? flags.output;
          const rawText = formatValue(rawPayload);
          if (outPath) {
            await writeTextFile(outPath, `${rawText}\n`);
            return snapshotRawOutResult({
              outPath,
              rawText,
              flags,
              structuredContent: {
                targetId: snap.targetId,
                cdp: true,
              },
            });
          }
          return {
            text: formatStdoutText(rawText, READ_STDOUT_HARD_MAX_CHARS, flags),
            structuredContent: rawPayload,
          };
        }
        const maxChars = stdoutMaxCharsFromFlags(
          flags,
          flags.verbose ? String(READ_STDOUT_HARD_MAX_CHARS) : String(DEFAULT_SNAPSHOT_MAX_CHARS),
        );
        const truncated = truncateText(snap.snapshot, maxChars.value);
        const stdoutHardCapped = maxChars.capped && truncated.truncated;
        let text = truncated.text;
        if (truncated.truncated && !stdoutHardCapped) {
          text = `${text}\n\n[...TRUNCATED - use --max-chars or --out]`;
        }
        if (stdoutHardCapped) {
          text = `${text}\n\n[...STDOUT CAPPED at ${maxChars.value} chars - use --out for full output]`;
        }
        const outPath = flags.out ?? flags.output;
        if (outPath) {
          await writeTextFile(outPath, `${snap.snapshot}\n`);
        }
        const lines = [];
        if (!flags.quiet) {
          lines.push(outPath ? `snapshot written to ${outPath}` : text);
        }
        if (outPath) {
          lines.push(`snapshot: ${outPath}`);
        }
        lines.push(
          `stats: lines=${snap.stats.lines} chars=${snap.stats.chars} refs=${snap.stats.refs} interactive=${snap.stats.interactive}${truncated.truncated ? " truncated=true" : ""}`,
        );
        return {
          text: lines.filter(Boolean).join("\n"),
          structuredContent: {
            snapshotText: text,
            refs: snap.refs,
            stats: {
              ...snap.stats,
              stdoutCapped: stdoutHardCapped,
              requestedMaxChars: maxChars.requested,
              stdoutMaxChars: maxChars.value,
            },
            truncated: truncated.truncated,
            targetId: snap.targetId,
            cdp: true,
            ...(outPath ? { out: outPath } : {}),
          },
        };
      } catch (error) {
        if (flags.selector || !this.shouldFallbackToMcpAfterCdp(flags)) {
          throw error;
        }
      }
    }
    if (flags.selector) {
      throw new Error("snapshot --selector requires a CDP-backed fast snapshot; MCP fallback cannot scope accessibility snapshots.");
    }
    const snapshot = await this.callTool("take_snapshot", {
      ...this.pageArgs(flags),
      verbose: Boolean(flags.verbose || flags.raw),
    });
    if (flags.raw) {
      const outPath = flags.out ?? flags.output;
      if (outPath) {
        const rawText = formatValue(snapshot);
        await writeTextFile(outPath, `${rawText}\n`);
        return snapshotRawOutResult({ outPath, rawText, flags });
      }
      return snapshot;
    }
    const built = buildCompactSnapshot(snapshot.structuredContent?.snapshot, snapshot.text, flags);
    const outPath = flags.out ?? (!flags.labels && !flags.annotate ? flags.output : undefined);
    if (outPath) {
      await writeTextFile(outPath, `${built.text}\n`);
    }
    const explicitPath = flags.output ?? args.find((arg) => !arg.startsWith("-"));
    let annotated;
    if (flags.labels || flags.annotate) {
      annotated = await this.annotatedScreenshotFromSnapshot(snapshot, explicitPath, flags);
    }
    const lines = [];
    if (!flags.quiet) {
      lines.push(outPath ? `snapshot written to ${outPath}` : built.text);
    }
    if (outPath) {
      lines.push(`snapshot: ${outPath}`);
    }
    if (annotated) {
      lines.push(`MEDIA:${annotated.filePath}`);
      lines.push(`labels: ${annotated.labels} skipped=${annotated.skipped}`);
    }
    lines.push(
      `stats: lines=${built.stats.lines} chars=${built.stats.chars} refs=${built.stats.refs} interactive=${built.stats.interactive}${built.truncated ? " truncated=true" : ""}`,
    );
    return {
      text: lines.filter(Boolean).join("\n"),
      structuredContent: {
        ...compactSnapshotStructuredContent(snapshot.structuredContent),
        snapshotText: built.text,
        refs: built.refs,
        stats: built.stats,
        truncated: built.truncated,
        ...(outPath ? { out: outPath } : {}),
        ...(annotated ? { annotatedScreenshot: annotated } : {}),
      },
    };
  }

  async handleSnapshotAria(args, flags = {}) {
    if (!this.shouldUseFastCdp(flags)) {
      throw new Error("snapshot-aria requires a CDP-backed browser endpoint; use snapshot for MCP fallback reads.");
    }
    const snap = await this.snapshotAria(flags);
    const payload = {
      nodes: snap.nodes,
      targetId: snap.targetId,
      cdp: true,
    };
    const formatted = await formatReadResult("snapshot-aria", { text: formatValue(payload) }, flags);
    return {
      ...formatted,
      structuredContent: {
        ...(formatted.structuredContent ?? {}),
        command: "snapshot-aria",
        count: snap.nodes.length,
        targetId: snap.targetId,
        cdp: true,
      },
    };
  }

  async handleSnapshotDom(args, flags = {}) {
    if (!this.shouldUseFastCdp(flags)) {
      throw new Error("snapshot-dom requires a CDP-backed browser endpoint; use text/html for MCP fallback reads.");
    }
    const snap = await this.snapshotDom(flags);
    const payload = {
      nodes: snap.nodes,
      targetId: snap.targetId,
      cdp: true,
    };
    const formatted = await formatRawResult("snapshot-dom", { text: formatValue(payload) }, flags);
    return {
      ...formatted,
      structuredContent: {
        ...(formatted.structuredContent ?? {}),
        command: "snapshot-dom",
        count: snap.nodes.length,
        targetId: snap.targetId,
        cdp: true,
      },
    };
  }

  async handleQuerySelector(args, flags = {}) {
    if (!this.shouldUseFastCdp(flags)) {
      throw new Error("query-selector requires a CDP-backed browser endpoint; use text/html selector reads for MCP fallback.");
    }
    const result = await this.querySelector(args[0], flags);
    const payload = {
      matches: result.matches,
      targetId: result.targetId,
      cdp: true,
    };
    const formatted = await formatReadResult("query-selector", { text: formatValue(payload) }, flags);
    return {
      ...formatted,
      structuredContent: {
        ...(formatted.structuredContent ?? {}),
        command: "query-selector",
        count: result.matches.length,
        targetId: result.targetId,
        cdp: true,
      },
    };
  }

  async handleObserve(args, flags = {}) {
    const limit = parsePositiveInteger(flags.limit ?? String(DEFAULT_OBSERVE_LIMIT), "limit");
    const maxChars = parsePositiveInteger(flags.maxChars ?? String(DEFAULT_OBSERVE_TEXT_CHARS), "max-chars");
    const selector = args[0] && !args[0].startsWith("-") ? args[0] : undefined;
    const pageInfoResult = await this.evaluateFunction(
      observePageFunction({ limit, maxChars, selector }),
      flags,
    );
    const pageInfo = extractJsonFromToolText(pageInfoResult.text) ?? {};
    const readNetwork = flags.network !== false && (!this.shouldUseFastCdp(flags) || flags.mcp === true || flags.network === true);
    const [consoleResult, networkResult] = await Promise.all([
      this.handleConsole([], { ...flags, errors: true, limit: "5" }).catch((error) => ({
        text: `console unavailable: ${error instanceof Error ? error.message : String(error)}`,
      })),
      readNetwork
        ? this.handleNetwork([], { ...flags, failed: true, limit: "5" }).catch((error) => ({
          text: `network unavailable: ${error instanceof Error ? error.message : String(error)}`,
        }))
        : Promise.resolve({ text: "network skipped on CDP fast path" }),
    ]);
    let screenshot;
    if (flags.screenshot) {
      screenshot = await this.handleScreenshot([], flags).catch((error) => ({
        text: `screenshot unavailable: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }
    if (flags.json) {
      return {
        page: pageInfo,
        console: consoleResult.structuredContent ?? consoleResult.text,
        network: networkResult.structuredContent ?? networkResult.text,
        screenshot: screenshot?.filePath ?? screenshot?.text,
      };
    }
    const lines = [];
    lines.push(`${pageInfo.title || "(untitled)"}`);
    lines.push(`${pageInfo.url || ""}`);
    if (pageInfo.readyState) {
      lines.push(`readyState: ${pageInfo.readyState}`);
    }
    if (Array.isArray(pageInfo.headings) && pageInfo.headings.length) {
      lines.push("");
      lines.push("Headings:");
      lines.push(...pageInfo.headings.map((heading) => `- h${heading.level ?? "?"} ${heading.text}`));
    }
    if (Array.isArray(pageInfo.interactive) && pageInfo.interactive.length) {
      lines.push("");
      lines.push("Interactive:");
      lines.push(...pageInfo.interactive.map(formatObservedElement));
    }
    if (Array.isArray(pageInfo.fields) && pageInfo.fields.length) {
      lines.push("");
      lines.push("Fields:");
      lines.push(...pageInfo.fields.map(formatObservedElement));
    }
    if (pageInfo.textSample) {
      lines.push("");
      lines.push("Text:");
      lines.push(pageInfo.textSample);
    }
    if (consoleResult.text) {
      lines.push("");
      lines.push("Console errors:");
      lines.push(consoleResult.text);
    }
    if (networkResult.text) {
      lines.push("");
      lines.push("Failed/recent network:");
      lines.push(networkResult.text);
    }
    if (screenshot?.text) {
      lines.push("");
      lines.push(screenshot.text);
    }
    return {
      text: lines.filter((line) => line !== undefined).join("\n"),
      structuredContent: { page: pageInfo },
    };
  }

  async annotatedScreenshotFromSnapshot(snapshot, explicitPath, flags = {}) {
    const refs = collectSnapshotUids(snapshot.structuredContent?.snapshot);
    const labelResult = await this.renderSnapshotLabels(refs, flags);
    const filePath =
      explicitPath ??
      path.join(
        DEFAULT_SCREENSHOT_DIR,
        `annotated-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.png`,
      );
    try {
      const screenshotFlags = { ...flags };
      delete screenshotFlags.annotate;
      delete screenshotFlags.labels;
      delete screenshotFlags.uid;
      const screenshot = await this.handleScreenshot([filePath], screenshotFlags);
      return {
        filePath,
        labels: labelResult.labels,
        skipped: labelResult.skipped,
        text: `MEDIA:${filePath}\nlabels: ${labelResult.labels} skipped=${labelResult.skipped}`,
        screenshot: screenshot.text,
      };
    } finally {
      await this.clearSnapshotLabels(flags);
    }
  }

  async renderSnapshotLabels(refs, flags = {}) {
    const maxLabels = parsePositiveInteger(flags.maxLabels ?? "150", "max-labels");
    const selectedRefs = refs.slice(0, maxLabels);
    const skippedByLimit = Math.max(0, refs.length - selectedRefs.length);
    if (selectedRefs.length === 0) {
      return { labels: 0, skipped: skippedByLimit };
    }
    const refList = JSON.stringify(selectedRefs);
    const result = await this.callTool("evaluate_script", {
      pageId: await this.resolvePageId(flags),
      args: selectedRefs,
      function: `(...elements) => {
        const refs = ${refList};
        document.querySelectorAll("[${LABEL_OVERLAY_ATTR}]").forEach((node) => node.remove());
        const root = document.createElement("div");
        root.setAttribute("${LABEL_OVERLAY_ATTR}", "root");
        root.style.position = "absolute";
        root.style.left = "0";
        root.style.top = "0";
        root.style.width = "0";
        root.style.height = "0";
        root.style.pointerEvents = "none";
        root.style.zIndex = "2147483647";
        root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        let labels = 0;
        let skipped = ${skippedByLimit};
        const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
        elements.forEach((el, index) => {
          if (!(el instanceof Element)) {
            skipped += 1;
            return;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            skipped += 1;
            return;
          }
          const x = Math.max(0, rect.left + scrollX);
          const y = Math.max(0, rect.top + scrollY);
          labels += 1;
          const box = document.createElement("div");
          box.setAttribute("${LABEL_OVERLAY_ATTR}", "box");
          box.style.position = "absolute";
          box.style.left = x + "px";
          box.style.top = y + "px";
          box.style.width = Math.max(1, rect.width) + "px";
          box.style.height = Math.max(1, rect.height) + "px";
          box.style.border = "2px solid #ffb020";
          box.style.background = "rgba(255, 176, 32, 0.08)";
          box.style.boxSizing = "border-box";
          const tag = document.createElement("div");
          tag.setAttribute("${LABEL_OVERLAY_ATTR}", "tag");
          tag.textContent = refs[index] || String(labels);
          tag.style.position = "absolute";
          tag.style.left = x + "px";
          tag.style.top = clamp(y - 18, 0, 20000) + "px";
          tag.style.background = "#ffb020";
          tag.style.color = "#1a1a1a";
          tag.style.fontSize = "12px";
          tag.style.lineHeight = "14px";
          tag.style.padding = "1px 4px";
          tag.style.borderRadius = "3px";
          tag.style.boxShadow = "0 1px 2px rgba(0,0,0,0.35)";
          tag.style.whiteSpace = "nowrap";
          root.appendChild(box);
          root.appendChild(tag);
        });
        document.documentElement.appendChild(root);
        return { labels, skipped };
      }`,
    });
    return extractJsonFromToolText(result.text) ?? { labels: 0, skipped: refs.length };
  }

  async clearSnapshotLabels(flags = {}) {
    await this.evaluateFunction(
      `() => {
        document.querySelectorAll("[${LABEL_OVERLAY_ATTR}]").forEach((node) => node.remove());
        return true;
      }`,
      flags,
    ).catch(() => {});
  }

  async handleConsole(args, flags = {}) {
    if (this.shouldUseFastCdp(flags)) {
      return await this.handleCdpConsole(args, flags);
    }
    if (args[0] === "get") {
      requireArgs("console get", args, 2);
      const result = await this.callTool("get_console_message", {
        ...await this.mcpPageArgs(flags),
        msgid: Number.parseInt(args[1], 10),
      });
      return flags.raw ? result : compactTextResult(result, flags, DEFAULT_READ_MAX_CHARS);
    }
    const result = await this.callTool("list_console_messages", {
      ...await this.mcpPageArgs(flags),
      ...(flags.errors ? { types: ["error", "warn"] } : {}),
      ...(flags.preserve ? { includePreservedMessages: true } : {}),
    });
    return compactLineResult(result, {
      flags,
      hiddenSet: this.hiddenConsoleLines,
      emptyText: flags.errors ? "(no console errors)" : "(no console messages)",
      lineLimit: DEFAULT_LINE_LIMIT,
    });
  }

  async handleCdpConsole(args, flags = {}) {
    const targetId = await this.resolveCdpTargetId(flags);
    await this.ensureCdpPageSession(targetId);
    const messages = this.cdpConsoleBuffers.get(targetId) ?? [];
    if (args[0] === "get") {
      requireArgs("console get", args, 2);
      const id = Number.parseInt(String(args[1]), 10);
      const message = messages.find((entry) => entry.id === id);
      if (!message) {
        throw new Error(`No CDP console message ${args[1]} is buffered for target ${targetId}`);
      }
      return {
        text: formatValue(message),
        structuredContent: {
          consoleMessage: message,
          targetId,
          cdp: true,
        },
      };
    }
    const selectedMessages = flags.errors
      ? messages.filter((message) => isProblemConsoleMessage(message))
      : messages;
    const result = {
      text: selectedMessages.map(formatConsoleMessageLine).join("\n"),
      structuredContent: {
        consoleMessages: selectedMessages,
        targetId,
        cdp: true,
        buffered: messages.length,
      },
    };
    const compacted = compactLineResult(result, {
      flags,
      hiddenSet: this.hiddenConsoleLines,
      emptyText: flags.errors ? "(no CDP console errors captured by this daemon)" : "(no CDP console messages captured by this daemon)",
      lineLimit: DEFAULT_LINE_LIMIT,
    });
    return {
      ...compacted,
      structuredContent: {
        ...(compacted.structuredContent ?? {}),
        consoleMessages: selectedMessages,
        targetId,
        cdp: true,
        buffered: messages.length,
      },
    };
  }

  async handleOpen(args, flags = {}, command = "open") {
    requireArgs(command, args, 1);
    const url = args[0];
    if (flags.foregroundUntilReady) {
      flags.front = true;
    }
    if (this.mode === ANONYMOUS_MODE) {
      const pageId = command === "newtab"
        ? await this.openAnonymousTab(url, flags)
        : await this.resolveAnonymousNavigationPageId(flags);
      if (pageId !== null && pageId !== undefined) {
        if (command !== "newtab") {
          await this.callTool("navigate_page", {
            pageId,
            type: "url",
            url,
          });
        }
        return await this.maybeWaitReadyAfterPageResult(
          await this.selectPage(pageId, Boolean(flags.front)),
          flags,
        );
      }
    }
    if (this.shouldUseFastCdp(flags)) {
      try {
        return await this.maybeWaitReadyAfterPageResult(
          await this.openCdpPage(url, flags, command),
          flags,
        );
      } catch (error) {
        if (!this.shouldFallbackToMcpAfterCdp(flags)) {
          throw error;
        }
        // Fall through to MCP only for non-real-profile sessions or explicit reattach.
      }
    }
    const opened = await this.callTool("new_page", {
      url,
      background: !flags.front,
    });
    return await this.maybeWaitReadyAfterPageResult(opened, flags);
  }

  async maybeWaitReadyAfterPageResult(result, flags = {}) {
    if (!flags.foregroundUntilReady) {
      return result;
    }
    const activation = await foregroundBrowserAppForProfile({ source: { appName: flags.browserAppName } }, flags);
    const page = readinessPageFromResult(result);
    const readyFlags = {
      ...flags,
      ...(page?.tabId ? { page: page.tabId } : page?.id !== undefined ? { page: String(page.id) } : {}),
    };
    const ready = await this.handleWaitReady(readinessArgsFromFlags(flags), readyFlags);
    return appendReadinessResult(result, ready, activation);
  }

  async resolveAnonymousNavigationPageId(flags = {}) {
    if (flags.page !== undefined) {
      return parsePageId(flags.page);
    }
    const pages = parseListPagesResult(await this.callTool("list_pages", {}));
    const blank = pages.find((page) => isBlankPageUrl(page.url));
    if (blank) {
      return blank.id;
    }
    const selected = pages.find((page) => page.selected);
    return selected?.id ?? pages[0]?.id ?? null;
  }

  async openAnonymousTab(url, flags = {}) {
    const pages = parseListPagesResult(await this.callTool("list_pages", {}));
    const opener = pages.find((page) => page.selected) ?? pages.find((page) => !isBlankPageUrl(page.url)) ?? pages[0];
    if (!opener) {
      return null;
    }
    await this.callTool("evaluate_script", {
      pageId: opener.id,
      function: `() => {
        window.open(${JSON.stringify(url)}, "_blank", "noopener,noreferrer");
        return true;
      }`,
    }).catch(() => null);
    await sleep(500);
    const afterPages = parseListPagesResult(await this.callTool("list_pages", {}));
    const match = [...afterPages].reverse().find((page) => sameDocumentUrl(page.url, url));
    if (match) {
      return match.id;
    }
    return afterPages.find((page) => page.selected)?.id ?? afterPages.at(-1)?.id ?? null;
  }

  async openPageForAutomation(url, flags = {}) {
    const beforePages = parseListPagesResult(await this.callTool("list_pages", {}));
    const opened = await this.callTool("new_page", {
      url,
      background: !flags.front,
    });
    const openedPages = parseListPagesResult(opened);
    const openedPage = openedPageCandidate(beforePages, openedPages, url);
    if (openedPage) {
      return openedPage.id;
    }
    await sleep(250);
    const afterPages = parseListPagesResult(await this.callTool("list_pages", {}));
    const afterPage = openedPageCandidate(beforePages, afterPages, url);
    if (afterPage) {
      return afterPage.id;
    }
    throw new Error(`Opened ${url}, but could not identify the new page id.`);
  }

  async prepareCapturePage(targetUrl, flags = {}, options = {}) {
    let pageId;
    let action = "sample";
    const beforeCaptureAction = async () => {
      if (options.clearPerformance) {
        await this.callTool("evaluate_script", {
          pageId,
          function: clearPerformanceEntriesFunction(),
        }).catch(() => null);
      }
    };

    if (targetUrl) {
      pageId = this.mode === ANONYMOUS_MODE
        ? await this.resolveAnonymousNavigationPageId(flags)
        : null;
      if (pageId === null || pageId === undefined) {
        pageId = await this.openPageForAutomation("about:blank", flags);
      }
      await beforeCaptureAction();
      await this.callTool("navigate_page", {
        pageId,
        type: "url",
        url: targetUrl,
      });
      action = "navigate";
    } else {
      pageId = await this.mcpPageIdForFlags(flags);
      await beforeCaptureAction();
      if (flags.reload) {
        await this.callTool("navigate_page", {
          pageId,
          type: "reload",
        });
        action = "reload";
      }
    }

    return { pageId, action };
  }

  async waitForCaptureSettled(pageId, flags = {}, options = {}) {
    const timeoutMs = options.timeoutMs;
    const durationMs = options.durationMs ?? 0;
    await this.handleWait(["load"], { ...flags, mcp: true, page: String(pageId), timeout: String(timeoutMs) }).catch(() => null);
    if (durationMs > 0) {
      await sleep(durationMs);
    }
    await this.handleWait(["networkidle"], {
      ...flags,
      mcp: true,
      page: String(pageId),
      timeout: String(Math.min(10000, Math.max(1000, timeoutMs))),
    }).catch(() => null);
  }

  async handleCaptureConsole(args, flags = {}) {
    const targetUrl = args[0];
    const durationMs = parsePositiveInteger(flags.duration ?? String(DEFAULT_CONSOLE_CAPTURE_DURATION_MS), "duration");
    const timeoutMs = parsePositiveInteger(flags.timeout ?? String(DEFAULT_CONSOLE_CAPTURE_TIMEOUT_MS), "timeout");
    const { pageId, action } = await this.prepareCapturePage(targetUrl, flags);
    await this.waitForCaptureSettled(pageId, flags, { timeoutMs, durationMs });

    return await this.collectConsoleCapture(pageId, flags, { action, durationMs });
  }

  async collectConsoleCapture(pageId, flags = {}, meta = {}) {
    const listResult = await this.callTool("list_console_messages", {
      pageId,
      ...(flags.errors ? { types: ["error", "warn"] } : {}),
      ...(flags.preserve ? { includePreservedMessages: true } : {}),
    });
    const networkResult = flags.network === false
      ? null
      : await this.callTool("list_network_requests", {
        pageId,
        includePreservedRequests: true,
      }).catch((error) => ({
        text: `network list unavailable: ${error instanceof Error ? error.message : String(error)}`,
      }));
    const pageInfoResult = await this.callTool("evaluate_script", {
      pageId,
      function: consolePageInfoFunction(),
    }).catch(() => null);
    const pageInfo = pageInfoResult ? parseEvaluateJsonResult(pageInfoResult, "capture-console page info") : {};
    const filter = normalizeOptionalString(flags.filter)?.toLowerCase();
    const limit = parsePositiveInteger(flags.limit ?? String(DEFAULT_CONSOLE_CAPTURE_LIMIT), "limit");
    const allMessages = normalizeConsoleMessages(listResult);
    const filteredMessages = filter
      ? allMessages.filter((message) => consoleMessageSearchText(message).toLowerCase().includes(filter))
      : allMessages;
    const selectedMessages = filteredMessages.slice(Math.max(0, filteredMessages.length - limit));
    const networkText = String(networkResult?.text ?? "");
    const networkFailures = flags.network === false
      ? []
      : networkText.split(/\r?\n/u).filter(isFailedNetworkLine).slice(-20);
    const messages = [];
    for (const message of selectedMessages) {
      const msgid = Number.parseInt(String(message.id ?? ""), 10);
      if (!Number.isFinite(msgid)) {
        messages.push(message);
        continue;
      }
      const detail = await this.callTool("get_console_message", {
        pageId,
        msgid,
      }).catch((error) => ({
        text: `console detail unavailable for ${msgid}: ${error instanceof Error ? error.message : String(error)}`,
      }));
      messages.push(mergeConsoleMessageDetail(message, detail));
    }
    const capture = {
      capturedAt: new Date().toISOString(),
      action: meta.action ?? "sample",
      durationMs: meta.durationMs ?? 0,
      pageId,
      url: pageInfo.url ?? "",
      title: pageInfo.title ?? "",
      readyState: pageInfo.readyState ?? "",
      userAgent: pageInfo.userAgent ?? "",
      filter: filter ?? undefined,
      errorsOnly: Boolean(flags.errors),
      includePreservedMessages: Boolean(flags.preserve),
      totalBeforeFilter: allMessages.length,
      totalAfterFilter: filteredMessages.length,
      truncated: filteredMessages.length > selectedMessages.length,
      messages,
      counts: countConsoleTypes(messages),
      networkFailures,
      networkText,
      rawListText: String(listResult.text ?? ""),
    };
    const outPath = flags.out ?? flags.output;
    let resolvedOutPath = null;
    if (outPath) {
      resolvedOutPath = path.resolve(outPath);
      await writeJson(resolvedOutPath, capture);
    }
    return {
      text: formatConsoleCaptureText(capture, { outPath: resolvedOutPath, flags }),
      quiet: resolvedOutPath ?? capture.url,
      pageId,
      url: capture.url,
      capture,
      outPath: resolvedOutPath,
    };
  }

  async handleEval(args, flags = {}) {
    if (this.shouldUseFastCdp(flags) && !flags.uid) {
      try {
        const result = await this.evaluateCdpFunction(buildEvalFunction(args.join(" ")), flags);
        return flags.raw ? await formatRawResult("eval", result, flags) : compactTextResult(result, flags, DEFAULT_READ_MAX_CHARS);
      } catch (error) {
        if (!this.shouldFallbackToMcpAfterCdp(flags)) {
          throw error;
        }
        // Fall through to MCP when the current session policy allows it.
      }
    }
    const pageId = await this.resolvePageId(flags);
    const result = await this.callTool("evaluate_script", {
      function: buildEvalFunction(args.join(" ")),
      pageId,
      ...(flags.uid ? { args: [flags.uid] } : {}),
    });
    return flags.raw ? await formatRawResult("eval", result, flags) : compactTextResult(result, flags, DEFAULT_READ_MAX_CHARS);
  }

  async resolvePageId(flags = {}) {
    if (flags.page !== undefined) {
      return parsePageId(flags.page);
    }
    const pages = await this.callTool("list_pages", {});
    const selected = pages.text.match(/^\s*(\d+): .*?\[selected\]\s*$/m);
    if (selected) {
      return Number.parseInt(selected[1], 10);
    }
    const first = pages.text.match(/^\s*(\d+): /m);
    if (first) {
      return Number.parseInt(first[1], 10);
    }
    throw new Error("No browser page found");
  }

  async handleNetwork(args, flags = {}) {
    if (args[0] === "get") {
      const reqid = args[1] === undefined ? undefined : Number.parseInt(args[1], 10);
      const result = await this.callTool("get_network_request", {
        ...await this.mcpPageArgs(flags),
        ...(Number.isFinite(reqid) ? { reqid } : {}),
        ...(flags.requestFile ? { requestFilePath: flags.requestFile } : {}),
        ...(flags.responseFile ? { responseFilePath: flags.responseFile } : {}),
      });
      return flags.raw ? result : compactTextResult(result, flags, DEFAULT_READ_MAX_CHARS);
    }
    const result = await this.callTool("list_network_requests", {
      ...await this.mcpPageArgs(flags),
      ...(flags.preserve ? { includePreservedRequests: true } : {}),
    });
    return compactLineResult(result, {
      flags,
      hiddenSet: this.hiddenNetworkLines,
      emptyText: "(no network requests)",
      lineLimit: DEFAULT_LINE_LIMIT,
      linePredicate: flags.failed ? isFailedNetworkLine : undefined,
    });
  }

  async handleCaptureNetwork(args, flags = {}) {
    const targetUrl = args[0];
    const durationMs = parsePositiveInteger(flags.duration ?? String(DEFAULT_NETWORK_CAPTURE_DURATION_MS), "duration");
    const timeoutMs = parsePositiveInteger(flags.timeout ?? String(DEFAULT_NETWORK_CAPTURE_TIMEOUT_MS), "timeout");
    const { pageId, action } = await this.prepareCapturePage(targetUrl, flags, { clearPerformance: true });
    await this.waitForCaptureSettled(pageId, flags, { timeoutMs, durationMs });

    const perfResult = await this.callTool("evaluate_script", {
      pageId,
      function: networkPerformanceCaptureFunction(),
    });
    const capture = parseEvaluateJsonResult(perfResult, "capture-network");
    capture.action = action;
    capture.pageId = pageId;
    capture.durationMs = durationMs;

    const networkResult = await this.callTool("list_network_requests", {
      pageId,
      includePreservedRequests: true,
    }).catch((error) => ({
      text: `network list unavailable: ${error instanceof Error ? error.message : String(error)}`,
    }));
    const networkText = String(networkResult.text ?? "");
    const summary = summarizeNetworkCapture(capture, networkText, flags);
    let harPath = null;
    if (flags.har) {
      harPath = path.resolve(flags.har);
      await fsp.mkdir(path.dirname(harPath), { recursive: true });
      await fsp.writeFile(harPath, `${JSON.stringify(buildHarFromNetworkCapture(capture), null, 2)}\n`, "utf8");
    }

    return {
      text: formatNetworkCaptureText(summary, { harPath, networkText, flags }),
      quiet: harPath ?? summary.url,
      pageId,
      url: summary.url,
      summary,
      capture,
      harPath,
      networkText,
    };
  }

  async handleRead(command, args, flags = {}) {
    const target = args[0] ?? flags.selector;
    const rawResult = async (fn, selectorOrUid = undefined) => {
      const result = await this.evaluateFunction(fn, flags, selectorOrUid);
      return flags.raw ? await formatRawResult(command, result, flags) : await formatReadResult(command, result, flags);
    };
    const cdpDomTextResult = async (format) => {
      const result = await this.getDomText(format, flags, target);
      const formatted = flags.raw
        ? await formatRawResult(command, { text: result.text }, flags)
        : await formatReadResult(command, { text: result.text }, flags);
      return {
        ...formatted,
        structuredContent: {
          ...(formatted.structuredContent ?? {}),
          cdp: true,
          targetId: result.targetId,
          source: "cdp-get-dom-text",
        },
      };
    };
    switch (command) {
      case "url":
        return await rawResult("() => location.href");
      case "text":
        if (this.shouldUseFastCdp(flags) && !(target && (isUidRef(target) || isCdpRoleRef(target)))) {
          try {
            return await cdpDomTextResult("text");
          } catch (error) {
            if (!this.shouldFallbackToMcpAfterCdp(flags)) {
              throw error;
            }
          }
        }
        return await rawResult(
          target
            ? selectorOrUidFunction(target, "(el) => el.innerText || el.textContent || ''")
            : `() => {
                const clone = document.body?.cloneNode(true);
                if (!clone) return "";
                clone.querySelectorAll("script,style,noscript,svg").forEach((el) => el.remove());
                return clone.innerText.split("\\n").map((line) => line.trim()).filter(Boolean).join("\\n");
              }`,
          target,
        );
      case "html":
        if (this.shouldUseFastCdp(flags) && !(target && (isUidRef(target) || isCdpRoleRef(target)))) {
          try {
            return await cdpDomTextResult("html");
          } catch (error) {
            if (!this.shouldFallbackToMcpAfterCdp(flags)) {
              throw error;
            }
          }
        }
        return await rawResult(
          target ? selectorOrUidFunction(target, "(el) => el.innerHTML") : "() => document.documentElement.outerHTML",
          target,
        );
      case "links":
        return await rawResult(
          target ? selectorOrUidFunction(target, linkReadBodyFunction(flags)) : linksReadFunction(flags),
          target,
        );
      case "forms":
        return await rawResult(
          `() => [...document.querySelectorAll("form")].map((form, index) => ({
            index,
            action: form.action || undefined,
            method: form.method || "get",
            id: form.id || undefined,
            fields: [...form.querySelectorAll("input, select, textarea")].map((el) => ({
              tag: el.tagName.toLowerCase(),
              type: el.type || undefined,
              name: el.name || undefined,
              id: el.id || undefined,
              placeholder: el.placeholder || undefined,
              required: Boolean(el.required) || undefined,
              value: el.type === "password" ? "[redacted]" : (el.value || undefined),
              options: el.tagName === "SELECT"
                ? [...el.options].map((option) => ({ value: option.value, text: option.text }))
                : undefined,
            })),
          }))`,
        );
      case "cookies":
        return await rawResult(
          `() => document.cookie.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
            const index = part.indexOf("=");
            const name = index === -1 ? part : part.slice(0, index);
            const value = index === -1 ? "" : part.slice(index + 1);
            return {
              name,
              value: ${flags.values ? "value" : '"[redacted " + value.length + " chars]"'},
            };
          })`,
        );
      case "storage":
        return await rawResult(
          storageReadFunction(Boolean(flags.values)),
        );
      case "perf":
        return await rawResult(
          `() => {
            const nav = performance.getEntriesByType("navigation")[0];
            if (!nav) return null;
            return {
              dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
              tcp: Math.round(nav.connectEnd - nav.connectStart),
              ssl: Math.round(nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0),
              ttfb: Math.round(nav.responseStart - nav.requestStart),
              download: Math.round(nav.responseEnd - nav.responseStart),
              domParse: Math.round(nav.domInteractive - nav.responseEnd),
              domReady: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
              load: Math.round(nav.loadEventEnd - nav.startTime),
              total: Math.round(nav.loadEventEnd - nav.startTime),
            };
          }`,
        );
      case "css":
        requireArgs(command, args, 2);
        return await rawResult(
          selectorOrUidFunction(args[0], `(el) => getComputedStyle(el).getPropertyValue(${JSON.stringify(args[1])})`),
          args[0],
        );
      case "attrs":
        requireArgs(command, args, 1);
        return await rawResult(
          selectorOrUidFunction(
            args[0],
            `(el) => Object.fromEntries([...el.attributes].map((attr) => [attr.name, attr.value]))`,
          ),
          args[0],
        );
      case "is":
        requireArgs(command, args, 2);
        return await rawResult(
          selectorOrUidFunction(args[1], stateFunctionBody(args[0])),
          args[1],
        );
      default:
        throw new Error(`Unknown read command: ${command}`);
    }
  }

  async evaluateFunction(fnString, flags = {}, selectorOrUid = undefined) {
    if (this.shouldUseFastCdp(flags) && !flags.uid && !(selectorOrUid && isUidRef(selectorOrUid))) {
      try {
        return await this.evaluateCdpFunction(fnString, flags);
      } catch (error) {
        if (!this.shouldFallbackToMcpAfterCdp(flags)) {
          throw error;
        }
        // Fall through to MCP when the current session policy allows it.
      }
    }
    const pageId = await this.resolvePageId(flags);
    return await this.callTool("evaluate_script", {
      function: fnString,
      pageId,
      ...(selectorOrUid && isUidRef(selectorOrUid) ? { args: [selectorOrUid] } : {}),
    });
  }

  async handleScroll(args, flags = {}) {
    const target = args[0];
    return await this.evaluateFunction(
      target
        ? selectorOrUidFunction(
            target,
            `(el) => {
              el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
              return true;
            }`,
          )
        : `() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
            return true;
          }`,
      flags,
      target,
    );
  }

  async handleSelectOption(args, flags = {}) {
    requireArgs("select", args, 2);
    const target = args[0];
    const value = args.slice(1).join(" ");
    if (isUidRef(target)) {
      return await this.callTool("fill", {
        ...this.pageArgs(flags),
        uid: target,
        value,
      });
    }
    return await this.evaluateFunction(
      selectorOrUidFunction(
        target,
        `(el) => {
          if (!(el instanceof HTMLSelectElement)) {
            throw new Error("Element is not a select");
          }
          const wanted = ${JSON.stringify(value)};
          const option = [...el.options].find((entry) =>
            entry.value === wanted ||
            entry.label === wanted ||
            entry.textContent?.trim() === wanted
          );
          if (!option) {
            throw new Error("Option not found: " + wanted);
          }
          el.value = option.value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return { value: el.value, text: option.textContent?.trim() || option.label || option.value };
        }`,
      ),
      flags,
      target,
    );
  }

  async handleClickCoords(args, flags = {}) {
    const x = Number.parseFloat(args[0]);
    const y = Number.parseFloat(args[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("click-coords expects numeric x and y viewport coordinates");
    }
    return await this.evaluateFunction(
      `() => {
        const x = ${JSON.stringify(x)};
        const y = ${JSON.stringify(y)};
        const el = document.elementFromPoint(x, y);
        if (!el) throw new Error("No element at coordinates " + x + "," + y);
        const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
        el.dispatchEvent(new PointerEvent("pointerdown", opts));
        el.dispatchEvent(new MouseEvent("mousedown", opts));
        el.dispatchEvent(new PointerEvent("pointerup", opts));
        el.dispatchEvent(new MouseEvent("mouseup", opts));
        el.dispatchEvent(new MouseEvent("click", opts));
        return {
          clicked: true,
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.textContent || "").trim().slice(0, 120),
          id: el.id || undefined,
        };
      }`,
      flags,
    );
  }

  async handleHighlight(args, flags = {}) {
    const target = args[0];
    return await this.evaluateFunction(
      selectorOrUidFunction(
        target,
        `(el) => {
          document.querySelectorAll("[data-realbrowser-highlight]").forEach((node) => node.remove());
          const rect = el.getBoundingClientRect();
          const overlay = document.createElement("div");
          overlay.setAttribute("data-realbrowser-highlight", "true");
          overlay.style.position = "fixed";
          overlay.style.left = rect.left + "px";
          overlay.style.top = rect.top + "px";
          overlay.style.width = Math.max(1, rect.width) + "px";
          overlay.style.height = Math.max(1, rect.height) + "px";
          overlay.style.border = "3px solid #ff3366";
          overlay.style.background = "rgba(255,51,102,0.12)";
          overlay.style.pointerEvents = "none";
          overlay.style.zIndex = "2147483647";
          document.documentElement.appendChild(overlay);
          setTimeout(() => overlay.remove(), 3000);
          return {
            highlighted: true,
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.textContent || "").trim().slice(0, 120),
            id: el.id || undefined,
          };
        }`,
      ),
      flags,
      target,
    );
  }

  async handleWait(args, flags = {}) {
    const timeout = parsePositiveInteger(flags.timeout ?? "10000", "timeout");
    const mode = args[0];
    if (mode === "--load" || mode === "load") {
      return await this.evaluateFunction(
        waitForReadyStateFunction("complete", timeout),
        flags,
      );
    }
    if (mode === "--domcontentloaded" || mode === "domcontentloaded") {
      return await this.evaluateFunction(
        waitForReadyStateFunction("interactive", timeout),
        flags,
      );
    }
    if (mode === "--networkidle" || mode === "networkidle") {
      return await this.evaluateFunction(
        waitForNetworkIdleFunction(timeout),
        flags,
      );
    }
    if (flags.selector && args.length === 0) {
      return await this.evaluateFunction(
        waitForSelectorFunction(flags.selector, timeout, { visible: Boolean(flags.visible) }),
        flags,
      );
    }
    if (args.length === 0) {
      throw new Error("wait expects text, --selector <css>, --load, --domcontentloaded, or --networkidle");
    }
    return await this.evaluateFunction(
      waitForTextFunction(args.join(" "), timeout, {
        visible: Boolean(flags.visible),
        selector: flags.selector,
      }),
      flags,
    );
  }

  async handleWaitReady(args, flags = {}) {
    const timeout = parsePositiveInteger(flags.timeout ?? "15000", "timeout");
    const text = normalizeOptionalString(flags.readyText) ?? normalizeOptionalString(args.join(" "));
    const result = await this.evaluateFunction(
      waitForReadyContentFunction(text, timeout, {
        selector: flags.selector,
        cardSelector: flags.cardSelector,
        minCards: flags.minCards,
        stableMs: flags.stableMs,
        visualStable: Boolean(flags.visualStable || flags.foregroundUntilReady),
        noSkeletons: Boolean(flags.noSkeletons),
        foregroundRequested: Boolean(flags.foregroundUntilReady || flags.front),
      }),
      flags,
    );
    const ready = parseEvaluateJsonResult(result, "wait-ready");
    let screenshot = null;
    if (flags.screenshot) {
      screenshot = await this.handleScreenshot([], flags).catch((error) => ({
        text: `screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }
    return {
      text: [
        formatReadyContentSummary(ready),
        screenshot?.text,
      ].filter(Boolean).join("\n"),
      structuredContent: ready,
      ready,
      screenshot,
    };
  }

  async handleViewport(size, flags = {}) {
    if (size === "reset" || size === "clear") {
      if (this.shouldUseFastCdp(flags)) {
        try {
          const targetId = await this.resolveCdpTargetId(flags);
          await this.cdpPageRequest(targetId, "Emulation.clearDeviceMetricsOverride", {}, {
            timeoutMs: parsePositiveInteger(flags.timeout ?? "10000", "timeout"),
          });
          return {
            text: "Viewport emulation reset.\nFast path: CDP",
            structuredContent: { targetId, cdp: true },
            cdp: true,
          };
        } catch (error) {
          if (!this.shouldFallbackToMcpAfterCdp(flags)) {
            throw error;
          }
          // Fall through to MCP when the current session policy allows it.
        }
      }
      return await this.callTool("emulate", this.pageArgs(flags));
    }
    const [width, height, rawDpr] = size.split(/[x,]/).map((value) => Number.parseInt(value, 10));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("viewport expects a size like 1280x720");
    }
    const deviceScaleFactor = Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1;
    if (this.shouldUseFastCdp(flags)) {
      try {
        const targetId = await this.resolveCdpTargetId(flags);
        await this.cdpPageRequest(targetId, "Emulation.setDeviceMetricsOverride", {
          width,
          height,
          deviceScaleFactor,
          mobile: Boolean(flags.mobile),
        }, {
          timeoutMs: parsePositiveInteger(flags.timeout ?? "10000", "timeout"),
        });
        return {
          text: `Emulating viewport: ${JSON.stringify({ width, height, deviceScaleFactor, mobile: Boolean(flags.mobile) })}\nFast path: CDP`,
          structuredContent: {
            targetId,
            viewport: { width, height, deviceScaleFactor, mobile: Boolean(flags.mobile) },
            cdp: true,
          },
          cdp: true,
        };
      } catch (error) {
        if (!this.shouldFallbackToMcpAfterCdp(flags)) {
          throw error;
        }
        // Fall through to MCP when the current session policy allows it.
      }
    }
    const viewport = size.includes("x") && size.split("x").length >= 3 ? size : `${width}x${height}x1`;
    return await this.callTool("emulate", {
      ...this.pageArgs(flags),
      viewport,
    });
  }

  async handleEmulate(flags = {}) {
    const params = { ...this.pageArgs(flags) };
    if (flags.network && flags.network !== "reset") params.networkConditions = flags.network;
    if (flags.cpu) params.cpuThrottlingRate = parsePositiveInteger(flags.cpu, "cpu");
    if (flags.userAgent && flags.userAgent !== "reset") params.userAgent = flags.userAgent;
    if (flags.colorScheme) params.colorScheme = flags.colorScheme;
    if (flags.geolocation) params.geolocation = flags.geolocation;
    return await this.callTool("emulate", params);
  }

  async handleCookie(cookieText, flags = {}) {
    const separator = cookieText.indexOf("=");
    if (separator <= 0) {
      throw new Error("cookie expects name=value");
    }
    const name = cookieText.slice(0, separator);
    const value = cookieText.slice(separator + 1);
    return await this.evaluateFunction(
      `() => {
        document.cookie = ${JSON.stringify(`${name}=${value}; path=/`)};
        return ${JSON.stringify(name)};
      }`,
      flags,
    );
  }

  async handleDialog(args, flags = {}) {
    if (args.length === 0 || args[0] === "list") {
      return await this.evaluateFunction(
        `() => window.__realbrowserDialogHook?.log ?? []`,
        flags,
      );
    }
    if (args[0] === "--accept" || args[0] === "--dismiss") {
      return await this.armDialog(args[0] === "--accept" ? "accept" : "dismiss", args.slice(1), flags);
    }
    if (args[0] === "arm") {
      const action = args[1];
      if (action !== "accept" && action !== "dismiss") {
        throw new Error("dialog arm expects accept or dismiss");
      }
      return await this.armDialog(action, args.slice(2), flags);
    }
    if (args[0] === "current" || args[0] === "now" || args[0] === "handle") {
      const action = args[1];
      if (action !== "accept" && action !== "dismiss") {
        throw new Error("dialog current expects accept or dismiss");
      }
      return await this.handleCurrentDialog(action, args.slice(2), flags);
    }
    const action = args[0];
    if (action !== "accept" && action !== "dismiss") {
      throw new Error("dialog expects list, arm accept|dismiss, or current accept|dismiss");
    }
    return await this.armDialog(action, args.slice(1), flags);
  }

  async handleCurrentDialog(action, textArgs, flags = {}) {
    return await this.callTool("handle_dialog", {
      ...this.pageArgs(flags),
      action,
      ...(textArgs.length > 0 ? { promptText: textArgs.join(" ") } : {}),
    });
  }

  async armDialog(action, textArgs = [], flags = {}) {
    const accept = action === "accept";
    const promptText = textArgs.length > 0 ? textArgs.join(" ") : "";
    const result = await this.evaluateFunction(
      `() => {
        const state = (window.__realbrowserDialogHook ??= { log: [] });
        if (!Array.isArray(state.log)) state.log = [];
        if (!state.originals) {
          state.originals = {
            alert: window.alert.bind(window),
            confirm: window.confirm.bind(window),
            prompt: window.prompt.bind(window),
          };
        }
        const originals = state.originals;
        const restore = () => {
          window.alert = originals.alert;
          window.confirm = originals.confirm;
          window.prompt = originals.prompt;
          state.originals = null;
          state.armed = false;
        };
        const remember = (entry) => {
          state.log.push({
            timestamp: new Date().toISOString(),
            ...entry,
          });
          state.log = state.log.slice(-50);
        };
        window.alert = (message) => {
          try {
            remember({ type: "alert", message: String(message ?? ""), action: "accepted" });
            return undefined;
          } finally {
            restore();
          }
        };
        window.confirm = (message) => {
          try {
            const accepted = ${accept ? "true" : "false"};
            remember({ type: "confirm", message: String(message ?? ""), action: accepted ? "accepted" : "dismissed" });
            return accepted;
          } finally {
            restore();
          }
        };
        window.prompt = (message, defaultValue = "") => {
          try {
            const accepted = ${accept ? "true" : "false"};
            const response = ${JSON.stringify(promptText)};
            remember({
              type: "prompt",
              message: String(message ?? ""),
              defaultValue: String(defaultValue ?? ""),
              action: accepted ? "accepted" : "dismissed",
              response: accepted ? response : undefined,
            });
            return accepted ? response : null;
          } finally {
            restore();
          }
        };
        state.armed = true;
        return { armed: true, action: ${JSON.stringify(action)}, promptText: ${JSON.stringify(promptText)} };
      }`,
      flags,
    );
    return {
      text: `dialog armed: ${action}${promptText ? ` (${promptText})` : ""}`,
      structuredContent: extractJsonFromToolText(result.text) ?? undefined,
      raw: result.raw,
    };
  }

  async handleFullScreenshot(args, flags = {}) {
    const explicitPath = args.find((arg) => !arg.startsWith("--"));
    const filePath = path.resolve(explicitPath ?? defaultFullScreenshotPath());
    const settleMs = parsePositiveInteger(flags.settleMs ?? "200", "settle-ms");
    if (flags.viewport) {
      const viewport = parseViewportSize(flags.viewport);
      await this.handleViewport(viewport.requested, {
        ...flags,
        mobile: Boolean(flags.mobile || flags.mobileEmulation),
      });
      if (settleMs > 0) await sleep(settleMs);
    }

    const prepared = await this.prepareFullScreenshotTarget(flags);
    try {
      const target = prepared.target;
      const documentScrollExtra = Math.max(0, prepared.document.scrollHeight - prepared.viewport.innerHeight);
      const targetScrollExtra = target ? Math.max(0, target.scrollHeight - target.clientHeight) : 0;

      if (flags.selector && targetScrollExtra <= 20) {
        return await this.handleAreaScreenshot([filePath], flags);
      }

      if (!flags.selector && (documentScrollExtra > 20 || !target || targetScrollExtra <= 20)) {
        const result = await this.handleScreenshot([filePath], {
          ...flags,
          full: true,
          rawSize: flags.rawSize !== false,
        });
        const format = inferScreenshotFormat(filePath, flags);
        const png = format === "png" ? readPngDimensions(filePath) : null;
        return {
          ...result,
          text: [
            `Saved full screenshot to ${path.resolve(filePath)}.`,
            "Method: page-full",
            `Document: ${prepared.document.scrollWidth}x${prepared.document.scrollHeight}`,
            `Viewport: ${prepared.viewport.innerWidth}x${prepared.viewport.innerHeight} @ ${prepared.viewport.devicePixelRatio}`,
            png ? `PNG: ${png.pixelWidth}x${png.pixelHeight}` : "",
          ].filter(Boolean).join("\n"),
          filePath: path.resolve(filePath),
          path: path.resolve(filePath),
          method: "page-full",
          png,
          prepared,
        };
      }

      return await this.captureStitchedScrollContainer(filePath, flags, prepared);
    } finally {
      await this.cleanupFullScreenshotTarget(prepared, flags).catch(() => {});
    }
  }

  async handleAreaScreenshot(args, flags = {}) {
    const explicitPath = args.find((arg) => !arg.startsWith("--"));
    const filePath = path.resolve(explicitPath ?? defaultAreaScreenshotPath());
    if (flags.uid) {
      return await this.handleScreenshot([filePath], {
        ...flags,
        rawSize: flags.rawSize !== false,
      });
    }
    if (!flags.selector) {
      throw new Error("area-screenshot requires --uid <uid> or --selector <css>.");
    }
    return await this.captureSelectorAreaScreenshot(filePath, flags);
  }

  async prepareFullScreenshotTarget(flags = {}) {
    const markerAttr = "data-realbrowser-full-screenshot-target";
    const marker = `rb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const selector = flags.selector ? String(flags.selector) : "";
    const result = await this.evaluateFunction(
      `() => {
        const markerAttr = ${JSON.stringify(markerAttr)};
        const marker = ${JSON.stringify(marker)};
        const selector = ${JSON.stringify(selector)};
        const doc = document.documentElement;
        const body = document.body;
        const viewport = {
          innerWidth: Math.max(1, Math.round(window.innerWidth || doc?.clientWidth || 0)),
          innerHeight: Math.max(1, Math.round(window.innerHeight || doc?.clientHeight || 0)),
          devicePixelRatio: Number(window.devicePixelRatio || 1),
        };
        const documentSize = {
          scrollWidth: Math.max(viewport.innerWidth, Math.round(doc?.scrollWidth || 0), Math.round(body?.scrollWidth || 0)),
          scrollHeight: Math.max(viewport.innerHeight, Math.round(doc?.scrollHeight || 0), Math.round(body?.scrollHeight || 0)),
          clientWidth: Math.max(1, Math.round(doc?.clientWidth || viewport.innerWidth)),
          clientHeight: Math.max(1, Math.round(doc?.clientHeight || viewport.innerHeight)),
        };
        const describe = (el, index = -1) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const visibleWidth = Math.max(0, Math.min(rect.right, viewport.innerWidth) - Math.max(rect.left, 0));
          const visibleHeight = Math.max(0, Math.min(rect.bottom, viewport.innerHeight) - Math.max(rect.top, 0));
          const scrollExtra = Math.max(0, el.scrollHeight - el.clientHeight);
          const score = (scrollExtra * Math.max(1, visibleWidth)) + (visibleWidth * visibleHeight);
          return {
            index,
            tag: el.tagName.toLowerCase(),
            id: el.id || "",
            className: String(el.className || "").slice(0, 160),
            overflowY: style.overflowY,
            scrollTop: Math.round(el.scrollTop || 0),
            scrollHeight: Math.round(el.scrollHeight || 0),
            clientHeight: Math.round(el.clientHeight || 0),
            clientWidth: Math.round(el.clientWidth || 0),
            scrollExtra,
            visibleWidth: Math.round(visibleWidth),
            visibleHeight: Math.round(visibleHeight),
            score,
            rect: {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            },
            text: String(el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120),
          };
        };
        let selected = null;
        let selectedBy = "";
        let candidates = [];
        if (selector) {
          selected = document.querySelector(selector);
          if (!selected) throw new Error("Selector not found: " + selector);
          selectedBy = "selector";
        } else {
          candidates = Array.from(document.querySelectorAll("*"))
            .map((el, index) => ({ el, info: describe(el, index) }))
            .filter(({ info }) =>
              info.scrollExtra > 20 &&
              info.visibleWidth > 40 &&
              info.visibleHeight > 40 &&
              (info.overflowY === "auto" || info.overflowY === "scroll")
            )
            .sort((left, right) => right.info.score - left.info.score);
          selected = candidates[0]?.el ?? null;
          selectedBy = selected ? "dominant-scroll-container" : "";
        }
        const target = selected ? describe(selected, candidates.find((entry) => entry.el === selected)?.info?.index ?? -1) : null;
        if (selected) selected.setAttribute(markerAttr, marker);
        return {
          markerAttr,
          marker,
          selectedBy,
          selector: selector || undefined,
          viewport,
          document: documentSize,
          target,
          candidates: candidates.slice(0, 5).map((entry) => entry.info),
        };
      }`,
      flags,
    );
    const prepared = extractJsonFromToolText(result.text);
    if (!prepared) {
      throw new Error("Could not inspect page for full-screenshot.");
    }
    return prepared;
  }

  async cleanupFullScreenshotTarget(prepared, flags = {}) {
    if (!prepared?.markerAttr || !prepared?.marker) return;
    const markerSelector = `[${prepared.markerAttr}="${prepared.marker}"]`;
    await this.evaluateFunction(
      `() => {
        document.querySelectorAll(${JSON.stringify(markerSelector)}).forEach((el) => {
          if (el.getAttribute(${JSON.stringify(prepared.markerAttr)}) === ${JSON.stringify(prepared.marker)}) {
            el.removeAttribute(${JSON.stringify(prepared.markerAttr)});
          }
        });
        return true;
      }`,
      flags,
    );
  }

  async captureStitchedScrollContainer(filePath, flags = {}, prepared) {
    const target = prepared?.target;
    if (!target) {
      throw new Error("No internal scroll container found to stitch.");
    }
    const scrollHeight = Math.max(1, Math.round(target.scrollHeight));
    const clientHeight = Math.max(1, Math.round(target.clientHeight));
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const offsets = [];
    for (let offset = 0; offset < maxScroll; offset += clientHeight) {
      offsets.push(Math.round(offset));
    }
    if (!offsets.includes(Math.round(maxScroll))) {
      offsets.push(Math.round(maxScroll));
    }
    if (offsets.length > 80) {
      throw new Error(`full-screenshot would need ${offsets.length} stitched captures; pass --selector for a smaller region or use a larger viewport.`);
    }

    const outputPath = path.resolve(filePath);
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "realbrowser-full-screenshot-"));
    const settleMs = parsePositiveInteger(flags.settleMs ?? "200", "settle-ms");
    const markerSelector = `[${prepared.markerAttr}="${prepared.marker}"]`;
    const originalScrollTop = Math.max(0, Math.round(target.scrollTop || 0));
    const shots = [];
    try {
      for (let index = 0; index < offsets.length; index += 1) {
        const offset = offsets[index];
        await this.evaluateFunction(
          `() => {
            const el = document.querySelector(${JSON.stringify(markerSelector)});
            if (!el) throw new Error("Marked scroll container disappeared.");
            el.scrollTop = ${JSON.stringify(offset)};
            return { scrollTop: Math.round(el.scrollTop || 0) };
          }`,
          flags,
        );
        if (settleMs > 0) await sleep(settleMs);
        const shotPath = path.join(tempDir, `shot-${String(index).padStart(3, "0")}.png`);
        await this.handleScreenshot([shotPath], {
          ...flags,
          uid: undefined,
          selector: undefined,
          full: false,
          rawSize: true,
          format: "png",
        });
        shots.push({
          offset,
          path: shotPath,
          png: readPngDimensions(shotPath),
          data: fs.readFileSync(shotPath).toString("base64"),
        });
      }
      await this.composeStitchedScrollScreenshot(outputPath, prepared, shots, flags);
    } finally {
      await this.evaluateFunction(
        `() => {
          const el = document.querySelector(${JSON.stringify(markerSelector)});
          if (el) el.scrollTop = ${JSON.stringify(originalScrollTop)};
          return true;
        }`,
        flags,
      ).catch(() => {});
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    const png = readPngDimensions(outputPath);
    const classLabel = target.className ? `.${target.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".")}` : "";
    const containerLabel = `${target.tag}${target.id ? `#${target.id}` : ""}${classLabel}`;
    return {
      text: [
        `Saved full screenshot to ${outputPath}.`,
        "Method: stitched-scroll-container",
        `Container: ${containerLabel || target.tag} (${prepared.selectedBy})`,
        `Viewport: ${prepared.viewport.innerWidth}x${prepared.viewport.innerHeight} @ ${prepared.viewport.devicePixelRatio}`,
        `Scroll: ${target.scrollHeight}x${target.clientHeight} offsets=${offsets.length}`,
        `PNG: ${png.pixelWidth}x${png.pixelHeight}`,
      ].join("\n"),
      filePath: outputPath,
      path: outputPath,
      method: "stitched-scroll-container",
      png,
      offsets,
      prepared,
    };
  }

  async composeStitchedScrollScreenshot(outputPath, prepared, shots, flags = {}) {
    if (!shots.length) {
      throw new Error("No stitched screenshots captured.");
    }
    const first = shots[0];
    const viewport = prepared.viewport;
    const target = prepared.target;
    const scaleX = first.png.pixelWidth / Math.max(1, viewport.innerWidth);
    const scaleY = first.png.pixelHeight / Math.max(1, viewport.innerHeight);
    const selectorMode = Boolean(prepared.selector);
    const cropLeft = selectorMode ? Math.max(0, Math.round(target.rect.left * scaleX)) : 0;
    const cropTop = Math.max(0, Math.round(target.rect.top * scaleY));
    const cropRight = selectorMode
      ? Math.min(first.png.pixelWidth, Math.round((target.rect.left + target.rect.width) * scaleX))
      : first.png.pixelWidth;
    const cropBottom = Math.min(first.png.pixelHeight, Math.round((target.rect.top + target.clientHeight) * scaleY));
    const cropWidth = Math.max(1, cropRight - cropLeft);
    const cropHeight = Math.max(1, cropBottom - cropTop);
    const headerHeight = selectorMode ? 0 : cropTop;
    const finalWidth = selectorMode ? cropWidth : first.png.pixelWidth;
    const finalHeight = headerHeight + Math.max(1, Math.ceil(target.scrollHeight * scaleY));
    const payload = {
      shots: shots.map((shot) => ({ offset: shot.offset, data: shot.data })),
      cropLeft,
      cropTop,
      cropWidth,
      cropHeight,
      headerHeight,
      finalWidth,
      finalHeight,
      scaleY,
    };
    const result = await this.evaluateFunction(
      `() => new Promise((resolve, reject) => {
        const payload = ${JSON.stringify(payload)};
        const loadImage = (base64) => new Promise((imageResolve, imageReject) => {
          const img = new Image();
          img.onload = () => imageResolve(img);
          img.onerror = () => imageReject(new Error("Could not load screenshot segment."));
          img.src = "data:image/png;base64," + base64;
        });
        Promise.all(payload.shots.map((shot) => loadImage(shot.data))).then((images) => {
          const canvas = document.createElement("canvas");
          canvas.width = payload.finalWidth;
          canvas.height = payload.finalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Could not create 2d canvas context.");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          if (payload.headerHeight > 0) {
            ctx.drawImage(images[0], 0, 0, payload.finalWidth, payload.headerHeight, 0, 0, payload.finalWidth, payload.headerHeight);
          }
          images.forEach((img, index) => {
            const shot = payload.shots[index];
            const destY = payload.headerHeight + Math.round(shot.offset * payload.scaleY);
            const remaining = payload.finalHeight - destY;
            if (remaining <= 0) return;
            const height = Math.max(1, Math.min(payload.cropHeight, remaining));
            ctx.drawImage(
              img,
              payload.cropLeft,
              payload.cropTop,
              payload.cropWidth,
              height,
              0,
              destY,
              payload.finalWidth,
              height,
            );
          });
          resolve(canvas.toDataURL("image/png").replace(/^data:image\\/png;base64,/, ""));
        }).catch(reject);
      })`,
      flags,
    );
    const base64 = String(result.text ?? "").trim();
    if (!base64) {
      throw new Error("Browser compositor did not return stitched PNG data.");
    }
    await fsp.writeFile(outputPath, Buffer.from(base64, "base64"));
  }

  async captureSelectorAreaScreenshot(filePath, flags = {}) {
    if (!this.shouldUseFastCdp(flags)) {
      throw new Error("area-screenshot --selector requires a CDP-backed browser session; use --uid when only MCP element screenshots are available.");
    }
    const selector = String(flags.selector || "");
    const infoResult = await this.evaluateFunction(
      `() => {
        const selector = ${JSON.stringify(selector)};
        const el = document.querySelector(selector);
        if (!el) throw new Error("Selector not found: " + selector);
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          throw new Error("Selector has an empty bounding box: " + selector);
        }
        return {
          selector,
          rect: {
            x: rect.left + (window.scrollX || document.documentElement.scrollLeft || 0),
            y: rect.top + (window.scrollY || document.documentElement.scrollTop || 0),
            width: rect.width,
            height: rect.height,
          },
          viewport: {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1,
          },
        };
      }`,
      flags,
    );
    const info = extractJsonFromToolText(infoResult.text);
    if (!info?.rect) {
      throw new Error("Could not resolve selector bounds for area-screenshot.");
    }
    const outputPath = path.resolve(filePath);
    const format = inferScreenshotFormat(outputPath, flags);
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    const targetId = await this.resolveCdpTargetId(flags);
    const result = await this.withCdpPageSession(targetId, async (client, sessionId) =>
      await this.captureScreenshotCdpInSession(client, sessionId, targetId, outputPath, format, {
        ...flags,
        clipX: info.rect.x,
        clipY: info.rect.y,
        clipWidth: info.rect.width,
        clipHeight: info.rect.height,
      })
    );
    const png = format === "png" ? readPngDimensions(outputPath) : null;
    return {
      ...result,
      text: [
        `Saved area screenshot to ${outputPath}.`,
        `Selector: ${selector}`,
        `Bounds: ${Math.round(info.rect.width)}x${Math.round(info.rect.height)} at ${Math.round(info.rect.x)},${Math.round(info.rect.y)}`,
        png ? `PNG: ${png.pixelWidth}x${png.pixelHeight}` : "",
      ].filter(Boolean).join("\n"),
      filePath: outputPath,
      path: outputPath,
      method: "selector-area",
      png,
      selector,
      bounds: info.rect,
    };
  }

  async handleScreenshot(args, flags) {
    const explicitPath = args.find((arg) => !arg.startsWith("--"));
    if (flags.labels || flags.annotate) {
      const snapshot = await this.callTool("take_snapshot", {
        ...this.pageArgs(flags),
        verbose: Boolean(flags.verbose),
      });
      return await this.annotatedScreenshotFromSnapshot(snapshot, explicitPath, flags);
    }
    const format = inferScreenshotFormat(explicitPath, flags);
    const filePath =
      explicitPath ??
      path.join(
        DEFAULT_SCREENSHOT_DIR,
        `screenshot-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.${extensionForFormat(format)}`,
      );
    await fsp.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
    return await this.captureScreenshot(filePath, format, flags);
  }

  async captureScreenshotOnce(filePath, format, flags = {}, quality = undefined) {
    if (!flags.uid && this.shouldUseFastCdp(flags)) {
      try {
        return await this.captureScreenshotCdpOnce(filePath, format, flags, quality);
      } catch (error) {
        if (isRealProfileSessionMode(this.currentMode())) {
          throw error;
        }
        // Dedicated/anonymous sessions can still use the MCP screenshot path.
      }
    }
    return await this.callTool("take_screenshot", {
      ...this.pageArgs(flags),
      filePath,
      format,
      ...(quality !== undefined && canUseScreenshotQuality(format) ? { quality } : {}),
      ...(flags.full ? { fullPage: true } : {}),
      ...(flags.uid ? { uid: flags.uid } : {}),
    });
  }

  async captureScreenshotCdpOnce(filePath, format, flags = {}, quality = undefined) {
    const targetId = await this.resolveCdpTargetId(flags);
    return await this.withCdpPageSession(targetId, async (client, sessionId) =>
      await this.captureScreenshotCdpInSession(client, sessionId, targetId, filePath, format, flags, quality)
    );
  }

  async captureScreenshotCdpInSession(client, sessionId, targetId, filePath, format, flags = {}, quality = undefined) {
    const normalizedFormat = normalizeFormat(format);
    const params = {
      format: normalizedFormat,
      fromSurface: true,
      captureBeyondViewport: Boolean(flags.full),
    };
    if (quality !== undefined && canUseScreenshotQuality(normalizedFormat)) {
      params.quality = quality;
    }
    const clipX = Number(flags.clipX);
    const clipY = Number(flags.clipY);
    const clipWidth = Number(flags.clipWidth);
    const clipHeight = Number(flags.clipHeight);
    const hasExplicitClip = [clipX, clipY, clipWidth, clipHeight].every(Number.isFinite) && clipWidth > 0 && clipHeight > 0;
    if (hasExplicitClip) {
      params.captureBeyondViewport = true;
      params.clip = {
        x: Math.max(0, clipX),
        y: Math.max(0, clipY),
        width: Math.ceil(clipWidth),
        height: Math.ceil(clipHeight),
        scale: 1,
      };
    } else if (flags.full) {
      const metrics = await client.request("Page.getLayoutMetrics", {}, { sessionId }).catch(() => null);
      const contentSize = metrics?.cssContentSize ?? metrics?.contentSize;
      const width = Number(contentSize?.width);
      const height = Number(contentSize?.height);
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        params.clip = {
          x: 0,
          y: 0,
          width: Math.ceil(width),
          height: Math.ceil(height),
          scale: 1,
        };
      }
    } else if (flags.exactViewportPng) {
      const clipWidth = Number(flags.clipWidth);
      const clipHeight = Number(flags.clipHeight);
      if (Number.isFinite(clipWidth) && Number.isFinite(clipHeight) && clipWidth > 0 && clipHeight > 0) {
        params.clip = {
          x: 0,
          y: 0,
          width: Math.ceil(clipWidth),
          height: Math.ceil(clipHeight),
          scale: 1,
        };
      } else {
        const metrics = await client.request("Page.getLayoutMetrics", {}, { sessionId }).catch(() => null);
        const viewport = metrics?.cssLayoutViewport ?? metrics?.cssVisualViewport ?? metrics?.layoutViewport ?? metrics?.visualViewport;
        const width = Number(viewport?.clientWidth);
        const height = Number(viewport?.clientHeight);
        const x = Number(viewport?.pageX ?? viewport?.x ?? 0);
        const y = Number(viewport?.pageY ?? viewport?.y ?? 0);
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          params.clip = {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            width: Math.ceil(width),
            height: Math.ceil(height),
            scale: 1,
          };
        }
      }
    }
    const result = await client.request("Page.captureScreenshot", params, {
      sessionId,
      timeoutMs: parsePositiveInteger(flags.timeout ?? "30000", "timeout"),
    });
    const data = String(result?.data ?? "");
    if (!data) {
      throw new Error("CDP screenshot did not return image data");
    }
    const resolvedPath = path.resolve(filePath);
    await fsp.writeFile(resolvedPath, Buffer.from(data, "base64"));
    return {
      text: `Saved screenshot to ${resolvedPath}.`,
      filePath: resolvedPath,
      structuredContent: {
        targetId,
        filePath: resolvedPath,
        format: normalizedFormat,
        cdp: true,
      },
      cdp: true,
    };
  }

  async captureScreenshot(filePath, format, flags = {}) {
    const options = screenshotNormalizationOptions(flags);
    const rawQuality = flags.quality ? parseScreenshotQuality(flags.quality) : undefined;
    if (!options.enabled) {
      return await this.captureScreenshotOnce(filePath, format, flags, rawQuality);
    }

    const metrics = await this.readScreenshotMetrics(flags).catch(() => null);
    const largestPhysicalSide = metrics
      ? Math.max(metrics.width * metrics.dpr, (flags.full ? metrics.contentHeight : metrics.height) * metrics.dpr)
      : 0;
    const cdpOnlyRealProfileScreenshot = !flags.uid && this.shouldUseFastCdp(flags) && isRealProfileSessionMode(this.currentMode());
    const baseScale = metrics && options.maxSide > 0 && largestPhysicalSide > options.maxSide
      ? options.maxSide / largestPhysicalSide
      : 1;
    const scales = metrics && !cdpOnlyRealProfileScreenshot ? screenshotScaleSteps(baseScale) : [1];
    const qualities = canUseScreenshotQuality(format) ? screenshotQualitySteps(rawQuality ?? options.quality) : [undefined];
    let usedEmulation = false;
    let finalResult;
    let finalInfo;

    try {
      for (const scale of scales) {
        if (metrics && scale < 0.999) {
          await this.emulateScreenshotScale(metrics, scale, flags);
          usedEmulation = true;
        } else if (usedEmulation) {
          await this.callTool("emulate", this.pageArgs(flags));
          usedEmulation = false;
        }
        for (const quality of qualities) {
          finalResult = await this.captureScreenshotOnce(filePath, format, flags, quality);
          const actualPath = await resolveScreenshotFilePath(filePath, finalResult, format);
          const stat = await fsp.stat(actualPath).catch(() => null);
          finalInfo = buildScreenshotCaptureInfo({
            filePath: actualPath,
            format,
            quality,
            scale,
            metrics,
            bytes: stat?.size,
            maxBytes: options.maxBytes,
          });
          if (!options.maxBytes || (stat?.size ?? Number.POSITIVE_INFINITY) <= options.maxBytes) {
            return withScreenshotCaptureInfo(finalResult, finalInfo);
          }
        }
      }
      if (finalInfo && options.maxBytes > 0 && finalInfo.bytes > options.maxBytes) {
        finalInfo.warning = `screenshot is still larger than ${formatBytes(options.maxBytes)} after portable capture reduction`;
      }
      return withScreenshotCaptureInfo(finalResult, finalInfo);
    } finally {
      if (usedEmulation) {
        await this.callTool("emulate", this.pageArgs(flags)).catch(() => {});
      }
    }
  }

  async readScreenshotMetrics(flags = {}) {
    const result = await this.evaluateFunction(
      `() => {
        const doc = document.documentElement;
        const body = document.body;
        const width = Math.max(1, Math.round(window.innerWidth || doc?.clientWidth || 0));
        const height = Math.max(1, Math.round(window.innerHeight || doc?.clientHeight || 0));
        const contentWidth = Math.max(width, Math.round(doc?.scrollWidth || 0), Math.round(body?.scrollWidth || 0));
        const contentHeight = Math.max(height, Math.round(doc?.scrollHeight || 0), Math.round(body?.scrollHeight || 0));
        return {
          width,
          height,
          contentWidth,
          contentHeight,
          dpr: Number(window.devicePixelRatio || 1),
        };
      }`,
      flags,
    );
    const metrics = extractJsonFromToolText(result.text);
    if (!metrics || !Number.isFinite(metrics.width) || !Number.isFinite(metrics.height)) {
      throw new Error("Could not read screenshot metrics");
    }
    return {
      width: Math.max(1, Math.round(metrics.width)),
      height: Math.max(1, Math.round(metrics.height)),
      contentWidth: Math.max(1, Math.round(metrics.contentWidth ?? metrics.width)),
      contentHeight: Math.max(1, Math.round(metrics.contentHeight ?? metrics.height)),
      dpr: Math.max(0.1, Number(metrics.dpr) || 1),
    };
  }

  async emulateScreenshotScale(metrics, scale, flags = {}) {
    const width = Math.max(320, Math.round(metrics.width * metrics.dpr * scale));
    const height = Math.max(240, Math.round(metrics.height * metrics.dpr * scale));
    await this.callTool("emulate", {
      ...this.pageArgs(flags),
      viewport: `${width}x${height}x1`,
    });
  }

  async handleDeviceScreenshots(args, flags = {}) {
    const { targetUrl, prefix } = resolveDeviceScreenshotsTarget(args);
    const devices = parseDeviceScreenshotViewports(flags.devices);
    const page = await this.resolveDeviceScreenshotsPage(targetUrl, flags);
    if (!page) {
      throw new Error("Could not find a page for device-screenshots.");
    }

    if (this.shouldUseFastCdp(flags)) {
      try {
        return await this.captureDeviceScreenshotsCdp(page, devices, prefix, flags);
      } catch (error) {
        if (isRealProfileSessionMode(this.currentMode())) {
          throw error;
        }
        // Dedicated/anonymous sessions can fall back to MCP page-scoped calls.
      }
    }
    return await this.captureDeviceScreenshotsMcp(page, devices, prefix, flags);
  }

  async resolveDeviceScreenshotsPage(targetUrl = "", flags = {}) {
    if (this.shouldUseFastCdp(flags)) {
      return await this.resolveDeviceScreenshotsCdpPage(targetUrl, flags);
    }
    return await this.resolveDeviceScreenshotsMcpPage(targetUrl, flags);
  }

  async resolveDeviceScreenshotsCdpPage(targetUrl = "", flags = {}) {
    const hasExplicitTarget = Boolean(flags.targetId || flags.page !== undefined);
    if (targetUrl && hasExplicitTarget) {
      await this.navigateCdpPage("url", targetUrl, flags);
    }
    if (hasExplicitTarget) {
      const targetId = await this.resolveCdpTargetId(flags);
      this.selectedCdpTargetId = targetId;
      return await this.cdpPageForTargetId(targetId) ?? {
        id: flags.page === undefined ? null : Number.parseInt(String(flags.page), 10),
        targetId,
        url: targetUrl,
        title: "",
      };
    }

    const pages = await this.cdpPages();
    if (targetUrl) {
      const matches = pages.filter((page) => pageUrlMatchesRequest(page.url, targetUrl));
      if (matches.length > 1) {
        throw new Error(`device-screenshots matched multiple tabs for ${targetUrl}; pass --page, --target-id, or select the intended tab first:\n${formatPageCandidates(matches)}`);
      }
      if (matches.length === 1) {
        this.selectedCdpTargetId = matches[0].targetId;
        return matches[0];
      }
      const opened = await this.openCdpPage(targetUrl, { ...flags, front: Boolean(flags.front), foregroundUntilReady: false }, "open");
      const page = opened.page ?? (this.selectedCdpTargetId ? await this.cdpPageForTargetId(this.selectedCdpTargetId) : null);
      if (page?.targetId) {
        this.selectedCdpTargetId = page.targetId;
      }
      return page;
    }

    const selected = this.selectedCdpTargetId
      ? pages.find((page) => page.targetId === this.selectedCdpTargetId)
      : pages.find((page) => page.selected);
    if (selected) {
      this.selectedCdpTargetId = selected.targetId;
      return selected;
    }
    if (pages.length === 1) {
      this.selectedCdpTargetId = pages[0].targetId;
      return pages[0];
    }
    throw new Error(`device-screenshots needs a single selected tab; pass --page, --target-id, --handle, or select-tab first:\n${formatPageCandidates(pages)}`);
  }

  async resolveDeviceScreenshotsMcpPage(targetUrl = "", flags = {}) {
    if (targetUrl && flags.page !== undefined) {
      await this.callTool("navigate_page", {
        ...this.pageArgs(flags),
        type: "url",
        url: targetUrl,
      });
    } else if (targetUrl) {
      await this.handleOpen([targetUrl], { ...flags, select: true, foregroundUntilReady: false }, "open");
    }
    const pages = parseListPagesResult(await this.callTool("list_pages", {}));
    if (flags.page !== undefined) {
      const pageId = parsePageId(flags.page);
      return pages.find((page) => page.id === pageId) ?? { id: pageId, url: targetUrl, title: "" };
    }
    if (targetUrl) {
      const matches = pages.filter((page) => pageUrlMatchesRequest(page.url, targetUrl));
      if (matches.length > 1) {
        throw new Error(`device-screenshots matched multiple pages for ${targetUrl}; pass --page or select the intended page first:\n${formatPageCandidates(matches)}`);
      }
      if (matches.length === 1) {
        return matches[0];
      }
    }
    const selected = pages.find((page) => page.selected);
    if (selected) {
      return selected;
    }
    if (pages.length === 1) {
      return pages[0];
    }
    throw new Error(`device-screenshots needs a single selected page; pass --page, --handle, or select-tab first:\n${formatPageCandidates(pages)}`);
  }

  async readViewportMetricsInSession(client, sessionId, flags = {}) {
    const settleMs = Math.min(10000, parsePositiveInteger(flags.settleMs ?? "200", "settle-ms"));
    const metricsFunction = deviceScreenshotMetricsFunction();
    const result = await client.request("Runtime.evaluate", {
      expression: `new Promise((resolve) => {
        let done = false;
        const sample = () => {
          if (done) return;
          done = true;
          resolve((${metricsFunction})());
        };
        setTimeout(sample, ${settleMs + 250});
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(sample, ${settleMs})));
      })`,
      awaitPromise: true,
      returnByValue: true,
    }, { sessionId, timeoutMs: Math.max(1000, settleMs + 5000) });
    if (result?.exceptionDetails) {
      throw new Error(formatCdpException(result.exceptionDetails));
    }
    return cdpRemoteObjectValue(result?.result);
  }

  async waitForDeviceScreenshotReadyInSession(client, sessionId, flags = {}) {
    const needsReady = Boolean(
      flags.readyText ||
      flags.selector ||
      flags.cardSelector ||
      flags.minCards ||
      flags.visualStable ||
      flags.noSkeletons,
    );
    if (!needsReady) {
      return { metrics: await this.readViewportMetricsInSession(client, sessionId, flags) };
    }
    const timeout = parsePositiveInteger(flags.timeout ?? "15000", "timeout");
    const result = await client.request("Runtime.evaluate", {
      expression: `(${waitForReadyContentFunction(
        normalizeOptionalString(flags.readyText) ?? "",
        timeout,
        {
          selector: flags.selector,
          cardSelector: flags.cardSelector,
          minCards: flags.minCards,
          stableMs: flags.stableMs ?? flags.settleMs,
          visualStable: Boolean(flags.visualStable),
          noSkeletons: Boolean(flags.noSkeletons),
          foregroundRequested: Boolean(flags.foregroundUntilReady || flags.front),
        },
      )})()`,
      awaitPromise: true,
      returnByValue: true,
    }, { sessionId, timeoutMs: timeout + 2000 });
    if (result?.exceptionDetails) {
      throw new Error(formatCdpException(result.exceptionDetails));
    }
    const value = cdpRemoteObjectValue(result?.result);
    const ready = typeof value === "string" ? JSON.parse(value) : value;
    return {
      ready,
      metrics: await this.readViewportMetricsInSession(client, sessionId, flags),
    };
  }

  async captureDeviceScreenshotsCdp(page, devices, prefix, flags = {}) {
    const targetId = page.targetId || await this.resolveCdpTargetId({ ...flags, page: page.id });
    return await this.withCdpPageSession(targetId, async (client, sessionId) => {
      await client.request("Page.enable", {}, { sessionId });
      const results = [];
      try {
        for (const device of devices) {
          const outputPath = deviceScreenshotPath(prefix, device.name);
          const mobile = deviceScreenshotMobileMode(device, flags);
          await fsp.mkdir(path.dirname(outputPath), { recursive: true });
          await client.request("Emulation.setDeviceMetricsOverride", {
            width: device.width,
            height: device.height,
            deviceScaleFactor: 1,
            mobile,
            screenWidth: device.width,
            screenHeight: device.height,
          }, { sessionId });
          await client.request("Emulation.setTouchEmulationEnabled", {
            enabled: mobile,
            ...(mobile ? { configuration: "mobile" } : {}),
          }, { sessionId }).catch(() => null);
          const ready = await this.waitForDeviceScreenshotReadyInSession(client, sessionId, flags);
          await this.captureScreenshotCdpInSession(client, sessionId, targetId, outputPath, "png", {
            ...flags,
            exactViewportPng: true,
            clipWidth: device.width,
            clipHeight: device.height,
            full: Boolean(flags.full),
          });
          const png = readPngDimensions(outputPath);
          assertDeviceScreenshotDimensions(device, png, flags);
          results.push(deviceScreenshotCaptureResult({
            device,
            outputPath,
            ready,
            png,
            mobile,
            extra: { targetId, cdp: true },
          }));
        }
      } finally {
        await safeCdpRequest(client, "Emulation.clearDeviceMetricsOverride", {}, { sessionId });
        await safeCdpRequest(client, "Emulation.setTouchEmulationEnabled", { enabled: false }, { sessionId });
      }
      return this.formatDeviceScreenshotResults(results, prefix, page, { cdp: true, targetId });
    });
  }

  async captureDeviceScreenshotsMcp(page, devices, prefix, flags = {}) {
    const results = [];
    const pageFlags = { ...flags, page: page.id };
    try {
      for (const device of devices) {
        const outputPath = deviceScreenshotPath(prefix, device.name);
        const mobile = deviceScreenshotMobileMode(device, flags);
        await this.handleViewport(device.requested, { ...pageFlags, mobile });
        const ready = await this.waitForDeviceScreenshotReadyMcp(pageFlags);
        await this.handleScreenshot([outputPath], {
          ...pageFlags,
          exactViewportPng: true,
          rawSize: flags.rawSize !== false,
          full: Boolean(flags.full),
          format: "png",
        });
        const png = readPngDimensions(outputPath);
        assertDeviceScreenshotDimensions(device, png, flags);
        results.push(deviceScreenshotCaptureResult({
          device,
          outputPath,
          ready,
          png,
          mobile,
        }));
      }
    } finally {
      await this.handleViewport("reset", pageFlags).catch(() => {});
    }
    return this.formatDeviceScreenshotResults(results, prefix, page);
  }

  async waitForDeviceScreenshotReadyMcp(flags = {}) {
    const needsReady = Boolean(
      flags.readyText ||
      flags.selector ||
      flags.cardSelector ||
      flags.minCards ||
      flags.visualStable ||
      flags.noSkeletons,
    );
    if (needsReady) {
      const readyResult = await this.handleWaitReady(readinessArgsFromFlags(flags), flags);
      const metricsResult = await this.evaluateFunction(deviceScreenshotMetricsFunction(), flags);
      return {
        ready: readyResult.ready,
        metrics: parseEvaluateJsonResult(metricsResult, "device screenshot metrics"),
      };
    }
    const settleMs = Math.min(10000, parsePositiveInteger(flags.settleMs ?? "200", "settle-ms"));
    if (settleMs > 0) {
      await sleep(settleMs);
    }
    const metricsResult = await this.evaluateFunction(deviceScreenshotMetricsFunction(), flags);
    return {
      metrics: parseEvaluateJsonResult(metricsResult, "device screenshot metrics"),
    };
  }

  formatDeviceScreenshotResults(results, prefix, page, extra = {}) {
    const text = results.map((result) => {
      const metrics = result.metrics
        ? ` browser=${result.metrics.innerWidth}x${result.metrics.innerHeight}@${result.metrics.devicePixelRatio}`
        : "";
      const png = result.png ? ` png=${result.png.pixelWidth}x${result.png.pixelHeight}` : "";
      const mobile = result.mobile ? " mobile-emulation=yes" : "";
      return `${result.name} (${result.requested}): ${result.filePath}${metrics}${png}${mobile}`;
    }).join("\n");
    return {
      text,
      prefix: path.resolve(prefix),
      pageId: page.id,
      targetId: extra.targetId ?? page.targetId,
      results,
      ...extra,
    };
  }

  async handleResponsive(args, flags = {}) {
    const prefix =
      args[0] ?? path.join(DEFAULT_SCREENSHOT_DIR, `responsive-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`);
    const viewports = [
      ["mobile", "375x812"],
      ["tablet", "768x1024"],
      ["desktop", "1280x720"],
    ];
    const results = [];
    for (const [name, size] of viewports) {
      await this.handleViewport(size, flags);
      const filePath = `${prefix}-${name}.png`;
      const screenshot = await this.handleScreenshot([filePath], flags);
      results.push({ name, size, filePath, result: screenshot.text });
    }
    await this.handleViewport("reset", flags).catch(() => {});
    return {
      text: results.map((result) => `${result.name} (${result.size}): ${result.filePath}`).join("\n"),
      results,
    };
  }

  async handleDiff(args, flags = {}) {
    requireArgs("diff", args, 2);
    const [url1, url2] = args;
    const originalPageId = await this.resolvePageId(flags).catch(() => undefined);
    const first = await this.callTool("navigate_page", {
      ...(originalPageId ? { pageId: originalPageId } : {}),
      type: "url",
      url: url1,
    });
    const text1 = await this.handleRead("text", [], flags);
    await this.callTool("navigate_page", {
      ...(originalPageId ? { pageId: originalPageId } : {}),
      type: "url",
      url: url2,
    });
    const text2 = await this.handleRead("text", [], flags);
    const value1 = extractJsonFromToolText(text1.text) ?? text1.text;
    const value2 = extractJsonFromToolText(text2.text) ?? text2.text;
    return {
      text: simpleLineDiff(String(value1), String(value2), url1, url2),
      first: first.text,
    };
  }

  async handleDownload(args, flags = {}) {
    requireArgs("download", args, 1);
    const cdpUrl = cdpUrlFromFlags(flags);
    if (cdpUrl) {
      return await interceptDownloadViaCdp({
        cdpUrl,
        timeoutMs: parsePositiveInteger(flags.timeout ?? "120000", "timeout"),
        outPath: args[1],
        trigger: async () => {
          await this.callTool("click", { ...this.pageArgs(flags), uid: args[0] });
        },
      });
    }
    const sourceDir = path.resolve(flags.downloadDir ?? DEFAULT_DOWNLOAD_SOURCE_DIR);
    const before = await readDownloadSnapshot(sourceDir);
    const startedAt = Date.now();
    await this.callTool("click", { ...this.pageArgs(flags), uid: args[0] });
    return await this.finishDownload({
      sourceDir,
      before,
      startedAt,
      outPath: args[1],
      timeoutMs: parsePositiveInteger(flags.timeout ?? "120000", "timeout"),
    });
  }

  async handleWaitDownload(args, flags = {}) {
    const cdpUrl = cdpUrlFromFlags(flags);
    if (cdpUrl) {
      return await interceptDownloadViaCdp({
        cdpUrl,
        timeoutMs: parsePositiveInteger(flags.timeout ?? "120000", "timeout"),
        outPath: args[0],
        trigger: async () => {},
      });
    }
    const sourceDir = path.resolve(flags.downloadDir ?? DEFAULT_DOWNLOAD_SOURCE_DIR);
    const before = await readDownloadSnapshot(sourceDir);
    return await this.finishDownload({
      sourceDir,
      before,
      startedAt: Date.now(),
      outPath: args[0],
      timeoutMs: parsePositiveInteger(flags.timeout ?? "120000", "timeout"),
    });
  }

  async finishDownload({ sourceDir, before, startedAt, outPath, timeoutMs }) {
    const downloaded = await waitForDownloadedFile({ sourceDir, before, startedAt, timeoutMs });
    const destination = await resolveDownloadDestination(outPath, downloaded.path);
    if (path.resolve(downloaded.path) !== path.resolve(destination)) {
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.copyFile(downloaded.path, destination);
    }
    return {
      text: `downloaded: ${destination}`,
      download: {
        sourcePath: downloaded.path,
        path: destination,
        size: downloaded.size,
        suggestedFilename: path.basename(downloaded.path),
      },
    };
  }

  async handleHandoff(args, flags = {}) {
    const pageId = args[0] !== undefined ? parsePageId(args[0]) : await this.resolvePageId(flags);
    await this.selectPage(pageId, true);
    const snapshot = await this.handleSnapshot([], { ...flags, page: String(pageId) });
    return {
      text: `Focused page ${pageId}\n\n${snapshot.text}`,
      structuredContent: snapshot.structuredContent,
    };
  }

  async handleResume(args, flags = {}) {
    const pageId = args[0] !== undefined ? parsePageId(args[0]) : await this.resolvePageId(flags);
    return await this.handleSnapshot([], { ...flags, page: String(pageId) });
  }

  async handleTrace(args, flags = {}) {
    const action = args[0];
    if (action === "start") {
      return await this.callTool("performance_start_trace", this.pageArgs(flags));
    }
    if (action === "stop") {
      return await this.callTool("performance_stop_trace", this.pageArgs(flags));
    }
    if (action === "analyze") {
      requireArgs("trace analyze", args, 3);
      return await this.callTool("performance_analyze_insight", {
        ...this.pageArgs(flags),
        insightSetId: args[1],
        insightName: args[2],
      });
    }
    throw new Error("trace expects start, stop, or analyze <insightName>");
  }
}

function clearPerformanceEntriesFunction() {
  return `() => {
    performance.clearResourceTimings?.();
    performance.clearMarks?.();
    performance.clearMeasures?.();
    return true;
  }`;
}

function networkPerformanceCaptureFunction() {
  return `() => {
    const number = (value) => Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
    const serialize = (entry) => ({
      name: entry.name || "",
      entryType: entry.entryType || "",
      initiatorType: entry.initiatorType || "",
      startTime: number(entry.startTime),
      duration: number(entry.duration),
      workerStart: number(entry.workerStart),
      redirectStart: number(entry.redirectStart),
      redirectEnd: number(entry.redirectEnd),
      fetchStart: number(entry.fetchStart),
      domainLookupStart: number(entry.domainLookupStart),
      domainLookupEnd: number(entry.domainLookupEnd),
      connectStart: number(entry.connectStart),
      secureConnectionStart: number(entry.secureConnectionStart),
      connectEnd: number(entry.connectEnd),
      requestStart: number(entry.requestStart),
      responseStart: number(entry.responseStart),
      responseEnd: number(entry.responseEnd),
      transferSize: Number.isFinite(entry.transferSize) ? entry.transferSize : 0,
      encodedBodySize: Number.isFinite(entry.encodedBodySize) ? entry.encodedBodySize : 0,
      decodedBodySize: Number.isFinite(entry.decodedBodySize) ? entry.decodedBodySize : 0,
      nextHopProtocol: entry.nextHopProtocol || "",
      renderBlockingStatus: entry.renderBlockingStatus || "",
      responseStatus: Number.isFinite(entry.responseStatus) ? entry.responseStatus : 0,
      domContentLoadedEventStart: number(entry.domContentLoadedEventStart),
      domContentLoadedEventEnd: number(entry.domContentLoadedEventEnd),
      loadEventStart: number(entry.loadEventStart),
      loadEventEnd: number(entry.loadEventEnd),
    });
    const navigation = performance.getEntriesByType("navigation").map(serialize)[0] || null;
    const resources = performance.getEntriesByType("resource").map(serialize);
    return JSON.stringify({
      capturedAt: new Date().toISOString(),
      timeOrigin: performance.timeOrigin,
      url: location.href,
      title: document.title,
      navigation,
      resources,
    });
  }`;
}

function parseEvaluateJsonResult(result, label) {
  const text = String(result?.text ?? "").trim();
  const candidates = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/u);
  if (fence?.[1]) {
    candidates.unshift(fence[1].trim());
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    candidates.push(text.slice(start, end + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        return JSON.parse(parsed);
      }
      return parsed;
    } catch {
      // Try the next representation.
    }
  }
  throw new Error(`${label} did not return JSON: ${truncateOneLine(text, 240)}`);
}

function summarizeNetworkCapture(capture, networkText = "", flags = {}) {
  const resources = Array.isArray(capture.resources) ? capture.resources : [];
  const navigation = capture.navigation ?? null;
  const totalTransfer = resources.reduce((sum, entry) => sum + positiveNumber(entry.transferSize), 0);
  const totalEncoded = resources.reduce((sum, entry) => sum + positiveNumber(entry.encodedBodySize), 0);
  const totalDecoded = resources.reduce((sum, entry) => sum + positiveNumber(entry.decodedBodySize), 0);
  const failedLines = networkText.split(/\r?\n/u).filter(isFailedNetworkLine).slice(-20);
  const slowRequests = [...resources]
    .filter((entry) => positiveNumber(entry.duration) >= 1000)
    .sort((a, b) => positiveNumber(b.duration) - positiveNumber(a.duration))
    .slice(0, 10)
    .map((entry) => summarizeNetworkEntry(entry, flags));
  const largeRequests = [...resources]
    .filter((entry) => Math.max(positiveNumber(entry.transferSize), positiveNumber(entry.decodedBodySize)) >= 512 * 1024)
    .sort((a, b) => Math.max(positiveNumber(b.transferSize), positiveNumber(b.decodedBodySize)) - Math.max(positiveNumber(a.transferSize), positiveNumber(a.decodedBodySize)))
    .slice(0, 10)
    .map((entry) => summarizeNetworkEntry(entry, flags));
  const renderBlocking = resources
    .filter((entry) => entry.renderBlockingStatus && entry.renderBlockingStatus !== "non-blocking")
    .slice(0, 10)
    .map((entry) => summarizeNetworkEntry(entry, flags));
  const byHost = topCounts(resources.map((entry) => hostFromUrl(entry.name)).filter(Boolean), 8);
  const byType = topCounts(resources.map((entry) => entry.initiatorType || "other"), 8);
  const navSummary = navigation ? {
    duration: positiveNumber(navigation.duration),
    ttfb: Math.max(0, positiveNumber(navigation.responseStart) - positiveNumber(navigation.requestStart)),
    domContentLoaded: positiveNumber(navigation.domContentLoadedEventEnd || navigation.domContentLoadedEventStart),
    load: positiveNumber(navigation.loadEventEnd || navigation.duration),
    transferSize: positiveNumber(navigation.transferSize),
    decodedBodySize: positiveNumber(navigation.decodedBodySize),
    protocol: navigation.nextHopProtocol || "",
    status: navigation.responseStatus || 0,
  } : null;
  return {
    url: capture.url,
    title: capture.title,
    capturedAt: capture.capturedAt,
    action: capture.action,
    durationMs: capture.durationMs,
    navigation: navSummary,
    resources: resources.length,
    totalTransfer,
    totalEncoded,
    totalDecoded,
    failedLines,
    slowRequests,
    largeRequests,
    renderBlocking,
    byHost,
    byType,
  };
}

function summarizeNetworkEntry(entry, flags = {}) {
  return {
    url: displayNetworkUrl(entry.name, flags),
    host: hostFromUrl(entry.name),
    type: entry.initiatorType || "other",
    duration: positiveNumber(entry.duration),
    transferSize: positiveNumber(entry.transferSize),
    decodedBodySize: positiveNumber(entry.decodedBodySize),
    status: entry.responseStatus || 0,
    protocol: entry.nextHopProtocol || "",
    renderBlockingStatus: entry.renderBlockingStatus || "",
  };
}

function formatNetworkCaptureText(summary, { harPath = null, networkText = "", flags = {} } = {}) {
  const lines = [
    `Network capture: ${summary.url}`,
    summary.title ? `Title: ${summary.title}` : "",
    `Resources: ${summary.resources} | transfer ${formatBytes(summary.totalTransfer)} | decoded ${formatBytes(summary.totalDecoded)}`,
  ].filter(Boolean);
  if (summary.navigation) {
    lines.push(
      `Navigation: ${formatMs(summary.navigation.duration)} total, ${formatMs(summary.navigation.ttfb)} TTFB, ${formatMs(summary.navigation.load)} load${summary.navigation.status ? `, status ${summary.navigation.status}` : ""}`,
    );
  }
  if (summary.failedLines.length > 0) {
    lines.push("");
    lines.push(`Failed/error requests (${summary.failedLines.length}):`);
    lines.push(...summary.failedLines.slice(0, 8));
  }
  if (summary.slowRequests.length > 0) {
    lines.push("");
    lines.push("Slow requests:");
    for (const entry of summary.slowRequests.slice(0, 8)) {
      lines.push(`- ${formatMs(entry.duration)} ${entry.type} ${entry.url}`);
    }
  }
  if (summary.largeRequests.length > 0) {
    lines.push("");
    lines.push("Large transfers:");
    for (const entry of summary.largeRequests.slice(0, 8)) {
      lines.push(`- ${formatBytes(Math.max(entry.transferSize, entry.decodedBodySize))} ${entry.type} ${entry.url}`);
    }
  }
  if (summary.renderBlocking.length > 0) {
    lines.push("");
    lines.push("Render-blocking resources:");
    for (const entry of summary.renderBlocking.slice(0, 8)) {
      lines.push(`- ${entry.renderBlockingStatus} ${entry.type} ${entry.url}`);
    }
  }
  if (summary.byHost.length > 0) {
    lines.push("");
    lines.push(`Top hosts: ${summary.byHost.map((entry) => `${entry.key} (${entry.count})`).join(", ")}`);
  }
  if (summary.byType.length > 0) {
    lines.push(`Types: ${summary.byType.map((entry) => `${entry.key} ${entry.count}`).join(", ")}`);
  }
  if (harPath) {
    lines.push(`HAR: ${harPath}`);
  }
  if (flags.raw && networkText) {
    lines.push("");
    lines.push("Raw DevTools network list:");
    lines.push(networkText);
  }
  return lines.join("\n");
}

function consolePageInfoFunction() {
  return `() => JSON.stringify({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    userAgent: navigator.userAgent,
  })`;
}

function normalizeConsoleMessages(result) {
  const structured = result?.structuredContent ?? {};
  const entries = Array.isArray(structured.consoleMessages)
    ? structured.consoleMessages
    : Array.isArray(structured.messages)
      ? structured.messages
      : [];
  if (entries.length > 0) {
    return entries.map((entry, index) => normalizeConsoleMessage(entry, index)).filter(Boolean);
  }
  return String(result?.text ?? "")
    .split(/\r?\n/u)
    .map((line, index) => normalizeConsoleLine(line, index))
    .filter(Boolean);
}

function normalizeConsoleLine(line, index) {
  const text = String(line ?? "").trim();
  if (!text) {
    return null;
  }
  if (/^#+\s*Console messages\b/iu.test(text) || /^<no console messages found>$/iu.test(text) || /^<no console errors>$/iu.test(text)) {
    return null;
  }
  const match = text.match(/^\s*(?:(\d+)[\s:.-]+)?(?:\[(log|info|warn|warning|error|debug|issue)\]|(log|info|warn|warning|error|debug|issue))?[\s:.-]*(.*)$/iu);
  const id = match?.[1] ? Number.parseInt(match[1], 10) : null;
  const type = (match?.[2] ?? match?.[3] ?? "").toLowerCase();
  const messageText = (match?.[4] ?? text).trim() || text;
  return {
    id: Number.isFinite(id) ? id : null,
    type: normalizeConsoleType(type),
    text: messageText,
    argsCount: undefined,
    order: index,
  };
}

function normalizeConsoleMessage(entry, index) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const id = parseOptionalNumber(entry.id ?? entry.msgid ?? entry.messageId ?? entry.messageID);
  const text = String(
    entry.text ??
      entry.message ??
      entry.description ??
      entry.value ??
      entry.preview ??
      "",
  );
  return {
    id,
    type: normalizeConsoleType(entry.type ?? entry.level ?? entry.source ?? ""),
    text,
    argsCount: parseOptionalNumber(entry.argsCount ?? entry.argumentCount) ?? (Array.isArray(entry.args) ? entry.args.length : undefined),
    source: normalizeConsoleSource(entry),
    timestamp: entry.timestamp ?? undefined,
    order: index,
  };
}

function mergeConsoleMessageDetail(message, detailResult) {
  const structured = detailResult?.structuredContent ?? extractJsonFromToolText(detailResult?.text ?? "") ?? {};
  const detail = structured.consoleMessage ?? structured.message ?? structured;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return {
      ...message,
      detailText: truncateOneLine(detailResult?.text ?? "", 2000),
    };
  }
  const args = normalizeConsoleArgs(detail.args ?? detail.arguments ?? detail.parameters ?? structured.args);
  const stackTrace = normalizeConsoleStackTrace(detail.stackTrace ?? detail.stack ?? structured.stackTrace ?? structured.stack);
  const detailArgsCount = parseOptionalNumber(detail.argsCount ?? detail.argumentCount);
  return {
    ...message,
    type: normalizeConsoleType(detail.type ?? detail.level ?? message.type),
    text: String(detail.text ?? detail.message ?? detail.description ?? message.text ?? ""),
    argsCount: detailArgsCount ?? (args.length > 0 ? args.length : message.argsCount),
    args,
    stackTrace,
    source: normalizeConsoleSource(detail, message.source),
    detailText: structured === detail && Object.keys(structured).length === 0
      ? truncateOneLine(detailResult?.text ?? "", 2000)
      : undefined,
  };
}

function normalizeConsoleArgs(args) {
  if (!Array.isArray(args)) {
    return [];
  }
  return args.slice(0, 50).map((arg) => normalizeConsoleArg(arg));
}

function normalizeConsoleArg(arg) {
  if (!arg || typeof arg !== "object") {
    return { value: arg };
  }
  const normalized = {};
  for (const key of ["type", "subtype", "className", "description", "unserializableValue", "objectId"]) {
    if (arg[key] !== undefined) {
      normalized[key] = arg[key];
    }
  }
  if (arg.value !== undefined) {
    normalized.value = arg.value;
  }
  if (arg.preview !== undefined) {
    normalized.preview = arg.preview;
  }
  return normalized;
}

function normalizeConsoleStackTrace(stackTrace) {
  if (!stackTrace) {
    return [];
  }
  if (typeof stackTrace === "string") {
    return stackTrace.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).slice(0, 30);
  }
  const frames = [];
  const visit = (trace) => {
    if (!trace) {
      return;
    }
    if (Array.isArray(trace)) {
      for (const frame of trace) {
        pushConsoleFrame(frames, frame);
      }
      return;
    }
    if (Array.isArray(trace.callFrames)) {
      for (const frame of trace.callFrames) {
        pushConsoleFrame(frames, frame);
      }
    }
    if (trace.parent) {
      visit(trace.parent);
    }
  };
  visit(stackTrace);
  return frames.slice(0, 30);
}

function pushConsoleFrame(frames, frame) {
  if (!frame || typeof frame !== "object") {
    return;
  }
  frames.push({
    functionName: frame.functionName || frame.name || "",
    url: frame.url || frame.scriptId || "",
    lineNumber: parseOptionalNumber(frame.lineNumber) !== null ? parseOptionalNumber(frame.lineNumber) + 1 : undefined,
    columnNumber: parseOptionalNumber(frame.columnNumber) !== null ? parseOptionalNumber(frame.columnNumber) + 1 : undefined,
  });
}

function normalizeConsoleSource(entry, fallback = undefined) {
  const url = entry.url ?? entry.sourceURL ?? entry.location?.url ?? fallback?.url;
  const lineNumber = parseOptionalNumber(entry.lineNumber ?? entry.location?.lineNumber ?? fallback?.lineNumber);
  const columnNumber = parseOptionalNumber(entry.columnNumber ?? entry.location?.columnNumber ?? fallback?.columnNumber);
  if (!url && lineNumber === null && columnNumber === null) {
    return fallback;
  }
  return {
    url: url ? String(url) : undefined,
    lineNumber: lineNumber !== null ? lineNumber + 1 : undefined,
    columnNumber: columnNumber !== null ? columnNumber + 1 : undefined,
  };
}

function normalizeConsoleType(value) {
  const type = String(value ?? "").trim().toLowerCase();
  if (type === "warning") {
    return "warn";
  }
  return type || "log";
}

function consoleMessageSearchText(message) {
  return [
    message.type,
    message.text,
    message.source?.url,
    ...(message.args ?? []).map((arg) => formatConsoleArgPreview(arg)),
  ].filter(Boolean).join(" ");
}

function countConsoleTypes(messages) {
  const counts = { total: messages.length, error: 0, warn: 0, log: 0, info: 0, debug: 0, issue: 0, other: 0 };
  for (const message of messages) {
    if (Object.hasOwn(counts, message.type)) {
      counts[message.type] += 1;
    } else {
      counts.other += 1;
    }
  }
  return counts;
}

function isProblemConsoleMessage(message) {
  return message.type === "error" || message.type === "warn" || message.type === "issue";
}

function formatConsoleCaptureText(capture, { outPath = null, flags = {} } = {}) {
  const counts = capture.counts ?? countConsoleTypes(capture.messages ?? []);
  const lines = [
    `Console capture: ${capture.url || "(unknown page)"}`,
    capture.title ? `Title: ${capture.title}` : "",
    `Messages: ${counts.total} shown${capture.truncated ? ` of ${capture.totalAfterFilter}` : ""} | errors ${counts.error} | warnings ${counts.warn} | logs ${counts.log}`,
  ].filter(Boolean);
  if (capture.readyState) {
    lines.push(`Ready state: ${capture.readyState}`);
  }
  if (capture.networkFailures?.length > 0) {
    lines.push("");
    lines.push(`Network failures shown in DevTools Console (${capture.networkFailures.length}):`);
    lines.push(...capture.networkFailures.slice(-8));
  }
  const problems = (capture.messages ?? []).filter(isProblemConsoleMessage);
  if (problems.length > 0) {
    lines.push("");
    lines.push("Errors/warnings:");
    for (const message of problems.slice(-20)) {
      lines.push(formatConsoleMessageLine(message));
      for (const frame of formatConsoleStackLines(message).slice(0, 3)) {
        lines.push(`  ${frame}`);
      }
    }
  }
  const logs = flags.errors ? [] : (capture.messages ?? []).filter((message) => !isProblemConsoleMessage(message));
  if (logs.length > 0) {
    lines.push("");
    lines.push("Recent logs:");
    for (const message of logs.slice(-20)) {
      lines.push(formatConsoleMessageLine(message));
    }
  }
  if (capture.truncated) {
    lines.push(`[...${capture.totalAfterFilter - capture.messages.length} earlier messages hidden - use --limit or --out]`);
  }
  if (outPath) {
    lines.push(`JSON: ${outPath}`);
  }
  if (flags.raw && capture.rawListText) {
    lines.push("");
    lines.push("Raw DevTools console list:");
    lines.push(capture.rawListText);
  }
  return lines.join("\n");
}

function formatConsoleMessageLine(message) {
  const id = message.id !== null && message.id !== undefined ? `msgid=${message.id}` : `msg=${message.order ?? "?"}`;
  const argsPreview = message.args?.length ? `args=${message.args.slice(0, 3).map(formatConsoleArgPreview).join(", ")}` : "";
  return `- ${id} [${message.type || "console"}] ${truncateOneLine(message.text || argsPreview || "(no message text)", 400)}${argsPreview && message.text ? ` | ${argsPreview}` : ""}`;
}

function formatConsoleArgPreview(arg) {
  if (!arg || typeof arg !== "object") {
    return truncateOneLine(String(arg), 160);
  }
  if (arg.value !== undefined) {
    return truncateOneLine(formatValue(arg.value), 160);
  }
  if (arg.unserializableValue !== undefined) {
    return truncateOneLine(String(arg.unserializableValue), 160);
  }
  if (arg.description !== undefined) {
    return truncateOneLine(String(arg.description), 160);
  }
  if (arg.preview !== undefined) {
    return truncateOneLine(formatValue(arg.preview), 160);
  }
  return arg.type ? String(arg.type) : truncateOneLine(formatValue(arg), 160);
}

function formatConsoleStackLines(message) {
  const stackTrace = message.stackTrace;
  if (!Array.isArray(stackTrace)) {
    return [];
  }
  return stackTrace.map((frame) => {
    if (typeof frame === "string") {
      return frame;
    }
    const location = [frame.url, frame.lineNumber, frame.columnNumber].filter((value) => value !== undefined && value !== "").join(":");
    return `at ${frame.functionName || "(anonymous)"}${location ? ` (${location})` : ""}`;
  });
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildHarFromNetworkCapture(capture) {
  const entries = [];
  const timeOrigin = Number.isFinite(capture.timeOrigin) ? capture.timeOrigin : Date.now();
  for (const entry of [capture.navigation, ...(capture.resources ?? [])].filter(Boolean)) {
    const url = entry.name || capture.url;
    if (!url) continue;
    entries.push({
      startedDateTime: new Date(timeOrigin + positiveNumber(entry.startTime)).toISOString(),
      time: positiveNumber(entry.duration),
      request: {
        method: "GET",
        url,
        httpVersion: "HTTP/2",
        headers: [],
        queryString: queryStringForHar(url),
        cookies: [],
        headersSize: -1,
        bodySize: 0,
      },
      response: {
        status: entry.responseStatus || 0,
        statusText: "",
        httpVersion: entry.nextHopProtocol || "",
        headers: [],
        cookies: [],
        content: {
          size: positiveNumber(entry.decodedBodySize),
          mimeType: "",
        },
        redirectURL: "",
        headersSize: -1,
        bodySize: positiveNumber(entry.encodedBodySize),
      },
      cache: {},
      timings: {
        blocked: Math.max(0, positiveNumber(entry.fetchStart) - positiveNumber(entry.startTime)),
        dns: timingDelta(entry.domainLookupStart, entry.domainLookupEnd),
        connect: timingDelta(entry.connectStart, entry.connectEnd),
        send: Math.max(0, positiveNumber(entry.responseStart) - positiveNumber(entry.requestStart)),
        wait: Math.max(0, positiveNumber(entry.responseStart) - positiveNumber(entry.requestStart)),
        receive: Math.max(0, positiveNumber(entry.responseEnd) - positiveNumber(entry.responseStart)),
        ssl: entry.secureConnectionStart ? timingDelta(entry.secureConnectionStart, entry.connectEnd) : -1,
      },
    });
  }
  return {
    log: {
      version: "1.2",
      creator: { name: "realbrowser", version: CLI_VERSION },
      pages: [{
        startedDateTime: new Date(timeOrigin).toISOString(),
        id: "page_1",
        title: capture.title ?? "",
        pageTimings: {},
      }],
      entries,
    },
  };
}

function queryStringForHar(url) {
  try {
    return [...new URL(url).searchParams.entries()].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function timingDelta(start, end) {
  const delta = positiveNumber(end) - positiveNumber(start);
  return delta >= 0 ? delta : -1;
}

function topCounts(values, limit) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function hostFromUrl(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function displayNetworkUrl(value, flags = {}) {
  if (flags.values || flags.raw) {
    return String(value ?? "");
  }
  try {
    const parsed = new URL(value);
    parsed.search = parsed.search ? "?..." : "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(value ?? "");
  }
}

function positiveNumber(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatMs(value) {
  return `${Math.round(positiveNumber(value))}ms`;
}

function chainStepTiming(entry) {
  return {
    index: entry.index,
    command: entry.command,
    ok: entry.ok,
    durationMs: entry.durationMs,
  };
}

function normalizeReturnMode(value) {
  if (value === "final" || value === "all" || value === "summary") {
    return value;
  }
  return "summary";
}

function resultText(result, maxChars = DEFAULT_READ_MAX_CHARS) {
  const text =
    typeof result === "string"
      ? result
      : result?.text
        ? result.text
        : JSON.stringify(result);
  return truncateText(String(text), maxChars).text;
}

function summarizeResult(command, result, maxChars) {
  const text = resultText(result, maxChars).replace(/\s+/g, " ").trim();
  const stats = result?.structuredContent?.stats ?? result?.stats;
  const suffix = stats
    ? ` (${Object.entries(stats)
        .filter(([, value]) => typeof value === "number" || typeof value === "boolean")
        .map(([key, value]) => `${key}=${value}`)
        .join(" ")})`
    : "";
  if (!text) {
    return `ok${suffix}`;
  }
  return `${truncateText(text, Math.min(maxChars, 500)).text}${suffix}`;
}

function normalizeRole(node = {}) {
  return String(node.role || "generic").trim().toLowerCase() || "generic";
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  return text || undefined;
}

function escapeQuoted(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function shouldIncludeSnapshotNode({ role, name, value, description, flags }) {
  if (flags.interactive && !INTERACTIVE_ROLES.has(role)) {
    return false;
  }
  if (flags.compact && STRUCTURAL_ROLES.has(role) && !name && !value && !description) {
    return false;
  }
  return true;
}

function shouldCountSnapshotRef(role, name) {
  return INTERACTIVE_ROLES.has(role) || (CONTENT_ROLES.has(role) && Boolean(name));
}

function buildCompactSnapshot(root, fallbackText, flags = {}) {
  const efficient = flags.efficient || flags.mode === "efficient";
  const snapshotFlags = {
    ...flags,
    interactive: flags.interactive || efficient,
    compact: flags.compact || efficient,
  };
  const maxDepth =
    flags.depth !== undefined
      ? parsePositiveInteger(flags.depth, "depth")
      : efficient
        ? 6
        : undefined;
  const maxNodes = parsePositiveInteger(flags.maxNodes ?? flags.limit ?? "500", "max-nodes");
  const maxChars = stdoutMaxCharsFromFlags(
    flags,
    flags.verbose ? String(READ_STDOUT_HARD_MAX_CHARS) : String(DEFAULT_SNAPSHOT_MAX_CHARS),
  );
  if (!root || typeof root !== "object") {
    const truncated = truncateText(String(fallbackText ?? ""), maxChars.value);
    const stdoutHardCapped = maxChars.capped && truncated.truncated;
    const text = stdoutHardCapped && !truncated.text.includes("STDOUT CAPPED")
      ? `${truncated.text}\n\n[...STDOUT CAPPED at ${maxChars.value} chars - use --out for full output]`
      : truncated.text;
    return {
      text: text || "(no snapshot)",
      truncated: truncated.truncated,
      refs: {},
      stats: {
        lines: text ? text.split("\n").length : 0,
        chars: text.length,
        refs: 0,
        interactive: 0,
        stdoutCapped: stdoutHardCapped,
        requestedMaxChars: maxChars.requested,
        stdoutMaxChars: maxChars.value,
      },
    };
  }

  const lines = [];
  const refs = {};
  let totalRefs = 0;
  let interactiveRefs = 0;
  let visited = 0;
  let stoppedByNodes = false;

  const visit = (node, depth) => {
    if (stoppedByNodes) {
      return;
    }
    if (maxDepth !== undefined && depth > maxDepth) {
      return;
    }
    const role = normalizeRole(node);
    const name = normalizeOptionalString(node.name);
    const value = normalizeOptionalString(node.value);
    const description = normalizeOptionalString(node.description);
    const uid = normalizeOptionalString(node.id);
    const includeNode = shouldIncludeSnapshotNode({
      role,
      name,
      value,
      description,
      flags: snapshotFlags,
    });
    if (includeNode) {
      if (visited >= maxNodes) {
        stoppedByNodes = true;
        return;
      }
      visited += 1;
      let line = `${"  ".repeat(Math.min(depth, 20))}- ${role}`;
      if (name) line += ` "${escapeQuoted(name)}"`;
      if (uid && shouldCountSnapshotRef(role, name)) {
        refs[uid] = { role, name: name ?? "" };
        totalRefs += 1;
        if (INTERACTIVE_ROLES.has(role)) {
          interactiveRefs += 1;
        }
        line += ` [uid=${uid}]`;
      }
      if (value) line += ` value="${escapeQuoted(value)}"`;
      if (description) line += ` description="${escapeQuoted(description)}"`;
      lines.push(line);
    }
    for (const child of node.children ?? []) {
      visit(child, depth + 1);
      if (stoppedByNodes) {
        return;
      }
    }
  };

  visit(root, 0);
  let text = lines.join("\n") || "(no matching snapshot nodes)";
  const truncated = truncateText(text, maxChars.value);
  text = truncated.text;
  const isTruncated = truncated.truncated || stoppedByNodes;
  if (stoppedByNodes && !text.includes("[...TRUNCATED")) {
    text = `${text}\n\n[...TRUNCATED - max nodes reached]`;
  }
  const stdoutHardCapped = maxChars.capped && truncated.truncated;
  if (stdoutHardCapped && !text.includes("STDOUT CAPPED")) {
    text = `${text}\n\n[...STDOUT CAPPED at ${maxChars.value} chars - use --out for full output]`;
  }
  return {
    text,
    truncated: isTruncated || (maxChars.capped && truncated.truncated),
    refs,
    stats: {
      lines: text ? text.split("\n").length : 0,
      chars: text.length,
      refs: totalRefs,
      interactive: interactiveRefs,
      stdoutCapped: stdoutHardCapped,
      requestedMaxChars: maxChars.requested,
      stdoutMaxChars: maxChars.value,
    },
  };
}

function compactSnapshotStructuredContent(structuredContent) {
  if (!structuredContent || typeof structuredContent !== "object") {
    return {};
  }
  const compact = { ...structuredContent };
  delete compact.snapshot;
  return compact;
}

async function formatReadResult(command, result, flags = {}) {
  const value = extractJsonFromToolText(result.text);
  const rawValue = value ?? result.text ?? "";
  const limit = parsePositiveInteger(flags.limit ?? defaultLimitForReadCommand(command), "limit");
  const maxChars = stdoutMaxCharsFromFlags(flags, defaultMaxCharsForReadCommand(command, flags));
  const rawText = Array.isArray(rawValue) || (rawValue && typeof rawValue === "object") ? formatValue(rawValue) : String(rawValue);
  let fullText;
  let displayedValue = rawValue;
  if (Array.isArray(rawValue)) {
    displayedValue = rawValue.slice(0, limit);
    fullText = formatValue(displayedValue);
  } else if (rawValue && typeof rawValue === "object") {
    fullText = formatValue(rawValue);
  } else {
    fullText = String(rawValue ?? "");
  }
  const outPath = flags.out ?? flags.output;
  if (outPath) {
    await writeTextFile(outPath, `${rawText}\n`);
    const count = Array.isArray(rawValue) ? rawValue.length : undefined;
    const shown = Array.isArray(displayedValue) ? displayedValue.length : undefined;
    const stdoutHardCapped = maxChars.capped && rawText.length > maxChars.value;
    return {
      text: readOutputSummary({
        command,
        outPath,
        chars: rawText.length,
        count,
        shown,
        truncated: rawText.length > maxChars.value,
        maxCharsInfo: maxChars,
      }),
      structuredContent: {
        command,
        count,
        shown,
        truncated: rawText.length > maxChars.value,
        stdoutCapped: stdoutHardCapped,
        out: outPath,
        chars: rawText.length,
        requestedMaxChars: maxChars.requested,
        stdoutMaxChars: maxChars.value,
      },
    };
  }
  const truncated = truncateText(fullText, maxChars.value);
  const stdoutHardCapped = maxChars.capped && fullText.length > maxChars.value;
  const autoOutPath = truncated.truncated
    ? await writeOverflowArtifact(rawText, {
      command,
      flags,
      extension: extensionForReadOutput(command, rawValue),
    })
    : null;
  const suffix = [];
  if (Array.isArray(rawValue) && rawValue.length > limit) {
    suffix.push(`[...${rawValue.length - limit} more items - use --limit or --out]`);
  }
  if (truncated.truncated && !stdoutHardCapped) {
    suffix.push(`[...TRUNCATED - use --max-chars or --out]`);
  }
  if (stdoutHardCapped) {
    suffix.push(`[...STDOUT CAPPED at ${maxChars.value} chars - use --out for full output]`);
  }
  if (autoOutPath) {
    suffix.push(`[full output written to ${autoOutPath}]`);
  }
  return {
    text: [truncated.text, ...suffix].filter(Boolean).join("\n"),
    structuredContent: {
      command,
      count: Array.isArray(rawValue) ? rawValue.length : undefined,
      shown: Array.isArray(displayedValue) ? displayedValue.length : undefined,
      truncated: truncated.truncated || (Array.isArray(rawValue) && rawValue.length > limit),
      stdoutCapped: stdoutHardCapped,
      ...(autoOutPath ? { autoOut: autoOutPath } : {}),
      requestedMaxChars: maxChars.requested,
      stdoutMaxChars: maxChars.value,
    },
  };
}

async function formatRawResult(command, result, flags = {}) {
  const rawText = String(result?.text ?? formatValue(result ?? ""));
  const outPath = flags.out ?? flags.output;
  if (outPath) {
    await writeTextFile(outPath, `${rawText}\n`);
    const maxChars = stdoutMaxCharsFromFlags(flags, defaultMaxCharsForReadCommand(command, flags));
    const stdoutHardCapped = maxChars.capped && rawText.length > maxChars.value;
    return {
      text: readOutputSummary({
        command,
        outPath,
        chars: rawText.length,
        truncated: rawText.length > maxChars.value,
        raw: true,
        maxCharsInfo: maxChars,
      }),
      structuredContent: {
        command,
        raw: true,
        chars: rawText.length,
        truncated: rawText.length > maxChars.value,
        stdoutCapped: stdoutHardCapped,
        out: outPath,
        requestedMaxChars: maxChars.requested,
        stdoutMaxChars: maxChars.value,
      },
    };
  }
  const maxChars = stdoutMaxCharsFromFlags(flags, defaultMaxCharsForReadCommand(command, flags));
  const truncated = truncateText(rawText, maxChars.value);
  const stdoutHardCapped = maxChars.capped && rawText.length > maxChars.value;
  const autoOutPath = truncated.truncated
    ? await writeOverflowArtifact(rawText, {
      command: `${command}-raw`,
      flags,
      extension: extensionForReadOutput(command, rawText, true),
    })
    : null;
  const suffix = [];
  if (truncated.truncated && !stdoutHardCapped) {
    suffix.push(`[...TRUNCATED raw output - use --max-chars or --out]`);
  }
  if (stdoutHardCapped) {
    suffix.push(`[...STDOUT CAPPED at ${maxChars.value} chars - use --out for full output]`);
  }
  if (autoOutPath) {
    suffix.push(`[full raw output written to ${autoOutPath}]`);
  }
  return {
    text: [truncated.text, ...suffix].filter(Boolean).join("\n"),
    structuredContent: {
      command,
      raw: true,
      chars: rawText.length,
      truncated: truncated.truncated,
      stdoutCapped: stdoutHardCapped,
      ...(autoOutPath ? { autoOut: autoOutPath } : {}),
      requestedMaxChars: maxChars.requested,
      stdoutMaxChars: maxChars.value,
    },
  };
}

function defaultLimitForReadCommand(command) {
  switch (command) {
    case "links":
      return "100";
    case "forms":
      return "20";
    default:
      return String(DEFAULT_LINE_LIMIT);
  }
}

function defaultMaxCharsForReadCommand(command, flags = {}) {
  if (flags.verbose) {
    return "40000";
  }
  return command === "html" ? String(DEFAULT_HTML_MAX_CHARS) : String(DEFAULT_READ_MAX_CHARS);
}

function stdoutMaxCharsFromFlags(flags = {}, fallback = String(DEFAULT_READ_MAX_CHARS)) {
  const requested = parsePositiveInteger(flags.maxChars ?? fallback, "max-chars");
  if (allowsFullStdout(flags)) {
    return {
      requested,
      value: requested,
      capped: false,
      fullStdout: true,
    };
  }
  return {
    requested,
    value: Math.min(requested, READ_STDOUT_HARD_MAX_CHARS),
    capped: requested > READ_STDOUT_HARD_MAX_CHARS,
    fullStdout: false,
  };
}

function extensionForReadOutput(command, value, raw = false) {
  if (command === "html" && typeof value === "string" && !raw) {
    return "html";
  }
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return "json";
  }
  return raw ? "txt" : "txt";
}

function outputArtifactDir(flags = {}) {
  return path.resolve(flags.outputDir || process.env.REALBROWSER_OUTPUT_DIR || DEFAULT_OUTPUT_DIR);
}

function overflowArtifactPath({ command = "stdout", extension = "txt", flags = {} } = {}) {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const safeCommand = sanitizeFileName(String(command || "stdout")).replaceAll(/\s+/g, "-");
  const safeExtension = sanitizeFileName(String(extension || "txt")).replaceAll(/^\.+/g, "") || "txt";
  const nonce = crypto.randomBytes(3).toString("hex");
  return path.join(outputArtifactDir(flags), `${timestamp}-${process.pid}-${nonce}-${safeCommand}.${safeExtension}`);
}

async function writeOverflowArtifact(text, options = {}) {
  const flags = options.flags ?? {};
  if (!autoOutEnabled(flags)) {
    return null;
  }
  const value = String(text ?? "");
  const filePath = overflowArtifactPath(options);
  await writeTextFile(filePath, value.endsWith("\n") ? value : `${value}\n`);
  return filePath;
}

function writeOverflowArtifactSync(text, options = {}) {
  const flags = options.flags ?? {};
  if (!autoOutEnabled(flags)) {
    return null;
  }
  const value = String(text ?? "");
  const filePath = overflowArtifactPath(options);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`, "utf8");
  return filePath;
}

function readOutputSummary({ command, outPath, chars, count, shown, truncated, raw = false, maxCharsInfo = null }) {
  const label = raw ? "raw output" : command;
  return [
    `${label} written to ${outPath}`,
    `chars: ${chars}`,
    Number.isFinite(count) ? `items: ${count}` : "",
    Number.isFinite(shown) ? `shown-if-printed: ${shown}` : "",
    "stdout-preview: skipped because --out was used",
    truncated ? "full output may exceed the stdout preview budget" : "",
    maxCharsInfo?.capped ? `stdout cap: ${maxCharsInfo.value} chars (requested ${maxCharsInfo.requested}; use --out for full output)` : "",
  ].filter(Boolean).join("\n");
}

function snapshotRawOutResult({ outPath, rawText, flags = {}, structuredContent = {} }) {
  return {
    text: readOutputSummary({
      command: "snapshot",
      outPath,
      chars: rawText.length,
      truncated: rawText.length > READ_STDOUT_HARD_MAX_CHARS,
      raw: true,
      maxCharsInfo: stdoutMaxCharsFromFlags(flags, String(READ_STDOUT_HARD_MAX_CHARS)),
    }),
    structuredContent: {
      command: "snapshot",
      raw: true,
      chars: rawText.length,
      out: outPath,
      ...structuredContent,
    },
  };
}

function compactTextResult(result, flags = {}, defaultMaxChars = DEFAULT_READ_MAX_CHARS) {
  const maxChars = stdoutMaxCharsFromFlags(flags, String(defaultMaxChars));
  const rawText = String(result.text ?? "");
  const truncated = truncateText(rawText, maxChars.value);
  const stdoutHardCapped = maxChars.capped && rawText.length > maxChars.value;
  const autoOutPath = truncated.truncated
    ? writeOverflowArtifactSync(rawText, {
      command: "text-result",
      flags,
      extension: "txt",
    })
    : null;
  const suffix = [];
  if (stdoutHardCapped) {
    suffix.push(`[...STDOUT CAPPED at ${maxChars.value} chars - use --out for full output]`);
  }
  if (autoOutPath) {
    suffix.push(`[full output written to ${autoOutPath}]`);
  }
  return {
    text: [truncated.text, ...suffix].filter(Boolean).join("\n"),
    structuredContent: {
      truncated: truncated.truncated,
      chars: truncated.text.length,
      stdoutCapped: stdoutHardCapped,
      ...(autoOutPath ? { autoOut: autoOutPath } : {}),
      requestedMaxChars: maxChars.requested,
      stdoutMaxChars: maxChars.value,
    },
  };
}

function compactLineResult(result, options) {
  if (options.flags.raw) {
    return result;
  }
  const limit = parsePositiveInteger(options.flags.limit ?? String(options.lineLimit), "limit");
  const filter = normalizeOptionalString(options.flags.filter)?.toLowerCase();
  const rawLines = String(result.text ?? "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  let lines = rawLines.filter((line) => !options.hiddenSet?.has(line));
  if (filter) {
    lines = lines.filter((line) => line.toLowerCase().includes(filter));
  }
  if (options.linePredicate) {
    lines = lines.filter(options.linePredicate);
  }
  const total = lines.length;
  const shown = lines.slice(Math.max(0, total - limit));
  if (options.flags.clear && options.hiddenSet) {
    for (const line of rawLines) {
      options.hiddenSet.add(line);
    }
  }
  const text =
    shown.length > 0
      ? shown.join("\n")
      : options.emptyText;
  const suffix = [];
  if (total > shown.length) {
    suffix.push(`[...${total - shown.length} earlier lines hidden - use --limit]`);
  }
  if (options.flags.clear) {
    suffix.push(`[cleared ${rawLines.length} buffered lines for this daemon]`);
  }
  return {
    text: [text, ...suffix].filter(Boolean).join("\n"),
    structuredContent: {
      total,
      shown: shown.length,
      hidden: Math.max(0, total - shown.length),
      cleared: Boolean(options.flags.clear),
    },
  };
}

function isFailedNetworkLine(line) {
  if (/\bfail(?:ed|ure)?\b/i.test(line)) {
    return true;
  }
  const status = line.match(/\b([45]\d\d)\b/);
  return Boolean(status);
}

function formatValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function truncateText(text, maxChars) {
  const value = String(text ?? "");
  if (!maxChars || value.length <= maxChars) {
    return { text: value, truncated: false };
  }
  return {
    text: `${value.slice(0, maxChars)}\n\n[...TRUNCATED ${value.length - maxChars} chars]`,
    truncated: true,
  };
}

async function writeTextFile(filePath, text) {
  const resolved = path.resolve(filePath);
  await fsp.mkdir(path.dirname(resolved), { recursive: true });
  await fsp.writeFile(resolved, text, "utf8");
}

function formatObservedElement(element) {
  const parts = [];
  if (element.role) parts.push(`[${element.role}]`);
  if (element.tag) parts.push(element.tag);
  if (element.text) parts.push(`"${element.text}"`);
  if (element.name) parts.push(`name=${element.name}`);
  if (element.id) parts.push(`#${element.id}`);
  if (element.href) parts.push(`-> ${element.href}`);
  return `- ${parts.join(" ") || "(element)"}`;
}

function observePageFunction({ limit, maxChars, selector }) {
  return `() => {
    const root = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : "document.body || document.documentElement"};
    if (!root) throw new Error(${JSON.stringify(`Element not found: ${selector}`)});
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const cleanText = (value, max = 120) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, max);
    const describe = (el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || (
        el.matches("a[href]") ? "link" :
        el.matches("button,[type=button],[type=submit],[type=reset]") ? "button" :
        el.matches("input,textarea") ? "textbox" :
        el.matches("select") ? "combobox" : undefined
      ),
      text: cleanText(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title")),
      name: el.getAttribute("name") || undefined,
      id: el.id || undefined,
      href: el.href || undefined,
      type: el.getAttribute("type") || undefined,
      placeholder: el.getAttribute("placeholder") || undefined,
      required: el.hasAttribute("required") || undefined,
    });
    const interactiveSelector = [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "[role=button]",
      "[role=link]",
      "[role=menuitem]",
      "[role=tab]",
      "[role=checkbox]",
      "[role=radio]",
      "[onclick]",
      "[tabindex]"
    ].join(",");
    const fields = [...root.querySelectorAll("input, select, textarea")]
      .filter(visible)
      .slice(0, ${limit})
      .map(describe);
    const interactive = [...root.querySelectorAll(interactiveSelector)]
      .filter(visible)
      .slice(0, ${limit})
      .map(describe);
    const headings = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter(visible)
      .slice(0, 12)
      .map((el) => ({ level: Number(el.tagName.slice(1)), text: cleanText(el.innerText || el.textContent, 180) }));
    const clone = root.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,svg").forEach((el) => el.remove());
    const textSample = cleanText(clone.innerText || clone.textContent, ${maxChars});
    return {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY },
      headings,
      interactive,
      fields,
      textSample,
    };
  }`;
}

function linkReadOptionsFromFlags(flags = {}) {
  return {
    filter: normalizeOptionalString(flags.filter),
    textFilter: normalizeOptionalString(flags.textFilter),
    hrefFilter: normalizeOptionalString(flags.hrefFilter),
    visible: Boolean(flags.visible),
    limit: Math.min(parsePositiveInteger(flags.limit ?? defaultLimitForReadCommand("links"), "limit"), 2000),
  };
}

function linkCollectorScript(rootExpression, flags = {}) {
  const options = linkReadOptionsFromFlags(flags);
  return `{
    const root = ${rootExpression};
    if (!root) throw new Error("Link root not found");
    const options = ${JSON.stringify(options)};
    const lower = (value) => String(value || "").toLowerCase();
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > innerHeight * 2) return false;
      const style = getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
    };
    const cleanText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const anchors = [...root.querySelectorAll("a[href]")];
    const out = [];
    const seen = new Set();
    const generalFilter = lower(options.filter);
    const textFilter = lower(options.textFilter);
    const hrefFilter = lower(options.hrefFilter);
    for (const anchor of anchors) {
      if (options.visible && !visible(anchor)) continue;
      const text = cleanText(anchor.innerText || anchor.textContent || anchor.getAttribute("aria-label") || anchor.getAttribute("title"));
      const href = anchor.href || anchor.getAttribute("href") || "";
      const combined = lower(text + " " + href);
      if (generalFilter && !combined.includes(generalFilter)) continue;
      if (textFilter && !lower(text).includes(textFilter)) continue;
      if (hrefFilter && !lower(href).includes(hrefFilter)) continue;
      const key = lower(text + "\\n" + href);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text, href });
      if (options.limit > 0 && out.length >= options.limit) break;
    }
    return out;
  }`;
}

function linksReadFunction(flags = {}) {
  return `() => ${linkCollectorScript("document", flags)}`;
}

function linkReadBodyFunction(flags = {}) {
  return `(el) => ${linkCollectorScript("el", flags)}`;
}

function parseJsonArg(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} expects valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseOptionalIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  return parsePositiveInteger(raw, name);
}

function parseOptionalBytesEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  return parseByteSize(raw, name);
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

function parseByteSize(value, label) {
  const raw = String(value ?? "").trim().toLowerCase();
  const match = raw.match(/^(\d+)(?:\s*(b|kb|kib|k|mb|mib|m))?$/);
  if (!match) {
    throw new Error(`${label} must be a byte size such as 5242880 or 5mb`);
  }
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2] ?? "b";
  const multiplier = unit === "mb" || unit === "mib" || unit === "m" ? 1024 * 1024 : unit === "kb" || unit === "kib" || unit === "k" ? 1024 : 1;
  return amount * multiplier;
}

function parseScreenshotQuality(value) {
  const quality = parsePositiveInteger(value, "quality");
  if (quality < 1 || quality > 100) {
    throw new Error("quality must be between 1 and 100");
  }
  return quality;
}

function normalizeFormat(format) {
  const normalized = String(format ?? "png").toLowerCase();
  return normalized === "jpg" ? "jpeg" : normalized;
}

function inferScreenshotFormat(explicitPath, flags = {}) {
  if (flags.format) {
    return normalizeFormat(flags.format);
  }
  const lowerPath = explicitPath?.toLowerCase();
  if (lowerPath?.endsWith(".webp")) {
    return "webp";
  }
  if (lowerPath?.endsWith(".jpg") || lowerPath?.endsWith(".jpeg")) {
    return "jpeg";
  }
  if (lowerPath?.endsWith(".png")) {
    return "png";
  }
  return screenshotNormalizationEnabled(flags) ? "jpeg" : "png";
}

function screenshotNormalizationEnabled(flags = {}) {
  if (flags.rawSize || flags.noNormalize) {
    return false;
  }
  if (flags.normalize) {
    return true;
  }
  const raw = String(process.env.REALBROWSER_SCREENSHOT_NORMALIZE ?? "1").toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
}

function screenshotNormalizationOptions(flags = {}) {
  return {
    enabled: screenshotNormalizationEnabled(flags),
    maxSide: flags.maxSide === undefined ? DEFAULT_SCREENSHOT_MAX_SIDE : parsePositiveInteger(flags.maxSide, "max-side"),
    maxBytes: flags.maxBytes === undefined ? DEFAULT_SCREENSHOT_MAX_BYTES : parseByteSize(flags.maxBytes, "max-bytes"),
    quality: parseScreenshotQuality(flags.quality ?? String(DEFAULT_SCREENSHOT_JPEG_QUALITY)),
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "unknown";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function screenshotQualitySteps(preferred) {
  return [...new Set([preferred, ...SCREENSHOT_QUALITY_STEPS.filter((quality) => quality < preferred)])];
}

function screenshotScaleSteps(baseScale) {
  return [...new Set(SCREENSHOT_SCALE_STEPS.map((step) => Math.max(0.1, Math.min(1, baseScale * step))))];
}

function canUseScreenshotQuality(format) {
  return ["jpeg", "webp"].includes(normalizeFormat(format));
}

function extensionForFormat(format) {
  return normalizeFormat(format);
}

function replaceFileExtension(filePath, extension) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.${extension}`);
}

async function resolveScreenshotFilePath(requestedPath, result, format) {
  if (await fsp.stat(requestedPath).then((stat) => stat.isFile()).catch(() => false)) {
    return requestedPath;
  }
  const savedPath = String(result?.text ?? "").match(/Saved screenshot to (.+?)(?:\.\s*(?:\n|$)|\n|$)/)?.[1];
  if (savedPath && await fsp.stat(savedPath).then((stat) => stat.isFile()).catch(() => false)) {
    return savedPath;
  }
  const alternate = replaceFileExtension(requestedPath, extensionForFormat(format));
  if (alternate !== requestedPath && await fsp.stat(alternate).then((stat) => stat.isFile()).catch(() => false)) {
    return alternate;
  }
  return requestedPath;
}

function buildScreenshotCaptureInfo({ filePath, format, quality, scale, metrics, bytes, maxBytes }) {
  const viewportWidth = metrics?.width ?? 0;
  const viewportHeight = metrics?.height ?? 0;
  const originalDpr = metrics?.dpr ?? 1;
  const estimatedOriginal = {
    width: Math.max(1, Math.round(viewportWidth * originalDpr)),
    height: Math.max(1, Math.round(viewportHeight * originalDpr)),
  };
  const estimatedFinal = {
    width: Math.max(1, Math.round(estimatedOriginal.width * scale)),
    height: Math.max(1, Math.round(estimatedOriginal.height * scale)),
  };
  return {
    path: filePath,
    filePath,
    format: normalizeFormat(format),
    quality,
    scale,
    bytes,
    maxBytes,
    normalized: scale < 0.999,
    estimatedOriginal,
    estimatedFinal,
  };
}

function withScreenshotCaptureInfo(result, info) {
  if (!info) {
    return result;
  }
  let text = result?.text ? String(result.text) : "";
  if (info.normalized) {
    text = text.replace(/\n?Emulating viewport: \{[^\n]*\}/g, "");
  }

  const notes = [];
  if (info.warning) {
    notes.push(`warning: ${info.warning}`);
  }
  if (info.normalized) {
    notes.push(
      `normalized screenshot: estimated ${info.estimatedOriginal.width}x${info.estimatedOriginal.height} -> ${info.estimatedFinal.width}x${info.estimatedFinal.height}, ${formatBytes(info.bytes)} (${info.format}${info.quality ? `, quality ${info.quality}` : ""})`,
    );
  }
  if (info.path && !text.includes(info.path)) {
    notes.push(`file: ${info.path}`);
  }

  return {
    ...result,
    path: info.path,
    filePath: info.path,
    screenshot: info,
    text: [text || `screenshot: ${info.path}`, ...notes].filter(Boolean).join("\n"),
  };
}

function extractJsonFromToolText(text) {
  const raw = String(text ?? "");
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to fenced JSON extraction.
    }
  }
  const match = raw.match(/```json\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function simpleLineDiff(left, right, leftLabel, rightLabel) {
  const a = left.split("\n");
  const b = right.split("\n");
  const max = Math.max(a.length, b.length);
  const lines = [`--- ${leftLabel}`, `+++ ${rightLabel}`];
  for (let index = 0; index < max; index += 1) {
    if (a[index] === b[index]) {
      if (a[index] !== undefined) lines.push(`  ${a[index]}`);
      continue;
    }
    if (a[index] !== undefined) lines.push(`- ${a[index]}`);
    if (b[index] !== undefined) lines.push(`+ ${b[index]}`);
  }
  return lines.join("\n");
}

function collectSnapshotUids(root) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (typeof node.id === "string" && isUidRef(node.id)) {
      out.push(node.id);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(root);
  return out;
}

async function readDownloadSnapshot(dir) {
  const entries = new Map();
  const names = await fsp.readdir(dir).catch(() => []);
  await Promise.all(
    names.map(async (name) => {
      const filePath = path.join(dir, name);
      const stat = await fsp.stat(filePath).catch(() => null);
      if (!stat?.isFile()) {
        return;
      }
      entries.set(name, {
        path: filePath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        incomplete: isIncompleteDownloadName(name),
      });
    }),
  );
  return entries;
}

function isIncompleteDownloadName(name) {
  return name.endsWith(".crdownload") || name.endsWith(".download") || name.endsWith(".part");
}

async function waitForDownloadedFile({ sourceDir, before, startedAt, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const current = await readDownloadSnapshot(sourceDir);
    const candidates = [];
    for (const [name, entry] of current) {
      if (entry.incomplete) {
        continue;
      }
      const previous = before.get(name);
      const changed = !previous || entry.mtimeMs > previous.mtimeMs + 1 || entry.size !== previous.size;
      if (changed && entry.mtimeMs >= startedAt - 1000) {
        candidates.push(entry);
      }
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const candidate of candidates) {
      const stable = await stableDownloadedFile(candidate.path);
      if (stable) {
        return stable;
      }
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for a download in ${sourceDir}`);
}

async function stableDownloadedFile(filePath) {
  const first = await fsp.stat(filePath).catch(() => null);
  if (!first?.isFile() || isIncompleteDownloadName(path.basename(filePath))) {
    return null;
  }
  await sleep(300);
  const second = await fsp.stat(filePath).catch(() => null);
  if (!second?.isFile() || second.size !== first.size) {
    return null;
  }
  return { path: filePath, size: second.size, mtimeMs: second.mtimeMs };
}

async function resolveDownloadDestination(outPath, sourcePath) {
  if (!outPath) {
    const destination = path.join(DEFAULT_DOWNLOAD_DIR, path.basename(sourcePath));
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    return destination;
  }
  const resolved = path.resolve(outPath);
  if (outPath.endsWith(path.sep) || (await isDirectory(resolved))) {
    return path.join(resolved, path.basename(sourcePath));
  }
  return resolved;
}

async function isDirectory(filePath) {
  const stat = await fsp.stat(filePath).catch(() => null);
  return Boolean(stat?.isDirectory());
}

function cdpUrlFromFlags(flags = {}) {
  return (
    flags.cdpUrl ??
    process.env.REALBROWSER_CDP_URL ??
    flags.browserUrl ??
    process.env.REALBROWSER_BROWSER_URL ??
    ""
  ).trim();
}

async function interceptDownloadViaCdp({ cdpUrl, timeoutMs, outPath, trigger }) {
  const wsUrl = await resolveCdpBrowserWebSocketUrl(cdpUrl);
  const client = new CdpClient(wsUrl);
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "realbrowser-download-"));
  let waiter;

  try {
    await client.connect();
    await client.request("Browser.setDownloadBehavior", {
      behavior: "allowAndName",
      downloadPath: tempDir,
      eventsEnabled: true,
    });
    waiter = createCdpDownloadWaiter(client, cdpUrl, timeoutMs);
    await trigger();
    await waiter.promise;
    const willBegin = waiter.getWillBegin();
    const suggestedFilename = sanitizeFileName(willBegin?.suggestedFilename || "download");
    const sourcePath = await findCdpDownloadedFile(tempDir, willBegin?.guid, suggestedFilename);
    const destination = await resolveDownloadDestination(outPath, path.join(tempDir, suggestedFilename));
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.copyFile(sourcePath, destination);
    const stat = await fsp.stat(destination);
    return {
      text: `downloaded: ${destination}`,
      download: {
        cdp: true,
        url: willBegin?.url,
        path: destination,
        size: stat.size,
        suggestedFilename,
      },
    };
  } finally {
    waiter?.cancel();
    await safeCdpRequest(client, "Browser.setDownloadBehavior", { behavior: "default" });
    client.close();
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function createCdpDownloadWaiter(client, cdpUrl, timeoutMs) {
  let willBegin;
  let stop = () => {};
  let timer;
  const cleanup = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    stop();
    stop = () => {};
  };
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for CDP download event from ${redactUrl(cdpUrl)}`));
    }, timeoutMs);
    timer.unref?.();
    stop = client.onEvent((event) => {
      if (event.method === "Browser.downloadWillBegin" && !willBegin) {
        willBegin = event.params;
        return;
      }
      if (
        event.method === "Browser.downloadProgress" &&
        willBegin &&
        event.params?.guid === willBegin.guid
      ) {
        if (event.params.state === "completed") {
          cleanup();
          resolve(event.params);
        } else if (event.params.state === "canceled") {
          cleanup();
          reject(new Error(`Download canceled: ${willBegin.url ?? willBegin.guid}`));
        }
      }
    });
  });
  return {
    promise,
    cancel: cleanup,
    getWillBegin: () => willBegin,
  };
}

async function safeCdpRequest(client, method, params, options = {}) {
  try {
    await client.request(method, params, options);
  } catch {
    // Best effort cleanup for partially-open CDP sessions.
  }
}

async function resolveCdpBrowserWebSocketUrl(cdpUrl) {
  if (/^wss?:\/\//i.test(cdpUrl)) {
    return cdpUrl;
  }
  const versionUrl = new URL(cdpUrl);
  versionUrl.pathname = "/json/version";
  versionUrl.search = "";
  const response = await fetch(versionUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`CDP /json/version failed (${response.status}) at ${redactUrl(versionUrl.href)}`);
  }
  const body = await response.json();
  const wsUrl = body.webSocketDebuggerUrl;
  if (typeof wsUrl !== "string" || !wsUrl) {
    throw new Error(`CDP /json/version did not return webSocketDebuggerUrl at ${redactUrl(versionUrl.href)}`);
  }
  return wsUrl;
}

async function findCdpDownloadedFile(tempDir, guid, suggestedFilename) {
  const candidates = [
    guid ? path.join(tempDir, guid) : undefined,
    suggestedFilename ? path.join(tempDir, suggestedFilename) : undefined,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const stable = await stableDownloadedFile(candidate);
    if (stable) {
      return stable.path;
    }
  }
  const entries = await readDownloadSnapshot(tempDir);
  const complete = [...entries.values()].filter((entry) => !entry.incomplete);
  complete.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (complete[0]) {
    return complete[0].path;
  }
  throw new Error("CDP reported a completed download, but no completed file was found");
}

function sanitizeFileName(name) {
  const safe = String(name).replaceAll(/[/:\\]/g, "_").trim();
  return safe || "download";
}

function redactUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.username) url.username = "***";
    if (url.password) url.password = "***";
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password/i.test(key)) {
        url.searchParams.set(key, "***");
      }
    }
    return url.toString();
  } catch {
    return String(value).replace(/([?&](?:token|key|secret|password)=)[^&]+/gi, "$1***");
  }
}

function parsePageId(value) {
  const pageId = Number.parseInt(value, 10);
  if (!Number.isFinite(pageId)) {
    throw new Error(`Invalid page id: ${value}`);
  }
  return pageId;
}

function isUidRef(value) {
  return typeof value === "string" && /^\d+_\d+$/.test(value);
}

function normalizeCdpRoleRef(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().replace(/^@/u, "").replace(/^ref=/iu, "");
  return /^e\d+$/iu.test(normalized) ? normalized.toLowerCase() : "";
}

function isCdpRoleRef(value) {
  return Boolean(normalizeCdpRoleRef(value));
}

function selectorLiteral(selector) {
  return JSON.stringify(selector);
}

function selectorOrUidFunction(selectorOrUid, body) {
  if (isUidRef(selectorOrUid)) {
    return `(el) => {
      if (!el) throw new Error("Element uid not found");
      return (${body})(el);
    }`;
  }
  return `() => {
    const el = document.querySelector(${selectorLiteral(selectorOrUid)});
    if (!el) throw new Error("Element not found: ${selectorOrUid.replaceAll('"', '\\"')}");
    return (${body})(el);
  }`;
}

function stateFunctionBody(property) {
  switch (property) {
    case "visible":
      return `(el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      }`;
    case "hidden":
      return `(el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility === "hidden" || style.display === "none" || rect.width === 0 || rect.height === 0;
      }`;
    case "enabled":
      return `(el) => !el.disabled && !el.getAttribute("aria-disabled")`;
    case "disabled":
      return `(el) => Boolean(el.disabled || el.getAttribute("aria-disabled"))`;
    case "checked":
      return `(el) => Boolean(el.checked || el.getAttribute("aria-checked") === "true")`;
    case "editable":
      return `(el) => !el.readOnly && !el.disabled && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))`;
    case "focused":
      return `(el) => el === document.activeElement`;
    default:
      throw new Error(`Unknown state: ${property}`);
  }
}

function storageReadFunction(includeValues) {
  return `() => {
    const sensitiveKey = /(^|[_.-])(token|secret|key|password|credential|auth|jwt|session|csrf)($|[_.-])|api.?key/i;
    const sensitiveValue = /^(eyJ|sk-|sk_live_|sk_test_|pk_live_|pk_test_|rk_live_|sk-ant-|ghp_|gho_|github_pat_|xox[bpsa]-|AKIA[A-Z0-9]{16}|AIza|SG\\.|Bearer\\s|sbp_)/;
    const redact = (store) => Object.fromEntries(Object.entries(store).map(([key, value]) => {
      const stringValue = String(value);
      if (${includeValues ? "false" : "true"} || sensitiveKey.test(key) || sensitiveValue.test(stringValue)) {
        return [key, "[redacted " + stringValue.length + " chars]"];
      }
      return [key, stringValue];
    }));
    return {
      localStorage: redact({ ...localStorage }),
      sessionStorage: redact({ ...sessionStorage }),
    };
  }`;
}

function waitForReadyStateFunction(targetState, timeoutMs) {
  const states =
    targetState === "complete"
      ? ["complete"]
      : ["interactive", "complete"];
  return `async () => {
    const accepted = new Set(${JSON.stringify(states)});
    const deadline = Date.now() + ${timeoutMs};
    while (!accepted.has(document.readyState)) {
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for document.readyState=${targetState}");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { readyState: document.readyState };
  }`;
}

function waitForSelectorFunction(selector, timeoutMs, options = {}) {
  return `async () => {
    const selector = ${JSON.stringify(String(selector ?? ""))};
    const requireVisible = ${options.visible ? "true" : "false"};
    const deadline = Date.now() + ${timeoutMs};
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
    };
    while (Date.now() <= deadline) {
      const el = document.querySelector(selector);
      if (el && (!requireVisible || visible(el))) {
        const rect = el.getBoundingClientRect();
        return {
          matched: selector,
          visible: visible(el),
          tag: el.tagName.toLowerCase(),
          text: String(el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 160) || undefined,
          top: Math.round(rect.top + scrollY),
          readyState: document.readyState,
          url: location.href,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Timed out waiting for " + (requireVisible ? "visible selector: " : "selector: ") + selector);
  }`;
}

function waitForTextFunction(text, timeoutMs, options = {}) {
  return `async () => {
    const needle = ${JSON.stringify(String(text ?? ""))};
    const selector = ${options.selector ? JSON.stringify(String(options.selector)) : "null"};
    const requireVisible = ${options.visible ? "true" : "false"};
    const deadline = Date.now() + ${timeoutMs};
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      if (el === document.body || el === document.documentElement) return true;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
    };
    const roots = () => {
      if (selector) {
        const root = document.querySelector(selector);
        return root ? [root] : [];
      }
      return [document.body || document.documentElement].filter(Boolean);
    };
    while (Date.now() <= deadline) {
      for (const root of roots()) {
        if (requireVisible && !visible(root)) continue;
        const haystack = String((requireVisible ? root.innerText : (root.innerText || root.textContent)) || "");
        if (haystack.includes(needle)) {
          return {
            matched: needle,
            selector: selector || undefined,
            visible: requireVisible ? true : undefined,
            readyState: document.readyState,
            url: location.href,
          };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Timed out waiting for " + (requireVisible ? "visible text: " : "text: ") + needle);
  }`;
}

function waitForReadyContentFunction(text, timeoutMs, options = {}) {
  const minCards = Math.max(0, Number.parseInt(options.minCards ?? "0", 10) || 0);
  const stableMs = Math.max(0, Number.parseInt(options.stableMs ?? "700", 10) || 0);
  return `async () => {
    const opts = ${JSON.stringify({
      text: text || "",
      selector: normalizeOptionalString(options.selector) ?? "",
      cardSelector: normalizeOptionalString(options.cardSelector) ?? "",
      minCards,
      stableMs,
      visualStable: Boolean(options.visualStable),
      noSkeletons: Boolean(options.noSkeletons),
      foregroundRequested: Boolean(options.foregroundRequested),
    })};
    const timeoutMs = ${timeoutMs};
    const deadline = Date.now() + timeoutMs;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const queryAll = (selector, root = document) => {
      if (!selector) return [];
      try {
        return [...root.querySelectorAll(selector)];
      } catch {
        return [];
      }
    };
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (rect.bottom < -innerHeight * 0.25 || rect.top > innerHeight * 2.5) return false;
      const style = getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
    };
    const cleanText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const visibleCardElements = () => {
      const explicit = opts.cardSelector ? queryAll(opts.cardSelector).filter(visible) : [];
      if (explicit.length) return explicit;
      const collectionChildren = queryAll('[role="feed"] > *, [role="list"] > *')
        .filter(visible)
        .filter((el) => cleanText(el.innerText || el.textContent || "").length >= 2 || el.querySelector("img,video,canvas,svg"));
      if (collectionChildren.length) return collectionChildren;
      return queryAll('main article, [role="main"] article, article, main [role="article"], [role="main"] [role="article"], [aria-posinset], main section, [role="main"] section')
        .filter(visible)
        .filter((el) => cleanText(el.innerText || el.textContent || "").length >= 2 || el.querySelector("img,video,canvas,svg"));
    };
    const skeletonCount = () => queryAll('[aria-busy="true"], [role="progressbar"], [data-visualcompletion="loading-state"], .skeleton, [class*="skeleton" i], [class*="loading" i]')
      .filter(visible)
      .length;
    const sample = () => {
      const root = opts.selector ? document.querySelector(opts.selector) : (document.body || document.documentElement);
      const selectorVisible = opts.selector ? visible(root) : true;
      const rootText = cleanText(root?.innerText || root?.textContent || "");
      const bodyText = cleanText(document.body?.innerText || document.body?.textContent || "");
      const cards = visibleCardElements();
      const images = [...document.images];
      const completeImages = images.filter((img) => img.complete && img.naturalWidth > 0).length;
      const skeletons = skeletonCount();
      return {
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        visibility: document.visibilityState,
        hasFocus: document.hasFocus(),
        selector: opts.selector || undefined,
        selectorVisible,
        textMatched: opts.text ? bodyText.includes(opts.text) || rootText.includes(opts.text) : undefined,
        textChars: bodyText.length,
        rootTextChars: rootText.length,
        cardCount: cards.length,
        minCards: opts.minCards,
        skeletonCount: skeletons,
        images: images.length,
        completeImages,
        scrollHeight: Math.round(document.documentElement?.scrollHeight || document.body?.scrollHeight || 0),
      };
    };
    const criteriaMet = (s) => {
      if (!["interactive", "complete"].includes(s.readyState)) return false;
      if (opts.selector && !s.selectorVisible) return false;
      if (opts.text && !s.textMatched) return false;
      if (opts.minCards > 0 && s.cardCount < opts.minCards) return false;
      if (opts.noSkeletons && s.skeletonCount > 0) return false;
      if (!opts.selector && !opts.text && opts.minCards <= 0 && s.textChars < 40 && s.cardCount < 1) return false;
      return true;
    };
    const signatureFor = (s) => JSON.stringify({
      textChars: s.textChars,
      rootTextChars: s.rootTextChars,
      cardCount: s.cardCount,
      skeletonCount: s.skeletonCount,
      images: s.images,
      completeImages: s.completeImages,
      scrollHeight: s.scrollHeight,
    });
    let last = sample();
    let lastSignature = "";
    let stableSince = 0;
    while (Date.now() <= deadline) {
      last = sample();
      const signature = signatureFor(last);
      if (signature !== lastSignature) {
        lastSignature = signature;
        stableSince = Date.now();
      }
      const stableForMs = Date.now() - stableSince;
      const stable = !opts.visualStable || stableForMs >= opts.stableMs;
      if (criteriaMet(last) && stable) {
        return JSON.stringify({
          ready: true,
          ...last,
          criteria: {
            selector: opts.selector || undefined,
            text: opts.text || undefined,
            minCards: opts.minCards || undefined,
            noSkeletons: opts.noSkeletons || undefined,
            visualStable: opts.visualStable || undefined,
            stableMs: opts.visualStable ? opts.stableMs : undefined,
            foregroundRequested: opts.foregroundRequested || undefined,
          },
          stableForMs,
          timeoutMs,
        });
      }
      await sleep(100);
    }
    throw new Error("Timed out waiting for ready content: " + JSON.stringify({
      ...last,
      criteria: {
        selector: opts.selector || undefined,
        text: opts.text || undefined,
        minCards: opts.minCards || undefined,
        noSkeletons: opts.noSkeletons || undefined,
        visualStable: opts.visualStable || undefined,
      },
      timeoutMs,
    }));
  }`;
}

function deviceScreenshotMetricsFunction() {
  return `() => ({
    url: location.href,
    title: document.title,
    innerWidth,
    innerHeight,
    devicePixelRatio,
    visualViewport: {
      width: visualViewport?.width,
      height: visualViewport?.height,
      scale: visualViewport?.scale
    }
  })`;
}

function formatReadyContentSummary(ready = {}) {
  const criteria = ready.criteria ?? {};
  const lines = [
    `ready content: ${ready.ready ? "yes" : "no"}`,
    ready.url ? `url: ${ready.url}` : "",
    `state: readyState=${ready.readyState ?? "unknown"} visibility=${ready.visibility ?? "unknown"} focus=${ready.hasFocus === true ? "yes" : "no"}`,
    criteria.selector ? `selector: ${criteria.selector} visible=${ready.selectorVisible === true ? "yes" : "no"}` : "",
    criteria.text ? `text: ${criteria.text} matched=${ready.textMatched === true ? "yes" : "no"}` : "",
    criteria.minCards ? `cards: ${ready.cardCount ?? 0}/${criteria.minCards}` : `cards: ${ready.cardCount ?? 0}`,
    `text chars: body=${ready.textChars ?? 0} root=${ready.rootTextChars ?? 0}`,
    `loading markers: ${ready.skeletonCount ?? 0}`,
    `images: ${ready.completeImages ?? 0}/${ready.images ?? 0}`,
    criteria.visualStable ? `stable: ${ready.stableForMs ?? 0}ms/${criteria.stableMs ?? 0}ms` : "",
    criteria.foregroundRequested && ready.hasFocus === false
      ? "note: tab was activated for browser automation, but document.hasFocus() is still false; this can mean the OS window is not frontmost."
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function waitForNetworkIdleFunction(timeoutMs) {
  return `async () => {
    const deadline = Date.now() + ${timeoutMs};
    let lastCount = -1;
    let stableSince = Date.now();
    while (Date.now() <= deadline) {
      const entries = performance.getEntriesByType("resource");
      const count = entries.length;
      const latest = entries.reduce((max, entry) => Math.max(max, entry.responseEnd || entry.startTime || 0), 0);
      const now = performance.now();
      if (count !== lastCount || now - latest < 500) {
        lastCount = count;
        stableSince = Date.now();
      }
      if (Date.now() - stableSince >= 500) {
        return { idle: true, resourceCount: count };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Timed out waiting for network idle");
  }`;
}

function requireArgs(command, args, count) {
  if (args.length < count) {
    throw usageError(`${command} requires ${count} argument${count === 1 ? "" : "s"}`);
  }
}

function buildEvalFunction(code) {
  const trimmed = code.trim();
  if (
    /^(async\s+)?function\b/.test(trimmed) ||
    (/^(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(trimmed) &&
      !looksLikeInvokedFunctionExpression(trimmed))
  ) {
    return trimmed;
  }
  if (needsEvalBlockWrapper(trimmed)) {
    return `async () => { ${code} }`;
  }
  return `async () => (${code})`;
}

function looksLikeInvokedFunctionExpression(code) {
  return (
    /^\(\s*(async\s*)?(function\b|(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/.test(code) &&
    /\)\s*\([^)]*\)\s*$/.test(code)
  );
}

function needsEvalBlockWrapper(code) {
  if (code.split("\n").length > 1) return true;
  if (/\b(const|let|var|function|class|return|throw|if|for|while|switch|try)\b/.test(code)) return true;
  if (code.includes(";")) return true;
  return false;
}

function commandVersion(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => resolve(null));
    child.on("close", () => resolve(out.trim() || null));
  });
}

async function runDaemon() {
  const stateFile = process.env.REALBROWSER_STATE_FILE ?? DEFAULT_STATE_FILE;
  const port = await findFreePort();
  const token = crypto.randomBytes(32).toString("hex");
  const daemon = new BrowserDaemon(stateFile);
  const idleTimeoutMs = managedIdleTimeoutMsForMode(daemon.mode);
  let lastActivity = Date.now();
  let idleCheckInterval = null;
  let rpcQueue = Promise.resolve();
  const enqueueRpc = (task) => {
    const run = rpcQueue.catch(() => {}).then(task);
    rpcQueue = run.catch(() => {});
    return run;
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, {
          ok: true,
          pid: process.pid,
          version: CLI_VERSION,
          script: SCRIPT_PATH,
          scriptHash: SCRIPT_HASH,
          capabilities: DAEMON_CAPABILITIES,
          mode: daemon.currentMode(),
          headless: daemon.headless,
          idleTimeoutMs,
          idleForMs: Date.now() - lastActivity,
          noFallback: daemon.noFallback,
          mcpConnected: Boolean(daemon.mcp),
        });
        return;
      }
      if (req.method !== "POST" || req.url !== "/rpc") {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      if (req.headers.authorization !== `Bearer ${token}`) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }
      lastActivity = Date.now();
      const body = await readRequestJson(req);
      const result = await enqueueRpc(() => daemon.handle(body.command, body.args ?? [], body.flags ?? {}));
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await writeJson(stateFile, {
    pid: process.pid,
    port,
    token,
    startedAt: new Date().toISOString(),
    version: CLI_VERSION,
    scriptHash: SCRIPT_HASH,
    capabilities: DAEMON_CAPABILITIES,
    idleTimeoutMs,
    script: SCRIPT_PATH,
    stateFile,
    session: process.env.REALBROWSER_SESSION || undefined,
    modeKey: modeKey({
      anonymous: process.env.REALBROWSER_MODE === ANONYMOUS_MODE,
      dedicated: process.env.REALBROWSER_MODE === DEDICATED_MODE,
      browserUrl: process.env.REALBROWSER_BROWSER_URL?.trim() || undefined,
      profileDir: process.env.REALBROWSER_PROFILE_DIR || undefined,
      headless: process.env.REALBROWSER_HEADLESS === "1",
      keepAnonymous: process.env.REALBROWSER_KEEP_ANONYMOUS === "1",
    }),
  });
  if (idleTimeoutMs > 0) {
    const checkEveryMs = Math.max(500, Math.min(60_000, Math.floor(idleTimeoutMs / 4)));
    idleCheckInterval = setInterval(() => {
      if (Date.now() - lastActivity <= idleTimeoutMs) {
        return;
      }
      clearInterval(idleCheckInterval);
      daemon.handle("stop", [], {}).catch(() => process.exit(0));
    }, checkEveryMs);
    idleCheckInterval.unref?.();
  }
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function runSelfTest() {
  const sampleSnapshot = {
    role: "RootWebArea",
    name: "Demo",
    id: "1_1",
    children: [
      { role: "heading", name: "Inbox", id: "1_2" },
      { role: "generic", children: [{ role: "button", name: "Compose", id: "1_3" }] },
      { role: "paragraph", name: "Welcome to the inbox", id: "1_4" },
    ],
  };
  const efficient = buildCompactSnapshot(sampleSnapshot, "", {
    efficient: true,
    maxChars: "1000",
    maxNodes: "10",
  });
  assertSelfTest(efficient.text.includes("[uid=1_3]"), "efficient snapshot keeps interactive refs");
  assertSelfTest(!efficient.text.includes("RootWebArea"), "efficient snapshot compacts structural root");
  assertSelfTest(efficient.stats.refs === 1, "efficient snapshot stats count interactive refs");

  const truncated = truncateText("abcdef", 3);
  assertSelfTest(truncated.truncated && truncated.text.includes("abc"), "truncateText truncates");
  assertSelfTest(extractJsonFromToolText('[{"text":"one"}]')?.[0]?.text === "one", "plain JSON tool text is parsed");
  const rawCompacted = await formatRawResult("eval", { text: "abcdef" }, { maxChars: "3", raw: true, autoOut: false });
  assertSelfTest(rawCompacted.text.includes("TRUNCATED raw output"), "raw output is capped by max-chars");
  const compactSnapshotStructured = compactSnapshotStructuredContent({
    snapshot: { role: "RootWebArea", children: [{ role: "paragraph", name: "large" }] },
    other: true,
  });
  assertSelfTest(!Object.hasOwn(compactSnapshotStructured, "snapshot") && compactSnapshotStructured.other === true, "compact snapshot json omits raw tree");
  const fallbackSnapshot = buildCompactSnapshot(null, "x".repeat(READ_STDOUT_HARD_MAX_CHARS + 500), { maxChars: "1000000" });
  assertSelfTest(fallbackSnapshot.stats.stdoutMaxChars === READ_STDOUT_HARD_MAX_CHARS, "snapshot stdout has a hard max cap");
  assertSelfTest(fallbackSnapshot.text.includes("STDOUT CAPPED"), "snapshot hard cap is visible in text output");
  const rawSnapshotOut = snapshotRawOutResult({
    outPath: "tmp/snapshot.json",
    rawText: "{\"ok\":true}",
    flags: {},
    structuredContent: { cdp: true },
  });
  assertSelfTest(
    rawSnapshotOut.text.includes("raw output written") &&
      rawSnapshotOut.structuredContent.out === "tmp/snapshot.json" &&
      rawSnapshotOut.structuredContent.cdp === true,
    "raw snapshot --out helper preserves summary shape",
  );
  const readOutTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "realbrowser-read-out-self-test-"));
  try {
    const htmlDefault = await formatReadResult("html", { text: "x".repeat(DEFAULT_HTML_MAX_CHARS + 500) }, { outputDir: readOutTempDir });
    assertSelfTest(htmlDefault.structuredContent.stdoutMaxChars === DEFAULT_HTML_MAX_CHARS, "html reads use a smaller default stdout budget");
    assertSelfTest(htmlDefault.text.includes("TRUNCATED"), "html reads truncate large stdout by default");
    assertSelfTest(
      htmlDefault.structuredContent.autoOut && fs.existsSync(htmlDefault.structuredContent.autoOut),
      "truncated read output is preserved in an auto artifact",
    );
    const hardCappedRead = await formatReadResult("text", { text: "x".repeat(READ_STDOUT_HARD_MAX_CHARS + 500) }, {
      maxChars: "1000000",
      outputDir: readOutTempDir,
    });
    assertSelfTest(hardCappedRead.structuredContent.stdoutMaxChars === READ_STDOUT_HARD_MAX_CHARS, "read stdout has a hard max cap");
    assertSelfTest(hardCappedRead.text.includes("STDOUT CAPPED"), "oversized requested read stdout reports the hard cap");
    assertSelfTest(hardCappedRead.structuredContent.autoOut && fs.existsSync(hardCappedRead.structuredContent.autoOut), "hard-capped read output is preserved in an auto artifact");
    const fullStdoutRead = await formatReadResult("text", { text: "x".repeat(READ_STDOUT_HARD_MAX_CHARS + 10) }, {
      maxChars: String(READ_STDOUT_HARD_MAX_CHARS + 10),
      fullStdout: true,
      autoOut: false,
    });
    assertSelfTest(fullStdoutRead.structuredContent.stdoutMaxChars === READ_STDOUT_HARD_MAX_CHARS + 10, "full-stdout bypasses the hard cap when explicit");
    assertSelfTest(!fullStdoutRead.text.includes("STDOUT CAPPED"), "full-stdout output is not hard-capped");
    const oversizedJson = formatStdoutJson(
      { text: "x".repeat(READ_STDOUT_HARD_MAX_CHARS + 1000) },
      READ_STDOUT_HARD_MAX_CHARS,
      { outputDir: readOutTempDir },
    );
    const oversizedJsonParsed = JSON.parse(oversizedJson);
    assertSelfTest(oversizedJsonParsed.stdoutTruncated === true, "json stdout is bounded when objects are too large");
    assertSelfTest(oversizedJsonParsed.fullOutput && fs.existsSync(oversizedJsonParsed.fullOutput), "oversized json stdout is preserved in an auto artifact");
    const fullStdoutJson = formatStdoutJson({ text: "abcdef" }, 3, { fullStdout: true });
    assertSelfTest(fullStdoutJson.includes("abcdef") && !fullStdoutJson.includes("stdoutTruncated"), "full-stdout bypasses final json cap");
    const htmlOutPath = path.join(readOutTempDir, "page.html");
    const htmlOut = await formatReadResult("html", { text: `<main>${"x".repeat(DEFAULT_HTML_MAX_CHARS + 500)}</main>` }, { out: htmlOutPath });
    assertSelfTest(!htmlOut.text.includes("x".repeat(100)), "--out read summaries do not echo large content");
    assertSelfTest(fs.readFileSync(htmlOutPath, "utf8").includes("x".repeat(100)), "--out read artifact keeps full content");
  } finally {
    fs.rmSync(readOutTempDir, { recursive: true, force: true });
  }

  assertSelfTest(
    [...INTERACTIVE_ROLES].join("|") === "button|checkbox|combobox|link|listbox|menuitem|menuitemcheckbox|menuitemradio|option|radio|searchbox|slider|spinbutton|switch|tab|textbox|treeitem",
    "interactive role set matches OpenClaw",
  );
  assertSelfTest(
    [...CONTENT_ROLES].join("|") === "article|cell|columnheader|gridcell|heading|listitem|main|navigation|region|rowheader",
    "content role set matches OpenClaw",
  );
  assertSelfTest(
    [...STRUCTURAL_ROLES].join("|") === "application|directory|document|generic|grid|group|ignored|list|menu|menubar|none|presentation|row|rowgroup|table|tablist|toolbar|tree|treegrid",
    "structural role set matches OpenClaw",
  );
  const selectorSnapshotMethods = [];
  const selectorSnapshotSend = async (method, params = {}) => {
    selectorSnapshotMethods.push({ method, params });
    if (method === "DOM.getDocument") {
      return { root: { nodeId: 1 } };
    }
    if (method === "DOM.querySelector") {
      return params.selector === "main" ? { nodeId: 2 } : { nodeId: 0 };
    }
    if (method === "DOM.describeNode") {
      return { node: { backendNodeId: 42, attributes: [] } };
    }
    if (method === "Accessibility.getFullAXTree") {
      return {
        nodes: [
          {
            nodeId: "1",
            role: { value: "RootWebArea" },
            name: { value: "Demo" },
            childIds: ["2"],
          },
          {
            nodeId: "2",
            role: { value: "main" },
            name: { value: "App" },
            backendDOMNodeId: 42,
            childIds: ["3"],
          },
          {
            nodeId: "3",
            role: { value: "button" },
            name: { value: "Save" },
            backendDOMNodeId: 43,
          },
        ],
      };
    }
    if (method === "Runtime.evaluate") {
      return { result: { value: [] } };
    }
    if (method === "DOM.querySelectorAll") {
      return { nodeIds: [] };
    }
    return {};
  };
  const selectorSnapshot = await buildCdpRoleSnapshotFromSession({
    send: selectorSnapshotSend,
    selector: "main",
    options: { compact: true },
    recurseIframes: false,
    nextRef: { value: 1 },
  });
  assertSelfTest(
    selectorSnapshotMethods.some((entry) => entry.method === "DOM.querySelector" && entry.params.selector === "main") &&
      selectorSnapshotMethods.some((entry) => entry.method === "Accessibility.getFullAXTree") &&
      selectorSnapshot.lines[0]?.startsWith("- main") &&
      selectorSnapshot.lines.some((line) => line.includes('button "Save"')),
    "CDP role snapshot supports selector-scoped AX rendering",
  );
  assertSelfTest(normalizeCdpRoleRef("ref=E12") === "e12", "CDP role refs normalize from snapshot syntax");
  assertSelfTest(!isCdpRoleRef("1_2"), "MCP uid refs stay distinct from CDP role refs");
  new Function(`return ${linksReadFunction({ filter: "docs", limit: "3", visible: true })}`)();
  new Function(`return ${linkReadBodyFunction({ textFilter: "docs", hrefFilter: "guide" })}`)();
  new Function(`return ${waitForSelectorFunction("main", 1000, { visible: true })}`)();
  new Function(`return ${waitForReadyContentFunction("Loaded", 1000, { selector: "main", minCards: "2", visualStable: true })}`)();
  assertSelfTest(
    waitForTextFunction("Example Group", 1000, { visible: true, selector: "main" }).includes("visible text"),
    "wait text supports visible scoped reads",
  );

  const hidden = new Set();
  const first = compactLineResult(
    { text: "200 GET /ok\n500 GET /bad\n400 POST /also-bad" },
    { flags: { failed: true, limit: "1", clear: true }, hiddenSet: hidden, emptyText: "(empty)", lineLimit: 50, linePredicate: isFailedNetworkLine },
  );
  assertSelfTest(first.text.includes("400 POST /also-bad"), "line compact returns latest failed request");
  const second = compactLineResult(
    { text: "200 GET /ok\n500 GET /bad\n400 POST /also-bad" },
    { flags: {}, hiddenSet: hidden, emptyText: "(empty)", lineLimit: 50 },
  );
  assertSelfTest(second.text.includes("(empty)"), "line clear hides previous lines");

  const windowsPath = String.raw`C:\Users\Example User\Pictures\screen shot.png`;
  const parsedWindowsPath = parseArgv(["screenshot", windowsPath, "--format", "png"]);
  assertSelfTest(parsedWindowsPath.command === "screenshot", "parser keeps command before Windows path");
  assertSelfTest(parsedWindowsPath.args[0] === windowsPath, "parser preserves Windows path with spaces");
  assertSelfTest(parsedWindowsPath.flags.format === "png", "parser handles flags after Windows path");

  const parsedBackgroundOpen = parseArgv(["open", "https://example.com"]);
  assertSelfTest(parsedBackgroundOpen.flags.front !== true, "open defaults to background mode");
  const parsedForegroundOpen = parseArgv(["open", "https://example.com", "--front"]);
  assertSelfTest(parsedForegroundOpen.flags.front === true, "open --front opts into focus");
  const parsedForegroundReadyOpen = parseArgv([
    "open",
    "https://example.com",
    "--foreground-until-ready",
    "--selector",
    "main",
    "--min-cards",
    "3",
    "--ready-text",
    "Loaded",
    "--visual-stable",
    "--no-skeletons",
  ]);
  assertSelfTest(
    parsedForegroundReadyOpen.flags.foregroundUntilReady === true &&
      parsedForegroundReadyOpen.flags.front === true &&
      parsedForegroundReadyOpen.flags.selector === "main" &&
      parsedForegroundReadyOpen.flags.minCards === "3" &&
      parsedForegroundReadyOpen.flags.readyText === "Loaded" &&
      parsedForegroundReadyOpen.flags.visualStable === true &&
      parsedForegroundReadyOpen.flags.noSkeletons === true,
    "parser handles foreground readiness flags",
  );
  const parsedHeadlessOpen = parseArgv(["open", "https://example.com", "--anonymous", "--headless"]);
  assertSelfTest(parsedHeadlessOpen.flags.headless === true, "parser handles headless flag");
  const parsedHeadedOpen = parseArgv(["open", "https://example.com", "--anonymous", "--headed"]);
  assertSelfTest(parsedHeadedOpen.flags.headless === false && parsedHeadedOpen.flags.headed === true, "parser handles headed flag");
  const parsedRawMode = parseArgv(["snapshot", "--mode=raw"]);
  assertSelfTest(parsedRawMode.flags.mode === "raw" && parsedRawMode.flags.raw === true, "parser handles output mode aliases");
  const parsedSnapshotSelector = parseArgv(["snapshot", "--selector", "main"]);
  assertSelfTest(parsedSnapshotSelector.flags.selector === "main", "parser handles snapshot selector flag");
  const parsedDedicatedBackend = parseArgv(["tabs", "--backend", "dev"]);
  assertSelfTest(parsedDedicatedBackend.flags.backend === "dev" && parsedDedicatedBackend.flags.dedicated === true, "parser handles dedicated backend alias");
  const parsedRealBackend = parseArgv(["tabs", "--backend=real"]);
  assertSelfTest(parsedRealBackend.flags.backend === "real" && parsedRealBackend.flags.dedicated === false, "parser handles real backend alias");
  assertSelfTest(desiredHeadless({ anonymous: true }) === true, "anonymous sessions default to headless");
  assertSelfTest(desiredHeadless({ anonymous: true, front: true }) === false, "front opts managed sessions into headed mode");
  assertSelfTest(managedIdleTimeoutMsForMode(ANONYMOUS_MODE) > 0, "anonymous managed sessions have an idle timeout");
  assertSelfTest(managedIdleTimeoutMsForMode(DEDICATED_MODE) > 0, "dedicated managed sessions have an idle timeout");
  assertSelfTest(managedIdleTimeoutMsForMode(AUTO_MODE) === 0, "real-profile auto sessions do not idle-shutdown by default");
  assertSelfTest(
    buildMcpArgs({ mode: ANONYMOUS_MODE, profileDir: "", headless: true }).includes("--headless=true"),
    "anonymous MCP launch can be headless",
  );
  assertSelfTest(
    !buildMcpArgs({ mode: ANONYMOUS_MODE, profileDir: "", headless: false }).includes("--headless=true"),
    "headed anonymous MCP launch omits headless flag",
  );
  const parsedSelectOpen = parseArgv(["open", "https://example.com", "--select"]);
  assertSelfTest(parsedSelectOpen.flags.select === true, "open --select selects for automation");
  const parsedCleanupDetach = parseArgv(["detach", "--cleanup-remote-debugging"]);
  assertSelfTest(parsedCleanupDetach.flags.cleanupRemoteDebugging === true, "parser handles cleanup remote debugging flag");
  const parsedMcpBypass = parseArgv(["tabs", "--mcp"]);
  assertSelfTest(parsedMcpBypass.flags.mcp === true && parsedMcpBypass.flags.fast === false, "parser handles MCP fast-path bypass");
  const parsedNoFast = parseArgv(["tabs", "--no-fast"]);
  assertSelfTest(parsedNoFast.flags.mcp === true && parsedNoFast.flags.fast === false, "parser handles no-fast alias");
  const parsedNoFallbackOpen = parseArgv(["open", "https://example.com", "--no-fallback"]);
  assertSelfTest(parsedNoFallbackOpen.flags.noFallback === true, "parser handles no-fallback flag");
  const parsedProfileOpen = parseArgv(["open", "https://example.com", "--profile", "chrome:Profile 4", "--browser=chrome"]);
  assertSelfTest(parsedProfileOpen.flags.profile === "chrome:Profile 4", "parser handles browser profile flag");
  assertSelfTest(parsedProfileOpen.flags.browser === "chrome", "parser handles browser filter flag");
  const parsedProfileOpenSelect = parseArgv(["open", "https://example.com", "--profile", "chrome:Profile 4", "--select", "--timeout", "15000"]);
  assertSelfTest(parsedProfileOpenSelect.flags.select === true, "parser handles profile open select flag");
  assertSelfTest(parsedProfileOpenSelect.flags.timeout === "15000", "parser preserves profile open select timeout");
  const parsedLinkFilters = parseArgv(["links", "--text-filter", "OpenClaw", "--href-filter=groups", "--visible", "--limit", "3"]);
  assertSelfTest(parsedLinkFilters.flags.textFilter === "OpenClaw", "parser handles links text-filter flag");
  assertSelfTest(parsedLinkFilters.flags.hrefFilter === "groups", "parser handles links href-filter flag");
  assertSelfTest(parsedLinkFilters.flags.visible === true, "parser handles visible flag");
  const parsedSelectorWait = parseArgv(["wait", "--selector", "main", "--visible", "--timeout", "1500"]);
  assertSelfTest(parsedSelectorWait.flags.selector === "main", "parser handles selector wait flag");
  assertSelfTest(parsedSelectorWait.flags.visible === true, "parser handles visible wait flag");
  const parsedAnonymousOpen = parseArgv(["open", "https://example.com", "--anonymous", "--select"]);
  assertSelfTest(parsedAnonymousOpen.flags.anonymous === true, "parser handles anonymous flag");
  assertSelfTest(parsedAnonymousOpen.flags.select === true, "parser handles anonymous select flag");
  const parsedSessionOpen = parseArgv(["open", "https://example.com", "--anonymous", "--session", "work-anon"]);
  assertSelfTest(parsedSessionOpen.flags.session === "work-anon", "parser handles session flag");
  const parsedHandle = parseArgv(["screenshot", "out.png", "--handle", "app", "--handle-out", "tmp/next.json", "--viewport", "390x844"]);
  assertSelfTest(parsedHandle.flags.handle === "app", "parser handles handle flag");
  assertSelfTest(parsedHandle.flags.handleOut === "tmp/next.json", "parser handles handle output flag");
  assertSelfTest(parsedHandle.flags.viewport === "390x844", "parser handles viewport flag");
  const parsedFullScreenshot = parseArgv(["full-screenshot", "out.png", "--viewport", "390x844", "--selector", ".scroll-panel"]);
  assertSelfTest(parsedFullScreenshot.command === "full-screenshot", "parser handles full-screenshot command");
  assertSelfTest(parsedFullScreenshot.flags.viewport === "390x844", "parser handles full-screenshot viewport flag");
  assertSelfTest(parsedFullScreenshot.flags.selector === ".scroll-panel", "parser handles full-screenshot selector flag");
  const parsedAreaScreenshot = parseArgv(["area-screenshot", "out.png", "--selector", "main"]);
  assertSelfTest(parsedAreaScreenshot.command === "area-screenshot", "parser handles area-screenshot command");
  assertSelfTest(parsedAreaScreenshot.flags.selector === "main", "parser handles area-screenshot selector flag");
  assertSelfTest(handleAwareCommands().has("full-screenshot"), "full-screenshot can consume handles");
  assertSelfTest(handleAwareCommands().has("area-screenshot"), "area-screenshot can consume handles");
  assertSelfTest(handlePathFromValue("app").endsWith(path.join(".realbrowser", "handles", "app.json")), "handle names map to handle directory");
  const customHandleStateFile = path.resolve(os.tmpdir(), "realbrowser-custom-state.json");
  assertSelfTest(
    stateFileFromHandle({ path: "handle", session: "named", stateFile: customHandleStateFile, pageId: 7 }) === customHandleStateFile,
    "handles prefer their recorded state file over a session label",
  );
  const handleTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "realbrowser-handle-self-test-"));
  try {
    const selfTestHandlePath = path.join(handleTempDir, "handle.json");
    const selfTestStateFile = path.join(handleTempDir, "state.json");
    const selfTestState = { session: "self-test" };
    const selfTestPage = { id: 1, url: "https://example.com/" };
    await writePageHandle({
      state: selfTestState,
      flags: { stateFile: selfTestStateFile },
      page: selfTestPage,
      handlePath: selfTestHandlePath,
    });
    await assertSelfTestRejects(
      () => writePageHandle({
        state: selfTestState,
        flags: { stateFile: selfTestStateFile },
        page: selfTestPage,
        handlePath: selfTestHandlePath,
      }),
      "handle writes do not silently overwrite existing handle files",
    );
    await writePageHandle({
      state: selfTestState,
      flags: { stateFile: selfTestStateFile, force: true },
      page: { ...selfTestPage, id: 2 },
      handlePath: selfTestHandlePath,
    });
    assertSelfTest(readJsonSync(selfTestHandlePath)?.pageId === 2, "handle writes allow explicit force replacement");
    await writePageHandle({
      state: selfTestState,
      flags: { stateFile: selfTestStateFile },
      page: { ...selfTestPage, id: 3 },
      handlePath: selfTestHandlePath,
      overwrite: true,
    });
    assertSelfTest(readJsonSync(selfTestHandlePath)?.pageId === 3, "handle writes allow explicit stale-claim replacement");
  } finally {
    fs.rmSync(handleTempDir, { recursive: true, force: true });
  }
  const previousRealbrowserSession = process.env.REALBROWSER_SESSION;
  delete process.env.REALBROWSER_SESSION;
  assertSelfTest(
    effectiveSessionNameFromFlags({ stateFile: customHandleStateFile }) === "",
    "explicit state files do not inherit the active session name",
  );
  if (previousRealbrowserSession === undefined) {
    delete process.env.REALBROWSER_SESSION;
  } else {
    process.env.REALBROWSER_SESSION = previousRealbrowserSession;
  }
  assertSelfTest(parseViewportSize("390x844").width === 390, "viewport parser reads width");
  assertSelfTest(parseViewportSize("390x844").height === 844, "viewport parser reads height");
  const parsedDeviceScreenshots = parseArgv([
    "device-screenshots",
    "https://example.com/app",
    "tmp/app",
    "--devices",
    "desktop:1440x900,phone:390x844",
    "--settle-ms",
    "250",
    "--mobile-emulation",
    "--target-id",
    "ABC",
  ]);
  assertSelfTest(parsedDeviceScreenshots.command === "device-screenshots", "parser handles device-screenshots command");
  assertSelfTest(parsedDeviceScreenshots.flags.devices === "desktop:1440x900,phone:390x844", "parser handles device screenshot devices flag");
  assertSelfTest(parsedDeviceScreenshots.flags.settleMs === "250", "parser handles device screenshot settle-ms flag");
  assertSelfTest(parsedDeviceScreenshots.flags.mobileEmulation === true, "parser handles device screenshot mobile-emulation flag");
  assertSelfTest(parsedDeviceScreenshots.flags.targetId === "ABC", "parser handles target-id flag");
  const parsedDeviceViewportsAlias = parseArgv(["responsive-exact", "tmp/app", "--viewports=desktop=1440x900;mobile=390x844"]);
  assertSelfTest(parsedDeviceViewportsAlias.flags.devices === "desktop=1440x900;mobile=390x844", "parser handles device screenshot viewports alias");
  const deviceViewports = parseDeviceScreenshotViewports("Desktop:1440x900,phone=390x844");
  assertSelfTest(deviceViewports[0].name === "desktop" && deviceViewports[0].width === 1440, "device viewport parser handles named colon specs");
  assertSelfTest(deviceViewports[1].name === "phone" && deviceViewports[1].height === 844, "device viewport parser handles named equals specs");
  assertSelfTest(deviceScreenshotMobileMode(deviceViewports[1], { mobileEmulation: true }) === true, "mobile-emulation applies to phone-like device names");
  assertSelfTest(deviceScreenshotMobileMode(deviceViewports[0], { mobileEmulation: true }) === false, "mobile-emulation does not apply to desktop-like device names");
  assertSelfTest(deviceScreenshotMobileMode(deviceViewports[0], { mobile: true }) === true, "mobile flag forces device mobile mode");
  assertSelfTest(resolveDeviceScreenshotsTarget(["https://example.com/app", "tmp/app"]).targetUrl === "https://example.com/app", "device screenshots target parser accepts explicit URL");
  assertSelfTest(resolveDeviceScreenshotsTarget(["tmp/app"]).prefix.endsWith(path.join("tmp", "app")), "device screenshots target parser accepts prefix-only mode");
  assertSelfTest(handleAwareCommands().has("responsive-exact"), "device screenshot aliases can consume handles");
  assertSelfTest(
    profileDirForMode(DEDICATED_MODE, { session: "codex-a" }) !== profileDirForMode(DEDICATED_MODE, { session: "codex-b" }),
    "named dedicated sessions use isolated managed profiles",
  );
  assertSelfTest(shouldReuseExistingRealProfileSession({}) === true, "plain real-profile commands can reuse an existing attach");
  assertSelfTest(shouldReuseExistingRealProfileSession({ session: "codex-a" }) === true, "new auto sessions can reuse an existing real-profile attach");
  assertSelfTest(shouldReuseExistingRealProfileSession({ noFallback: true }) === true, "no-fallback real-profile commands can reuse an existing attach");
  const previousRealbrowserMode = process.env.REALBROWSER_MODE;
  process.env.REALBROWSER_MODE = AUTO_MODE;
  assertSelfTest(shouldReuseExistingRealProfileSession({}) === true, "explicit auto mode can reuse an existing attach");
  if (previousRealbrowserMode === undefined) {
    delete process.env.REALBROWSER_MODE;
  } else {
    process.env.REALBROWSER_MODE = previousRealbrowserMode;
  }
  assertSelfTest(shouldReuseExistingRealProfileSession({ dedicated: true }) === false, "dedicated sessions do not auto-route");
  assertSelfTest(shouldReuseExistingRealProfileSession({ profile: "chrome:Default" }) === false, "profile-targeted commands do not auto-route");
  const parsedNoActive = parseArgv(["observe", "--no-active-session"]);
  assertSelfTest(parsedNoActive.flags.noActiveSession === true, "parser handles no-active-session flag");
  const parsedNoActivate = parseArgv(["select-tab", "app.example.com", "--no-activate-session"]);
  assertSelfTest(parsedNoActivate.flags.activateSession === false, "parser handles no-activate-session flag");
  const parsedForceSession = parseArgv(["use-session", "work-anon", "--force"]);
  assertSelfTest(parsedForceSession.flags.force === true, "parser handles force flag");
  assertSelfTest(path.basename(sessionStateFile("work anon")) === "work%20anon.json", "session names map to encoded state files");
  assertSelfTest(autoSessionNameForBrowserTab({ browserUrl: "http://127.0.0.1:9222" }) === "cdp-127-0-0-1-9222", "CDP endpoints map to stable automatic session names");
  assertSelfTest(
    shouldUseRealProfileAttachLock({ browserUrl: "http://127.0.0.1:9222" }) === true,
    "explicit browser endpoints use the real-profile attach lock",
  );
  const endpointScopedFlags = { browserUrl: "http://127.0.0.1:9222" };
  applyEndpointScopedRealProfileSession(endpointScopedFlags);
  assertSelfTest(
    endpointScopedFlags.session === "cdp-127-0-0-1-9222",
    "explicit browser endpoints map to endpoint-scoped sessions",
  );
  const explicitSessionEndpointFlags = {
    browserUrl: "http://127.0.0.1:9222",
    session: "manual",
  };
  applyEndpointScopedRealProfileSession(explicitSessionEndpointFlags);
  assertSelfTest(
    explicitSessionEndpointFlags.session === "manual",
    "endpoint-scoped sessions respect explicit sessions",
  );
  const restartEndpointFlags = { browserUrl: "http://127.0.0.1:9222", restartDaemon: true };
  await prepareRealProfileSessionFlags(restartEndpointFlags);
  assertSelfTest(
    restartEndpointFlags.session === "cdp-127-0-0-1-9222",
    "endpoint-scoped sessions are still selected when explicitly restarting the daemon",
  );
  const inheritedRestartFlags = { restartDaemon: true };
  applyRestartDaemonInheritance(inheritedRestartFlags, {
    modeKey: JSON.stringify({
      mode: AUTO_MODE,
      browserUrl: "http://127.0.0.1:9222",
      noFallback: true,
    }),
  });
  assertSelfTest(
    inheritedRestartFlags.browserUrl === "http://127.0.0.1:9222" && inheritedRestartFlags.noFallback === true,
    "daemon restart preserves the previous browser endpoint when no new target is specified",
  );
  const dedupedBrowserTabs = dedupeBrowserTabs([
    {
      id: "1:abc",
      browserUrl: "http://127.0.0.1:9222",
      url: "https://example.com/",
    },
    {
      id: "cdp-127-0-0-1-9222:3",
      source: "session",
      sessionName: "cdp-127-0-0-1-9222",
      endpointHttpUrl: "http://127.0.0.1:9222",
      browserUrl: "session:cdp-127-0-0-1-9222",
      url: "https://example.com/",
    },
  ]);
  assertSelfTest(
    dedupedBrowserTabs.length === 1 && dedupedBrowserTabs[0].source === "session",
    "browser tab discovery prefers existing endpoint sessions over duplicate CDP rows",
  );
  const mockTabSearchProfiles = [
    {
      id: "chrome:Default",
      displayName: "Default",
      lastUsed: true,
      lastActive: true,
      activeRank: 0,
      devtoolsHttpUrl: "http://127.0.0.1:9222",
      devtoolsWsEndpoint: "ws://127.0.0.1:9222/devtools/browser/main",
    },
    {
      id: "chrome:Profile 4",
      displayName: "Work",
      lastUsed: false,
      lastActive: true,
      activeRank: 1,
      devtoolsHttpUrl: "http://127.0.0.1:9333",
      devtoolsWsEndpoint: "ws://127.0.0.1:9333/devtools/browser/work",
    },
  ];
  assertSelfTest(
    profilesForBrowserTabSearch(mockTabSearchProfiles, {}).length === 1 &&
      profilesForBrowserTabSearch(mockTabSearchProfiles, {})[0].id === "chrome:Default",
    "broad tab discovery limits fresh controller attach to one active endpoint",
  );
  assertSelfTest(
    profilesForBrowserTabSearch(mockTabSearchProfiles, { browserUrl: "http://127.0.0.1:9222" }).length === 0,
    "explicit tab endpoints do not also scan every profile endpoint",
  );
  const exactUrlPageCandidates = pageCandidatesForBrowserTab(
    [
      { id: 1, url: "https://social.example.com/" },
      { id: 2, url: "https://social.example.com/search/groups/?q=Example%20Group" },
    ],
    {
      targetId: "2",
      url: "https://social.example.com/search/groups/?q=Example%20Group",
    },
    "https://social.example.com/search/groups/?q=Example%20Group",
  );
  assertSelfTest(
    exactUrlPageCandidates.length === 1 && exactUrlPageCandidates[0].id === 2,
    "absolute URL tab selection does not fuzzy-match shorter parent URLs",
  );
  const parsedAllSessions = parseArgv(["find-tab", "app.example.com", "--all-sessions"]);
  assertSelfTest(parsedAllSessions.flags.allSessions === true, "parser handles all-sessions flag");
  const parsedNetworkCapture = parseArgv(["capture-network", "https://example.com", "--anonymous", "--duration", "15000", "--har", "example.har", "--reload"]);
  assertSelfTest(parsedNetworkCapture.command === "capture-network", "parser handles capture-network command");
  assertSelfTest(parsedNetworkCapture.flags.duration === "15000", "parser handles capture duration");
  assertSelfTest(parsedNetworkCapture.flags.har === "example.har", "parser handles HAR path");
  assertSelfTest(parsedNetworkCapture.flags.reload === true, "parser handles reload flag");
  const parsedNetworkGet = parseArgv(["network", "get", "12", "--request-file", "tmp/request.txt", "--response-file=tmp/response.txt", "--raw"]);
  assertSelfTest(parsedNetworkGet.command === "network", "parser handles network get command");
  assertSelfTest(parsedNetworkGet.args.join(" ") === "get 12", "parser preserves network get reqid");
  assertSelfTest(parsedNetworkGet.flags.requestFile === "tmp/request.txt", "parser handles network request-file flag");
  assertSelfTest(parsedNetworkGet.flags.responseFile === "tmp/response.txt", "parser handles network response-file flag");
  assertSelfTest(parsedNetworkGet.flags.raw === true, "parser handles raw network get output");
  const parsedConsoleCapture = parseArgv(["capture-console", "https://example.com", "--anonymous", "--duration", "3000", "--out", "console.json", "--errors"]);
  assertSelfTest(parsedConsoleCapture.command === "capture-console", "parser handles capture-console command");
  assertSelfTest(parsedConsoleCapture.flags.out === "console.json", "parser handles console capture output path");
  assertSelfTest(parsedConsoleCapture.flags.errors === true, "parser handles console capture errors flag");
  const parsedConsoleNoNetwork = parseArgv(["capture-console", "--no-network"]);
  assertSelfTest(parsedConsoleNoNetwork.flags.network === false, "parser handles console no-network flag");
  assertSelfTest(
    normalizeConsoleMessages({ text: "## Console messages\n<no console messages found>" }).length === 0,
    "empty console message placeholders are ignored",
  );
  assertSelfTest(desiredMode({ anonymous: true }) === ANONYMOUS_MODE, "anonymous flag selects anonymous mode");
  const mockProfiles = [
    { id: "chrome:Default", browserName: "Google Chrome", profileDirectory: "Default", displayName: "Person 1", email: "one@example.com", lastUsed: true, lastActive: true, activeRank: 0 },
    { id: "chrome:Profile 4", browserName: "Google Chrome", profileDirectory: "Profile 4", displayName: "Work", email: "work@example.com", lastUsed: false, lastActive: true, activeRank: 1 },
  ];
  assertSelfTest(selectBrowserProfile(mockProfiles, "chrome:Profile 4")?.displayName === "Work", "profile selection supports stable id");
  assertSelfTest(selectBrowserProfile(mockProfiles, "work@example.com")?.profileDirectory === "Profile 4", "profile selection supports account email");
  assertSelfTest(filterProfilesByActivity(mockProfiles, { active: true }).length === 2, "active profile filter uses Chrome activity hints");
  assertSelfTest(formatProfileActivity(mockProfiles[0]) === "last-used,active#1", "profile activity formatter marks last-used profile");
  assertSelfTest(
    canOpenProfileUrlViaEndpoint({ devtoolsScope: "browser", devtoolsHttpUrl: "http://127.0.0.1:9222", lastUsed: true }),
    "browser-level endpoint can open URL for Chrome last-used profile",
  );
  assertSelfTest(
    !canOpenProfileUrlViaEndpoint({ devtoolsScope: "browser", devtoolsHttpUrl: "http://127.0.0.1:9222", lastUsed: false }),
    "browser-level endpoint does not pretend to choose a non-last-used Chrome profile",
  );
  const macBackgroundLaunch = macBrowserProfileLaunchCommand(
    { source: { appName: "Google Chrome" } },
    ["--profile-directory=Default", "--new-tab", "https://example.com"],
    {},
  );
  assertSelfTest(
    macBackgroundLaunch[0] === "open" && macBackgroundLaunch[1][0] === "-g",
    "macOS profile launches default to background mode",
  );
  const macFrontLaunch = macBrowserProfileLaunchCommand(
    { source: { appName: "Google Chrome" } },
    ["--profile-directory=Default", "--new-tab", "https://example.com"],
    { front: true },
  );
  assertSelfTest(
    macFrontLaunch[0] === "open" && !macFrontLaunch[1].includes("-g"),
    "macOS profile launches honor --front",
  );
  const mockProfileEndpoint = endpointForBrowserProfile({
    id: "chrome:Default",
    browserName: "Google Chrome",
    profileDirectory: "Default",
    displayName: "Person 1",
    devtoolsHttpUrl: "http://127.0.0.1:9222",
    devtoolsWsEndpoint: "ws://127.0.0.1:9222/devtools/browser/mock",
  });
  assertSelfTest(
    mockProfileEndpoint?.httpUrl === "http://127.0.0.1:9222" &&
      mockProfileEndpoint.wsEndpoint === "ws://127.0.0.1:9222/devtools/browser/mock",
    "profile endpoint is normalized for running-session reuse",
  );
  const wsOnlyProfileEndpoint = endpointForBrowserProfile({
    id: "chrome:Default",
    browserName: "Google Chrome",
    profileDirectory: "Default",
    displayName: "Person 1",
    devtoolsWsEndpoint: "ws://127.0.0.1:9223/devtools/browser/mock",
  });
  assertSelfTest(
    wsOnlyProfileEndpoint?.httpUrl === "http://127.0.0.1:9223" &&
      wsOnlyProfileEndpoint.wsEndpoint === "ws://127.0.0.1:9223/devtools/browser/mock",
    "profile endpoint accepts direct WS metadata without separate HTTP metadata",
  );
  const wsOnlyDaemon = new BrowserDaemon(path.join(os.tmpdir(), "realbrowser-ws-only-self-test.json"));
  wsOnlyDaemon.browserUrl = "ws://127.0.0.1:9222/devtools/browser/mock";
  const wsOnlyEndpoint = wsOnlyDaemon.cdpEndpoint();
  assertSelfTest(
    wsOnlyEndpoint?.httpUrl === "http://127.0.0.1:9222" &&
      wsOnlyEndpoint.wsEndpoint === "ws://127.0.0.1:9222/devtools/browser/mock",
    "daemon CDP endpoint derives an HTTP discovery root from direct WS endpoints",
  );
  assertSelfTest(
    normalizeCdpWsEndpoint("ws://127.0.0.1:9222") === null &&
      buildMcpArgs({ browserUrl: "ws://127.0.0.1:9222" }).includes("--browserUrl=http://127.0.0.1:9222"),
    "bare WS roots are treated as HTTP discovery URLs instead of direct CDP websocket endpoints",
  );
  const browserWsMcpArgs = buildMcpArgs({ browserUrl: "ws://127.0.0.1:9222/devtools/browser/mock" });
  assertSelfTest(
    browserWsMcpArgs.includes("--wsEndpoint=ws://127.0.0.1:9222/devtools/browser/mock") &&
      !browserWsMcpArgs.includes("--browserUrl=http://127.0.0.1:9222"),
    "browser-level WS endpoints are handed to MCP as direct WebSocket endpoints",
  );
  assertSelfTest(
    browserEndpointEquivalent(
      "ws://127.0.0.1:9222/devtools/browser/mock",
      "http://127.0.0.1:9222",
    ),
    "endpoint session reuse treats matching CDP HTTP and WS endpoints as equivalent",
  );
  assertSelfTest(
    sessionMatchesBrowserEndpoint(
      {
        mode: "browserUrl",
        state: { modeKey: JSON.stringify({ browserUrl: "ws://127.0.0.1:9222/devtools/browser/approved" }) },
      },
      { httpUrl: "http://127.0.0.1:9222", wsEndpoint: "ws://127.0.0.1:9222/devtools/browser/current" },
    ),
    "endpoint session reuse matches arbitrary approved session names by CDP endpoint",
  );
  const openedCandidate = openedPageCandidate(
    [{ id: 1, url: "https://example.com/old" }],
    [
      { id: 1, url: "https://example.com/old" },
      { id: 2, url: "https://example.com/new/" },
    ],
    "https://example.com/new",
  );
  assertSelfTest(
    openedCandidate?.id === 2,
    "opened page candidate tolerates trailing slash canonicalization",
  );
  const parsedDismissDetach = parseArgv(["detach", "--dismiss-banner"]);
  assertSelfTest(parsedDismissDetach.flags.dismissBanner === true, "parser handles dismiss banner flag");
  const parsedNoDismissDetach = parseArgv(["detach", "--no-dismiss-banner"]);
  assertSelfTest(parsedNoDismissDetach.flags.dismissBanner === false, "parser handles no-dismiss banner flag");
  const parsedAllowAttach = parseArgv(["cleanup-remote-debugging", "--allow-attach"]);
  assertSelfTest(parsedAllowAttach.flags.allowAttach === true, "parser handles cleanup allow attach flag");
  const parsedAllowProfileReattach = parseArgv(["tabs", "--restart-daemon", "--allow-profile-reattach"]);
  assertSelfTest(parsedAllowProfileReattach.flags.allowProfileReattach === true, "parser handles profile reattach consent flag");
  assertSelfTest(
    allowsProfileControllerStart({}) === false,
    "real-profile MCP controller start is not allowed without an approved signal",
  );
  assertSelfTest(
    allowsProfileControllerStart({}, { browserUrl: "http://127.0.0.1:9222" }) === true,
    "real-profile MCP controller start is allowed for an explicit DevTools endpoint",
  );
  assertSelfTest(
    allowsProfileControllerStart({}, { chromeRemoteDebugging: { known: true, userEnabled: true } }) === true,
    "real-profile MCP controller start is allowed when Chrome remote debugging is already enabled",
  );
  assertSelfTest(
    allowsProfileControllerStart({ reusedRealProfileSession: "cdp-127-0-0-1-9222" }) === true,
    "real-profile MCP controller start is allowed for a reused approved endpoint session",
  );
  const parsedFullStdout = parseArgv(["html", "--full-stdout", "--max-chars", "100000"]);
  assertSelfTest(parsedFullStdout.flags.fullStdout === true, "parser handles full stdout flag");
  const parsedNoAutoOut = parseArgv(["html", "--no-auto-out"]);
  assertSelfTest(parsedNoAutoOut.flags.autoOut === false, "parser handles no-auto-out flag");
  const parsedRestartDaemon = parseArgv(["tabs", "--restart-daemon"]);
  assertSelfTest(parsedRestartDaemon.flags.restartDaemon === true, "parser handles daemon restart flag");
  const realProfileState = {
    pid: process.pid,
    session: "real",
    stateFile: stateFileForSessionName("real"),
    modeKey: JSON.stringify({ mode: AUTO_MODE, browserUrl: "http://127.0.0.1:9222" }),
  };
  assertSelfTestThrows(
    () => assertRealProfileRestartAllowed(realProfileState, { restartDaemon: true }),
    "real-profile restart requires explicit reattach consent",
  );
  assertRealProfileRestartAllowed(realProfileState, { restartDaemon: true, allowProfileReattach: true });
  assertRealProfileRestartAllowed(
    { pid: process.pid, modeKey: JSON.stringify({ mode: DEDICATED_MODE, browserUrl: "" }) },
    { restartDaemon: true },
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "wait", args: [], flags: { selector: "main", visible: true } }).has("visible-wait"),
    "daemon capability check covers visible selector waits",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "wait-ready", args: [] }).has("foreground-readiness"),
    "daemon capability check covers wait-ready",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "open", args: [], flags: { foregroundUntilReady: true } }).has("foreground-readiness"),
    "daemon capability check covers foreground readiness opens",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "device-screenshots", args: [] }).has("device-screenshots"),
    "daemon capability check covers device screenshots",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "full-screenshot", args: [] }).has("full-screenshot"),
    "daemon capability check covers full screenshots",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "area-screenshot", args: [] }).has("area-screenshot"),
    "daemon capability check covers area screenshots",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "snapshot-dom", args: [] }).has("snapshot-dom"),
    "daemon capability check covers DOM snapshots",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "snapshot-aria", args: [] }).has("snapshot-aria"),
    "daemon capability check covers AX snapshots",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "snapshot", args: [], flags: { selector: "main" } }).has("snapshot-selector"),
    "daemon capability check covers scoped snapshots",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "query-selector", args: ["main"] }).has("query-selector"),
    "daemon capability check covers selector queries",
  );
  assertSelfTest(isDeviceScreenshotsCommand("responsive-exact") === true, "device screenshot aliases share the compatibility path");
  assertSelfTest(
    isMissingDaemonCapabilityError(new Error("does not support device-screenshots needed by device-screenshots"), "device-screenshots") === true,
    "missing capability detection recognizes device screenshots",
  );
  const staleRoutineState = {
    pid: process.pid,
    session: "default",
    stateFile: stateFileForSessionName("default"),
    scriptHash: "old-script",
    modeKey: JSON.stringify({ mode: AUTO_MODE, browserUrl: "" }),
  };
  assertSelfTest(isCurrentCliDaemon(staleRoutineState) === false, "daemon freshness detects stale script hashes");
  assertSelfTest(isRoutineRealProfileCommand("console") === true, "routine real-profile command detection covers console reads");
  assertSelfTest(isRoutineRealProfileCommand("observe") === true, "routine real-profile command detection covers observe reads");
  assertSelfTest(isRoutineRealProfileCommand("device-screenshots") === true, "routine real-profile command detection covers device screenshots");
  assertSelfTest(isRoutineRealProfileCommand("cleanup-remote-debugging") === false, "routine real-profile command detection excludes cleanup");
  assertSelfTest(
    canRouteStaleRealProfileRoutineCommand(
      staleRoutineState,
      { command: "console", args: [], flags: {} },
      {},
      { chromeRemoteDebugging: { known: true, userEnabled: true } },
    ) === true,
    "stale real-profile routine commands can route through a temporary current daemon when Chrome remote debugging is enabled",
  );
  assertSelfTest(
    canRouteStaleRealProfileRoutineCommand(
      staleRoutineState,
      { command: "console", args: [], flags: {} },
      {},
      { chromeRemoteDebugging: { known: true, userEnabled: false } },
    ) === false,
    "stale real-profile routine routing still requires an approved attach signal",
  );
  assertSelfTest(
    canRouteStaleRealProfileRoutineCommand(
      {
        ...staleRoutineState,
        scriptHash: SCRIPT_HASH,
        __health: { scriptHash: SCRIPT_HASH },
      },
      { command: "console", args: [], flags: {} },
      {},
      { chromeRemoteDebugging: { known: true, userEnabled: true } },
    ) === false,
    "current daemons keep the normal command path",
  );
  assertSelfTest(
    canRouteStaleRealProfileRoutineCommand(
      staleRoutineState,
      { command: "cleanup-remote-debugging", args: [], flags: {} },
      {},
      { chromeRemoteDebugging: { known: true, userEnabled: true } },
    ) === false,
    "stale daemon routing does not cover cleanup commands",
  );
  assertSelfTest(
    isMissingRequiredCapabilityError(
      new Error("does not support device-screenshots needed by device-screenshots"),
      { command: "device-screenshots", args: [] },
    ) === true,
    "routine endpoint routing can fall back on missing required capabilities",
  );
  assertSelfTest(
    preferSingleMcpControllerFlags("tabs", [], {}, { mode: "browserUrl", hasBrowserEndpoint: true }).mcp !== true,
    "real-profile endpoint tabs keep the persistent CDP controller",
  );
  assertSelfTest(
    preferSingleMcpControllerFlags("console", [], {}, { mode: "browserUrl", hasBrowserEndpoint: true }).mcp !== true,
    "real-profile endpoint console reads keep the persistent CDP controller",
  );
  assertSelfTest(
    preferSingleMcpControllerFlags("snapshot-dom", [], {}, { mode: "browserUrl", hasBrowserEndpoint: true }).mcp !== true,
    "CDP-only DOM snapshots do not force the MCP controller",
  );
  assertSelfTest(
    preferSingleMcpControllerFlags("click", ["e1"], {}, { mode: "browserUrl", hasBrowserEndpoint: true }).mcp !== true,
    "CDP role-ref actions keep the direct CDP path",
  );
  assertSelfTest(
    shouldDiscoverTabsThroughEndpointSession({ httpUrl: "http://127.0.0.1:9222" }, {}) === true,
    "tab discovery prefers the stable endpoint session before direct CDP probes",
  );
  const freshEndpointFlags = {
    browserUrl: "http://127.0.0.1:9222",
    noFallback: true,
    noActiveSession: true,
    session: "cdp-127-0-0-1-9222",
  };
  assertSelfTest(
    stateFileFromFlags(freshEndpointFlags) === stateFileForSessionName("cdp-127-0-0-1-9222"),
    "fresh endpoint routine fallback uses the stable endpoint session file",
  );
  assertSelfTest(
    stateFileFromFlags({
      ...freshEndpointFlags,
      stateFile: path.join(os.tmpdir(), "realbrowser-routine-self-test.json"),
    }) !== stateFileForSessionName("cdp-127-0-0-1-9222"),
    "temporary routine state files stay distinguishable from endpoint sessions",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "js", args: ["document.body.innerText"], flags: { raw: true } }).has("bounded-raw-output"),
    "daemon capability check covers bounded raw eval output",
  );
  assertSelfTestThrows(
    () => assertDaemonSupportsPayload({ pid: 1, session: "old" }, { command: "snapshot-dom", args: [] }),
    "daemon capability check rejects unsupported old-daemon commands",
  );
  let realProfileCapabilityError = "";
  try {
    assertDaemonSupportsPayload(realProfileState, { command: "snapshot-dom", args: [] });
  } catch (error) {
    realProfileCapabilityError = error instanceof Error ? error.message : String(error);
  }
  assertSelfTest(
    realProfileCapabilityError.includes("--allow-profile-reattach"),
    "real-profile capability error does not casually suggest restart",
  );
  const restartGuardDaemon = new BrowserDaemon(path.join(os.tmpdir(), "realbrowser-self-test-restart.json"));
  restartGuardDaemon.browserUrl = "http://127.0.0.1:9222";
  await assertSelfTestRejects(
    () => restartGuardDaemon.restart({}),
    "real-profile MCP restart requires explicit reattach consent",
  );
  const backgroundPayload = daemonPayloadForCommand(parsedBackgroundOpen.command, parsedBackgroundOpen.args, parsedBackgroundOpen.flags);
  assertSelfTest(backgroundPayload.command === "open", "open is handled by the daemon hot path");
  assertSelfTest(backgroundPayload.args[0] === "https://example.com", "open payload preserves URL");
  const selectPayload = daemonPayloadForCommand(parsedSelectOpen.command, parsedSelectOpen.args, parsedSelectOpen.flags);
  assertSelfTest(selectPayload.command === "open" && selectPayload.flags.select === true, "open --select stays daemon-owned");
  const foregroundPayload = daemonPayloadForCommand(parsedForegroundOpen.command, parsedForegroundOpen.args, parsedForegroundOpen.flags);
  assertSelfTest(foregroundPayload.command === "open" && foregroundPayload.flags.front === true, "open --front stays daemon-owned");
  const foregroundReadyPayload = daemonPayloadForCommand(parsedForegroundReadyOpen.command, parsedForegroundReadyOpen.args, parsedForegroundReadyOpen.flags);
  assertSelfTest(
    foregroundReadyPayload.command === "open" && foregroundReadyPayload.flags.foregroundUntilReady === true,
    "open --foreground-until-ready stays daemon-owned",
  );
  const anonymousPayload = daemonPayloadForCommand(parsedAnonymousOpen.command, parsedAnonymousOpen.args, parsedAnonymousOpen.flags);
  assertSelfTest(anonymousPayload.command === "open", "anonymous open is handled by daemon to preserve incognito context");
  const anonymousFollowupPayload = daemonPayloadForCommand(
    parsedBackgroundOpen.command,
    parsedBackgroundOpen.args,
    parsedBackgroundOpen.flags,
    { modeKey: JSON.stringify({ mode: ANONYMOUS_MODE }) },
  );
  assertSelfTest(anonymousFollowupPayload.command === "open", "open reuses daemon handling when state is anonymous");
  const chainPayload = daemonPayloadForCommand("chain", ['[["open","https://example.com"],["snapshot","--efficient"]]'], {});
  const translatedChain = JSON.parse(chainPayload.args[0]);
  assertSelfTest(translatedChain[0][0] === "open", "chain open stays daemon-owned");
  assertSelfTest(translatedChain[1][0] === "snapshot", "chain translation preserves other commands");
  assertSelfTest(buildEvalFunction("() => 1") === "() => 1", "buildEvalFunction preserves direct arrow functions");
  assertSelfTest(
    buildEvalFunction("(() => 1)()").startsWith("async () => ("),
    "buildEvalFunction wraps invoked arrow expressions",
  );

  const parsedScreenshotLimits = parseArgv(["screenshot", "--max-side", "2000", "--max-bytes=5mb", "--raw-size"]);
  assertSelfTest(parsedScreenshotLimits.flags.maxSide === "2000", "parser handles screenshot max-side");
  assertSelfTest(parsedScreenshotLimits.flags.maxBytes === "5mb", "parser handles screenshot max-bytes");
  assertSelfTest(parsedScreenshotLimits.flags.rawSize === true, "parser handles screenshot raw-size");
  assertSelfTest(parseByteSize("5mb", "max-bytes") === 5 * 1024 * 1024, "parseByteSize handles mb suffix");
  const sampleDevice = { name: "mobile", requested: "390x844", width: 390, height: 844 };
  const samplePng = { pixelWidth: 390, pixelHeight: 844 };
  assertDeviceScreenshotDimensions(sampleDevice, samplePng, {});
  assertSelfTestThrows(
    () => assertDeviceScreenshotDimensions(sampleDevice, { pixelWidth: 391, pixelHeight: 844 }, {}),
    "device screenshot dimensions reject mismatches",
  );
  const deviceResult = deviceScreenshotCaptureResult({
    device: sampleDevice,
    outputPath: "tmp/mobile.png",
    ready: { metrics: { innerWidth: 390 }, ready: { ready: true } },
    png: samplePng,
    mobile: true,
    extra: { cdp: true },
  });
  assertSelfTest(
    deviceResult.name === "mobile" &&
      deviceResult.metrics.innerWidth === 390 &&
      deviceResult.ready.ready === true &&
      deviceResult.cdp === true,
    "device screenshot result helper preserves result shape",
  );

  const parsedLiteralFlag = parseArgv(["type", "--", "--raw", "literal text"]);
  assertSelfTest(parsedLiteralFlag.command === "type", "parser handles command before -- sentinel");
  assertSelfTest(parsedLiteralFlag.args.join(" ") === "--raw literal text", "parser preserves literal flag-like arguments after --");
  assertSelfTest(parsedLiteralFlag.flags.raw !== true, "parser does not parse flags after --");
  const parsedLiteralVersion = parseArgv(["type", "--", "--version"]);
  assertSelfTest(parsedLiteralVersion.command === "type", "parser does not treat literal --version as global version");
  assertSelfTest(parsedLiteralVersion.args[0] === "--version", "parser preserves literal --version after --");

  const parsedJson = parseArgv(["chain", '[["type","hello world"],["press","Enter"]]']);
  assertSelfTest(parsedJson.args[0].includes("hello world"), "parser preserves JSON arguments with spaces");
  const parsedPrefixedClaimHelp = parseArgv(["--session", "work", "claim", "--help"]);
  assertSelfTest(parsedPrefixedClaimHelp.command === "claim" && parsedPrefixedClaimHelp.flags.help === true, "parser supports global flags before subcommand help");
  const parsedClaimHelp = parseArgv(["claim", "--help"]);
  assertSelfTest(parsedClaimHelp.command === "claim" && parsedClaimHelp.flags.help === true, "parser supports subcommand help flags");
  const parsedMalformedClaimHelp = parseArgv(["claim", "--session", "--help"]);
  assertSelfTest(parsedMalformedClaimHelp.command === "claim" && parsedMalformedClaimHelp.flags.help === true, "help stays side-effect-free after malformed flags");
  const parsedHelpCommand = parseArgv(["help", "claim"]);
  assertSelfTest(parsedHelpCommand.command === "help" && parsedHelpCommand.args[0] === "claim", "parser supports help subcommand");
  const parsedHelpVersion = parseArgv(["help", "version"]);
  assertSelfTest(parsedHelpVersion.command === "help" && parsedHelpVersion.args[0] === "version", "parser supports help for version");
  const parsedVersion = parseArgv(["--version"]);
  assertSelfTest(parsedVersion.flags.version === true, "parser supports version flag");
  assertSelfTestThrows(() => parseArgv(["claim", "--accept"]), "command-owned argument tokens fail on unrelated commands");
  assertSelfTestThrows(() => parseArgv(["claim", "--hanlde", "app"]), "unknown flags fail before daemon startup");
  assertSelfTestThrows(() => parseArgv(["claim", "--session"]), "missing flag values fail before daemon startup");
  const parsedWaitNetworkIdle = parseArgv(["wait", "--networkidle"]);
  assertSelfTest(parsedWaitNetworkIdle.args[0] === "--networkidle", "parser preserves wait readiness tokens");
  assertSelfTest(waitForTextFunction("Example Group", 1000).includes("Example Group"), "wait text uses page-local polling function");
  new Function(`return (${waitForTextFunction("Example Group", 1000)})`);
  const parsedSnapshotDom = parseArgv(["snapshot-dom", "--max-text-chars", "180"]);
  assertSelfTest(parsedSnapshotDom.command === "snapshot-dom" && parsedSnapshotDom.flags.maxTextChars === "180", "parser handles DOM snapshot text budget");
  const parsedSnapshotAria = parseArgv(["snapshot-aria", "--limit", "180"]);
  assertSelfTest(parsedSnapshotAria.command === "snapshot-aria" && parsedSnapshotAria.flags.limit === "180", "parser handles AX snapshot limit");
  const parsedQuerySelector = parseArgv(["query-selector", "main", "--max-html-chars", "1200"]);
  assertSelfTest(parsedQuerySelector.command === "query-selector" && parsedQuerySelector.flags.maxHtmlChars === "1200", "parser handles selector query HTML budget");
  const parsedDialogAccept = parseArgv(["dialog", "--accept", "ok"]);
  assertSelfTest(parsedDialogAccept.args.join(" ") === "--accept ok", "parser preserves dialog action tokens");
  const parsedEmulateNetwork = parseArgv(["emulate", "--network", "Offline"]);
  assertSelfTest(parsedEmulateNetwork.flags.network === "Offline", "parser supports emulate network values");
  assertSelfTestThrows(() => validateCommandArgs("click", []), "missing positional args fail before daemon startup");
  validateCommandArgs("click", ["uid-1"]);
  assertSelfTest(handleAwareCommands().has("goto"), "handle-aware command metadata includes aliases");
  assertSelfTest(handleAwareCommands().has("chain"), "chain can run against a pinned handle");
  assertSelfTest(!handleAwareCommands().has("select"), "page-selection commands do not implicitly consume handles");
  const mcpPagesForMapping = [
    { id: 1, url: "https://datafa.st/docs/google-search-console" },
    { id: 16, url: "https://chat.zalo.me/" },
    { id: 26, url: "https://www.bilibili.com/video/BV1bsYPztE4D/" },
  ];
  assertSelfTest(
    matchingMcpPagesForCdpPage(mcpPagesForMapping, { url: "https://chat.zalo.me/" })[0]?.id === 16,
    "CDP-to-MCP page mapping uses URL instead of assuming page-id namespaces match",
  );

  const autoControl = browserControlStatus({ running: true, mode: AUTO_MODE, mcpConnected: true });
  assertSelfTest(autoControl.chromeBannerExpectedNow === true, "browser control reports active Chrome banner");
  assertSelfTest(autoControl.canSafelySuppressBanner === false, "browser control does not suppress Chrome safety banner");
  assertSelfTest(autoControl.realSignedInProfileMayBeControlled === true, "auto mode reports real profile control risk");
  const dedicatedControl = browserControlStatus({ running: true, mode: DEDICATED_MODE, mcpConnected: false });
  assertSelfTest(dedicatedControl.mayAppearOnNextBrowserCommand === true, "warm daemon reports possible later banner");
  assertSelfTest(dedicatedControl.realSignedInProfileMayBeControlled === false, "dedicated mode does not report real profile control");
  assertSelfTest(
    modeFromState({ modeKey: JSON.stringify({ mode: DEDICATED_MODE, browserUrl: "" }) }) === DEDICATED_MODE,
    "modeFromState reads dedicated mode",
  );
  assertSelfTest(
    modeFromState({ modeKey: JSON.stringify({ mode: AUTO_MODE, browserUrl: "http://127.0.0.1:9222" }) }) === "browserUrl",
    "modeFromState detects browserUrl mode",
  );
  assertSelfTest(
    noFallbackFromState({ modeKey: JSON.stringify({ mode: AUTO_MODE, noFallback: true }) }) === true,
    "noFallbackFromState reads disabled fallback",
  );
  assertSelfTest(
    shouldReplaceExistingDaemon(
      { modeKey: JSON.stringify({ mode: AUTO_MODE, browserUrl: "http://127.0.0.1:9222" }) },
      modeKey({ noFallback: true }),
      { noFallback: true },
      true,
    ) === false,
    "no-fallback does not restart an existing real-profile attach",
  );
  assertSelfTest(
    shouldReplaceExistingDaemon(
      { modeKey: JSON.stringify({ mode: DEDICATED_MODE, browserUrl: "" }) },
      modeKey({ noFallback: true }),
      { noFallback: true },
      true,
    ) === true,
    "no-fallback can replace a dedicated fallback session",
  );
  assertSelfTest(
    shouldAttemptBannerDismissal({ flags: {}, mode: AUTO_MODE }) === false,
    "plain detach does not dismiss browser UI by default",
  );
  assertSelfTest(
    shouldAttemptBannerDismissal({ flags: { dismissBanner: true }, mode: AUTO_MODE }) === true,
    "explicit banner dismissal works independently of daemon health",
  );
  assertSelfTest(
    shouldAttemptBannerDismissal({ flags: { dismissBanner: true }, mode: DEDICATED_MODE }) === false,
    "banner dismissal is skipped for dedicated mode",
  );
  const detachedControl = browserControlStatus({ running: false, mode: AUTO_MODE, mcpConnected: null });
  assertSelfTest(detachedControl.realSignedInProfileMayBeControlled === false, "detached status reports no realbrowser control");
  assertSelfTest(
    detachedControl.reason.includes("No running realbrowser daemon"),
    "detached status reports realbrowser daemon absence",
  );
  const cleanupText = formatRemoteDebuggingCleanupText(
    { text: "cleanup done" },
    { known: true, userEnabled: true },
    { known: true, userEnabled: false },
    { mode: AUTO_MODE },
  );
  assertSelfTest(
    cleanupText.includes("Default local Chrome remote-debugging setting: no"),
    "cleanup status reports disabled setting",
  );
  const parsedPages = parseListPagesResult({
    text: "## Pages\n1: about:blank\n2: chrome://inspect/#remote-debugging [selected]",
  });
  assertSelfTest(parsedPages[1]?.url.startsWith("chrome://inspect/"), "list_pages text parser keeps inspect urls");
  const cdpPagesResult = formatCdpPagesResult([
    {
      id: 1,
      tabId: "t1",
      suggestedTargetId: "t1",
      targetId: "ABC",
      title: "Example",
      url: "https://example.com/",
      selected: true,
    },
  ]);
  const parsedCdpPages = parseListPagesResult(cdpPagesResult);
  assertSelfTest(
    parsedCdpPages[0]?.targetId === "ABC" && parsedCdpPages[0]?.tabId === "t1",
    "CDP tab structured output preserves short handles and raw target id",
  );
  const handledTabs = withBrowserTabHandles([
    { id: "raw-a", url: "https://a.example/" },
    { id: "raw-b", tabId: "local", url: "https://b.example/" },
  ]);
  assertSelfTest(
    handledTabs[0].suggestedTargetId === "t1" && handledTabs[1].suggestedTargetId === "t2",
    "browser tab lists get compact suggested targets",
  );
  console.log("self-test ok");
}

function assertSelfTest(condition, message) {
  if (!condition) {
    throw new Error(`self-test failed: ${message}`);
  }
}

function assertSelfTestThrows(fn, message) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`self-test failed: ${message}`);
}

async function assertSelfTestRejects(fn, message) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(`self-test failed: ${message}`);
}

runCli().catch((error) => {
  printCliError(error, outputFlagsFromArgv(process.argv.slice(2)));
  process.exitCode = error?.exitCode ?? 1;
});

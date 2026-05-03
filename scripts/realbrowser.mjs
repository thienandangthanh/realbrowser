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
const DEFAULT_DOWNLOAD_DIR = path.join(os.homedir(), ".realbrowser", "downloads");
const DEFAULT_DOWNLOAD_SOURCE_DIR = path.join(os.homedir(), "Downloads");
const DEFAULT_SCREENSHOT_MAX_SIDE = parseOptionalIntegerEnv("REALBROWSER_SCREENSHOT_MAX_SIDE", 2000);
const DEFAULT_SCREENSHOT_MAX_BYTES = parseOptionalBytesEnv("REALBROWSER_SCREENSHOT_MAX_BYTES", 5 * 1024 * 1024);
const START_TIMEOUT_MS = Number.parseInt(process.env.REALBROWSER_START_TIMEOUT_MS ?? "20000", 10);
const MCP_START_TIMEOUT_MS = Number.parseInt(process.env.REALBROWSER_MCP_TIMEOUT_MS ?? "30000", 10);
const PACKAGE_SPEC = process.env.REALBROWSER_MCP_PACKAGE ?? "chrome-devtools-mcp@latest";
const CLI_VERSION = "0.1.0";
const SCRIPT_HASH = crypto.createHash("sha256").update(fs.readFileSync(SCRIPT_PATH)).digest("hex").slice(0, 16);
const DAEMON_CAPABILITIES = Object.freeze([
  "bounded-raw-output",
  "chain-step-durations",
  "content-posts",
  "endpoint-session-manager",
  "filtered-links",
  "page-local-wait",
  "persistent-cdp-ws-target-list",
  "visible-wait",
  "visible-blocks",
]);
const AUTO_MODE = "auto";
const DEDICATED_MODE = "dedicated";
const ANONYMOUS_MODE = "anonymous";
const LABEL_OVERLAY_ATTR = "data-realbrowser-labels";
const DEFAULT_SNAPSHOT_MAX_CHARS = 8_000;
const DEFAULT_READ_MAX_CHARS = 12_000;
const DEFAULT_CHAIN_STEP_MAX_CHARS = 4_000;
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
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "treeitem",
]);

const CONTENT_ROLES = new Set([
  "heading",
  "img",
  "image",
  "paragraph",
  "text",
  "statictext",
  "listitem",
  "cell",
  "rowheader",
  "columnheader",
]);

const STRUCTURAL_ROLES = new Set([
  "generic",
  "none",
  "presentation",
  "document",
  "group",
  "section",
  "region",
  "main",
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
  "list",
  "table",
  "row",
]);

const CLI_COMMAND_GROUPS = [
  {
    title: "Daily workflow",
    commands: [
      { name: "status", usage: "realbrowser status [--deep] [--json]", summary: "Show current daemon and Chrome control state." },
      { name: "claim", aliases: ["claim-tab", "handle-claim"], usage: "realbrowser claim [url] [--handle-out <path>|--handle-name <name>] [--force] [--session <name>] [--json]", summary: "Claim a tab and write a reusable handle." },
      { name: "handles", aliases: ["list-handles", "handle-list"], usage: "realbrowser handles [--json]", summary: "List saved tab handles." },
      { name: "release-handle", aliases: ["handle-release", "delete-handle"], usage: "realbrowser release-handle <path-or-name> [--json]", summary: "Delete a saved tab handle.", minArgs: 1 },
      { name: "mobile-screenshot", usage: "realbrowser mobile-screenshot [url] [path] [--viewport <WxH>] [--handle <path-or-name>] [--handle-out <path>] [--force] [--session <name>]", summary: "Capture a page-scoped mobile screenshot with dimension checks.", handle: true },
      { name: "screenshot", usage: "realbrowser screenshot [path] [--full|--full-page] [--uid <uid>] [--labels|--annotate] [--format png|jpeg|webp] [--quality <0-100>] [--max-side <px>] [--max-bytes <bytes|5mb>] [--raw-size|--no-normalize] [--page <id>]", summary: "Capture a screenshot.", handle: true },
      { name: "observe", usage: "realbrowser observe [--screenshot] [--limit <n>] [--max-chars <n>] [--page <id>] [--json]", summary: "Read a compact page observation.", handle: true },
      { name: "snapshot", aliases: ["accessibility"], usage: "realbrowser snapshot [--page <id>] [--efficient] [--interactive] [--compact] [--depth <n>] [--max-chars <n>] [--max-nodes <n>] [--labels|--annotate] [--out <path>] [--raw|--verbose] [--json]", summary: "Read the accessibility tree.", handle: true },
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
      { name: "open-profile", aliases: ["profile-open"], usage: "realbrowser open-profile <profile-query> <url> [--browser <key>] [--select] [--no-fallback] [--timeout <ms>] [--front] [--json]", summary: "Open a URL in a specific browser UI profile.", minArgs: 2 },
      { name: "cleanup-remote-debugging", aliases: ["cleanup"], usage: "realbrowser cleanup-remote-debugging [--allow-attach] [--json]", summary: "Turn off Chrome remote-debugging when possible." },
      { name: "stop", aliases: ["detach"], usage: "realbrowser stop|detach [--all-sessions] [--dismiss-banner] [--cleanup-remote-debugging] [--json]", summary: "Stop realbrowser session state." },
    ],
  },
  {
    title: "Navigation and page actions",
    commands: [
      { name: "tabs", usage: "realbrowser tabs [--json]", summary: "List pages in the current session." },
      { name: "open", aliases: ["newtab"], usage: "realbrowser open <url> [--front] [--anonymous|--profile <profile-query>] [--browser <key>] [--select] [--no-fallback] [--timeout <ms>] [--json]", summary: "Open a URL.", handle: false, minArgs: 1 },
      { name: "navigate", aliases: ["goto"], usage: "realbrowser navigate <url> [--page <id>]", summary: "Navigate the selected page.", handle: true, minArgs: 1 },
      { name: "back", usage: "realbrowser back [--page <id>]", summary: "Navigate back.", handle: true },
      { name: "forward", usage: "realbrowser forward [--page <id>]", summary: "Navigate forward.", handle: true },
      { name: "reload", usage: "realbrowser reload [--page <id>]", summary: "Reload the page.", handle: true },
      { name: "select", usage: "realbrowser select <target>|<uid|selector> [value] [--page <id>] [--front]", summary: "Select a page/target or option.", minArgs: 1 },
      { name: "tab", usage: "realbrowser tab <target> [--front]", summary: "Select a page target.", minArgs: 1 },
      { name: "focus", usage: "realbrowser focus <target>", summary: "Bring a page target to front.", minArgs: 1 },
      { name: "close", aliases: ["closetab"], usage: "realbrowser close <target>", summary: "Close a page target.", handle: false, minArgs: 1 },
      { name: "click", usage: "realbrowser click <uid> [--page <id>]", summary: "Click an accessibility uid.", handle: true, minArgs: 1 },
      { name: "hover", usage: "realbrowser hover <uid> [--page <id>]", summary: "Hover an accessibility uid.", handle: true, minArgs: 1 },
      { name: "drag", usage: "realbrowser drag <fromUid> <toUid> [--page <id>]", summary: "Drag between accessibility uids.", handle: true, minArgs: 2 },
      { name: "type", usage: "realbrowser type <text> [--page <id>]", summary: "Type text.", handle: true, minArgs: 1 },
      { name: "fill", usage: "realbrowser fill <uid> <value> [--page <id>]", summary: "Fill one field.", handle: true, minArgs: 2 },
      { name: "fill-form", usage: "realbrowser fill-form '[{\"uid\":\"...\",\"value\":\"...\"}]' [--page <id>]", summary: "Fill several fields.", handle: true, minArgs: 1 },
      { name: "press", usage: "realbrowser press <key> [--page <id>]", summary: "Press a key.", handle: true, minArgs: 1 },
      { name: "click-coords", usage: "realbrowser click-coords <x> <y> [--page <id>]", summary: "Click screen coordinates.", handle: true, minArgs: 2 },
      { name: "highlight", usage: "realbrowser highlight <uid|selector> [--page <id>]", summary: "Highlight a target.", handle: true, minArgs: 1 },
      { name: "upload", usage: "realbrowser upload <uid> <file> [--page <id>]", summary: "Upload a file.", handle: true, minArgs: 2 },
      { name: "wait", usage: "realbrowser wait [<text>|--load|--domcontentloaded|--networkidle] [--visible] [--selector <css>] [--timeout <ms>] [--page <id>]", summary: "Wait for text, visible content, selector, or page readiness.", handle: true },
      { name: "scroll", usage: "realbrowser scroll [selector|uid] [--page <id>]", summary: "Scroll the page or target.", handle: true },
      { name: "viewport", aliases: ["resize"], usage: "realbrowser viewport <WxH|reset> [--page <id>]", summary: "Set or reset viewport size.", handle: true, minArgs: 1 },
    ],
  },
  {
    title: "Inspection and diagnostics",
    commands: [
      { name: "eval", aliases: ["js"], usage: "realbrowser eval <js> [--page <id>] [--max-chars <n>] [--out <path>] [--raw] [--json]", summary: "Run JavaScript in the page.", handle: true, minArgs: 1 },
      { name: "text", usage: "realbrowser text [selector|uid] [--page <id>] [--max-chars <n>] [--out <path>] [--raw]", summary: "Read text.", handle: true },
      { name: "blocks", aliases: ["visible-blocks"], usage: "realbrowser blocks [selector] [--page <id>] [--limit <n>] [--max-chars <n>] [--fallback-text] [--out <path>] [--raw]", summary: "Read compact visible text blocks.", handle: true },
      { name: "posts", aliases: ["feed", "content-blocks"], usage: "realbrowser posts [selector] [--page <id>] [--limit <n>] [--max-chars <n>] [--out <path>] [--json]", summary: "Read compact visible feed/content posts.", handle: true },
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
      { name: "chain", usage: "realbrowser chain '[[\"snapshot\",\"--page\",\"1\"],[\"console\",\"--errors\",\"--page\",\"1\"]]' [--return summary|final|all] [--trace <path>] [--json]", summary: "Run several realbrowser commands in one daemon RPC.", minArgs: 1 },
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
  "--select",
  "--front",
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
  "--no-network",
  "--dedicated",
  "--no-fallback",
  "--mcp",
  "--no-fast",
  "--cleanup-remote-debugging",
  "--dismiss-banner",
  "--allow-attach",
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
  "--max-bytes",
  "--max-chars",
  "--max-labels",
  "--max-nodes",
  "--max-side",
  "--mode",
  "--name",
  "--out",
  "--output",
  "--page",
  "--profile",
  "--quality",
  "--request-file",
  "--response-file",
  "--return",
  "--selector",
  "--session",
  "--state-file",
  "--submit",
  "--text-filter",
  "--timeout",
  "--trace",
  "--uid",
  "--user-agent",
  "--viewport",
  "--href-filter",
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
  "--anonymous",
  "--annotate",
  "--attach",
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
  "--fallback-text",
  "--force",
  "--front",
  "--full",
  "--full-page",
  "--help",
  "--ignore-active-session",
  "--interactive",
  "--isolated",
  "--json",
  "--keep-anonymous",
  "--keep-isolated",
  "--labels",
  "--mcp",
  "--no-active-session",
  "--no-dismiss-banner",
  "--no-fallback",
  "--no-fallback-text",
  "--no-fast",
  "--no-network",
  "--no-normalize",
  "--no-reload",
  "--no-screenshot",
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
  "--version",
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
  const flags = { json: false, deep: false, full: false, verbose: false };
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
    } else if (arg === "--max-nodes") {
      flags.maxNodes = argv[++index];
    } else if (arg?.startsWith("--max-nodes=")) {
      flags.maxNodes = arg.slice("--max-nodes=".length);
    } else if (arg === "--limit") {
      flags.limit = argv[++index];
    } else if (arg?.startsWith("--limit=")) {
      flags.limit = arg.slice("--limit=".length);
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
    } else if (arg === "--fallback-text") {
      flags.fallbackText = true;
    } else if (arg === "--no-fallback-text") {
      flags.fallbackText = false;
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
      flags.mode = argv[++index];
      if (flags.mode === "efficient") {
        flags.efficient = true;
      } else if (flags.mode === "raw") {
        flags.raw = true;
      } else if (flags.mode === "verbose") {
        flags.verbose = true;
      }
    } else if (arg?.startsWith("--mode=")) {
      flags.mode = arg.slice("--mode=".length);
      if (flags.mode === "efficient") {
        flags.efficient = true;
      } else if (flags.mode === "raw") {
        flags.raw = true;
      } else if (flags.mode === "verbose") {
        flags.verbose = true;
      }
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
    } else if (arg === "--dedicated") {
      flags.dedicated = true;
    } else if (arg === "--backend") {
      flags.backend = argv[++index];
      if (flags.backend === "dev" || flags.backend === "dedicated") {
        flags.dedicated = true;
      }
      if (flags.backend === "real" || flags.backend === "auto") {
        flags.dedicated = false;
      }
    } else if (arg?.startsWith("--backend=")) {
      flags.backend = arg.slice("--backend=".length);
      if (flags.backend === "dev" || flags.backend === "dedicated") {
        flags.dedicated = true;
      }
      if (flags.backend === "real" || flags.backend === "auto") {
        flags.dedicated = false;
      }
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
    } else if (arg === "--viewport") {
      flags.viewport = argv[++index];
    } else if (arg?.startsWith("--viewport=")) {
      flags.viewport = arg.slice("--viewport=".length);
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
  return handle.session
    ? `session "${handle.session}" page ${handle.pageId}`
    : `state file "${handle.stateFile}" page ${handle.pageId}`;
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
  const page = parseListPagesResult(pagesResult).find((entry) => entry.id === handle.pageId);
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
    flags.keepAnonymous ||
    (envMode && envMode !== AUTO_MODE) ||
    process.env.REALBROWSER_ANONYMOUS === "1" ||
    process.env.REALBROWSER_BROWSER_URL ||
    process.env.REALBROWSER_PROFILE_DIR ||
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
  if (existing) {
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
    const keepAnonymous = flags.keepAnonymous || process.env.REALBROWSER_KEEP_ANONYMOUS === "1";
    const startProfileDir = startMode === ANONYMOUS_MODE && keepAnonymous
      ? await anonymousProfileDirForStart(flags)
      : profileDirForMode(startMode, flags);
    const sessionName = effectiveSessionNameFromFlags(flags);
    const env = {
      ...process.env,
      REALBROWSER_STATE_FILE: stateFile,
      REALBROWSER_MODE: startMode,
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

function daemonCapabilitiesFrom(value) {
  const capabilities = value?.__health?.capabilities ?? value?.capabilities;
  return new Set(Array.isArray(capabilities) ? capabilities.map((entry) => String(entry)) : []);
}

function daemonSupports(state, capability) {
  return daemonCapabilitiesFrom(state).has(capability);
}

function requiredCapabilitiesForCommand(command, args = []) {
  switch (command) {
    case "wait":
      return args.includes("--visible") || args.includes("--selector") || args.some((arg) => String(arg).startsWith("--selector="))
        ? new Set(["visible-wait"])
        : new Set();
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
    case "blocks":
    case "visible-blocks":
      return new Set(["visible-blocks"]);
    case "posts":
    case "feed":
    case "content-blocks":
      return new Set(["content-posts"]);
    case "links":
      return new Set(["filtered-links"]);
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
  throw new Error([
    `Running realbrowser daemon pid ${state?.pid ?? "unknown"} does not support ${missing.join(", ")} needed by ${command}.`,
    "It was started by an older copy of this skill, so sending the command would fail or trigger noisy fallbacks.",
    `Reload it explicitly with \`--restart-daemon\`, or run \`${detachCommand}\` and then rerun the command.`,
  ].join(" "));
}

function printResult(value, flagsOrJson = false) {
  const flags = typeof flagsOrJson === "boolean" ? { json: flagsOrJson } : (flagsOrJson ?? {});
  if (flags.quiet) {
    const quiet = value?.quiet ?? value?.path ?? value?.filePath ?? value?.text;
    if (quiet) {
      console.log(String(quiet));
    }
    return;
  }
  if (flags.json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  if (value?.text) {
    console.log(value.text);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
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
    const tabs = await findBrowserTabs({
      query: args.join(" "),
      browser: flags.browser,
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
  const response = await daemonRpc(state, daemonPayloadForCommand(command, args, flags, state));
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
    url: handle.url,
    createdAt: handle.createdAt,
    updatedAt: handle.updatedAt,
  };
}

async function writePageHandle({ state, flags, page, handlePath }) {
  const now = new Date().toISOString();
  const session = sessionNameForState(state, flags);
  const resolvedPath = handlePath ?? handleOutputPathFromFlags(flags);
  const handle = {
    kind: "realbrowser-tab-handle",
    version: 1,
    session,
    stateFile: stateFileFromFlags({ ...flags, session }),
    pageId: page.id,
    url: page.url,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await writeJson(resolvedPath, handle, 0o600, { overwrite: flags.force === true });
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
  await resolveProfileForAutomation(flags);
  await prepareRealProfileSessionFlags(flags);
  const state = await ensureDaemon(flags);
  if (targetUrl) {
    const openFlags = { ...flags, select: true };
    await daemonRpc(state, daemonPayloadForCommand("open", [targetUrl], openFlags, state));
  }
  const pagesResult = await daemonRpc(state, { command: "tabs", args: [], flags: {} });
  const page = pickClaimedPage(parseListPagesResult(pagesResult), targetUrl);
  if (!page) {
    throw new Error("Could not find a page to claim.");
  }
  const handle = await writePageHandle({
    state,
    flags,
    page,
    handlePath: handleOutputPathFromFlags(flags),
  });
  const explicitSessionName = sessionNameFromFlags(flags);
  if (explicitSessionName) {
    await writeActiveSessionName(explicitSessionName);
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

function defaultMobileScreenshotPath() {
  return path.join(
    DEFAULT_SCREENSHOT_DIR,
    `mobile-screenshot-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.png`,
  );
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
    pid: String(session.pid ?? ""),
    mcp: session.mcpConnected ? "yes" : "no",
    script: session.scriptHash ? (session.scriptHash === SCRIPT_HASH ? "current" : `old:${session.scriptHash}`) : "old",
    state: session.stateFile,
  }));
  const widths = {
    active: 1,
    name: Math.max("Session".length, ...rows.map((row) => row.name.length)),
    mode: Math.max("Mode".length, ...rows.map((row) => row.mode.length)),
    pid: Math.max("PID".length, ...rows.map((row) => row.pid.length)),
    mcp: Math.max("MCP".length, ...rows.map((row) => row.mcp.length)),
    script: Math.max("Script".length, ...rows.map((row) => row.script.length)),
  };
  const line = (row) => [
    row.active.padEnd(widths.active),
    row.name.padEnd(widths.name),
    row.mode.padEnd(widths.mode),
    row.pid.padEnd(widths.pid),
    row.mcp.padEnd(widths.mcp),
    row.script.padEnd(widths.script),
    row.state,
  ].join("  ");
  return [
    line({ active: "", name: "Session", mode: "Mode", pid: "PID", mcp: "MCP", script: "Script", state: "State file" }),
    line({ active: "-", name: "-".repeat(widths.name), mode: "-".repeat(widths.mode), pid: "-".repeat(widths.pid), mcp: "-".repeat(widths.mcp), script: "-".repeat(widths.script), state: "----------" }),
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
  return {
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
  const endpoints = browserTabEndpoints(profiles, options);
  const tabs = [];
  const endpointSessionNames = new Set();
  for (const endpoint of endpoints) {
    const endpointSession = await runningEndpointSession(endpoint);
    if (endpointSession) {
      endpointSessionNames.add(endpointSession.name);
      tabs.push(...await tabsForKnownSession(endpointSession, { endpoint }));
      continue;
    }
    const targets = await fetchCdpTargetList(endpoint, { allowWs: false }).catch(() => []);
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
      if (!endpoint.wsEndpoint) {
        throw error;
      }
    }
  }
  if (!endpoint.wsEndpoint) {
    return [];
  }
  if (options.allowWs !== true) {
    return [];
  }
  return await fetchCdpTargetListFromWs(endpoint.wsEndpoint);
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

function formatCdpValue(value) {
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
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
    return {
      text: [
        `Attached to ${tab.browserUrl}, but could not map the CDP target to a single MCP page.`,
        `Matched tab: ${tab.title || "(untitled)"} ${tab.url}`,
        "Run `realbrowser tabs`, then `realbrowser select <pageId>` for the intended page.",
      ].join("\n"),
      tab: publicBrowserTabInfo(tab),
      pages,
      selected: null,
    };
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
    return {
      text: [
        `Attached to session ${tab.sessionName}, but could not map the tab to a single page.`,
        `Matched tab: ${tab.title || "(untitled)"} ${tab.url}`,
        `Run \`realbrowser --session "${tab.sessionName}" tabs\`, then \`realbrowser --session "${tab.sessionName}" select <pageId>\`.`,
      ].join("\n"),
      tab: publicBrowserTabInfo(tab),
      pages,
      selected: null,
    };
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

function macBrowserExecutableCandidates(source) {
  const binary = source.appName;
  return [
    path.join("/Applications", `${source.appName}.app`, "Contents", "MacOS", binary),
    path.join(os.homedir(), "Applications", `${source.appName}.app`, "Contents", "MacOS", binary),
  ];
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
  return {
    chromeBannerText: CONTROLLED_BANNER_TEXT,
    chromeBannerExpectedNow: mcpKnown ? mcpConnected : null,
    mayAppearOnNextBrowserCommand: running && (!mcpKnown || !mcpConnected),
    realSignedInProfileMayBeControlled: realProfile && (running || mcpConnected),
    realbrowserMcpConnected: mcpKnown ? mcpConnected : null,
    defaultLocalChromeRemoteDebuggingUserEnabled: chromeRemoteDebugging?.known ? chromeRemoteDebugging.userEnabled : null,
    chromeRemoteDebuggingUserEnabled: chromeRemoteDebugging?.known ? chromeRemoteDebugging.userEnabled : null,
    chromeRemoteDebuggingMetadataAppliesToActiveBrowser: mode === AUTO_MODE ? true : null,
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
    this.mcp = null;
    this.tools = null;
    this.hiddenConsoleLines = new Set();
    this.hiddenNetworkLines = new Set();
    this.selectedCdpTargetId = null;
    this.cdpTargetAliases = new Map();
    this.cdpTargetHandles = new Map();
    this.nextCdpTargetHandle = 1;
    this.cdpBrowserClient = null;
    this.cdpBrowserClientPromise = null;
  }

  async ensureMcp() {
    if (this.mcp) {
      return this.mcp;
    }
    if (this.profileDir) {
      await fsp.mkdir(this.profileDir, { recursive: true });
    }
    const mode = this.browserUrl ? "browserUrl" : this.mode;
    const client = new McpClient({
      mode: this.browserUrl ? DEDICATED_MODE : this.mode,
      browserUrl: this.browserUrl,
      profileDir: this.profileDir,
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
      } catch {
        // Fall through to MCP. --no-fallback only disables dedicated-profile fallback.
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

  async cdpPageRequest(targetId, method, params = {}) {
    const client = await this.ensureCdpBrowserClient();
    let sessionId = null;
    try {
      const attached = await client.request("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      sessionId = String(attached?.sessionId ?? "");
      if (!sessionId) {
        throw new Error(`CDP attach did not return a session id for target ${targetId}`);
      }
      return await client.request(method, params, { sessionId });
    } finally {
      if (sessionId) {
        await safeCdpRequest(client, "Target.detachFromTarget", { sessionId });
      }
    }
  }

  async cdpActivateTarget(targetId) {
    const endpoint = this.cdpEndpoint();
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
    const result = await this.cdpPageRequest(targetId, "Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
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
      } catch {
        // Fall through to MCP. --no-fallback only disables dedicated-profile fallback.
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

  async handle(command, args, flags = {}) {
    switch (command) {
      case "doctor":
        return await this.doctor(Boolean(flags.deep));
      case "status":
        return await this.status();
      case "restart":
        return await this.restart();
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
        if (this.shouldUseFastCdp(flags)) {
          try {
            return await this.navigateCdpPage("url", args[0], flags);
          } catch {
            // Fall through to MCP. --no-fallback only disables dedicated-profile fallback.
          }
        }
        return await this.callTool("navigate_page", {
          ...this.pageArgs(flags),
          type: "url",
          url: args[0],
        });
      case "back":
      case "forward":
      case "reload":
        if (this.shouldUseFastCdp(flags)) {
          try {
            return await this.navigateCdpPage(command, undefined, flags);
          } catch {
            // Fall through to MCP. --no-fallback only disables dedicated-profile fallback.
          }
        }
        return await this.callTool("navigate_page", {
          ...this.pageArgs(flags),
          type: command,
        });
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
          } catch {
            // Fall through to MCP. --no-fallback only disables dedicated-profile fallback.
          }
        }
        return await this.callTool("close_page", { pageId: parsePageId(args[0]) });
      case "snapshot":
      case "accessibility":
        return await this.handleSnapshot(args, flags);
      case "observe":
        return await this.handleObserve(args, flags);
      case "click":
        requireArgs(command, args, 1);
        return await this.callTool("click", { ...this.pageArgs(flags), uid: args[0] });
      case "hover":
        requireArgs(command, args, 1);
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
      case "blocks":
      case "visible-blocks":
      case "posts":
      case "feed":
      case "content-blocks":
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

  async doctor(deep) {
    const tools = await this.listTools();
    const out = {
      daemon: {
        pid: process.pid,
        stateFile: this.stateFile,
        mode: this.currentMode(),
      },
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
        daemon: {
          pid: process.pid,
          stateFile: this.stateFile,
          mode: this.currentMode(),
        },
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
      daemon: {
        pid: process.pid,
        stateFile: this.stateFile,
        mode: this.currentMode(),
      },
      browserControl: this.browserControlStatus(),
      tabs: pages.length,
      selected,
    };
  }

  async restart() {
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
    const stepMaxChars = parsePositiveInteger(flags.maxChars ?? String(DEFAULT_CHAIN_STEP_MAX_CHARS), "max-chars");
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
        chain: { ok: results.every((entry) => entry.ok), totalDurationMs, results: results.map(chainStepTiming), trace: flags.trace },
      };
    }
    if (returnMode === "all") {
      return {
        text: results
          .map((entry) => {
            if (!entry.ok) {
              return `[${entry.index}] ${entry.command ?? "?"} (${formatMs(entry.durationMs)}): ERROR ${entry.error}`;
            }
            return `[${entry.index}] ${entry.command} (${formatMs(entry.durationMs)}): ${resultText(entry.result, stepMaxChars)}`;
          })
          .concat(`total: ${formatMs(totalDurationMs)}`)
          .join("\n\n"),
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
    const snapshot = await this.callTool("take_snapshot", {
      ...this.pageArgs(flags),
      verbose: Boolean(flags.verbose || flags.raw),
    });
    if (flags.raw) {
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
      lines.push(built.text);
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
        ...snapshot.structuredContent,
        snapshotText: built.text,
        refs: built.refs,
        stats: built.stats,
        truncated: built.truncated,
        ...(outPath ? { out: outPath } : {}),
        ...(annotated ? { annotatedScreenshot: annotated } : {}),
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
    const [consoleResult, networkResult] = await Promise.all([
      this.handleConsole([], { ...flags, errors: true, limit: "5" }).catch((error) => ({
        text: `console unavailable: ${error instanceof Error ? error.message : String(error)}`,
      })),
      this.handleNetwork([], { ...flags, failed: true, limit: "5" }).catch((error) => ({
        text: `network unavailable: ${error instanceof Error ? error.message : String(error)}`,
      })),
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
    if (args[0] === "get") {
      requireArgs("console get", args, 2);
      const result = await this.callTool("get_console_message", {
        ...this.pageArgs(flags),
        msgid: Number.parseInt(args[1], 10),
      });
      return flags.raw ? result : compactTextResult(result, flags, DEFAULT_READ_MAX_CHARS);
    }
    const result = await this.callTool("list_console_messages", {
      ...this.pageArgs(flags),
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

  async handleOpen(args, flags = {}, command = "open") {
    requireArgs(command, args, 1);
    const url = args[0];
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
        return await this.selectPage(pageId, Boolean(flags.front));
      }
    }
    if (this.shouldUseFastCdp(flags)) {
      try {
        return await this.openCdpPage(url, flags, command);
      } catch {
        // Fall through to MCP. --no-fallback only disables dedicated-profile fallback.
      }
    }
    return await this.callTool("new_page", {
      url,
      background: !flags.front,
    });
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

  async handleCaptureConsole(args, flags = {}) {
    const targetUrl = args[0];
    const durationMs = parsePositiveInteger(flags.duration ?? String(DEFAULT_CONSOLE_CAPTURE_DURATION_MS), "duration");
    const timeoutMs = parsePositiveInteger(flags.timeout ?? String(DEFAULT_CONSOLE_CAPTURE_TIMEOUT_MS), "timeout");
    let pageId;
    let action = "sample";

    if (targetUrl) {
      pageId = this.mode === ANONYMOUS_MODE
        ? await this.resolveAnonymousNavigationPageId(flags)
        : null;
      if (pageId === null || pageId === undefined) {
        pageId = await this.openPageForAutomation("about:blank", flags);
      }
      await this.callTool("navigate_page", {
        pageId,
        type: "url",
        url: targetUrl,
      });
      action = "navigate";
    } else {
      pageId = await this.resolvePageId(flags);
      if (flags.reload) {
        await this.callTool("navigate_page", {
          pageId,
          type: "reload",
        });
        action = "reload";
      }
    }

    await this.handleWait(["load"], { ...flags, page: String(pageId), timeout: String(timeoutMs) }).catch(() => null);
    if (durationMs > 0) {
      await sleep(durationMs);
    }
    await this.handleWait(["networkidle"], {
      ...flags,
      page: String(pageId),
      timeout: String(Math.min(10000, Math.max(1000, timeoutMs))),
    }).catch(() => null);

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
    const pageInfoResult = await this.evaluateFunction(consolePageInfoFunction(), {
      ...flags,
      page: String(pageId),
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
      } catch {
        // Fall through to MCP. --no-fallback only disables dedicated-profile fallback.
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
        ...this.pageArgs(flags),
        ...(Number.isFinite(reqid) ? { reqid } : {}),
        ...(flags.requestFile ? { requestFilePath: flags.requestFile } : {}),
        ...(flags.responseFile ? { responseFilePath: flags.responseFile } : {}),
      });
      return flags.raw ? result : compactTextResult(result, flags, DEFAULT_READ_MAX_CHARS);
    }
    const result = await this.callTool("list_network_requests", {
      ...this.pageArgs(flags),
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
    let pageId;
    let action = "sample";

    if (targetUrl) {
      pageId = this.mode === ANONYMOUS_MODE
        ? await this.resolveAnonymousNavigationPageId(flags)
        : null;
      if (pageId === null || pageId === undefined) {
        pageId = await this.openPageForAutomation("about:blank", flags);
      }
      await this.evaluateFunction(clearPerformanceEntriesFunction(), { ...flags, page: String(pageId) }).catch(() => null);
      await this.callTool("navigate_page", {
        pageId,
        type: "url",
        url: targetUrl,
      });
      action = "navigate";
    } else {
      pageId = await this.resolvePageId(flags);
      await this.evaluateFunction(clearPerformanceEntriesFunction(), { ...flags, page: String(pageId) }).catch(() => null);
      if (flags.reload) {
        await this.callTool("navigate_page", {
          pageId,
          type: "reload",
        });
        action = "reload";
      }
    }

    await this.handleWait(["load"], { ...flags, page: String(pageId), timeout: String(timeoutMs) }).catch(() => null);
    if (durationMs > 0) {
      await sleep(durationMs);
    }
    await this.handleWait(["networkidle"], {
      ...flags,
      page: String(pageId),
      timeout: String(Math.min(10000, Math.max(1000, timeoutMs))),
    }).catch(() => null);

    const perfResult = await this.evaluateFunction(networkPerformanceCaptureFunction(), {
      ...flags,
      page: String(pageId),
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
    switch (command) {
      case "url":
        return await rawResult("() => location.href");
      case "text":
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
      case "blocks":
      case "visible-blocks":
        return await rawResult(
          visibleBlocksFunction(target, { fallbackText: flags.fallbackText === true }),
          target,
        );
      case "posts":
      case "feed":
      case "content-blocks":
        return await rawResult(
          visibleContentPostsFunction(target),
          target,
        );
      case "html":
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
      } catch {
        // Fall through to MCP. --no-fallback only disables dedicated-profile fallback.
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

  async handleViewport(size, flags = {}) {
    if (size === "reset" || size === "clear") {
      return await this.callTool("emulate", this.pageArgs(flags));
    }
    const [width, height] = size.split(/[x,]/).map((value) => Number.parseInt(value, 10));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("viewport expects a size like 1280x720");
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
    return await this.callTool("take_screenshot", {
      ...this.pageArgs(flags),
      filePath,
      format,
      ...(quality !== undefined && canUseScreenshotQuality(format) ? { quality } : {}),
      ...(flags.full ? { fullPage: true } : {}),
      ...(flags.uid ? { uid: flags.uid } : {}),
    });
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
    const baseScale = metrics && options.maxSide > 0 && largestPhysicalSide > options.maxSide
      ? options.maxSide / largestPhysicalSide
      : 1;
    const scales = metrics ? screenshotScaleSteps(baseScale) : [1];
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
  const maxChars = parsePositiveInteger(
    flags.maxChars ?? (flags.verbose ? "40000" : String(DEFAULT_SNAPSHOT_MAX_CHARS)),
    "max-chars",
  );
  if (!root || typeof root !== "object") {
    const truncated = truncateText(String(fallbackText ?? ""), maxChars);
    return {
      text: truncated.text || "(no snapshot)",
      truncated: truncated.truncated,
      refs: {},
      stats: {
        lines: truncated.text ? truncated.text.split("\n").length : 0,
        chars: truncated.text.length,
        refs: 0,
        interactive: 0,
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
  const truncated = truncateText(text, maxChars);
  text = truncated.text;
  const isTruncated = truncated.truncated || stoppedByNodes;
  if (stoppedByNodes && !text.includes("[...TRUNCATED")) {
    text = `${text}\n\n[...TRUNCATED - max nodes reached]`;
  }
  return {
    text,
    truncated: isTruncated,
    refs,
    stats: {
      lines: text ? text.split("\n").length : 0,
      chars: text.length,
      refs: totalRefs,
      interactive: interactiveRefs,
    },
  };
}

async function formatReadResult(command, result, flags = {}) {
  const value = extractJsonFromToolText(result.text);
  const rawValue = value ?? result.text ?? "";
  const limit = parsePositiveInteger(flags.limit ?? defaultLimitForReadCommand(command), "limit");
  const maxChars = parsePositiveInteger(
    flags.maxChars ?? (flags.verbose ? "40000" : String(DEFAULT_READ_MAX_CHARS)),
    "max-chars",
  );
  let fullText;
  let displayedValue = rawValue;
  if ((command === "blocks" || command === "visible-blocks") && Array.isArray(rawValue)) {
    displayedValue = rawValue.slice(0, limit);
    fullText = displayedValue.length ? displayedValue.map(formatVisibleBlock).join("\n\n") : "(no visible blocks)";
  } else if ((command === "posts" || command === "feed" || command === "content-blocks") && Array.isArray(rawValue)) {
    displayedValue = rawValue.slice(0, limit);
    fullText = displayedValue.length ? displayedValue.map(formatVisiblePost).join("\n\n") : "(no visible content posts)";
  } else if (Array.isArray(rawValue)) {
    displayedValue = rawValue.slice(0, limit);
    fullText = formatValue(displayedValue);
  } else if (rawValue && typeof rawValue === "object") {
    fullText = formatValue(rawValue);
  } else {
    fullText = String(rawValue ?? "");
  }
  const outPath = flags.out ?? flags.output;
  if (outPath) {
    await writeTextFile(outPath, `${Array.isArray(rawValue) || typeof rawValue === "object" ? formatValue(rawValue) : String(rawValue)}\n`);
  }
  const truncated = truncateText(fullText, maxChars);
  const suffix = [];
  if (Array.isArray(rawValue) && rawValue.length > limit) {
    suffix.push(`[...${rawValue.length - limit} more items - use --limit or --out]`);
  }
  if (truncated.truncated) {
    suffix.push(`[...TRUNCATED - use --max-chars or --out]`);
  }
  if (outPath) {
    suffix.push(`out: ${outPath}`);
  }
  return {
    text: [truncated.text, ...suffix].filter(Boolean).join("\n"),
    structuredContent: {
      command,
      count: Array.isArray(rawValue) ? rawValue.length : undefined,
      shown: Array.isArray(displayedValue) ? displayedValue.length : undefined,
      truncated: truncated.truncated || (Array.isArray(rawValue) && rawValue.length > limit),
      ...(outPath ? { out: outPath } : {}),
    },
  };
}

async function formatRawResult(command, result, flags = {}) {
  const rawText = String(result?.text ?? formatValue(result ?? ""));
  const outPath = flags.out ?? flags.output;
  if (outPath) {
    await writeTextFile(outPath, `${rawText}\n`);
  }
  const maxChars = parsePositiveInteger(
    flags.maxChars ?? (flags.verbose ? "40000" : String(DEFAULT_READ_MAX_CHARS)),
    "max-chars",
  );
  const truncated = truncateText(rawText, maxChars);
  const suffix = [];
  if (truncated.truncated) {
    suffix.push(`[...TRUNCATED raw output - use --max-chars or --out]`);
  }
  if (outPath) {
    suffix.push(`out: ${outPath}`);
  }
  return {
    text: [truncated.text, ...suffix].filter(Boolean).join("\n"),
    structuredContent: {
      command,
      raw: true,
      chars: rawText.length,
      truncated: truncated.truncated,
      ...(outPath ? { out: outPath } : {}),
    },
  };
}

function formatVisibleBlock(block, index) {
  const label = block?.role || block?.tag || "block";
  const geometry = [
    Number.isFinite(block?.top) ? `top=${Math.round(block.top)}` : "",
    Number.isFinite(block?.height) ? `h=${Math.round(block.height)}` : "",
  ].filter(Boolean).join(" ");
  const source = block?.source ? ` source=${block.source}` : "";
  const selector = block?.selector ? ` ${block.selector}` : "";
  const header = `[${index + 1}] ${label}${geometry ? ` ${geometry}` : ""}${source}${selector}`;
  return `${header}\n${String(block?.text ?? "").trim()}`.trim();
}

function formatVisiblePost(post, index) {
  const parts = [
    `[${index + 1}] post`,
    Number.isFinite(post?.top) ? `top=${Math.round(post.top)}` : "",
    Number.isFinite(post?.height) ? `h=${Math.round(post.height)}` : "",
    post?.source ? `source=${post.source}` : "",
    post?.selector ? post.selector : "",
  ].filter(Boolean);
  const header = parts.join(" ");
  const meta = [
    post?.author ? `author: ${post.author}` : "",
    post?.time ? `time: ${post.time}` : "",
  ].filter(Boolean).join("\n");
  const body = String(post?.body || post?.text || "").trim();
  return [header, meta, body].filter(Boolean).join("\n").trim();
}

function defaultLimitForReadCommand(command) {
  switch (command) {
    case "links":
      return "100";
    case "forms":
      return "20";
    case "posts":
    case "feed":
    case "content-blocks":
      return "5";
    case "blocks":
    case "visible-blocks":
      return "12";
    default:
      return String(DEFAULT_LINE_LIMIT);
  }
}

function compactTextResult(result, flags = {}, defaultMaxChars = DEFAULT_READ_MAX_CHARS) {
  const maxChars = parsePositiveInteger(flags.maxChars ?? String(defaultMaxChars), "max-chars");
  const truncated = truncateText(result.text ?? "", maxChars);
  return {
    text: truncated.text,
    structuredContent: {
      truncated: truncated.truncated,
      chars: truncated.text.length,
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

function visibleBlocksFunction(selector = undefined, options = {}) {
  const allowFallbackText = options.fallbackText === true;
  return `() => {
    const explicitSelector = ${selector ? JSON.stringify(selector) : "null"};
    const allowFallbackText = ${allowFallbackText ? "true" : "false"};
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 16 || rect.bottom < -20 || rect.top > innerHeight * 3) return false;
      const style = getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
    };
    const cleanLines = (value, max = 1200) => {
      const seen = new Set();
      const lines = String(value || "")
        .split("\\n")
        .map((line) => line.replace(/\\s+/g, " ").trim())
        .filter((line) => line.length > 1)
        .filter((line) => {
          const key = line.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return lines.join("\\n").slice(0, max).trim();
    };
    const cssPath = (el) => {
      if (!(el instanceof Element)) return "";
      const tag = el.tagName.toLowerCase();
      if (el.id) return tag + "#" + CSS.escape(el.id);
      const role = el.getAttribute("role");
      const dataPagelet = el.getAttribute("data-pagelet");
      if (dataPagelet) return tag + '[data-pagelet="' + dataPagelet + '"]';
      if (role) return tag + '[role="' + role + '"]';
      const parent = el.parentElement;
      if (!parent) return tag;
      const siblings = [...parent.children].filter((child) => child.tagName === el.tagName);
      const index = siblings.indexOf(el) + 1;
      return tag + (siblings.length > 1 ? ":nth-of-type(" + index + ")" : "");
    };
    const queryAll = (query) => {
      try {
        return [...document.querySelectorAll(query)];
      } catch {
        return [];
      }
    };
    const pushCandidates = (items, source) => {
      for (const item of items) {
        if (item instanceof Element) {
          candidates.push({ el: item, source });
        }
      }
    };
    const candidates = [];
    if (explicitSelector) {
      pushCandidates(queryAll(explicitSelector), "explicit");
    } else {
      pushCandidates(queryAll('[role="main"] [role="article"], [role="article"], article'), "article");
      pushCandidates(queryAll('[data-pagelet*="FeedUnit"], [data-pagelet*="feed_unit"], [aria-posinset], div[data-ad-preview="message"]'), "feed");
      if (candidates.length < 4) {
        pushCandidates(queryAll('[role="feed"] > *, main [data-pagelet], main section, [role="main"] > div, main > div'), "main-child");
      }
      if (candidates.length < 4) {
        const roots = queryAll('[role="main"], main').length ? queryAll('[role="main"], main') : [document.body].filter(Boolean);
        for (const root of roots) {
          const blocks = [...root.querySelectorAll('article, section, [role="article"], [role="group"], div')]
            .filter((el) => {
              if (!visible(el)) return false;
              const text = cleanLines(el.innerText || el.textContent || "", 1600);
              if (text.length < 40 || text.length > 5000) return false;
              const parentText = el.parentElement ? cleanLines(el.parentElement.innerText || el.parentElement.textContent || "", 5200) : "";
              if (parentText && parentText === text && el.parentElement !== root) return false;
              return true;
            })
            .slice(0, 80);
          pushCandidates(blocks, "visible-dom");
        }
      }
    }
    const unique = [];
    const seenElements = new Set();
    for (const candidate of candidates) {
      if (seenElements.has(candidate.el)) continue;
      seenElements.add(candidate.el);
      unique.push(candidate);
    }
    const entries = unique
      .filter((candidate) => visible(candidate.el))
      .map((candidate) => {
        const el = candidate.el;
        const rect = el.getBoundingClientRect();
        const text = cleanLines(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || undefined,
          source: candidate.source,
          selector: cssPath(el),
          top: Math.round(rect.top + scrollY),
          left: Math.round(rect.left + scrollX),
          height: Math.round(rect.height),
          text,
        };
      })
      .filter((entry) => entry.text.length >= 20)
      .sort((a, b) => a.top - b.top || a.left - b.left || b.text.length - a.text.length);
    const out = [];
    for (const entry of entries) {
      const normalized = entry.text.toLowerCase();
      const duplicate = out.some((previous) => {
        const previousText = previous.text.toLowerCase();
        return previousText === normalized ||
          (normalized.length > 80 && previousText.includes(normalized)) ||
          (previousText.length > 80 && normalized.includes(previousText));
      });
      if (!duplicate) {
        out.push(entry);
      }
      if (out.length >= 50) break;
    }
    if (out.length === 0 && allowFallbackText) {
      const root = explicitSelector ? queryAll(explicitSelector)[0] : document.body;
      const fallbackText = cleanLines(root?.innerText || root?.textContent || "", 1200);
      if (fallbackText) {
        out.push({
          tag: root?.tagName?.toLowerCase?.() || "body",
          role: root?.getAttribute?.("role") || "document",
          source: "fallback-text",
          selector: explicitSelector || "body",
          top: 0,
          left: 0,
          height: 0,
          text: fallbackText,
        });
      }
    }
    return out;
  }`;
}

function visibleContentPostsFunction(selector = undefined) {
  return `() => {
    const explicitSelector = ${selector ? JSON.stringify(selector) : "null"};
    const visible = (el) => {
      if (!(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 24 || rect.bottom < -innerHeight * 0.25 || rect.top > innerHeight * 3) return false;
      const style = getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
    };
    const isBoilerplateLine = (line) => {
      const value = String(line || "").trim();
      if (!value) return true;
      if (value.length > 220) return false;
      return /^(like|comment|share|reply|send|save|follow|following|more|see more|view more|show more|hide|report|translate|copy link|not now|join|joined|visit|subscribe|notifications?|write a comment|add a comment|log in|sign up)$/i.test(value) ||
        /^\\d+\\s*(likes?|comments?|shares?|replies?|views?)$/i.test(value) ||
        /^[·•⋯…]+$/.test(value);
    };
    const cleanLines = (value, max = 1800) => {
      const seen = new Set();
      const lines = String(value || "")
        .replace(/\\u00a0/g, " ")
        .split("\\n")
        .map((line) => line.replace(/\\s+/g, " ").trim())
        .filter((line) => line.length > 1)
        .filter((line) => {
          const key = line.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return lines.join("\\n").slice(0, max).trim();
    };
    const cssPath = (el) => {
      if (!(el instanceof Element)) return "";
      const tag = el.tagName.toLowerCase();
      if (el.id) return tag + "#" + CSS.escape(el.id);
      const role = el.getAttribute("role");
      const ariaPos = el.getAttribute("aria-posinset");
      const dataPagelet = el.getAttribute("data-pagelet");
      const testId = el.getAttribute("data-testid");
      if (dataPagelet) return tag + '[data-pagelet="' + dataPagelet + '"]';
      if (testId) return tag + '[data-testid="' + testId + '"]';
      if (role && ariaPos) return tag + '[role="' + role + '"][aria-posinset="' + ariaPos + '"]';
      if (role) return tag + '[role="' + role + '"]';
      const parent = el.parentElement;
      if (!parent) return tag;
      const siblings = [...parent.children].filter((child) => child.tagName === el.tagName);
      const index = siblings.indexOf(el) + 1;
      return tag + (siblings.length > 1 ? ":nth-of-type(" + index + ")" : "");
    };
    const queryAll = (query) => {
      try {
        return [...document.querySelectorAll(query)];
      } catch {
        return [];
      }
    };
    const pushCandidates = (items, source) => {
      for (const item of items) {
        if (item instanceof Element) {
          candidates.push({ el: item, source });
        }
      }
    };
    const timePattern = /\\b(?:just now|today|yesterday|\\d+\\s*(?:s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|mo|month|months|y|yr|yrs|year|years)\\s*ago|\\d+[smhdw]|\\d{1,2}:\\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\s+\\d{1,2})\\b/i;
    const extractParts = (text) => {
      const lines = text.split("\\n").map((line) => line.trim()).filter(Boolean);
      const contentLines = lines.filter((line) => !isBoilerplateLine(line));
      const time = contentLines.find((line) => timePattern.test(line) && line.length <= 120);
      const author = contentLines.find((line) => {
        if (line === time) return false;
        if (timePattern.test(line)) return false;
        return line.length <= 100;
      });
      const ignored = new Set([author, time].filter(Boolean).map((line) => line.toLowerCase()));
      let bodyLines = contentLines.filter((line) => !ignored.has(line.toLowerCase()));
      if (bodyLines.length === 0) {
        bodyLines = contentLines;
      }
      return {
        author,
        time,
        body: bodyLines.join("\\n").slice(0, 1800).trim(),
      };
    };
    const candidates = [];
    if (explicitSelector) {
      pushCandidates(queryAll(explicitSelector), "explicit");
    } else {
      pushCandidates(queryAll('[role="main"] [role="article"], main [role="article"], [role="article"], article'), "article");
      pushCandidates(queryAll('[role="feed"] > *, [aria-posinset], [data-pagelet*="FeedUnit"], [data-pagelet*="feed_unit"]'), "feed");
      pushCandidates(queryAll('main [data-testid*="post"], main [data-testid*="feed"], [role="main"] [data-testid*="post"], [role="main"] [data-testid*="feed"]'), "testid");
      if (candidates.length < 4) {
        pushCandidates(queryAll('main section, [role="main"] section, main [role="group"], [role="main"] [role="group"], main > div, [role="main"] > div'), "main-child");
      }
      if (candidates.length < 4) {
        const roots = queryAll('main, [role="main"]').length ? queryAll('main, [role="main"]') : [document.body].filter(Boolean);
        for (const root of roots) {
          const blocks = [...root.querySelectorAll('article, section, [role="article"], [role="group"], [aria-posinset], div')]
            .filter((el) => {
              if (!visible(el)) return false;
              const text = cleanLines(el.innerText || el.textContent || "", 2600);
              if (text.length < 40 || text.length > 6000) return false;
              const lines = text.split("\\n").filter((line) => !isBoilerplateLine(line));
              if (lines.length < 2 && text.length < 120) return false;
              return true;
            })
            .slice(0, 100);
          pushCandidates(blocks, "visible-dom");
        }
      }
    }
    const unique = [];
    const seenElements = new Set();
    for (const candidate of candidates) {
      if (seenElements.has(candidate.el)) continue;
      seenElements.add(candidate.el);
      unique.push(candidate);
    }
    const entries = unique
      .filter((candidate) => visible(candidate.el))
      .map((candidate) => {
        const el = candidate.el;
        const rect = el.getBoundingClientRect();
        const text = cleanLines(el.innerText || el.textContent || el.getAttribute("aria-label") || "", 2400);
        const parts = extractParts(text);
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || undefined,
          source: candidate.source,
          selector: cssPath(el),
          top: Math.round(rect.top + scrollY),
          left: Math.round(rect.left + scrollX),
          height: Math.round(rect.height),
          author: parts.author,
          time: parts.time,
          body: parts.body || text,
          text,
        };
      })
      .filter((entry) => entry.text.length >= 30 && (entry.body || entry.text).length >= 20)
      .sort((a, b) => a.top - b.top || a.height - b.height || a.left - b.left || a.text.length - b.text.length);
    const out = [];
    for (const entry of entries) {
      const normalized = entry.text.toLowerCase();
      const duplicate = out.some((previous) => {
        const previousText = previous.text.toLowerCase();
        return previousText === normalized ||
          (normalized.length > 80 && previousText.includes(normalized)) ||
          (previousText.length > 80 && normalized.includes(previousText));
      });
      if (!duplicate) {
        out.push(entry);
      }
      if (out.length >= 30) break;
    }
    return out;
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

async function safeCdpRequest(client, method, params) {
  try {
    await client.request(method, params);
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

function isIntegerText(value) {
  return typeof value === "string" && /^\d+$/.test(value.trim());
}

function isUidRef(value) {
  return typeof value === "string" && /^\d+_\d+$/.test(value);
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
    script: SCRIPT_PATH,
    stateFile,
    session: process.env.REALBROWSER_SESSION || undefined,
    modeKey: modeKey({
      anonymous: process.env.REALBROWSER_MODE === ANONYMOUS_MODE,
      dedicated: process.env.REALBROWSER_MODE === DEDICATED_MODE,
      browserUrl: process.env.REALBROWSER_BROWSER_URL?.trim() || undefined,
      profileDir: process.env.REALBROWSER_PROFILE_DIR || undefined,
      keepAnonymous: process.env.REALBROWSER_KEEP_ANONYMOUS === "1",
    }),
  });
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
  const rawCompacted = await formatRawResult("eval", { text: "abcdef" }, { maxChars: "3", raw: true });
  assertSelfTest(rawCompacted.text.includes("TRUNCATED raw output"), "raw output is capped by max-chars");

  assertSelfTest(
    visibleBlocksFunction(undefined, { fallbackText: false }).includes("allowFallbackText = false"),
    "visible blocks can disable fallback text",
  );
  assertSelfTest(
    visibleBlocksFunction(undefined, { fallbackText: true }).includes("allowFallbackText = true"),
    "visible blocks can opt into fallback text",
  );
  new Function(`return ${visibleContentPostsFunction()}`)();
  new Function(`return ${linksReadFunction({ filter: "docs", limit: "3", visible: true })}`)();
  new Function(`return ${linkReadBodyFunction({ textFilter: "docs", hrefFilter: "guide" })}`)();
  new Function(`return ${waitForSelectorFunction("main", 1000, { visible: true })}`)();
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
  const parsedRestartDaemon = parseArgv(["tabs", "--restart-daemon"]);
  assertSelfTest(parsedRestartDaemon.flags.restartDaemon === true, "parser handles daemon restart flag");
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "chain", args: ['[["wait","Example Group"],["blocks","--limit","5"]]'] }).has("visible-blocks"),
    "daemon capability check inspects chain steps",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "chain", args: ['[["wait","Example Group","--visible"],["posts","--limit","1"]]'] }).has("content-posts"),
    "daemon capability check inspects compact post chain steps",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "wait", args: [], flags: { selector: "main", visible: true } }).has("visible-wait"),
    "daemon capability check covers visible selector waits",
  );
  assertSelfTest(
    requiredCapabilitiesForPayload({ command: "js", args: ["document.body.innerText"], flags: { raw: true } }).has("bounded-raw-output"),
    "daemon capability check covers bounded raw eval output",
  );
  assertSelfTestThrows(
    () => assertDaemonSupportsPayload({ pid: 1, session: "old" }, { command: "blocks", args: [] }),
    "daemon capability check rejects unsupported old-daemon commands",
  );
  const backgroundPayload = daemonPayloadForCommand(parsedBackgroundOpen.command, parsedBackgroundOpen.args, parsedBackgroundOpen.flags);
  assertSelfTest(backgroundPayload.command === "open", "open is handled by the daemon hot path");
  assertSelfTest(backgroundPayload.args[0] === "https://example.com", "open payload preserves URL");
  const selectPayload = daemonPayloadForCommand(parsedSelectOpen.command, parsedSelectOpen.args, parsedSelectOpen.flags);
  assertSelfTest(selectPayload.command === "open" && selectPayload.flags.select === true, "open --select stays daemon-owned");
  const foregroundPayload = daemonPayloadForCommand(parsedForegroundOpen.command, parsedForegroundOpen.args, parsedForegroundOpen.flags);
  assertSelfTest(foregroundPayload.command === "open" && foregroundPayload.flags.front === true, "open --front stays daemon-owned");
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
  const parsedBlocks = parseArgv(["blocks", "[role=article]", "--limit", "5"]);
  assertSelfTest(parsedBlocks.command === "blocks" && parsedBlocks.flags.limit === "5", "parser handles visible blocks command");
  assertSelfTest(visibleBlocksFunction("[role=article]").includes("querySelectorAll"), "visible blocks builds a DOM query function");
  new Function(`return (${visibleBlocksFunction("[role=article]")})`);
  const parsedDialogAccept = parseArgv(["dialog", "--accept", "ok"]);
  assertSelfTest(parsedDialogAccept.args.join(" ") === "--accept ok", "parser preserves dialog action tokens");
  const parsedEmulateNetwork = parseArgv(["emulate", "--network", "Offline"]);
  assertSelfTest(parsedEmulateNetwork.flags.network === "Offline", "parser supports emulate network values");
  assertSelfTestThrows(() => validateCommandArgs("click", []), "missing positional args fail before daemon startup");
  validateCommandArgs("click", ["uid-1"]);
  assertSelfTest(handleAwareCommands().has("goto"), "handle-aware command metadata includes aliases");
  assertSelfTest(!handleAwareCommands().has("select"), "page-selection commands do not implicitly consume handles");

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

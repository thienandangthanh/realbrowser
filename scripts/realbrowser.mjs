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
const DEFAULT_PROFILE_DIR = path.join(os.homedir(), ".realbrowser", "profile");
const DEFAULT_SCREENSHOT_DIR = path.join(os.homedir(), ".realbrowser", "screenshots");
const DEFAULT_DOWNLOAD_DIR = path.join(os.homedir(), ".realbrowser", "downloads");
const DEFAULT_DOWNLOAD_SOURCE_DIR = path.join(os.homedir(), "Downloads");
const DEFAULT_SCREENSHOT_MAX_SIDE = parseOptionalIntegerEnv("REALBROWSER_SCREENSHOT_MAX_SIDE", 2000);
const DEFAULT_SCREENSHOT_MAX_BYTES = parseOptionalBytesEnv("REALBROWSER_SCREENSHOT_MAX_BYTES", 5 * 1024 * 1024);
const START_TIMEOUT_MS = Number.parseInt(process.env.REALBROWSER_START_TIMEOUT_MS ?? "20000", 10);
const MCP_START_TIMEOUT_MS = Number.parseInt(process.env.REALBROWSER_MCP_TIMEOUT_MS ?? "30000", 10);
const PACKAGE_SPEC = process.env.REALBROWSER_MCP_PACKAGE ?? "chrome-devtools-mcp@latest";
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

function usage() {
  return `realbrowser

Usage:
  realbrowser doctor [--deep] [--json]
  realbrowser status [--deep] [--json]
  realbrowser profiles [query] [--browser <key>] [--json]
  realbrowser find-tab|tabs-all [query] [--browser <key>] [--json]
  realbrowser select-tab <query> [--browser <key>] [--front] [--json]
  realbrowser open-profile <profile-query> <url> [--browser <key>] [--select] [--front] [--json]
  realbrowser capture-network [url] [--anonymous|--profile <profile-query>|--browser-url <url>] [--reload] [--duration <ms>] [--har <path>] [--json]
  realbrowser capture-console [url] [--anonymous|--profile <profile-query>|--reload] [--duration <ms>] [--out <path>] [--errors] [--json]
  realbrowser restart [--json]
  realbrowser cleanup-remote-debugging [--allow-attach] [--json]
  realbrowser tabs [--json]
  realbrowser open|newtab <url> [--front] [--anonymous|--profile <profile-query>] [--browser <key>] [--select] [--json]
  realbrowser navigate|goto <url>
  realbrowser back|forward|reload [--page <id>]
  realbrowser select <pageId> [--front]
  realbrowser select <uid|selector> <value> [--page <id>]
  realbrowser tab <pageId> [--front]
  realbrowser focus <pageId>
  realbrowser close|closetab <pageId>
  realbrowser observe [--screenshot] [--limit <n>] [--max-chars <n>] [--page <id>] [--json]
  realbrowser snapshot|accessibility [--page <id>] [--efficient] [--interactive] [--compact] [--depth <n>] [--max-chars <n>] [--max-nodes <n>] [--labels|--annotate] [--out <path>] [--raw|--verbose] [--json]
  realbrowser click <uid> [--page <id>]
  realbrowser hover <uid> [--page <id>]
  realbrowser drag <fromUid> <toUid> [--page <id>]
  realbrowser type <text> [--page <id>]
  realbrowser fill <uid> <value> [--page <id>]
  realbrowser fill-form '[{"uid":"...","value":"..."}]' [--page <id>]
  realbrowser press <key> [--page <id>]
  realbrowser click-coords <x> <y> [--page <id>]
  realbrowser highlight <uid|selector> [--page <id>]
  realbrowser upload <uid> <file> [--page <id>]
  realbrowser wait <text> [more text...] [--timeout <ms>] [--page <id>]
  realbrowser wait --load|--domcontentloaded|--networkidle [--timeout <ms>] [--page <id>]
  realbrowser scroll [selector|uid] [--page <id>]
  realbrowser viewport <WxH|reset> [--page <id>]
  realbrowser emulate [--network <name|Offline|reset>] [--cpu <rate>] [--user-agent <ua|reset>] [--color-scheme dark|light|auto] [--geolocation <lat>x<long>] [--page <id>]
  realbrowser useragent <ua|reset> [--page <id>]
  realbrowser cookie <name=value> [--page <id>]
  realbrowser dialog [list|arm accept|arm dismiss|--accept|--dismiss|current accept|current dismiss] [text] [--page <id>]
  realbrowser dialog-accept [text] [--page <id>]
  realbrowser dialog-dismiss [--page <id>]
  realbrowser eval|js <js> [--page <id>] [--json]
  realbrowser text|html|links|forms|cookies|storage|perf|url [selector|uid] [--page <id>] [--max-chars <n>] [--limit <n>] [--out <path>] [--raw]
  realbrowser css <selector|uid> <property> [--page <id>]
  realbrowser attrs <selector|uid> [--page <id>]
  realbrowser is <visible|hidden|enabled|disabled|checked|editable|focused> <selector|uid> [--page <id>]
  realbrowser console [get <msgid>] [--errors] [--filter <text>] [--limit <n>] [--clear] [--preserve] [--json]
  realbrowser network [get <reqid>] [--failed] [--filter <text>] [--limit <n>] [--clear] [--preserve] [--request-file path] [--response-file path] [--json]
  realbrowser errors [--clear] [--limit <n>] [--page <id>]
  realbrowser requests [--failed] [--filter <text>] [--clear] [--limit <n>] [--page <id>]
  realbrowser screenshot [path] [--full|--full-page] [--uid <uid>] [--labels|--annotate] [--format png|jpeg|webp] [--quality <0-100>] [--max-side <px>] [--max-bytes <bytes|5mb>] [--raw-size|--no-normalize] [--page <id>]
  realbrowser responsive <path-prefix> [--page <id>]
  realbrowser diff <url1> <url2> [--page <id>]
  realbrowser download <uid> [path] [--cdp-url <url>] [--download-dir <dir>] [--timeout <ms>] [--page <id>]
  realbrowser wait-download|waitfordownload [path] [--cdp-url <url>] [--download-dir <dir>] [--timeout <ms>]
  realbrowser handoff [pageId]
  realbrowser resume [pageId] [--page <id>]
  realbrowser trace start|stop [--page <id>]
  realbrowser trace analyze <insightSetId> <insightName> [--page <id>]
  realbrowser tool <mcpToolName> [jsonArgs]
  realbrowser tools [--json]
  realbrowser chain '[["snapshot","--page","1"],["console","--errors","--page","1"]]' [--return summary|final|all] [--trace <path>] [--json]
  realbrowser stop|detach [--dismiss-banner] [--cleanup-remote-debugging]

Global flags:
  --json
  --quiet
  --verbose
  --raw
  --mode compact|normal|verbose|raw
  --state-file <path>
  --backend real|dev
  --browser-url <url>
  --cdp-url <url>
  --profile <profile-query>
  --browser <browser-key>
  --select
  --anonymous
  --keep-anonymous
  --reload
  --duration <ms>
  --har <path>
  --out <path>
  --dedicated
  --no-fallback
  --cleanup-remote-debugging
  --dismiss-banner
  --allow-attach
`;
}

function parseArgv(argv) {
  const args = [];
  const flags = { json: false, deep: false, full: false, verbose: false };
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
    } else if (arg === "--front" || arg === "--bring-to-front") {
      flags.front = true;
    } else if (arg === "--select") {
      flags.select = true;
    } else if (arg === "--no-select") {
      flags.select = false;
    } else if (arg === "--anonymous" || arg === "--isolated" || arg === "--clean-profile") {
      flags.anonymous = true;
      flags.dedicated = false;
    } else if (arg === "--keep-anonymous" || arg === "--keep-isolated") {
      flags.keepAnonymous = true;
    } else if (arg === "--reload") {
      flags.reload = true;
    } else if (arg === "--no-reload") {
      flags.reload = false;
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
    } else if (arg === "--network") {
      flags.network = argv[++index];
    } else if (arg?.startsWith("--network=")) {
      flags.network = arg.slice("--network=".length);
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
  return { command: args[0] ?? "help", args: args.slice(1), flags };
}

function stateFileFromFlags(flags = {}) {
  return path.resolve(
    flags.stateFile ?? process.env.REALBROWSER_STATE_FILE ?? DEFAULT_STATE_FILE,
  );
}

function stateDir(stateFile) {
  return path.dirname(stateFile);
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(file, value, mode = 0o600) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await fsp.chmod(file, mode).catch(() => {});
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
  if (
    mode === ANONYMOUS_MODE &&
    !flags.keepAnonymous &&
    process.env.REALBROWSER_KEEP_ANONYMOUS !== "1"
  ) {
    return "";
  }
  return (
    flags.profileDir ??
    process.env.REALBROWSER_PROFILE_DIR ??
    (mode === ANONYMOUS_MODE ? "" : DEFAULT_PROFILE_DIR)
  );
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

function hasExplicitDaemonSelection(flags = {}) {
  return Boolean(
    flags.anonymous ||
    flags.dedicated ||
    flags.backend ||
    flags.browserUrl ||
    flags.profileDir ||
    flags.noFallback ||
    flags.keepAnonymous ||
    process.env.REALBROWSER_MODE ||
    process.env.REALBROWSER_ANONYMOUS ||
    process.env.REALBROWSER_BROWSER_URL ||
    process.env.REALBROWSER_PROFILE_DIR ||
    process.env.REALBROWSER_NO_FALLBACK,
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
  if (!state || state.modeKey === expectedModeKey) {
    return false;
  }
  if (!explicitSelection) {
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

async function ensureDaemon(flags = {}) {
  const stateFile = stateFileFromFlags(flags);
  const existing = await readJson(stateFile);
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
    if (shouldReplaceExistingDaemon(afterLock, expectedModeKey, flags, explicitSelection)) {
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
    const env = {
      ...process.env,
      REALBROWSER_STATE_FILE: stateFile,
      REALBROWSER_MODE: startMode,
      REALBROWSER_PROFILE_DIR: startProfileDir,
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

async function runCli() {
  const parsed = parseArgv(process.argv.slice(2));
  const { command, args, flags } = parsed;
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }
  if (command === "self-test") {
    runSelfTest();
    return;
  }
  if (command === "daemon") {
    await runDaemon();
    return;
  }

  if (command === "profiles" || command === "profile-list" || command === "list-profiles") {
    const profiles = await listBrowserProfiles({ query: args[0], browser: flags.browser });
    printResult({
      text: formatProfileListText(profiles),
      profiles: profiles.map(publicProfileInfo),
    }, flags);
    return;
  }

  if (command === "find-tab" || command === "tabs-all" || command === "search-tabs") {
    const tabs = await findBrowserTabs({ query: args.join(" "), browser: flags.browser });
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
    const state = await readJson(stateFileFromFlags(flags));
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
      console.log(lines.filter(Boolean).join("\n"));
      return;
    }
    const healthBody = await health(state).catch(() => null);
    const mode = healthBody?.mode ?? modeFromState(state) ?? AUTO_MODE;
    let cleanup = null;
    if (flags.cleanupRemoteDebugging) {
      cleanup = await cleanupRemoteDebuggingViaDaemon(state);
    }
    await daemonRpc(state, { command: "stop" }).catch(() => null);
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
    console.log(lines.join("\n"));
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

  if (flags.profile && !flags.browserUrl) {
    const profile = await resolveBrowserProfileSelection(flags.profile, flags);
    if (!profile.devtoolsHttpUrl) {
      throw new Error(`Profile ${profile.id} is not exposing a DevTools endpoint. Open it with \`realbrowser open --profile "${profile.id}" <url>\`, enable Chrome remote debugging in that profile, then retry with \`--no-fallback\`.`);
    }
    flags.browserUrl = profile.devtoolsWsEndpoint ?? profile.devtoolsHttpUrl;
  }

  const state = await ensureDaemon(flags);
  const response = await daemonRpc(state, daemonPayloadForCommand(command, args, flags));
  printResult(response, flags);
}

function daemonPayloadForCommand(command, args, flags = {}) {
  if (command === "open" || command === "newtab") {
    requireArgs(command, args, 1);
    return {
      command: "tool",
      args: backgroundNewPageArgs(args[0], flags),
      flags,
    };
  }
  if (command === "chain") {
    return {
      command,
      args: translateChainOpenSteps(args),
      flags,
    };
  }
  return { command, args, flags };
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
    startedAt: running ? (state.startedAt ?? null) : null,
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
    return profiles;
  }
  return profiles.filter((profile) => browserProfileMatchesQuery(profile, options.query));
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
    debug: profile.devtoolsHttpUrl ? `${profile.devtoolsHttpUrl}${profile.devtoolsScope === "browser" ? " (browser)" : ""}` : "-",
  }));
  const widths = {
    id: Math.max("ID".length, ...rows.map((row) => row.id.length)),
    browser: Math.max("Browser".length, ...rows.map((row) => row.browser.length)),
    profile: Math.max("Profile".length, ...rows.map((row) => row.profile.length)),
    name: Math.max("Name / account".length, ...rows.map((row) => row.name.length)),
  };
  const line = (row) => [
    row.id.padEnd(widths.id),
    row.browser.padEnd(widths.browser),
    row.profile.padEnd(widths.profile),
    row.name.padEnd(widths.name),
    row.debug,
  ].join("  ");
  return [
    line({ id: "ID", browser: "Browser", profile: "Profile", name: "Name / account", debug: "Debug endpoint" }),
    line({ id: "-".repeat(widths.id), browser: "-".repeat(widths.browser), profile: "-".repeat(widths.profile), name: "-".repeat(widths.name), debug: "--------------" }),
    ...rows.map(line),
    "",
    'Use: realbrowser open --profile "<id>" <url>',
    'Attach to a detected debugging endpoint with: realbrowser --profile "<id>" tabs',
  ].join("\n");
}

function formatProfileCandidates(profiles) {
  return profiles.map((profile) => `- ${profile.id} (${profile.browserName}, ${profile.displayName}${profile.email ? `, ${profile.email}` : ""})`).join("\n");
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

async function waitAndSelectBrowserTab(query, flags = {}) {
  const timeoutMs = parsePositiveInteger(flags.timeout ?? "10000", "timeout");
  const startedAt = Date.now();
  let lastTabs = [];
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
    await sleep(250);
  }
  throw new Error(`Opened the URL but no debuggable matching tab appeared within ${timeoutMs}ms.\n${formatBrowserTabListText(lastTabs)}`);
}

async function findBrowserTabs(options = {}) {
  const profiles = await listBrowserProfiles({ browser: options.browser });
  const endpoints = browserTabEndpoints(profiles, options);
  const tabs = [];
  for (const endpoint of endpoints) {
    const targets = await fetchCdpTargetList(endpoint).catch(() => []);
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
  const filtered = options.query ? tabs.filter((tab) => browserTabMatchesQuery(tab, options.query)) : tabs;
  return filtered.sort((a, b) => (
    (a.url || "").localeCompare(b.url || "") ||
    (a.title || "").localeCompare(b.title || "")
  ));
}

function browserTabEndpoints(profiles, options = {}) {
  const endpoints = [];
  const byUrl = new Map();
  const addEndpoint = (httpUrl, profile = null, wsEndpoint = null) => {
    if (!httpUrl) {
      return;
    }
    const normalized = normalizeCdpHttpUrl(httpUrl);
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
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchCdpTargetList(endpoint) {
  if (endpoint.wsEndpoint) {
    const client = new CdpClient(endpoint.wsEndpoint);
    await client.connect();
    try {
      const result = await client.request("Target.getTargets", {});
      return Array.isArray(result?.targetInfos) ? result.targetInfos : [];
    } finally {
      client.close();
    }
  }
  const response = await fetch(`${endpoint.httpUrl.replace(/\/$/u, "")}/json/list`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) {
    throw new Error(`CDP target list failed for ${endpoint.httpUrl}: HTTP ${response.status}`);
  }
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}

function browserTabMatchesQuery(tab, query) {
  const needle = normalizeProfileToken(query);
  if (!needle) {
    return true;
  }
  return [
    tab.id,
    tab.targetId,
    tab.url,
    tab.title,
    tab.browserUrl,
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
  const exactId = tabs.filter((tab) => tab.id === query || tab.targetId === query);
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

async function selectBrowserTabForAutomation(query, flags = {}) {
  const tabs = await findBrowserTabs({ query, browser: flags.browser, browserUrl: flags.browserUrl, cdpUrl: flags.cdpUrl });
  const tab = selectBrowserTabCandidate(tabs, query);
  if (!tab) {
    throw new Error(`No debuggable tab matched "${query}". Run \`realbrowser find-tab "${query}"\`; if nothing appears, open the URL with \`realbrowser open --profile <id> <url>\` and enable remote debugging for that profile.`);
  }
  const attachFlags = { ...flags, browserUrl: tab.browserWsEndpoint ?? tab.browserUrl, noFallback: true };
  const state = await ensureDaemon(attachFlags);
  const pagesResult = await daemonRpc(state, { command: "tabs", args: [], flags: {} });
  const pages = parseListPagesResult(pagesResult);
  const candidates = pages.filter((page) => page.url === tab.url || page.url.includes(query) || tab.url.includes(page.url));
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
  return {
    text: [
      `Selected tab ${candidates[0].id} on ${tab.browserUrl}.`,
      `${tab.title || "(untitled)"}`,
      tab.url,
      tab.profileNames?.length ? `Possible profiles: ${tab.profileNames.join(", ")}` : "",
    ].filter(Boolean).join("\n"),
    quiet: String(candidates[0].id),
    tab: publicBrowserTabInfo(tab),
    page: candidates[0],
    selected,
  };
}

function formatBrowserTabListText(tabs) {
  if (tabs.length === 0) {
    return "No debuggable tabs found. Enable remote debugging in the target browser/profile, or open a URL with `realbrowser open --profile <id> <url>` first.";
  }
  const rows = tabs.map((tab) => ({
    id: tab.id,
    profiles: compactList(tab.profileNames, 32) || "-",
    title: truncateOneLine(tab.title || "(untitled)", 42),
    url: tab.url || "-",
  }));
  const widths = {
    id: Math.max("ID".length, ...rows.map((row) => row.id.length)),
    profiles: Math.max("Possible profiles".length, ...rows.map((row) => row.profiles.length)),
    title: Math.max("Title".length, ...rows.map((row) => row.title.length)),
  };
  const line = (row) => [
    row.id.padEnd(widths.id),
    row.profiles.padEnd(widths.profiles),
    row.title.padEnd(widths.title),
    row.url,
  ].join("  ");
  return [
    line({ id: "ID", profiles: "Possible profiles", title: "Title", url: "URL" }),
    line({ id: "-".repeat(widths.id), profiles: "-".repeat(widths.profiles), title: "-".repeat(widths.title), url: "---" }),
    ...rows.map(line),
    "",
    'Use: realbrowser select-tab "<url-or-title-fragment>"',
  ].join("\n");
}

function formatBrowserTabCandidates(tabs) {
  return tabs.map((tab) => `- ${tab.id} ${tab.title || "(untitled)"} ${tab.url}`).join("\n");
}

function publicBrowserTabInfo(tab) {
  return {
    id: tab.id,
    targetId: tab.targetId,
    browserUrl: tab.browserUrl,
    browserWsEndpoint: tab.browserWsEndpoint,
    webSocketDebuggerUrl: tab.webSocketDebuggerUrl,
    title: tab.title,
    url: tab.url,
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
  const newTabArg = "--new-tab";
  if (process.platform === "darwin") {
    const executable = await firstExistingPath(macBrowserExecutableCandidates(profile.source));
    if (executable) {
      return await spawnDetached(executable, [profileArg, newTabArg, url]);
    }
    return await spawnDetached("open", ["-a", profile.source.appName, "--args", profileArg, newTabArg, url]);
  }
  if (process.platform === "win32") {
    const executable = await firstExistingPath(windowsBrowserExecutableCandidates(profile.source)) ??
      findCommandOnPath(profile.source.commands ?? []);
    if (!executable) {
      throw new Error(`Cannot find an executable for ${profile.browserName}. Open the browser manually with ${profileArg}, or pass --browser-url after enabling remote debugging.`);
    }
    return await spawnDetached(executable, [profileArg, newTabArg, url]);
  }
  if (profile.source.appId) {
    const flatpak = findCommandOnPath(["flatpak"]);
    if (flatpak) {
      return await spawnDetached(flatpak, ["run", profile.source.appId, profileArg, newTabArg, url]);
    }
  }
  const command = findCommandOnPath(profile.source.commands ?? []);
  if (!command) {
    throw new Error(`Cannot find a launcher for ${profile.browserName}. Open the browser manually with ${profileArg}, or pass --browser-url after enabling remote debugging.`);
  }
  return await spawnDetached(command, [profileArg, newTabArg, url]);
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

function backgroundNewPageArgs(url, flags = {}) {
  return [
    "new_page",
    JSON.stringify({
      url,
      background: !(flags.front || flags.select),
      ...(flags.timeout ? { timeout: parsePositiveInteger(flags.timeout, "timeout") } : {}),
    }),
  ];
}

function translateChainOpenSteps(args) {
  if (args.length === 0) {
    return args;
  }
  const steps = parseJsonArg(args.join(" "), "chain");
  if (!Array.isArray(steps)) {
    return args;
  }
  let changed = false;
  const translated = steps.map((step) => {
    if (!Array.isArray(step) || step.length === 0) {
      return step;
    }
    const parsed = parseArgv(step.map((value) => String(value)));
    if (parsed.command !== "open" && parsed.command !== "newtab") {
      return step;
    }
    requireArgs(parsed.command, parsed.args, 1);
    changed = true;
    return ["tool", ...backgroundNewPageArgs(parsed.args[0], parsed.flags)];
  });
  return changed ? [JSON.stringify(translated)] : args;
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
        clientInfo: { name: "realbrowser", version: "0.1.0" },
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
  }

  connect() {
    if (typeof WebSocket === "undefined") {
      throw new Error("This Node runtime does not provide WebSocket; CDP download interception is unavailable.");
    }
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener("message", (event) => this.handleMessage(String(event.data)));
    this.ws.addEventListener("close", () => {
      const error = new Error("CDP socket closed");
      for (const { reject } of this.pending.values()) {
        reject(error);
      }
      this.pending.clear();
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP socket open timed out")), 5000);
      timeout.unref?.();
      this.ws.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error(`CDP socket failed to open: ${this.wsUrl}`));
      }, { once: true });
    });
  }

  request(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
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
    if (/^wss?:/iu.test(config.browserUrl)) {
      args.push(`--wsEndpoint=${config.browserUrl}`);
    } else {
      args.push(`--browserUrl=${config.browserUrl}`);
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

  async restartDedicated() {
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

  async selectPage(pageId, bringToFront = false) {
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
        return await this.callTool("list_pages", {});
      case "open":
      case "newtab":
        requireArgs(command, args, 1);
        return await this.callTool("new_page", {
          url: args[0],
          background: !(flags.front || flags.select),
        });
      case "navigate":
      case "goto":
        requireArgs(command, args, 1);
        return await this.callTool("navigate_page", {
          ...this.pageArgs(flags),
          type: "url",
          url: args[0],
        });
      case "back":
      case "forward":
      case "reload":
        return await this.callTool("navigate_page", {
          ...this.pageArgs(flags),
          type: command,
        });
      case "select":
        requireArgs(command, args, 1);
        if (args.length >= 2 || !isIntegerText(args[0])) {
          return await this.handleSelectOption(args, flags);
        }
        return await this.selectPage(args[0], Boolean(flags.front));
      case "tab":
        requireArgs(command, args, 1);
        return await this.selectPage(args[0], Boolean(flags.front));
      case "focus":
        requireArgs(command, args, 1);
        return await this.selectPage(args[0], true);
      case "close":
      case "closetab":
        requireArgs(command, args, 1);
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
        requireArgs(command, args, 1);
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
    for (const [index, step] of steps.entries()) {
      if (!Array.isArray(step) || step.length === 0) {
        results.push({ index, ok: false, error: "step must be a non-empty command array" });
        continue;
      }
      const parsed = parseArgv(step.map((value) => String(value)));
      try {
        const result = await this.handle(parsed.command, parsed.args, { ...flags, ...parsed.flags });
        results.push({
          index,
          command: parsed.command,
          ok: true,
          result,
          summary: summarizeResult(parsed.command, result, stepMaxChars),
        });
      } catch (error) {
        results.push({
          index,
          command: parsed.command,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (flags.trace) {
      await writeTextFile(flags.trace, `${JSON.stringify(results, null, 2)}\n`);
    }
    if (flags.json) {
      if (flags.raw || returnMode === "all") {
        return { results, trace: flags.trace };
      }
      return {
        ok: results.every((entry) => entry.ok),
        returnMode,
        trace: flags.trace,
        results: results.map((entry) =>
          entry.ok
            ? { index: entry.index, command: entry.command, ok: true, summary: entry.summary }
            : { index: entry.index, command: entry.command, ok: false, error: entry.error },
        ),
      };
    }
    const final = [...results].reverse().find((entry) => entry.ok);
    if (returnMode === "final" && final) {
      return {
        text: resultText(final.result, stepMaxChars),
        chain: { ok: results.every((entry) => entry.ok), trace: flags.trace },
      };
    }
    if (returnMode === "all") {
      return {
        text: results
          .map((entry) => {
            if (!entry.ok) {
              return `[${entry.index}] ${entry.command ?? "?"}: ERROR ${entry.error}`;
            }
            return `[${entry.index}] ${entry.command}: ${resultText(entry.result, stepMaxChars)}`;
          })
          .join("\n\n"),
      };
    }
    return {
      text: results
        .map((entry) => {
          if (!entry.ok) {
            return `[${entry.index}] ${entry.command ?? "?"}: ERROR ${entry.error}`;
          }
          return `[${entry.index}] ${entry.command}: ${entry.summary}`;
        })
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

  async handleCaptureConsole(args, flags = {}) {
    const targetUrl = args[0];
    const durationMs = parsePositiveInteger(flags.duration ?? String(DEFAULT_CONSOLE_CAPTURE_DURATION_MS), "duration");
    const timeoutMs = parsePositiveInteger(flags.timeout ?? String(DEFAULT_CONSOLE_CAPTURE_TIMEOUT_MS), "timeout");
    let pageId;
    let action = "sample";

    if (targetUrl) {
      await this.callTool("new_page", { url: "about:blank", background: false });
      pageId = await this.resolvePageId(flags);
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
    const pageId = await this.resolvePageId(flags);
    const result = await this.callTool("evaluate_script", {
      function: buildEvalFunction(args.join(" ")),
      pageId,
      ...(flags.uid ? { args: [flags.uid] } : {}),
    });
    return flags.raw ? result : compactTextResult(result, flags, DEFAULT_READ_MAX_CHARS);
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
      await this.callTool("new_page", { url: "about:blank", background: false });
      pageId = await this.resolvePageId(flags);
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
    const target = args[0];
    const rawResult = async (fn, selectorOrUid = undefined) => {
      const result = await this.evaluateFunction(fn, flags, selectorOrUid);
      return flags.raw ? result : await formatReadResult(command, result, flags);
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
      case "html":
        return await rawResult(
          target ? selectorOrUidFunction(target, "(el) => el.innerHTML") : "() => document.documentElement.outerHTML",
          target,
        );
      case "links":
        return await rawResult(
          `() => [...document.querySelectorAll("a[href]")]
            .map((a) => ({ text: (a.textContent || "").trim().slice(0, 120), href: a.href }))
            .filter((link) => link.text && link.href)`,
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
    return await this.callTool("wait_for", {
      ...this.pageArgs(flags),
      text: [args.join(" ")],
      timeout,
    });
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
      creator: { name: "realbrowser", version: "0.1.0" },
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
  const match = String(text).match(/```json\n([\s\S]*?)\n```/);
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
    throw new Error(`${command} requires ${count} argument${count === 1 ? "" : "s"}`);
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
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, {
          ok: true,
          pid: process.pid,
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
      const result = await daemon.handle(body.command, body.args ?? [], body.flags ?? {});
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
    script: SCRIPT_PATH,
    stateFile,
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

function runSelfTest() {
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

  const windowsPath = String.raw`C:\Users\Tuyen Hx\Pictures\screen shot.png`;
  const parsedWindowsPath = parseArgv(["screenshot", windowsPath, "--format", "png"]);
  assertSelfTest(parsedWindowsPath.command === "screenshot", "parser keeps command before Windows path");
  assertSelfTest(parsedWindowsPath.args[0] === windowsPath, "parser preserves Windows path with spaces");
  assertSelfTest(parsedWindowsPath.flags.format === "png", "parser handles flags after Windows path");

  const parsedBackgroundOpen = parseArgv(["open", "https://example.com"]);
  assertSelfTest(parsedBackgroundOpen.flags.front !== true, "open defaults to background mode");
  const parsedForegroundOpen = parseArgv(["open", "https://example.com", "--front"]);
  assertSelfTest(parsedForegroundOpen.flags.front === true, "open --front opts into focus");
  const parsedCleanupDetach = parseArgv(["detach", "--cleanup-remote-debugging"]);
  assertSelfTest(parsedCleanupDetach.flags.cleanupRemoteDebugging === true, "parser handles cleanup remote debugging flag");
  const parsedNoFallbackOpen = parseArgv(["open", "https://example.com", "--no-fallback"]);
  assertSelfTest(parsedNoFallbackOpen.flags.noFallback === true, "parser handles no-fallback flag");
  const parsedProfileOpen = parseArgv(["open", "https://example.com", "--profile", "chrome:Profile 4", "--browser=chrome"]);
  assertSelfTest(parsedProfileOpen.flags.profile === "chrome:Profile 4", "parser handles browser profile flag");
  assertSelfTest(parsedProfileOpen.flags.browser === "chrome", "parser handles browser filter flag");
  const parsedProfileOpenSelect = parseArgv(["open", "https://example.com", "--profile", "chrome:Profile 4", "--select", "--timeout", "15000"]);
  assertSelfTest(parsedProfileOpenSelect.flags.select === true, "parser handles profile open select flag");
  assertSelfTest(parsedProfileOpenSelect.flags.timeout === "15000", "parser preserves profile open select timeout");
  const parsedAnonymousOpen = parseArgv(["open", "https://example.com", "--anonymous", "--select"]);
  assertSelfTest(parsedAnonymousOpen.flags.anonymous === true, "parser handles anonymous flag");
  assertSelfTest(parsedAnonymousOpen.flags.select === true, "parser handles anonymous select flag");
  const parsedNetworkCapture = parseArgv(["capture-network", "https://example.com", "--anonymous", "--duration", "15000", "--har", "example.har", "--reload"]);
  assertSelfTest(parsedNetworkCapture.command === "capture-network", "parser handles capture-network command");
  assertSelfTest(parsedNetworkCapture.flags.duration === "15000", "parser handles capture duration");
  assertSelfTest(parsedNetworkCapture.flags.har === "example.har", "parser handles HAR path");
  assertSelfTest(parsedNetworkCapture.flags.reload === true, "parser handles reload flag");
  const parsedConsoleCapture = parseArgv(["capture-console", "https://example.com", "--anonymous", "--duration", "3000", "--out", "console.json", "--errors"]);
  assertSelfTest(parsedConsoleCapture.command === "capture-console", "parser handles capture-console command");
  assertSelfTest(parsedConsoleCapture.flags.out === "console.json", "parser handles console capture output path");
  assertSelfTest(parsedConsoleCapture.flags.errors === true, "parser handles console capture errors flag");
  assertSelfTest(desiredMode({ anonymous: true }) === ANONYMOUS_MODE, "anonymous flag selects anonymous mode");
  const mockProfiles = [
    { id: "chrome:Default", browserName: "Google Chrome", profileDirectory: "Default", displayName: "Person 1", email: "one@example.com" },
    { id: "chrome:Profile 4", browserName: "Google Chrome", profileDirectory: "Profile 4", displayName: "Tom", email: "tom@example.com" },
  ];
  assertSelfTest(selectBrowserProfile(mockProfiles, "chrome:Profile 4")?.displayName === "Tom", "profile selection supports stable id");
  assertSelfTest(selectBrowserProfile(mockProfiles, "tom@example.com")?.profileDirectory === "Profile 4", "profile selection supports account email");
  const parsedDismissDetach = parseArgv(["detach", "--dismiss-banner"]);
  assertSelfTest(parsedDismissDetach.flags.dismissBanner === true, "parser handles dismiss banner flag");
  const parsedNoDismissDetach = parseArgv(["detach", "--no-dismiss-banner"]);
  assertSelfTest(parsedNoDismissDetach.flags.dismissBanner === false, "parser handles no-dismiss banner flag");
  const parsedAllowAttach = parseArgv(["cleanup-remote-debugging", "--allow-attach"]);
  assertSelfTest(parsedAllowAttach.flags.allowAttach === true, "parser handles cleanup allow attach flag");
  const backgroundPayload = daemonPayloadForCommand(parsedBackgroundOpen.command, parsedBackgroundOpen.args, parsedBackgroundOpen.flags);
  assertSelfTest(backgroundPayload.command === "tool", "open is client-translated for old daemons");
  assertSelfTest(backgroundPayload.args[0] === "new_page", "open translation calls new_page");
  assertSelfTest(JSON.parse(backgroundPayload.args[1]).background === true, "open translation uses background by default");
  const foregroundPayload = daemonPayloadForCommand(parsedForegroundOpen.command, parsedForegroundOpen.args, parsedForegroundOpen.flags);
  assertSelfTest(JSON.parse(foregroundPayload.args[1]).background === false, "open --front uses foreground");
  const chainPayload = daemonPayloadForCommand("chain", ['[["open","https://example.com"],["snapshot","--efficient"]]'], {});
  const translatedChain = JSON.parse(chainPayload.args[0]);
  assertSelfTest(translatedChain[0][0] === "tool" && translatedChain[0][1] === "new_page", "chain open is translated to new_page");
  assertSelfTest(JSON.parse(translatedChain[0][2]).background === true, "chain open defaults to background");
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

  const parsedJson = parseArgv(["chain", '[["type","hello world"],["press","Enter"]]']);
  assertSelfTest(parsedJson.args[0].includes("hello world"), "parser preserves JSON arguments with spaces");

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
  console.log("self-test ok");
}

function assertSelfTest(condition, message) {
  if (!condition) {
    throw new Error(`self-test failed: ${message}`);
  }
}

runCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

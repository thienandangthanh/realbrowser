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
  realbrowser restart [--json]
  realbrowser cleanup-remote-debugging [--allow-attach] [--json]
  realbrowser tabs [--json]
  realbrowser open|newtab <url> [--front] [--json]
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
  realbrowser stop|detach [--cleanup-remote-debugging] [--no-dismiss-banner]

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
  --dedicated
  --no-fallback
  --cleanup-remote-debugging
  --dismiss-banner
  --no-dismiss-banner
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
  return flags.dedicated ? DEDICATED_MODE : (process.env.REALBROWSER_MODE ?? AUTO_MODE);
}

function modeKey(flags = {}) {
  return JSON.stringify({
    mode: desiredMode(flags),
    browserUrl: flags.browserUrl ?? process.env.REALBROWSER_BROWSER_URL ?? "",
    profileDir: process.env.REALBROWSER_PROFILE_DIR ?? DEFAULT_PROFILE_DIR,
    packageSpec: PACKAGE_SPEC,
    noFallback: Boolean(flags.noFallback || process.env.REALBROWSER_NO_FALLBACK === "1"),
  });
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
  if (existing && existing.modeKey !== modeKey(flags)) {
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
    if (afterLock && afterLock.modeKey !== modeKey(flags)) {
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
    const env = {
      ...process.env,
      REALBROWSER_STATE_FILE: stateFile,
      REALBROWSER_MODE: desiredMode(flags),
      ...(flags.browserUrl ? { REALBROWSER_BROWSER_URL: flags.browserUrl } : {}),
      ...(flags.noFallback ? { REALBROWSER_NO_FALLBACK: "1" } : {}),
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

  if (command === "stop" || command === "detach") {
    const state = await readJson(stateFileFromFlags(flags));
    if (!state || !isProcessAlive(state.pid)) {
      const lines = [
        "realbrowser daemon is not running",
        `If Chrome still shows "${CONTROLLED_BANNER_TEXT}", ${BANNER_X_INSTRUCTION}`,
      ];
      if (flags.cleanupRemoteDebugging) {
        lines.push("No daemon is available for automatic cleanup; use Chrome's settings UI, or run `realbrowser cleanup-remote-debugging --allow-attach` if starting a fresh permission-gated attach is acceptable.");
      }
      console.log(lines.join("\n"));
      return;
    }
    const healthBody = await health(state).catch(() => null);
    const mode = healthBody?.mode ?? modeFromState(state) ?? AUTO_MODE;
    const hadMcpConnection = healthBody?.mcpConnected === true;
    let cleanup = null;
    if (flags.cleanupRemoteDebugging) {
      cleanup = await cleanupRemoteDebuggingViaDaemon(state);
    }
    await daemonRpc(state, { command: "stop" }).catch(() => null);
    const shouldDismissBanner = shouldAttemptBannerDismissal({ flags, hadMcpConnection, mode });
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
  if (mode === DEDICATED_MODE) {
    return {
      text: "Remote-debugging settings cleanup skipped for the dedicated realbrowser profile; stopping the daemon closes the managed browser session.",
      cleanupRemoteDebugging: {
        attempted: false,
        confirmed: true,
        reason: "dedicated-managed-profile",
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
  if (cleanup?.cleanupRemoteDebugging?.reason === "dedicated-managed-profile") {
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
  if (cleanup?.cleanupRemoteDebugging?.reason !== "dedicated-managed-profile" && (!after?.known || after.userEnabled)) {
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
  if (mode === "browserUrl") {
    return "That metadata may not describe the configured browser URL backend.";
  }
  return "That metadata may not describe the active browser backend.";
}

function shouldAttemptBannerDismissal({ flags = {}, hadMcpConnection = false, mode = AUTO_MODE } = {}) {
  return (
    !flags.cleanupRemoteDebugging &&
    flags.dismissBanner !== false &&
    mode !== DEDICATED_MODE &&
    (flags.dismissBanner === true || hadMcpConnection)
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
    note: "The Chrome banner is a browser safety indicator while attached. Plain detach closes realbrowser's session and may dismiss the banner UI, but it must not disable Chrome remote debugging.",
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
    `Cleanup: run \`${browserControl.stopRealbrowserCommand}\`; plain detach keeps Chrome remote debugging enabled and best-effort clicks the banner X. Use \`${browserControl.stopRealbrowserCommand} --cleanup-remote-debugging\` only when you want to disable Chrome remote debugging too.`,
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
      background: !flags.front,
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
    args.push(`--browserUrl=${config.browserUrl}`);
  } else if (config.mode === AUTO_MODE) {
    args.push("--autoConnect");
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
    this.mode = process.env.REALBROWSER_MODE === DEDICATED_MODE ? DEDICATED_MODE : AUTO_MODE;
    this.browserUrl = process.env.REALBROWSER_BROWSER_URL?.trim() || "";
    this.profileDir = process.env.REALBROWSER_PROFILE_DIR ?? DEFAULT_PROFILE_DIR;
    this.noFallback = process.env.REALBROWSER_NO_FALLBACK === "1";
    this.mcp = null;
    this.tools = null;
    this.hiddenConsoleLines = new Set();
    this.hiddenNetworkLines = new Set();
  }

  async ensureMcp() {
    if (this.mcp) {
      return this.mcp;
    }
    await fsp.mkdir(this.profileDir, { recursive: true });
    const mode = this.browserUrl ? "browserUrl" : this.mode;
    const client = new McpClient({
      mode: this.browserUrl ? DEDICATED_MODE : this.mode,
      browserUrl: this.browserUrl,
      profileDir: this.profileDir,
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
          background: !flags.front,
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
      dedicated: process.env.REALBROWSER_MODE === DEDICATED_MODE,
      browserUrl: process.env.REALBROWSER_BROWSER_URL?.trim() || undefined,
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
    shouldAttemptBannerDismissal({ flags: {}, hadMcpConnection: true, mode: AUTO_MODE }) === true,
    "banner dismissal defaults on after an MCP-backed real-profile session",
  );
  assertSelfTest(
    shouldAttemptBannerDismissal({ flags: { dismissBanner: true }, hadMcpConnection: false, mode: AUTO_MODE }) === true,
    "explicit banner dismissal works even when daemon health is incomplete",
  );
  assertSelfTest(
    shouldAttemptBannerDismissal({ flags: {}, hadMcpConnection: true, mode: DEDICATED_MODE }) === false,
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

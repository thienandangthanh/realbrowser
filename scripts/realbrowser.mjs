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
const START_TIMEOUT_MS = Number.parseInt(process.env.REALBROWSER_START_TIMEOUT_MS ?? "20000", 10);
const MCP_START_TIMEOUT_MS = Number.parseInt(process.env.REALBROWSER_MCP_TIMEOUT_MS ?? "30000", 10);
const PACKAGE_SPEC = process.env.REALBROWSER_MCP_PACKAGE ?? "chrome-devtools-mcp@latest";
const AUTO_MODE = "auto";
const DEDICATED_MODE = "dedicated";
const LABEL_OVERLAY_ATTR = "data-realbrowser-labels";

function usage() {
  return `realbrowser

Usage:
  realbrowser doctor [--deep] [--json]
  realbrowser status [--json]
  realbrowser restart [--json]
  realbrowser tabs [--json]
  realbrowser open|newtab <url> [--json]
  realbrowser navigate|goto <url>
  realbrowser back|forward|reload [--page <id>]
  realbrowser select <pageId> [--front]
  realbrowser select <uid|selector> <value> [--page <id>]
  realbrowser tab <pageId> [--front]
  realbrowser focus <pageId>
  realbrowser close|closetab <pageId>
  realbrowser snapshot|accessibility [--page <id>] [--verbose] [--annotate|-a] [--output <path>] [--json]
  realbrowser click <uid> [--page <id>]
  realbrowser hover <uid> [--page <id>]
  realbrowser drag <fromUid> <toUid> [--page <id>]
  realbrowser type <text> [--page <id>]
  realbrowser fill <uid> <value> [--page <id>]
  realbrowser fill-form '[{"uid":"...","value":"..."}]' [--page <id>]
  realbrowser press <key> [--page <id>]
  realbrowser upload <uid> <file> [--page <id>]
  realbrowser wait <text> [more text...] [--timeout <ms>] [--page <id>]
  realbrowser wait --load|--domcontentloaded|--networkidle [--timeout <ms>] [--page <id>]
  realbrowser scroll [selector|uid] [--page <id>]
  realbrowser viewport <WxH|reset> [--page <id>]
  realbrowser emulate [--network <name|Offline|reset>] [--cpu <rate>] [--user-agent <ua|reset>] [--color-scheme dark|light|auto] [--geolocation <lat>x<long>] [--page <id>]
  realbrowser useragent <ua|reset> [--page <id>]
  realbrowser cookie <name=value> [--page <id>]
  realbrowser dialog [list|arm accept|arm dismiss|current accept|current dismiss] [text] [--page <id>]
  realbrowser dialog-accept [text] [--page <id>]
  realbrowser dialog-dismiss [--page <id>]
  realbrowser eval|js <js> [--page <id>] [--json]
  realbrowser text|html|links|forms|cookies|storage|perf|url [selector|uid] [--page <id>]
  realbrowser css <selector|uid> <property> [--page <id>]
  realbrowser attrs <selector|uid> [--page <id>]
  realbrowser is <visible|hidden|enabled|disabled|checked|editable|focused> <selector|uid> [--page <id>]
  realbrowser console [get <msgid>] [--errors] [--preserve] [--json]
  realbrowser network [get <reqid>] [--preserve] [--request-file path] [--response-file path] [--json]
  realbrowser screenshot [path] [--full|--full-page] [--uid <uid>] [--labels|--annotate] [--format png|jpeg|webp] [--quality <0-100>] [--page <id>]
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
  realbrowser chain '[["snapshot","--page","1"],["console","--errors","--page","1"]]' [--json]
  realbrowser stop

Global flags:
  --json
  --state-file <path>
  --backend real|dev
  --browser-url <url>
  --cdp-url <url>
  --dedicated
`;
}

function parseArgv(argv) {
  const args = [];
  const flags = { json: false, deep: false, full: false, verbose: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      flags.json = true;
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
    } else if (arg === "--max-labels") {
      flags.maxLabels = argv[++index];
    } else if (arg?.startsWith("--max-labels=")) {
      flags.maxLabels = arg.slice("--max-labels=".length);
    } else if (arg === "--front" || arg === "--bring-to-front") {
      flags.front = true;
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

function printResult(value, json = false) {
  if (json) {
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
  if (command === "daemon") {
    await runDaemon();
    return;
  }

  if (command === "stop") {
    const state = await readJson(stateFileFromFlags(flags));
    if (!state || !isProcessAlive(state.pid)) {
      console.log("realbrowser daemon is not running");
      return;
    }
    await daemonRpc(state, { command: "stop" }).catch(() => null);
    console.log(`stopped daemon pid ${state.pid}`);
    return;
  }

  const state = await ensureDaemon(flags);
  const response = await daemonRpc(state, { command, args, flags });
  printResult(response, flags.json);
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
    this.proc = spawn("npx", args, {
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
    this.mcp = null;
    this.tools = null;
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
      if (!options.noFallback && this.mode === AUTO_MODE && !this.browserUrl && isAttachFailure(error)) {
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
        return await this.callTool("new_page", { url: args[0] });
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
      case "stop":
        await this.mcp?.close().catch(() => {});
        await fsp.rm(this.stateFile, { force: true }).catch(() => {});
        setTimeout(() => process.exit(0), 10).unref();
        return { text: "stopping" };
      default:
        throw new Error(`Unknown command: ${command}\n\n${usage()}`);
    }
  }

  async doctor(deep) {
    const tools = await this.listTools();
    const out = {
      daemon: {
        pid: process.pid,
        stateFile: this.stateFile,
        mode: this.activeMode ?? (this.browserUrl ? "browserUrl" : this.mode),
      },
      runtime: {
        node: process.version,
        npx: await commandVersion("npx", ["--version"]),
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
    const pages = tabs.structuredContent?.pages ?? [];
    const selected = pages.find((page) => page.selected) ?? null;
    return {
      daemon: {
        pid: process.pid,
        stateFile: this.stateFile,
        mode: this.activeMode ?? (this.browserUrl ? "browserUrl" : this.mode),
      },
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
    const results = [];
    for (const [index, step] of steps.entries()) {
      if (!Array.isArray(step) || step.length === 0) {
        results.push({ index, ok: false, error: "step must be a non-empty command array" });
        continue;
      }
      const parsed = parseArgv(step.map((value) => String(value)));
      try {
        const result = await this.handle(parsed.command, parsed.args, { ...flags, ...parsed.flags });
        results.push({ index, command: parsed.command, ok: true, result });
      } catch (error) {
        results.push({
          index,
          command: parsed.command,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (flags.json) {
      return { results };
    }
    return {
      text: results
        .map((entry) => {
          if (!entry.ok) {
            return `[${entry.index}] ${entry.command ?? "?"}: ERROR ${entry.error}`;
          }
          const text =
            typeof entry.result === "string"
              ? entry.result
              : entry.result?.text
                ? entry.result.text
                : JSON.stringify(entry.result);
          return `[${entry.index}] ${entry.command}: ${text}`;
        })
        .join("\n\n"),
    };
  }

  async handleSnapshot(args, flags = {}) {
    const snapshot = await this.callTool("take_snapshot", {
      ...this.pageArgs(flags),
      verbose: Boolean(flags.verbose),
    });
    if (!flags.labels && !flags.annotate) {
      return snapshot;
    }
    const explicitPath = flags.output ?? args.find((arg) => !arg.startsWith("-"));
    const annotated = await this.annotatedScreenshotFromSnapshot(snapshot, explicitPath, flags);
    return {
      text: `${snapshot.text}\n[annotated screenshot: ${annotated.filePath} labels=${annotated.labels} skipped=${annotated.skipped}]`,
      structuredContent: {
        ...snapshot.structuredContent,
        annotatedScreenshot: annotated,
      },
      raw: snapshot.raw,
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
      return await this.callTool("get_console_message", {
        ...this.pageArgs(flags),
        msgid: Number.parseInt(args[1], 10),
      });
    }
    return await this.callTool("list_console_messages", {
      ...this.pageArgs(flags),
      ...(flags.errors ? { types: ["error", "warn"] } : {}),
      ...(flags.preserve ? { includePreservedMessages: true } : {}),
    });
  }

  async handleEval(args, flags = {}) {
    const pageId = await this.resolvePageId(flags);
    return await this.callTool("evaluate_script", {
      function: buildEvalFunction(args.join(" ")),
      pageId,
      ...(flags.uid ? { args: [flags.uid] } : {}),
    });
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
      return await this.callTool("get_network_request", {
        ...this.pageArgs(flags),
        ...(Number.isFinite(reqid) ? { reqid } : {}),
        ...(flags.requestFile ? { requestFilePath: flags.requestFile } : {}),
        ...(flags.responseFile ? { responseFilePath: flags.responseFile } : {}),
      });
    }
    return await this.callTool("list_network_requests", {
      ...this.pageArgs(flags),
      ...(flags.preserve ? { includePreservedRequests: true } : {}),
    });
  }

  async handleRead(command, args, flags = {}) {
    const target = args[0];
    switch (command) {
      case "url":
        return await this.evaluateFunction("() => location.href", flags);
      case "text":
        return await this.evaluateFunction(
          target
            ? selectorOrUidFunction(target, "(el) => el.innerText || el.textContent || ''")
            : `() => {
                const clone = document.body?.cloneNode(true);
                if (!clone) return "";
                clone.querySelectorAll("script,style,noscript,svg").forEach((el) => el.remove());
                return clone.innerText.split("\\n").map((line) => line.trim()).filter(Boolean).join("\\n");
              }`,
          flags,
          target,
        );
      case "html":
        return await this.evaluateFunction(
          target ? selectorOrUidFunction(target, "(el) => el.innerHTML") : "() => document.documentElement.outerHTML",
          flags,
          target,
        );
      case "links":
        return await this.evaluateFunction(
          `() => [...document.querySelectorAll("a[href]")]
            .map((a) => ({ text: (a.textContent || "").trim().slice(0, 120), href: a.href }))
            .filter((link) => link.text && link.href)`,
          flags,
        );
      case "forms":
        return await this.evaluateFunction(
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
          flags,
        );
      case "cookies":
        return await this.evaluateFunction(
          `() => document.cookie.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
            const index = part.indexOf("=");
            const name = index === -1 ? part : part.slice(0, index);
            const value = index === -1 ? "" : part.slice(index + 1);
            return {
              name,
              value: ${flags.values ? "value" : '"[redacted " + value.length + " chars]"'},
            };
          })`,
          flags,
        );
      case "storage":
        return await this.evaluateFunction(
          storageReadFunction(Boolean(flags.values)),
          flags,
        );
      case "perf":
        return await this.evaluateFunction(
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
          flags,
        );
      case "css":
        requireArgs(command, args, 2);
        return await this.evaluateFunction(
          selectorOrUidFunction(args[0], `(el) => getComputedStyle(el).getPropertyValue(${JSON.stringify(args[1])})`),
          flags,
          args[0],
        );
      case "attrs":
        requireArgs(command, args, 1);
        return await this.evaluateFunction(
          selectorOrUidFunction(
            args[0],
            `(el) => Object.fromEntries([...el.attributes].map((attr) => [attr.name, attr.value]))`,
          ),
          flags,
          args[0],
        );
      case "is":
        requireArgs(command, args, 2);
        return await this.evaluateFunction(
          selectorOrUidFunction(args[1], stateFunctionBody(args[0])),
          flags,
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
    const format =
      flags.format ??
      (explicitPath?.toLowerCase().endsWith(".webp")
        ? "webp"
        : explicitPath?.toLowerCase().endsWith(".jpg") || explicitPath?.toLowerCase().endsWith(".jpeg")
          ? "jpeg"
          : "png");
    const filePath =
      explicitPath ??
      path.join(DEFAULT_SCREENSHOT_DIR, `screenshot-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.${format}`);
    await fsp.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
    return await this.callTool("take_screenshot", {
      ...this.pageArgs(flags),
      filePath,
      format,
      ...(flags.quality ? { quality: parsePositiveInteger(flags.quality, "quality") } : {}),
      ...(flags.full ? { fullPage: true } : {}),
      ...(flags.uid ? { uid: flags.uid } : {}),
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
    const snapshot = await this.callTool("take_snapshot", { pageId, verbose: Boolean(flags.verbose) });
    return {
      text: `Focused page ${pageId}\n\n${snapshot.text}`,
      structuredContent: snapshot.structuredContent,
    };
  }

  async handleResume(args, flags = {}) {
    const pageId = args[0] !== undefined ? parsePageId(args[0]) : await this.resolvePageId(flags);
    return await this.callTool("take_snapshot", { pageId, verbose: Boolean(flags.verbose) });
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

function parseJsonArg(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} expects valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
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
    /^(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(trimmed)
  ) {
    return trimmed;
  }
  if (needsEvalBlockWrapper(trimmed)) {
    return `async () => { ${code} }`;
  }
  return `async () => (${code})`;
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
        sendJson(res, 200, { ok: true, pid: process.pid });
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

runCli().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import "server-only";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { processSingleton } from "@/lib/process-singleton";
import { signalStoreDir } from "@/lib/signal-store";

export const GOSIGNAL_VERSION = "0.3.0";
export const GOSIGNAL_EXIT_UNLINKED = 3;

const RELEASE_BASE = `https://github.com/CWBudde/go-signal/releases/download/v${GOSIGNAL_VERSION}`;
const DEFAULT_BIN_DIR = "data/bin";
const FIRST_URI_MS = 60_000;
const DEFAULT_RUN_MS = 60_000;

let firstUriMs = FIRST_URI_MS;
let killFollowupMs = 2_000;

/** Test hook: wait this long for the first linking URI. Pass `null` to restore. */
export function setGoSignalFirstUriMs(ms: number | null): void {
  firstUriMs = ms ?? FIRST_URI_MS;
}

/** Test hook: SIGKILL follow-up after SIGINT on a link session. Pass `null` to restore. */
export function setGoSignalKillFollowupMs(ms: number | null): void {
  killFollowupMs = ms ?? 2_000;
}

/** Test hook: forget cached binary paths so ensureGoSignalBinary re-reads disk. */
export function resetGoSignalBinCache(): void {
  resolvedBinByDest.clear();
}

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type LinkSession = {
  kill: () => void;
  finished: Promise<number>;
  /** Resolves when the first `sgnl://` URI has been emitted. */
  ready: Promise<void>;
};

type SpawnImpl = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

type FetchImpl = typeof fetch;

let spawnImpl: SpawnImpl = spawn as SpawnImpl;
let fetchImpl: FetchImpl = fetch;

function createMutex() {
  let chain: Promise<void> = Promise.resolve();
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const release = await this.acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    acquire(): Promise<() => void> {
      let release!: () => void;
      const next = new Promise<void>((resolve) => {
        release = resolve;
      });
      const wait = chain;
      chain = wait.then(() => next);
      return wait.then(() => release);
    },
  };
}

const mutex = processSingleton("__santaGoSignalMutex", createMutex);

/** Test hook: replace child_process.spawn. Pass `null` to restore. */
export function setGoSignalSpawn(fn: SpawnImpl | null): void {
  spawnImpl = fn ?? (spawn as SpawnImpl);
}

/** Test hook: replace fetch used for GitHub downloads. Pass `null` to restore. */
export function setGoSignalFetch(fn: FetchImpl | null): void {
  fetchImpl = fn ?? fetch;
}

function goSignalBinDir(): string {
  return process.env.GOSIGNAL_BIN_DIR ?? DEFAULT_BIN_DIR;
}

export function goSignalBinPath(): string {
  const override = process.env.SIGNAL_CLI || process.env.GOSIGNAL_BIN;
  if (override) return override;
  return path.join(goSignalBinDir(), "go-signal");
}

export function releaseAssetName(
  platform = process.platform,
  arch = process.arch,
): string {
  const os =
    platform === "darwin"
      ? "darwin"
      : platform === "linux"
        ? "linux"
        : platform === "win32"
          ? "windows"
          : null;
  const cpu = arch === "arm64" ? "arm64" : arch === "x64" ? "amd64" : null;
  if (!os || !cpu) {
    throw new Error(
      `go-signal has no binary for ${platform}/${arch}. Link device needs linux/darwin on amd64 or arm64.`,
    );
  }
  const ext = os === "windows" ? "zip" : "tar.gz";
  return `go-signal_${GOSIGNAL_VERSION}_${os}_${cpu}.${ext}`;
}

export function parseLinkUri(text: string): string | null {
  const match = text.match(/sgnl:\/\/linkdevice\?[^\s]+/);
  return match?.[0] ?? null;
}

export function parseLinkedNumber(text: string): string | null {
  const match = text.match(/^Linked (\+\d+)/m);
  return match?.[1] ?? null;
}

export function parseSha256Sums(text: string, assetName: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && parts[parts.length - 1] === assetName) {
      return parts[0];
    }
  }
  throw new Error(`SHA256SUMS has no entry for ${assetName}.`);
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export type SendJsonResult = {
  ok: boolean;
  error?: string;
};

export function parseSendJson(stdout: string): SendJsonResult {
  const json = extractJsonObject(stdout);
  if (!json) return { ok: false, error: stdout.trim() || "empty go-signal output" };
  const send = json.send as
    | { results?: Array<{ success?: boolean; error?: string }> }
    | undefined;
  const results = send?.results ?? [];
  const failed = results.find((r) => r.success === false);
  if (failed) {
    return { ok: false, error: failed.error || "send failed" };
  }
  return { ok: true };
}

export type ParsedContact = {
  aci?: string;
  number?: string;
  name?: string;
  blocked: boolean;
};

export function parseContactsJson(stdout: string): ParsedContact[] {
  const json = extractJsonObject(stdout);
  if (!json) return [];
  const list = json.contacts;
  if (!Array.isArray(list)) return [];
  const out: ParsedContact[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    out.push({
      aci: optionalString(row.aci),
      number: optionalString(row.number),
      name: optionalString(row.name),
      blocked: row.blocked === true,
    });
  }
  return out;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Unpack a named file (matched by basename) from a gzipped ustar archive. */
export function extractNamedFileFromTarGz(
  archive: Buffer,
  wantedBase: string,
): Buffer {
  const tar = zlib.gunzipSync(archive);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    const name = readTarString(header, 0, 100);
    if (!name) break;
    const prefix = readTarString(header, 345, 155);
    const full = prefix ? `${prefix}/${name}` : name;
    const size = parseInt(readTarString(header, 124, 12), 8) || 0;
    offset += 512;
    const data = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    const type = String.fromCharCode(header[156] || 0);
    if (type === "5" || type === "g" || type === "x" || type === "L") continue;
    const base = full.split("/").pop();
    if (base === wantedBase || full === wantedBase) return Buffer.from(data);
  }
  throw new Error(`Archive does not contain ${wantedBase}.`);
}

function readTarString(header: Buffer, start: number, length: number): string {
  return header.subarray(start, start + length).toString("utf8").replace(/\0+$/, "").trim();
}

const resolvedBinByDest = new Map<string, string>();

export async function ensureGoSignalBinary(): Promise<string> {
  const override = process.env.SIGNAL_CLI || process.env.GOSIGNAL_BIN;
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`SIGNAL_CLI / GOSIGNAL_BIN does not exist: ${override}`);
    }
    return override;
  }

  const dest = goSignalBinPath();
  const cached = resolvedBinByDest.get(dest);
  if (cached) return cached;

  const versionPath = `${dest}.version`;
  if (
    fs.existsSync(dest) &&
    fs.existsSync(versionPath) &&
    fs.readFileSync(versionPath, "utf8").trim() === GOSIGNAL_VERSION
  ) {
    resolvedBinByDest.set(dest, dest);
    return dest;
  }

  const asset = releaseAssetName();
  const sumsUrl = `${RELEASE_BASE}/SHA256SUMS`;
  const tarUrl = `${RELEASE_BASE}/${asset}`;

  let sumsText: string;
  try {
    sumsText = await downloadText(sumsUrl);
  } catch (e) {
    throw wrapDownloadError("SHA256SUMS", e);
  }
  const expected = parseSha256Sums(sumsText, asset);

  let archive: Buffer;
  try {
    archive = await downloadBuffer(tarUrl);
  } catch (e) {
    throw wrapDownloadError(asset, e);
  }

  const actual = sha256Hex(archive);
  if (actual !== expected) {
    throw new Error(
      `go-signal download checksum mismatch for ${asset} (got ${actual}, expected ${expected}).`,
    );
  }

  let binary: Buffer;
  try {
    binary = extractNamedFileFromTarGz(archive, "go-signal");
  } catch (e) {
    throw new Error(
      `Could not extract go-signal from ${asset}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, binary, { mode: 0o755 });
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, dest);
  fs.writeFileSync(versionPath, `${GOSIGNAL_VERSION}\n`);
  resolvedBinByDest.set(dest, dest);
  return dest;
}

function wrapDownloadError(what: string, e: unknown): Error {
  const detail = e instanceof Error ? e.message : String(e);
  return new Error(
    `Could not download go-signal ${what} from GitHub (${detail}). ` +
      "The server needs outbound HTTPS to github.com.",
  );
}

async function downloadText(url: string): Promise<string> {
  const res = await fetchImpl(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetchImpl(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Run a one-shot go-signal command with `--data-dir` pointed at the Signal store.
 * Serialized with other go-signal invocations.
 */
export async function runGoSignal(
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<RunResult> {
  const bin = await ensureGoSignalBinary();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_RUN_MS;
  return mutex.run(() =>
    collectProcess(bin, ["--data-dir", signalStoreDir(), ...args], timeoutMs),
  );
}

/**
 * Start `go-signal link`. Holds the process lock until the child exits.
 * Await `session.ready` for the first provisioning URI (it rejects on failure).
 */
export async function startGoSignalLink(
  deviceName: string,
  onUri: (uri: string) => void,
  onLine?: (line: string) => void,
): Promise<LinkSession> {
  const bin = await ensureGoSignalBinary();
  const release = await mutex.acquire();
  try {
    return spawnLink(bin, deviceName, onUri, release, onLine);
  } catch (e) {
    release();
    throw e;
  }
}

function spawnLink(
  bin: string,
  deviceName: string,
  onUri: (uri: string) => void,
  onClose: () => void,
  onLine?: (line: string) => void,
): LinkSession {
  const args = [
    "--data-dir",
    signalStoreDir(),
    "link",
    "--name",
    deviceName,
    "--sync-timeout",
    "0s",
  ];
  const child = spawnImpl(bin, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let readySettled = false;
  let finishedSettled = false;
  let sawUri = false;
  let resolveFinished!: (code: number) => void;
  const finished = new Promise<number>((resolve) => {
    resolveFinished = resolve;
  });
  let resolveReady!: () => void;
  let rejectReady!: (e: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const stderrChunks: Buffer[] = [];
  const stdoutBuf = { text: "" };

  const settleReady = (err?: Error) => {
    if (readySettled) return;
    readySettled = true;
    if (err) rejectReady(err);
    else resolveReady();
  };

  const settleFinished = (code: number) => {
    if (finishedSettled) return;
    finishedSettled = true;
    onClose();
    resolveFinished(code);
  };

  const emitUris = (text: string) => {
    const uri = parseLinkUri(text);
    if (!uri) return;
    sawUri = true;
    onUri(uri);
    settleReady();
  };

  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrChunks.push(Buffer.from(chunk));
  });
  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdoutBuf.text += chunk.toString();
    const parts = stdoutBuf.text.split(/\r?\n/);
    stdoutBuf.text = parts.pop()!;
    for (const line of parts) {
      onLine?.(line);
      emitUris(line);
    }
  });

  child.on("error", (err) => {
    const wrapped = new Error(`Failed to start go-signal (${err.message}).`);
    settleReady(wrapped);
    settleFinished(1);
  });
  child.on("close", (code) => {
    if (stdoutBuf.text) onLine?.(stdoutBuf.text);
    emitUris(stdoutBuf.text);
    const exit = code ?? 1;
    if (!sawUri) {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      settleReady(
        new Error(
          stderr ||
            `go-signal link exited ${exit} before printing a linking QR.`,
        ),
      );
    }
    settleFinished(exit);
  });

  const session: LinkSession = {
    kill() {
      try {
        child.kill("SIGINT");
      } catch {
        /* already gone */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, killFollowupMs).unref?.();
    },
    finished,
    ready,
  };

  setTimeout(() => {
    if (readySettled) return;
    session.kill();
    settleReady(
      new Error("Timed out waiting for a Signal linking QR from go-signal."),
    );
  }, firstUriMs).unref?.();

  return session;
}

async function collectProcess(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let done = false;

    const finish = (code: number | null, err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
        return;
      }
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      finish(null, new Error(`go-signal timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    timer.unref?.();

    child.stdout?.on("data", (c: Buffer | string) =>
      stdoutChunks.push(Buffer.from(c)),
    );
    child.stderr?.on("data", (c: Buffer | string) =>
      stderrChunks.push(Buffer.from(c)),
    );
    child.on("error", (err) =>
      finish(null, new Error(`Failed to start go-signal (${err.message}).`)),
    );
    child.on("close", (code) => finish(code));
  });
}


import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import type { ChildProcess } from "node:child_process";
import {
  ensureGoSignalBinary,
  extractNamedFileFromTarGz,
  GOSIGNAL_VERSION,
  parseLinkUri,
  parseLinkedNumber,
  parseContactsJson,
  parseSendJson,
  parseSha256Sums,
  releaseAssetName,
  resetGoSignalBinCache,
  setGoSignalFetch,
  setGoSignalFirstUriMs,
  setGoSignalKillFollowupMs,
  setGoSignalSpawn,
  sha256Hex,
  goSignalBinPath,
  runGoSignal,
  startGoSignalLink,
} from "@/lib/go-signal";

function tarHeader(name: string, size: number, type = 0x30): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "utf8");
  header.write("0000000\0", 108, 8, "utf8");
  header.write("0000000\0", 116, 8, "utf8");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "utf8");
  header.write("00000000000\0", 136, 12, "utf8");
  header[156] = type;
  header.write("ustar\0", 257, 6, "utf8");
  header.write("00", 263, 2, "utf8");
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");
  return header;
}

function packTarGz(name: string, content: Buffer): Buffer {
  const size = content.length;
  const padded = Buffer.alloc(Math.ceil(size / 512) * 512);
  content.copy(padded);
  const tar = Buffer.concat([tarHeader(name, size), padded, Buffer.alloc(1024)]);
  return zlib.gzipSync(tar);
}

function fakeChild(opts: {
  stdout?: string;
  stderr?: string;
  code?: number;
  delayMs?: number;
}): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = vi.fn(() => {
    child.emit("close", 1);
    return true;
  }) as ChildProcess["kill"];
  const delay = opts.delayMs ?? 5;
  setTimeout(() => {
    if (opts.stdout) stdout.push(opts.stdout);
    if (opts.stderr) stderr.push(opts.stderr);
    stdout.push(null);
    stderr.push(null);
    child.emit("close", opts.code ?? 0);
  }, delay);
  return child;
}

describe("releaseAssetName", () => {
  it("maps darwin arm64 and linux x64", () => {
    expect(releaseAssetName("darwin", "arm64")).toBe(
      `go-signal_${GOSIGNAL_VERSION}_darwin_arm64.tar.gz`,
    );
    expect(releaseAssetName("linux", "x64")).toBe(
      `go-signal_${GOSIGNAL_VERSION}_linux_amd64.tar.gz`,
    );
  });

  it("rejects unsupported platforms", () => {
    expect(() => releaseAssetName("freebsd", "x64")).toThrow(/no binary/);
    expect(() => releaseAssetName("linux", "ia32")).toThrow(/no binary/);
  });

  it("uses a zip on Windows", () => {
    expect(releaseAssetName("win32", "x64")).toBe(
      `go-signal_${GOSIGNAL_VERSION}_windows_amd64.zip`,
    );
  });
});

describe("parsers", () => {
  it("extracts a provisioning URI from mixed QR output", () => {
    expect(
      parseLinkUri("hello\nsgnl://linkdevice?uuid=abc&pub_key=def\nScan this"),
    ).toBe("sgnl://linkdevice?uuid=abc&pub_key=def");
    expect(parseLinkUri("nope")).toBeNull();
  });

  it("parses the Linked number line", () => {
    expect(
      parseLinkedNumber("Linked +15550100 (ACI 11111111-1111-1111-1111-111111111111, device 2)\n"),
    ).toBe("+15550100");
    expect(parseLinkedNumber("still linking")).toBeNull();
  });

  it("reads a SHA256SUMS line for the asset", () => {
    const sums = [
      "aaaa  go-signal_0.3.0_linux_amd64.tar.gz",
      "bbbb  go-signal_0.3.0_darwin_arm64.tar.gz",
    ].join("\n");
    expect(parseSha256Sums(sums, "go-signal_0.3.0_darwin_arm64.tar.gz")).toBe(
      "bbbb",
    );
    expect(() => parseSha256Sums(sums, "missing.tar.gz")).toThrow(/no entry/);
    expect(
      parseSha256Sums(
        "# comment\n\nbbbb  go-signal_0.3.0_darwin_arm64.tar.gz\n",
        "go-signal_0.3.0_darwin_arm64.tar.gz",
      ),
    ).toBe("bbbb");
  });

  it("maps send JSON success and per-recipient failure", () => {
    expect(parseSendJson(JSON.stringify({ version: 1 }))).toEqual({ ok: true });
    expect(
      parseSendJson(
        JSON.stringify({
          version: 1,
          send: {
            results: [{ success: true }, { success: true }],
          },
        }),
      ),
    ).toEqual({ ok: true });
    expect(
      parseSendJson(
        JSON.stringify({
          version: 1,
          send: {
            results: [
              { success: true },
              { success: false, error: "not registered" },
            ],
          },
        }),
      ),
    ).toEqual({ ok: false, error: "not registered" });
  });

  it("parses contacts list JSON", () => {
    expect(
      parseContactsJson(
        JSON.stringify({
          version: 1,
          contacts: [
            {
              aci: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              number: "+15550101",
              name: "Alice",
              blocked: false,
            },
            { number: "+15550102", blocked: true },
          ],
        }),
      ),
    ).toEqual([
      {
        aci: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        number: "+15550101",
        name: "Alice",
        blocked: false,
      },
      { number: "+15550102", blocked: true },
    ]);
    expect(parseContactsJson("not json")).toEqual([]);
    expect(parseContactsJson(JSON.stringify({ version: 1, contacts: {} }))).toEqual(
      [],
    );
    expect(
      parseContactsJson(
        JSON.stringify({ version: 1, contacts: [null, "x", { name: "Ada" }] }),
      ),
    ).toEqual([{ name: "Ada", blocked: false }]);
  });

  it("falls back to send failed when a result has no error", () => {
    expect(
      parseSendJson(
        JSON.stringify({
          version: 1,
          send: { results: [{ success: false }] },
        }),
      ),
    ).toEqual({ ok: false, error: "send failed" });
  });

  it("maps empty send output to a failure", () => {
    expect(parseSendJson("")).toEqual({
      ok: false,
      error: "empty go-signal output",
    });
    expect(parseSendJson("{nope")).toEqual({
      ok: false,
      error: "{nope",
    });
    expect(parseSendJson("{]")).toEqual({
      ok: false,
      error: "{]",
    });
    expect(parseSendJson("{]}")).toEqual({
      ok: false,
      error: "{]}",
    });
  });
});

describe("goSignalBinPath", () => {
  it("joins the default bin dir when no override is set", () => {
    delete process.env.GOSIGNAL_BIN_DIR;
    delete process.env.SIGNAL_CLI;
    delete process.env.GOSIGNAL_BIN;
    expect(goSignalBinPath()).toBe(path.join("data/bin", "go-signal"));
  });
});

describe("extractNamedFileFromTarGz", () => {
  it("extracts a nested file by basename", () => {
    const body = Buffer.from("hello-binary");
    const archive = packTarGz("bin/go-signal", body);
    expect(extractNamedFileFromTarGz(archive, "go-signal").toString()).toBe(
      "hello-binary",
    );
  });

  it("throws when the name is missing", () => {
    const archive = packTarGz("README", Buffer.from("x"));
    expect(() => extractNamedFileFromTarGz(archive, "go-signal")).toThrow(
      /does not contain/,
    );
  });

  it("matches a prefix+name header", () => {
    const body = Buffer.from("hello-binary");
    const header = tarHeader("go-signal", body.length);
    header.write("usr/bin", 345, 155, "utf8");
    const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
    body.copy(padded);
    const archive = zlib.gzipSync(Buffer.concat([header, padded, Buffer.alloc(1024)]));
    expect(extractNamedFileFromTarGz(archive, "go-signal").toString()).toBe(
      "hello-binary",
    );
  });

  it("treats a missing type flag as a regular file", () => {
    const body = Buffer.from("hello-binary");
    const header = tarHeader("go-signal", body.length, 0);
    const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
    body.copy(padded);
    const archive = zlib.gzipSync(
      Buffer.concat([header, padded, Buffer.alloc(1024)]),
    );
    expect(extractNamedFileFromTarGz(archive, "go-signal").toString()).toBe(
      "hello-binary",
    );
  });

  it("skips directory entries", () => {
    const body = Buffer.from("hello-binary");
    const dir = tarHeader("bin/", 0, 0x35);
    const file = tarHeader("go-signal", body.length);
    const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
    body.copy(padded);
    const archive = zlib.gzipSync(Buffer.concat([dir, file, padded, Buffer.alloc(1024)]));
    expect(extractNamedFileFromTarGz(archive, "go-signal").toString()).toBe(
      "hello-binary",
    );
  });
});

describe("ensureGoSignalBinary", () => {
  let tmp: string;

  afterEach(() => {
    setGoSignalFetch(null);
    setGoSignalSpawn(null);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("downloads, verifies SHA256, and installs the binary", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    vi.stubEnv("GOSIGNAL_BIN_DIR", tmp);
    const body = Buffer.from("fake-go-signal");
    const archive = packTarGz("go-signal", body);
    const asset = releaseAssetName();
    const digest = sha256Hex(archive);
    const sums = `${digest}  ${asset}\n`;

    setGoSignalFetch(async (input) => {
      const url = String(input);
      if (url.endsWith("SHA256SUMS")) {
        return new Response(sums, { status: 200 });
      }
      if (url.endsWith(asset)) {
        return new Response(new Uint8Array(archive), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    });

    const { ensureGoSignalBinary, goSignalBinPath } = await import(
      "@/lib/go-signal"
    );
    const installed = await ensureGoSignalBinary();
    expect(installed).toBe(goSignalBinPath());
    expect(fs.readFileSync(installed).toString()).toBe("fake-go-signal");
    expect(fs.readFileSync(`${installed}.version`, "utf8").trim()).toBe(
      GOSIGNAL_VERSION,
    );
  });

  it("rejects a checksum mismatch", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    vi.stubEnv("GOSIGNAL_BIN_DIR", tmp);
    const archive = packTarGz("go-signal", Buffer.from("x"));
    const asset = releaseAssetName();
    setGoSignalFetch(async (input) => {
      const url = String(input);
      if (url.endsWith("SHA256SUMS")) {
        return new Response(`deadbeef  ${asset}\n`, { status: 200 });
      }
      return new Response(new Uint8Array(archive), { status: 200 });
    });

    const { ensureGoSignalBinary } = await import("@/lib/go-signal");
    await expect(ensureGoSignalBinary()).rejects.toThrow(/checksum mismatch/);
  });

  it("returns a SIGNAL_CLI override that exists", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    const bin = path.join(tmp, "cli");
    fs.writeFileSync(bin, "x", { mode: 0o755 });
    vi.stubEnv("SIGNAL_CLI", bin);
    expect(goSignalBinPath()).toBe(bin);
    await expect(ensureGoSignalBinary()).resolves.toBe(bin);
  });

  it("throws when SIGNAL_CLI does not exist", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    vi.stubEnv("SIGNAL_CLI", path.join(tmp, "missing"));
    await expect(ensureGoSignalBinary()).rejects.toThrow(/does not exist/);
  });

  it("reuses a matching on-disk binary and the in-memory cache", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    vi.stubEnv("GOSIGNAL_BIN_DIR", tmp);
    vi.stubEnv("SIGNAL_CLI", "");
    vi.stubEnv("GOSIGNAL_BIN", "");
    const dest = path.join(tmp, "go-signal");
    fs.writeFileSync(dest, "cached", { mode: 0o755 });
    fs.writeFileSync(`${dest}.version`, `${GOSIGNAL_VERSION}\n`);
    resetGoSignalBinCache();
    const fetchMock = vi.fn();
    setGoSignalFetch(fetchMock);
    await expect(ensureGoSignalBinary()).resolves.toBe(dest);
    await expect(ensureGoSignalBinary()).resolves.toBe(dest);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a GOSIGNAL_BIN override that exists", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    const bin = path.join(tmp, "cli");
    fs.writeFileSync(bin, "x", { mode: 0o755 });
    vi.stubEnv("SIGNAL_CLI", "");
    vi.stubEnv("GOSIGNAL_BIN", bin);
    resetGoSignalBinCache();
    expect(goSignalBinPath()).toBe(bin);
    await expect(ensureGoSignalBinary()).resolves.toBe(bin);
  });

  it("wraps SHA256SUMS download failures", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    vi.stubEnv("GOSIGNAL_BIN_DIR", tmp);
    vi.stubEnv("SIGNAL_CLI", "");
    vi.stubEnv("GOSIGNAL_BIN", "");
    resetGoSignalBinCache();
    setGoSignalFetch(async () => {
      throw "offline";
    });
    await expect(ensureGoSignalBinary()).rejects.toThrow(/SHA256SUMS/);
  });

  it("wraps a SHA256SUMS HTTP error", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    vi.stubEnv("GOSIGNAL_BIN_DIR", tmp);
    vi.stubEnv("SIGNAL_CLI", "");
    vi.stubEnv("GOSIGNAL_BIN", "");
    resetGoSignalBinCache();
    setGoSignalFetch(async () => new Response("nope", { status: 404 }));
    await expect(ensureGoSignalBinary()).rejects.toThrow(/HTTP 404/);
  });

  it("wraps archive HTTP failures", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    vi.stubEnv("GOSIGNAL_BIN_DIR", tmp);
    vi.stubEnv("SIGNAL_CLI", "");
    vi.stubEnv("GOSIGNAL_BIN", "");
    resetGoSignalBinCache();
    const asset = releaseAssetName();
    setGoSignalFetch(async (input) => {
      const url = String(input);
      if (url.endsWith("SHA256SUMS")) {
        return new Response(`deadbeef  ${asset}\n`, { status: 200 });
      }
      return new Response("nope", { status: 404 });
    });
    await expect(ensureGoSignalBinary()).rejects.toThrow(/HTTP 404/);
  });

  it("wraps extract failures", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    vi.stubEnv("GOSIGNAL_BIN_DIR", tmp);
    vi.stubEnv("SIGNAL_CLI", "");
    vi.stubEnv("GOSIGNAL_BIN", "");
    resetGoSignalBinCache();
    const archive = packTarGz("README", Buffer.from("x"));
    const asset = releaseAssetName();
    const digest = sha256Hex(archive);
    setGoSignalFetch(async (input) => {
      const url = String(input);
      if (url.endsWith("SHA256SUMS")) {
        return new Response(`${digest}  ${asset}\n`, { status: 200 });
      }
      return new Response(new Uint8Array(archive), { status: 200 });
    });
    await expect(ensureGoSignalBinary()).rejects.toThrow(/Could not extract/);
  });

  it("stringifies a non-Error extract failure", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    vi.stubEnv("GOSIGNAL_BIN_DIR", tmp);
    vi.stubEnv("SIGNAL_CLI", "");
    vi.stubEnv("GOSIGNAL_BIN", "");
    resetGoSignalBinCache();
    const archive = packTarGz("go-signal", Buffer.from("x"));
    const asset = releaseAssetName();
    const digest = sha256Hex(archive);
    setGoSignalFetch(async (input) => {
      const url = String(input);
      if (url.endsWith("SHA256SUMS")) {
        return new Response(`${digest}  ${asset}\n`, { status: 200 });
      }
      return new Response(new Uint8Array(archive), { status: 200 });
    });
    vi.spyOn(zlib, "gunzipSync").mockImplementation(() => {
      throw "corrupt tar";
    });
    await expect(ensureGoSignalBinary()).rejects.toThrow(/corrupt tar/);
  });

  it("stringifies a non-Error download failure", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-gosignal-"));
    vi.stubEnv("GOSIGNAL_BIN_DIR", tmp);
    vi.stubEnv("SIGNAL_CLI", "");
    vi.stubEnv("GOSIGNAL_BIN", "");
    resetGoSignalBinCache();
    setGoSignalFetch(async () => {
      throw "offline";
    });
    await expect(ensureGoSignalBinary()).rejects.toThrow(/offline/);
  });
});

describe("runGoSignal mutex", () => {
  afterEach(() => {
    setGoSignalSpawn(null);
  });

  it("runs invocations one at a time", async () => {
    const order: string[] = [];
    setGoSignalSpawn((_cmd, args) => {
      const label = args.includes("send") ? "send" : "receive";
      return fakeChild({
        stdout: label,
        delayMs: label === "send" ? 40 : 5,
      });
    });
    vi.stubEnv("SIGNAL_CLI", "/tmp/fake-go-signal");
    tmpWriteFakeBin();

    const { runGoSignal } = await import("@/lib/go-signal");
    const send = runGoSignal(["send", "+1", "-m", "hi"]).then((r) => {
      order.push(`send:${r.code}`);
      return r;
    });
    const receive = runGoSignal(["receive"]).then((r) => {
      order.push(`receive:${r.code}`);
      return r;
    });
    await Promise.all([send, receive]);
    expect(order).toEqual(["send:0", "receive:0"]);
  });

  it("times out a hung process and captures stderr", async () => {
    tmpWriteFakeBin();
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      child.stdout = stdout;
      child.stderr = stderr;
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => stderr.push("busy"), 5);
      return child;
    });
    await expect(runGoSignal(["receive"], { timeoutMs: 30 })).rejects.toThrow(
      /timed out/,
    );
  });

  it("treats a null exit code as 1", async () => {
    tmpWriteFakeBin();
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => child.emit("close", null), 5);
      return child;
    });
    await expect(runGoSignal(["receive"])).resolves.toMatchObject({ code: 1 });
  });

  it("rejects when spawn emits an error", async () => {
    tmpWriteFakeBin();
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => child.emit("error", new Error("enoent")), 5);
      return child;
    });
    await expect(runGoSignal(["receive"], { timeoutMs: 200 })).rejects.toThrow(
      /Failed to start go-signal/,
    );
  });

  it("ignores a second close on a one-shot process", async () => {
    tmpWriteFakeBin();
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => {
        child.emit("close", 0);
        child.emit("close", 0);
      }, 5);
      return child;
    });
    await expect(runGoSignal(["receive"])).resolves.toMatchObject({ code: 0 });
  });
});

describe("startGoSignalLink", () => {
  afterEach(() => {
    setGoSignalSpawn(null);
    setGoSignalFirstUriMs(null);
    setGoSignalKillFollowupMs(null);
  });

  it("emits URIs from stdout and resolves ready", async () => {
    const uris: string[] = [];
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      child.stdout = stdout;
      child.stderr = stderr;
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => {
        stdout.push("sgnl://linkdevice?uuid=one\n");
        stdout.push("QR JUNK\n");
        stdout.push("sgnl://linkdevice?uuid=two\n");
        stdout.push("Linked +15550100 (ACI aaa, device 2)\n");
        stdout.push(null);
        stderr.push(null);
        child.emit("close", 0);
      }, 10);
      return child;
    });
    tmpWriteFakeBin();

    const { startGoSignalLink } = await import("@/lib/go-signal");
    const session = await startGoSignalLink("Santa", (uri) => uris.push(uri));
    await session.ready;
    expect(uris[0]).toBe("sgnl://linkdevice?uuid=one");
    const code = await session.finished;
    expect(code).toBe(0);
    expect(uris).toEqual([
      "sgnl://linkdevice?uuid=one",
      "sgnl://linkdevice?uuid=two",
    ]);
  });

  it("treats a null link exit code as 1", async () => {
    tmpWriteFakeBin();
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      child.stdout = stdout;
      child.stderr = stderr;
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => {
        stdout.push(null);
        stderr.push(null);
        child.emit("close", null);
      }, 10);
      return child;
    });
    const session = await startGoSignalLink("Santa", () => {});
    await expect(session.ready).rejects.toThrow(/exited 1/);
    await expect(session.finished).resolves.toBe(1);
  });

  it("rejects ready when the process exits before a URI", async () => {
    tmpWriteFakeBin();
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      child.stdout = stdout;
      child.stderr = stderr;
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => {
        stdout.push("still waiting");
        stderr.push("no qr");
        stdout.push(null);
        stderr.push(null);
        child.emit("close", 1);
      }, 10);
      return child;
    });
    const session = await startGoSignalLink("Santa", () => {}, (line) => {
      expect(line).toBeDefined();
    });
    await expect(session.ready).rejects.toThrow(/exited 1|no qr/);
  });

  it("rejects ready on spawn error", async () => {
    tmpWriteFakeBin();
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => child.emit("error", new Error("enoent")), 5);
      return child;
    });
    const session = await startGoSignalLink("Santa", () => {});
    await expect(session.ready).rejects.toThrow(/Failed to start go-signal/);
  });

  it("times out waiting for a URI and follows up with SIGKILL", async () => {
    tmpWriteFakeBin();
    setGoSignalFirstUriMs(20);
    setGoSignalKillFollowupMs(10);
    const kill = vi.fn((signal?: NodeJS.Signals) => {
      if (signal === "SIGKILL") throw new Error("gone");
      return true;
    });
    let child!: ChildProcess;
    setGoSignalSpawn(() => {
      child = new EventEmitter() as ChildProcess;
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.kill = kill as ChildProcess["kill"];
      return child;
    });
    const session = await startGoSignalLink("Santa", () => {});
    await expect(session.ready).rejects.toThrow(/Timed out waiting/);
    await new Promise((r) => setTimeout(r, 40));
    expect(kill).toHaveBeenCalled();
    child.emit("close", 1);
    await session.finished;
    setGoSignalFirstUriMs(null);
    setGoSignalKillFollowupMs(null);
  });

  it("ignores the URI timeout after a URI is seen", async () => {
    tmpWriteFakeBin();
    setGoSignalFirstUriMs(30);
    let child!: ChildProcess;
    setGoSignalSpawn(() => {
      child = new EventEmitter() as ChildProcess;
      const stdout = new Readable({ read() {} });
      child.stdout = stdout;
      child.stderr = new Readable({ read() {} });
      child.kill = vi.fn(() => {
        child.emit("close", 0);
        return true;
      }) as ChildProcess["kill"];
      setTimeout(() => {
        stdout.push("sgnl://linkdevice?uuid=one\n");
      }, 5);
      return child;
    });
    const session = await startGoSignalLink("Santa", () => {});
    await session.ready;
    await new Promise((r) => setTimeout(r, 40));
    session.kill();
    await session.finished;
    setGoSignalFirstUriMs(null);
  });

  it("releases the mutex when spawn throws", async () => {
    tmpWriteFakeBin();
    setGoSignalSpawn(() => {
      throw new Error("cannot spawn");
    });
    await expect(startGoSignalLink("Santa", () => {})).rejects.toThrow(
      "cannot spawn",
    );
  });

  it("links without piping stdout or stderr", async () => {
    tmpWriteFakeBin();
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      child.stdout = null;
      child.stderr = null;
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => child.emit("close", 1), 5);
      return child;
    });
    const session = await startGoSignalLink("Santa", () => {});
    await expect(session.ready).rejects.toThrow(/exited 1/);
    await expect(session.finished).resolves.toBe(1);
  });

  it("reads Buffer stdout chunks and leftover text without a newline", async () => {
    const uris: string[] = [];
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      child.stdout = stdout;
      child.stderr = stderr;
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => {
        stdout.push(Buffer.from("sgnl://linkdevice?uuid=buf\npartial"));
        stdout.push(null);
        stderr.push(null);
        child.emit("close", 0);
      }, 10);
      return child;
    });
    tmpWriteFakeBin();
    const { startGoSignalLink } = await import("@/lib/go-signal");
    const session = await startGoSignalLink("Santa", (uri) => uris.push(uri));
    await session.ready;
    await expect(session.finished).resolves.toBe(0);
    expect(uris).toEqual(["sgnl://linkdevice?uuid=buf"]);
  });

  it("ignores a second close on a link session", async () => {
    tmpWriteFakeBin();
    setGoSignalSpawn(() => {
      const child = new EventEmitter() as ChildProcess;
      const stdout = new Readable({ read() {} });
      child.stdout = stdout;
      child.stderr = new Readable({ read() {} });
      child.kill = vi.fn(() => true) as ChildProcess["kill"];
      setTimeout(() => {
        stdout.push("sgnl://linkdevice?uuid=one\n");
        stdout.push(null);
        child.emit("close", 0);
        child.emit("close", 0);
      }, 10);
      return child;
    });
    const session = await startGoSignalLink("Santa", () => {});
    await session.ready;
    await expect(session.finished).resolves.toBe(0);
  });
});

function tmpWriteFakeBin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "santa-fakebin-"));
  const bin = path.join(dir, "go-signal");
  fs.writeFileSync(bin, "x", { mode: 0o755 });
  vi.stubEnv("SIGNAL_CLI", bin);
}

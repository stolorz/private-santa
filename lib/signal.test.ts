import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const runGoSignal = vi.fn();
const noteDeviceUnlinked = vi.fn();

vi.mock("@/lib/go-signal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/go-signal")>();
  return {
    ...actual,
    runGoSignal: (...args: unknown[]) => runGoSignal(...args),
  };
});

vi.mock("@/lib/signal-link", () => ({
  noteDeviceUnlinked: (...args: unknown[]) => noteDeviceUnlinked(...args),
}));

function writeLinked(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".linked"), "ok");
}

describe("signal", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-signal-"));
    vi.stubEnv("SIGNAL_STORE_DIR", tmp);
    runGoSignal.mockReset();
    noteDeviceUnlinked.mockReset();
    runGoSignal.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        version: 1,
        send: { results: [{ success: true }] },
      }),
      stderr: "",
    });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("isSignalConfigured is false without a .linked marker", async () => {
    const { isSignalConfigured } = await import("@/lib/signal");
    expect(isSignalConfigured()).toBe(false);
  });

  it("isSignalConfigured is true after markSignalLinked", async () => {
    const { isSignalConfigured } = await import("@/lib/signal");
    const { markSignalLinked } = await import("@/lib/signal-store");
    markSignalLinked();
    expect(isSignalConfigured()).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".linked"))).toBe(true);
  });

  it("unlinkSignal removes the store so the channel is unconfigured", async () => {
    const { isSignalConfigured } = await import("@/lib/signal");
    const { markSignalLinked, unlinkSignal } = await import(
      "@/lib/signal-store"
    );
    markSignalLinked();
    unlinkSignal();
    expect(isSignalConfigured()).toBe(false);
    expect(fs.existsSync(tmp)).toBe(false);
  });

  it("sendBatch throws when not configured", async () => {
    const { sendBatch } = await import("@/lib/signal");
    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "https://santa.test/reveal/tok" },
      ]),
    ).rejects.toThrow(/signal:link/);
  });

  it("sends E.164 and a provided text body", async () => {
    writeLinked(tmp);
    const { sendBatch } = await import("@/lib/signal");

    const results = await sendBatch([
      {
        to: "351911111111",
        giverName: "Ana",
        secondParam: "https://santa.test/reveal/tok",
        text: "Cześć Ana! https://santa.test/reveal/tok",
      },
    ]);

    expect(results).toEqual([{ to: "351911111111", ok: true }]);
    expect(runGoSignal).toHaveBeenCalledWith(
      [
        "-o",
        "json",
        "send",
        "+351911111111",
        "-m",
        "Cześć Ana! https://santa.test/reveal/tok",
      ],
      expect.anything(),
    );
  });

  it("maps send failures to { ok: false } and never throws", async () => {
    writeLinked(tmp);
    runGoSignal.mockResolvedValue({
      code: 1,
      stdout: JSON.stringify({
        version: 1,
        send: { results: [{ success: false, error: "not registered" }] },
      }),
      stderr: "",
    });
    const { sendBatch } = await import("@/lib/signal");

    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "https://santa.test/reveal/tok" },
      ]),
    ).resolves.toEqual([
      {
        to: "351911111111",
        ok: false,
        error: "not registered",
      },
    ]);
  });

  it("returns per-recipient results when some sends fail", async () => {
    writeLinked(tmp);
    runGoSignal
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          version: 1,
          send: { results: [{ success: true }] },
        }),
        stderr: "",
      })
      .mockResolvedValueOnce({
        code: 1,
        stdout: JSON.stringify({
          version: 1,
          send: { results: [{ success: false, error: "timeout" }] },
        }),
        stderr: "",
      });
    const { sendBatch } = await import("@/lib/signal");

    const results = await sendBatch([
      { to: "351911111111", giverName: "Ana", secondParam: "https://santa.test/reveal/a" },
      { to: "351922222222", giverName: "Cara", secondParam: "https://santa.test/reveal/b" },
    ]);

    expect(results[0]).toEqual({ to: "351911111111", ok: true });
    expect(results[1]?.ok).toBe(false);
    expect(results[1]?.error).toContain("timeout");
  });

  it("listSignalContacts skips blocked users and maps send targets", async () => {
    writeLinked(tmp);
    runGoSignal.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        version: 1,
        contacts: [
          {
            aci: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            number: "+15550101",
            name: "Alice",
            blocked: false,
          },
          {
            aci: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            number: "+15550102",
            name: "Blocked Bob",
            blocked: true,
          },
          {
            aci: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            name: "ACI only",
            blocked: false,
          },
        ],
      }),
      stderr: "",
    });
    const { listSignalContacts } = await import("@/lib/signal");
    await expect(listSignalContacts()).resolves.toEqual([
      { id: "+15550101", label: "Alice (+15550101)", number: "+15550101" },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        label: "ACI only",
      },
    ]);
    expect(runGoSignal).toHaveBeenCalledWith(
      ["-o", "json", "contacts", "list"],
      expect.anything(),
    );
  });

  it("listSignalContacts can sync from the phone first", async () => {
    writeLinked(tmp);
    runGoSignal
      .mockResolvedValueOnce({ code: 0, stdout: "{}", stderr: "" })
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({ version: 1, contacts: [] }),
        stderr: "",
      });
    const { listSignalContacts } = await import("@/lib/signal");
    await listSignalContacts({ sync: true });
    expect(runGoSignal).toHaveBeenNthCalledWith(
      1,
      ["-o", "json", "account", "sync", "--timeout", "15s"],
      expect.anything(),
    );
    expect(runGoSignal).toHaveBeenNthCalledWith(
      2,
      ["-o", "json", "contacts", "list"],
      expect.anything(),
    );
  });

  it("sendSignalTest sends to Note to Self", async () => {
    writeLinked(tmp);
    const { sendSignalTest, SIGNAL_TEST_MESSAGE } = await import("@/lib/signal");
    await expect(sendSignalTest("self")).resolves.toEqual({
      to: "self",
      ok: true,
    });
    expect(runGoSignal).toHaveBeenCalledWith(
      ["-o", "json", "send", "self", "-m", SIGNAL_TEST_MESSAGE],
      expect.anything(),
    );
  });

  it("sendSignalTest sends to an E.164 contact", async () => {
    writeLinked(tmp);
    const { sendSignalTest, SIGNAL_TEST_MESSAGE } = await import("@/lib/signal");
    await expect(sendSignalTest("+15550101")).resolves.toEqual({
      to: "+15550101",
      ok: true,
    });
    expect(runGoSignal).toHaveBeenCalledWith(
      ["-o", "json", "send", "+15550101", "-m", SIGNAL_TEST_MESSAGE],
      expect.anything(),
    );
  });

  it("sendSignalTest sends to a UUID and a digits-only number", async () => {
    writeLinked(tmp);
    const { sendSignalTest, SIGNAL_TEST_MESSAGE } = await import("@/lib/signal");
    const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await expect(sendSignalTest(` ${uuid} `)).resolves.toEqual({
      to: uuid,
      ok: true,
    });
    expect(runGoSignal).toHaveBeenCalledWith(
      ["-o", "json", "send", uuid, "-m", SIGNAL_TEST_MESSAGE],
      expect.anything(),
    );
    await expect(sendSignalTest("15550101111")).resolves.toMatchObject({
      ok: true,
    });
    await expect(sendSignalTest("   ")).rejects.toThrow(/Note to Self/);
  });

  it("sendBatch uses a UUID recipient and default text", async () => {
    writeLinked(tmp);
    const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { sendBatch } = await import("@/lib/signal");
    await sendBatch([
      { to: uuid, giverName: "Ada", secondParam: "https://santa.test/x" },
    ]);
    expect(runGoSignal).toHaveBeenCalledWith(
      expect.arrayContaining([uuid, "-m", expect.stringContaining("Ada")]),
      expect.anything(),
    );
  });

  it("maps an unlinked send exit and remaining recipients", async () => {
    writeLinked(tmp);
    runGoSignal.mockResolvedValue({
      code: 3,
      stdout: "",
      stderr: "unlinked",
    });
    const { sendBatch } = await import("@/lib/signal");
    const { unlinkSignal } = await import("@/lib/signal-store");
    runGoSignal.mockImplementation(async () => {
      unlinkSignal();
      return { code: 3, stdout: "", stderr: "unlinked" };
    });
    const results = await sendBatch([
      { to: "351911111111", giverName: "Ana", secondParam: "https://a" },
      { to: "351922222222", giverName: "Bea", secondParam: "https://b" },
    ]);
    expect(results[0]?.ok).toBe(false);
    expect(results[1]).toEqual({
      to: "351922222222",
      ok: false,
      error: expect.stringMatching(/unlinked/i),
    });
  });

  it("uses a default send error when go-signal output is empty", async () => {
    writeLinked(tmp);
    const gs = await import("@/lib/go-signal");
    vi.spyOn(gs, "parseSendJson").mockReturnValue({ ok: false });
    runGoSignal.mockResolvedValue({ code: 5, stdout: "", stderr: "" });
    const { sendBatch } = await import("@/lib/signal");
    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "https://a" },
      ]),
    ).resolves.toEqual([
      {
        to: "351911111111",
        ok: false,
        error: "go-signal send exited 5",
      },
    ]);
  });

  it("falls back through stderr and stdout when send JSON has no error", async () => {
    writeLinked(tmp);
    runGoSignal.mockResolvedValue({
      code: 1,
      stdout: "raw out",
      stderr: "",
    });
    const { sendBatch } = await import("@/lib/signal");
    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "https://a" },
      ]),
    ).resolves.toEqual([
      { to: "351911111111", ok: false, error: "raw out" },
    ]);

    runGoSignal.mockResolvedValue({
      code: 7,
      stdout: JSON.stringify({
        version: 1,
        send: { results: [{ success: true }] },
      }),
      stderr: "denied",
    });
    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "https://a" },
      ]),
    ).resolves.toEqual([
      { to: "351911111111", ok: false, error: "denied" },
    ]);

    runGoSignal.mockResolvedValue({
      code: 9,
      stdout: JSON.stringify({
        version: 1,
        send: { results: [{ success: true }] },
      }),
      stderr: "  ",
    });
    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "https://a" },
      ]),
    ).resolves.toEqual([
      {
        to: "351911111111",
        ok: false,
        error: JSON.stringify({
          version: 1,
          send: { results: [{ success: true }] },
        }),
      },
    ]);
  });

  it("stringifies a non-Error send throw", async () => {
    writeLinked(tmp);
    runGoSignal.mockRejectedValue("pipe broke");
    const { sendBatch } = await import("@/lib/signal");
    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "https://a" },
      ]),
    ).resolves.toEqual([
      { to: "351911111111", ok: false, error: "pipe broke" },
    ]);
  });

  it("returns a send error when go-signal throws", async () => {
    writeLinked(tmp);
    runGoSignal.mockRejectedValue(new Error("spawn failed"));
    const { sendBatch } = await import("@/lib/signal");
    await expect(
      sendBatch([
        { to: "351911111111", giverName: "Ana", secondParam: "https://a" },
      ]),
    ).resolves.toEqual([
      { to: "351911111111", ok: false, error: "spawn failed" },
    ]);
  });

  it("listSignalContacts throws on a non-zero list exit", async () => {
    writeLinked(tmp);
    runGoSignal.mockResolvedValue({
      code: 1,
      stdout: "",
      stderr: "store locked",
    });
    const { listSignalContacts } = await import("@/lib/signal");
    await expect(listSignalContacts()).rejects.toThrow("store locked");

    runGoSignal.mockResolvedValue({
      code: 2,
      stdout: "listed badly",
      stderr: "  ",
    });
    await expect(listSignalContacts()).rejects.toThrow("listed badly");

    runGoSignal.mockResolvedValue({
      code: 4,
      stdout: "  ",
      stderr: "  ",
    });
    await expect(listSignalContacts()).rejects.toThrow(
      "go-signal contacts list exited 4",
    );
  });

  it("labels contacts with only a number or ACI", async () => {
    writeLinked(tmp);
    runGoSignal.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        version: 1,
        contacts: [
          { number: "+15550109", blocked: false },
          { aci: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", blocked: false },
        ],
      }),
      stderr: "",
    });
    const { listSignalContacts } = await import("@/lib/signal");
    await expect(listSignalContacts()).resolves.toEqual([
      { id: "+15550109", label: "+15550109", number: "+15550109" },
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        label: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
    ]);
  });

  it("listSignalContacts rethrows an unlink during sync", async () => {
    writeLinked(tmp);
    runGoSignal.mockResolvedValue({ code: 3, stdout: "", stderr: "gone" });
    const { listSignalContacts } = await import("@/lib/signal");
    const { SignalUnlinkedError } = await import("@/lib/errors");
    await expect(listSignalContacts({ sync: true })).rejects.toBeInstanceOf(
      SignalUnlinkedError,
    );
  });

  it("listSignalContacts logs a non-unlink sync failure", async () => {
    writeLinked(tmp);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runGoSignal
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({ version: 1, contacts: [] }),
        stderr: "",
      });
    const { listSignalContacts } = await import("@/lib/signal");
    await expect(listSignalContacts({ sync: true })).resolves.toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it("keepSignalLinked logs receive throws", async () => {
    writeLinked(tmp);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    runGoSignal.mockRejectedValue(new Error("pipe"));
    const { keepSignalLinked } = await import("@/lib/signal");
    await keepSignalLinked();
    expect(error).toHaveBeenCalled();
  });

  it("sendSignalTest rejects an unknown recipient", async () => {
    writeLinked(tmp);
    const { sendSignalTest } = await import("@/lib/signal");
    await expect(sendSignalTest("--help")).rejects.toThrow(/Note to Self/);
    expect(runGoSignal).not.toHaveBeenCalled();
  });

  it("sendSignalTest throws when not configured", async () => {
    const { sendSignalTest } = await import("@/lib/signal");
    await expect(sendSignalTest("self")).rejects.toThrow(/signal:link/);
  });

  it("keepSignalLinked is a no-op when unconfigured", async () => {
    const { keepSignalLinked } = await import("@/lib/signal");
    await keepSignalLinked();
    expect(runGoSignal).not.toHaveBeenCalled();
  });

  it("keepSignalLinked receives when configured and notes an unlink", async () => {
    writeLinked(tmp);
    runGoSignal.mockResolvedValue({ code: 3, stdout: "", stderr: "unlinked" });
    const { keepSignalLinked } = await import("@/lib/signal");
    await keepSignalLinked();
    expect(runGoSignal).toHaveBeenCalledWith(
      ["receive", "--timeout", "5s"],
      expect.anything(),
    );
    expect(noteDeviceUnlinked).toHaveBeenCalled();
  });
});

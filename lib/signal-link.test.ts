import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const startGoSignalLink = vi.fn();
const runGoSignal = vi.fn();

vi.mock("@/lib/go-signal", () => ({
  GOSIGNAL_EXIT_UNLINKED: 3,
  parseLinkedNumber: (text: string) => {
    const m = text.match(/^Linked (\+\d+)/m);
    return m?.[1] ?? null;
  },
  startGoSignalLink: (...args: unknown[]) => startGoSignalLink(...args),
  runGoSignal: (...args: unknown[]) => runGoSignal(...args),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async (url: string) => `data:image/png;base64,QR:${url}`),
  },
}));

describe("signal-link", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "santa-signal-link-"));
    vi.stubEnv("SIGNAL_STORE_DIR", tmp);
    startGoSignalLink.mockReset();
    runGoSignal.mockReset();
    runGoSignal.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
  });

  afterEach(async () => {
    const { resetSignalLinkState } = await import("@/lib/signal-link");
    resetSignalLinkState();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function mockSession(opts: {
    uri?: string;
    code?: number;
    hang?: boolean;
    kill?: () => void;
  }) {
    let resolveFinished!: (code: number) => void;
    const finished = new Promise<number>((resolve) => {
      resolveFinished = resolve;
    });
    const kill = opts.kill ?? vi.fn();
    const session = {
      kill: () => {
        kill();
        resolveFinished(1);
      },
      finished,
      ready: Promise.resolve(),
    };
    startGoSignalLink.mockImplementation(
      async (
        _name: string,
        onUri: (uri: string) => void,
        onLine?: (line: string) => void,
      ) => {
        if (opts.uri) onUri(opts.uri);
        onLine?.("Linked +15550100 (ACI aaa, device 2)");
        if (!opts.hang) queueMicrotask(() => resolveFinished(opts.code ?? 0));
        return session;
      },
    );
    return session;
  }

  it("startSignalLink returns a QR and pending status", async () => {
    mockSession({ uri: "sgnl://linkdevice?uuid=abc", hang: true });
    const { startSignalLink, getSignalLinkStatus } = await import(
      "@/lib/signal-link"
    );

    const started = await startSignalLink();

    expect(started.linking).toBe(true);
    expect(started.linkUrl).toBe("sgnl://linkdevice?uuid=abc");
    await vi.waitFor(() => {
      expect(getSignalLinkStatus().qrDataUrl).toContain(
        "QR:sgnl://linkdevice?uuid=abc",
      );
    });
    expect(getSignalLinkStatus().linking).toBe(true);
    expect(startGoSignalLink).toHaveBeenCalledTimes(1);
  });

  it("reuses an in-flight link instead of requesting a new URL", async () => {
    mockSession({ uri: "sgnl://linkdevice?uuid=abc", hang: true });
    const { startSignalLink } = await import("@/lib/signal-link");

    await startSignalLink();
    await startSignalLink();

    expect(startGoSignalLink).toHaveBeenCalledTimes(1);
  });

  it("marks linked after go-signal link exits 0", async () => {
    mockSession({ uri: "sgnl://linkdevice?uuid=abc", code: 0 });
    const { startSignalLink, getSignalLinkStatus } = await import(
      "@/lib/signal-link"
    );
    const { isSignalConfigured } = await import("@/lib/signal-store");

    await startSignalLink();
    await vi.waitFor(() => {
      expect(isSignalConfigured()).toBe(true);
    });
    expect(getSignalLinkStatus().linking).toBe(false);
    expect(getSignalLinkStatus().accountNumber).toBe("+15550100");
  });

  it("kills the in-flight process on unlink", async () => {
    const kill = vi.fn();
    mockSession({ uri: "sgnl://linkdevice?uuid=abc", hang: true, kill });
    const { startSignalLink, unlinkSignalDevice } = await import(
      "@/lib/signal-link"
    );
    const { isSignalConfigured } = await import("@/lib/signal-store");

    await startSignalLink();
    await unlinkSignalDevice();

    expect(kill).toHaveBeenCalled();
    expect(runGoSignal).toHaveBeenCalledWith(
      ["account", "unlink", "--yes"],
      expect.anything(),
    );
    expect(isSignalConfigured()).toBe(false);
    expect(fs.existsSync(tmp)).toBe(false);
  });

  it("noteDeviceUnlinked wipes the store and records the error", async () => {
    const { markSignalLinked } = await import("@/lib/signal-store");
    markSignalLinked();
    const { noteDeviceUnlinked, getSignalLinkStatus } = await import(
      "@/lib/signal-link"
    );
    noteDeviceUnlinked("dropped");
    expect(getSignalLinkStatus().error).toBe("dropped");
    expect(fs.existsSync(tmp)).toBe(false);
  });

  it("returns already-configured without starting a new link", async () => {
    const { markSignalLinked } = await import("@/lib/signal-store");
    markSignalLinked();
    const { startSignalLink } = await import("@/lib/signal-link");
    const started = await startSignalLink();
    expect(started.configured).toBe(true);
    expect(startGoSignalLink).not.toHaveBeenCalled();
  });

  it("records an unlink when go-signal link exits 3", async () => {
    mockSession({ uri: "sgnl://linkdevice?uuid=abc", code: 3 });
    const { startSignalLink, getSignalLinkStatus } = await import(
      "@/lib/signal-link"
    );
    await startSignalLink();
    await vi.waitFor(() => {
      expect(getSignalLinkStatus().error).toMatch(/unlinked/i);
    });
  });

  it("records a non-zero link exit", async () => {
    mockSession({ uri: "sgnl://linkdevice?uuid=abc", code: 2 });
    const { startSignalLink, getSignalLinkStatus } = await import(
      "@/lib/signal-link"
    );
    await startSignalLink();
    await vi.waitFor(() => {
      expect(getSignalLinkStatus().error).toMatch(/exited 2/);
    });
  });

  it("rethrows when startGoSignalLink fails", async () => {
    startGoSignalLink.mockRejectedValue(new Error("binary missing"));
    const { startSignalLink } = await import("@/lib/signal-link");
    await expect(startSignalLink()).rejects.toThrow("binary missing");
  });

  it("stringifies a non-Error link failure", async () => {
    startGoSignalLink.mockRejectedValue("offline");
    const { startSignalLink, getSignalLinkStatus } = await import(
      "@/lib/signal-link"
    );
    await expect(startSignalLink()).rejects.toBe("offline");
    expect(getSignalLinkStatus().error).toBe("offline");
  });

  it("drops a late QR image after cancel", async () => {
    const qrcode = await import("qrcode");
    let resolveQr!: (data: string) => void;
    vi.mocked(qrcode.default.toDataURL).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveQr = resolve;
        }),
    );
    mockSession({ uri: "sgnl://linkdevice?uuid=abc", hang: true });
    const { startSignalLink, unlinkSignalDevice, getSignalLinkStatus } =
      await import("@/lib/signal-link");
    await startSignalLink();
    await unlinkSignalDevice();
    resolveQr("data:image/png;base64,late");
    await Promise.resolve();
    expect(getSignalLinkStatus().qrDataUrl).toBeNull();
  });

  it("still wipes the store when account unlink throws", async () => {
    runGoSignal.mockRejectedValue(new Error("missing binary"));
    const { unlinkSignalDevice } = await import("@/lib/signal-link");
    await unlinkSignalDevice();
    expect(fs.existsSync(tmp)).toBe(false);
  });

  it("ignores a rejected link session while unlinking", async () => {
    let rejectFinished!: (err: Error) => void;
    const finished = new Promise<number>((_, reject) => {
      rejectFinished = reject;
    });
    startGoSignalLink.mockImplementation(async (_n, onUri) => {
      onUri("sgnl://linkdevice?uuid=abc");
      return {
        kill: vi.fn(),
        finished,
        ready: Promise.resolve(),
      };
    });
    const { startSignalLink, unlinkSignalDevice } = await import(
      "@/lib/signal-link"
    );
    await startSignalLink();
    const unlinking = unlinkSignalDevice();
    rejectFinished(new Error("killed"));
    await unlinking;
  });

  it("ignores link output without a phone number", async () => {
    let resolveFinished!: (code: number) => void;
    startGoSignalLink.mockImplementation(async (_n, onUri, onLine) => {
      onUri("sgnl://linkdevice?uuid=abc");
      onLine?.("still waiting");
      return {
        kill: vi.fn(),
        finished: new Promise<number>((resolve) => {
          resolveFinished = resolve;
        }),
        ready: Promise.resolve(),
      };
    });
    const { startSignalLink, getSignalLinkStatus } = await import(
      "@/lib/signal-link"
    );
    await startSignalLink();
    expect(getSignalLinkStatus().accountNumber).toBeNull();
    resolveFinished(1);
  });

  it("ignores QR updates after cancel", async () => {
    let onUri!: (uri: string) => void;
    let resolveFinished!: (code: number) => void;
    startGoSignalLink.mockImplementation(async (_n, uriCb) => {
      onUri = uriCb;
      return {
        kill: vi.fn(() => resolveFinished(1)),
        finished: new Promise<number>((resolve) => {
          resolveFinished = resolve;
        }),
        ready: Promise.resolve(),
      };
    });
    const { startSignalLink, unlinkSignalDevice } = await import(
      "@/lib/signal-link"
    );
    const started = startSignalLink();
    await vi.waitFor(() => expect(onUri).toBeDefined());
    await unlinkSignalDevice();
    onUri("sgnl://linkdevice?uuid=late");
    await started.catch(() => {});
  });
});

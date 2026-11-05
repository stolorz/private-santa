import "server-only";
import QRCode from "qrcode";
import {
  GOSIGNAL_EXIT_UNLINKED,
  parseLinkedNumber,
  runGoSignal,
  startGoSignalLink,
  type LinkSession,
} from "@/lib/go-signal";
import { processSingleton } from "@/lib/process-singleton";
import {
  isSignalConfigured,
  markSignalLinked,
  unlinkSignal,
} from "@/lib/signal-store";

type LinkRuntime = {
  pending: boolean;
  preparing: boolean;
  url: string | null;
  qrDataUrl: string | null;
  error: string | null;
  cancelled: boolean;
  accountNumber: string | null;
  session: LinkSession | null;
};

type LinkHolder = { current: LinkRuntime };

function holder(): LinkHolder {
  return processSingleton("__santaSignalLink", () => ({
    current: emptyRuntime(),
  }));
}

function runtime(): LinkRuntime {
  return holder().current;
}

function emptyRuntime(): LinkRuntime {
  return {
    pending: false,
    preparing: false,
    url: null,
    qrDataUrl: null,
    error: null,
    cancelled: false,
    accountNumber: null,
    session: null,
  };
}

/** Reset in-memory linking state. Used by tests and after unlink. */
export function resetSignalLinkState() {
  const state = holder();
  state.current.session?.kill();
  state.current = emptyRuntime();
}

export function getSignalLinkStatus(): {
  linking: boolean;
  preparing: boolean;
  linkUrl: string | null;
  qrDataUrl: string | null;
  error: string | null;
  accountNumber: string | null;
} {
  const s = runtime();
  return {
    linking: s.pending,
    preparing: s.preparing,
    linkUrl: s.url,
    qrDataUrl: s.qrDataUrl,
    error: s.error,
    accountNumber: s.accountNumber,
  };
}

/** Record that Signal dropped this linked device so the UI can prompt a re-link. */
export function noteDeviceUnlinked(message: string): void {
  const s = runtime();
  s.pending = false;
  s.preparing = false;
  s.url = null;
  s.qrDataUrl = null;
  s.accountNumber = null;
  s.error = message;
  try {
    unlinkSignal();
  } catch {
    /* store path may already be gone */
  }
}

/**
 * Start (or resume) linking this app as a secondary Signal device.
 * `go-signal link` runs until the phone confirms.
 */
export async function startSignalLink(): Promise<{
  linking: boolean;
  preparing: boolean;
  linkUrl: string | null;
  qrDataUrl: string | null;
  error: string | null;
  accountNumber: string | null;
  configured: boolean;
}> {
  if (isSignalConfigured()) {
    return {
      configured: true,
      linking: false,
      preparing: false,
      linkUrl: null,
      qrDataUrl: null,
      error: null,
      accountNumber: runtime().accountNumber,
    };
  }

  const s = runtime();
  if (s.pending) {
    return {
      configured: false,
      linking: true,
      preparing: s.preparing,
      linkUrl: s.url,
      qrDataUrl: s.qrDataUrl,
      error: s.error,
      accountNumber: s.accountNumber,
    };
  }

  s.pending = true;
  s.preparing = true;
  s.url = null;
  s.qrDataUrl = null;
  s.error = null;
  s.cancelled = false;
  s.accountNumber = null;

  const deviceName = process.env.SIGNAL_DEVICE_NAME ?? "Private Santa";

  try {
    const session = await startGoSignalLink(
      deviceName,
      (uri) => {
        const cur = runtime();
        if (cur.cancelled) return;
        cur.url = uri;
        void QRCode.toDataURL(uri, { margin: 1, width: 256 }).then((data) => {
          const latest = runtime();
          if (latest.cancelled || latest.url !== uri) return;
          latest.qrDataUrl = data;
        });
      },
      (line) => rememberLinkedNumberFromOutput(line),
    );
    s.session = session;
    s.preparing = false;
    await session.ready;

    void session.finished
      .then((code) => {
        const cur = runtime();
        cur.session = null;
        if (cur.cancelled) return;
        if (code === 0) {
          markSignalLinked();
          cur.pending = false;
          cur.url = null;
          cur.qrDataUrl = null;
          cur.error = null;
          return;
        }
        if (code === GOSIGNAL_EXIT_UNLINKED) {
          noteDeviceUnlinked(
            "Signal unlinked this device. Link again from Settings.",
          );
          return;
        }
        cur.pending = false;
        cur.error = `go-signal link exited ${code}.`;
      })
      .catch(() => {
        /* unlinked while the process was still exiting */
      });
  } catch (e) {
    s.pending = false;
    s.preparing = false;
    s.session = null;
    s.error = e instanceof Error ? e.message : String(e);
    throw e;
  }

  return {
    configured: false,
    linking: true,
    preparing: false,
    linkUrl: s.url,
    qrDataUrl: s.qrDataUrl,
    error: s.error,
    accountNumber: s.accountNumber,
  };
}

export async function unlinkSignalDevice(): Promise<void> {
  const s = runtime();
  s.cancelled = true;
  s.pending = false;
  s.preparing = false;
  s.url = null;
  s.qrDataUrl = null;
  s.error = null;
  s.accountNumber = null;
  const session = s.session;
  s.session = null;
  session?.kill();
  if (session) {
    await session.finished.catch(() => {});
  }
  try {
    await runGoSignal(["account", "unlink", "--yes"], { timeoutMs: 30_000 });
  } catch {
    /* never linked, or binary missing — still wipe local store */
  }
  unlinkSignal();
}

/** Capture the phone number printed when linking finishes. */
function rememberLinkedNumberFromOutput(text: string): void {
  const number = parseLinkedNumber(text);
  if (number) runtime().accountNumber = number;
}

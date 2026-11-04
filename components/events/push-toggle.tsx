"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { apiPath } from "@/lib/public-path";

const DEFAULT_HINT =
  "Get a notification when a guest opens their link or unwraps their match.";

/** Convert a base64url VAPID key to the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function subscriptionKeyMatches(sub: PushSubscription, vapid: string): boolean {
  const raw = sub.options.applicationServerKey;
  if (!raw) return true;
  const actual = new Uint8Array(raw);
  const expected = urlBase64ToUint8Array(vapid);
  if (actual.length !== expected.length) return false;
  return actual.every((b, i) => b === expected[i]);
}

export async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(apiPath("/sw.js"));
  try {
    await reg.update();
  } catch {
    // Ignore update failures; `ready` waits for the active worker.
  }
  await navigator.serviceWorker.ready;
  return reg;
}

/**
 * Current browser subscription, after `/sw.js` is active and updated.
 * Also re-posts it to `/api/push/subscribe` so the DB matches this tab.
 */
export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  const reg = await ensureRegistration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  await requestJson(apiPath("/api/push/subscribe"), {
    method: "POST",
    ...jsonBody(sub.toJSON()),
  }).catch(() => {});
  return sub;
}

export function waitForTestPush(timeoutMs = 10000): {
  promise: Promise<{ received: boolean; shown: boolean; error?: string }>;
  cancel: () => void;
} {
  let done = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let onMessage: ((event: MessageEvent) => void) | undefined;
  let bc: BroadcastChannel | undefined;
  let resolveFn: (value: {
    received: boolean;
    shown: boolean;
    error?: string;
  }) => void = () => {};

  function finish(value: {
    received: boolean;
    shown: boolean;
    error?: string;
  }) {
    if (done) return;
    done = true;
    if (timeoutId) clearTimeout(timeoutId);
    if (onMessage && "serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    }
    bc?.close();
    resolveFn(value);
  }

  const promise = new Promise<{
    received: boolean;
    shown: boolean;
    error?: string;
  }>((resolve) => {
    resolveFn = resolve;
    const handle = (data: unknown) => {
      const msg = data as {
        type?: string;
        test?: boolean;
        shown?: boolean;
        error?: string;
      } | null;
      if (msg?.type === "push" && msg.test) {
        finish({
          received: true,
          shown: msg.shown !== false,
          error: msg.error,
        });
      }
    };
    if ("serviceWorker" in navigator) {
      onMessage = (event: MessageEvent) => handle(event.data);
      navigator.serviceWorker.addEventListener("message", onMessage);
    }
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel("secret-santa-push");
      bc.onmessage = (event: MessageEvent) => handle(event.data);
    }
    timeoutId = setTimeout(
      () => finish({ received: false, shown: false }),
      timeoutMs,
    );
  });

  return {
    promise,
    cancel() {
      finish({ received: false, shown: false });
    },
  };
}

export function PushToggle({
  publicKey,
  hint = DEFAULT_HINT,
}: {
  publicKey: string;
  hint?: string;
}) {
  const vapid = publicKey;
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      "serviceWorker" in navigator && "PushManager" in window && !!vapid;
    setSupported(ok);
    if (!ok) return;
    let cancelled = false;
    void ensureRegistration()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setSubscribed(!!sub);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vapid]);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const reg = await ensureRegistration();
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setError("Notifications permission denied.");
        return;
      }
      const existing = await reg.pushManager.getSubscription();
      if (existing && !subscriptionKeyMatches(existing, vapid)) {
        await existing.unsubscribe();
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const res = await requestJson(apiPath("/api/push/subscribe"), {
        method: "POST",
        ...jsonBody(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Failed to save subscription.");
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const res = await requestJson(apiPath("/api/push/subscribe"), {
          method: "DELETE",
          ...jsonBody({ endpoint: sub.endpoint }),
        });
        if (!res.ok) throw new Error("Failed to remove subscription.");
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError("Could not disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={subscribed ? "outline" : "default"}
        size="sm"
        disabled={busy}
        onClick={subscribed ? unsubscribe : subscribe}
      >
        {busy
          ? "…"
          : subscribed
            ? "Disable push notifications"
            : "Enable push notifications"}
      </Button>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

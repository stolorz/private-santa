/* Service worker for Web Push (PWA notifications). */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function broadcastPush(payload) {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel("secret-santa-push");
      bc.postMessage(payload);
      bc.close();
    }
  } catch {
    // Fallback to client.postMessage below.
  }
}

self.addEventListener("push", (event) => {
  let data = { title: "Private Santa", body: "", url: "/", test: false };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    (async () => {
      const icon = new URL("android.png", self.registration.scope).href;
      let shown = true;
      let error;
      try {
        await self.registration.showNotification(data.title, {
          body: data.body,
          icon,
          data: { url: data.url || "/" },
          tag: data.test ? "secret-santa-push-test" : "secret-santa-push",
          renotify: true,
        });
      } catch (err) {
        shown = false;
        error = err instanceof Error ? err.message : String(err);
        console.error("showNotification failed", err);
      }
      const ack = {
        type: "push",
        title: data.title,
        body: data.body,
        test: Boolean(data.test),
        shown,
        error,
      };
      broadcastPush(ack);
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage(ack);
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});

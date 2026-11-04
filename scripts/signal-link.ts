/**
 * Link this app as a secondary Signal device on the organiser's private
 * number. Prints provisioning URLs (scan as a QR), waits until the phone
 * confirms, then writes the `.linked` marker used by
 * `isSignalConfigured()`.
 *
 * Usage: npm run signal:link
 *
 * Prefer Settings → Integrations in the web app; this script is optional.
 */
import {
  getSignalLinkStatus,
  startSignalLink,
} from "../lib/signal-link";
import { isSignalConfigured } from "../lib/signal-store";

async function main() {
  const started = await startSignalLink();
  if (started.configured) {
    console.log("Already linked.");
    return;
  }

  let lastUrl = started.linkUrl;
  if (lastUrl) {
    console.log("Scan this QR on your phone (Signal → Linked devices):");
    console.log(lastUrl);
  } else {
    console.log("Starting go-signal link…");
  }

  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    if (isSignalConfigured()) {
      console.log("Linked. Signal delivery is now configured.");
      return;
    }
    const status = getSignalLinkStatus();
    if (status.error) {
      throw new Error(status.error);
    }
    if (status.linkUrl && status.linkUrl !== lastUrl) {
      lastUrl = status.linkUrl;
      console.log("QR refreshed — scan this URL:");
      console.log(lastUrl);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

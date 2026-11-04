import fs from "node:fs";
import path from "node:path";

const DEFAULT_STORE = "data/signal";
const SIGNAL_LINKED_MARKER = ".linked";

export function signalStoreDir(): string {
  return process.env.SIGNAL_STORE_DIR ?? DEFAULT_STORE;
}

/** True when a successful link has written the marker. */
export function isSignalConfigured(): boolean {
  return fs.existsSync(path.join(signalStoreDir(), SIGNAL_LINKED_MARKER));
}

/** Persist that device linking finished. */
export function markSignalLinked(): void {
  const dir = signalStoreDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, SIGNAL_LINKED_MARKER),
    new Date().toISOString(),
  );
}

/**
 * Remove the local Signal store (protocol state + `.linked` marker).
 * Refuses to delete `/` or the process cwd.
 */
export function unlinkSignal(): void {
  const dir = path.resolve(signalStoreDir());
  const cwd = path.resolve(".");
  if (dir === "/" || dir === cwd) {
    throw new Error("Refusing to delete Signal store: path looks unsafe.");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

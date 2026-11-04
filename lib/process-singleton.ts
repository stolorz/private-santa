/**
 * Keep a value across Next.js hot reloads by storing it on `globalThis`.
 */
export function processSingleton<T>(key: string, create: () => T): T {
  const globalForValue = globalThis as unknown as Record<string, T | undefined>;
  if (globalForValue[key] == null) {
    globalForValue[key] = create();
  }
  return globalForValue[key];
}

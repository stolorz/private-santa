"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * A timestamp in the viewer's own locale and time zone. The server and the
 * hydration pass render an empty `<time>`, because the server's locale and
 * zone can differ from the browser's and would cause a hydration mismatch.
 */
export function LocalDateTime({
  value,
  options,
  className,
}: {
  value: Date | string;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const inBrowser = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const date = new Date(value);
  return (
    <time className={className} dateTime={date.toISOString()}>
      {inBrowser ? date.toLocaleString(undefined, options) : null}
    </time>
  );
}

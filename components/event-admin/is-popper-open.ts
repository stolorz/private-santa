"use client";

export function isPopperOpen() {
  return Boolean(
    document.querySelector("[data-radix-popper-content-wrapper]"),
  );
}

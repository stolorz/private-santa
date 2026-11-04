"use client";

import { useRef, useState } from "react";

export function usePendingLeave() {
  const pendingRef = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);

  function tryLeave(dirty: boolean, next: () => void) {
    if (!dirty) {
      next();
      return;
    }
    pendingRef.current = next;
    setOpen(true);
  }

  function stay() {
    pendingRef.current = null;
    setOpen(false);
  }

  function take() {
    const go = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    return go;
  }

  function clear() {
    pendingRef.current = null;
    setOpen(false);
  }

  function close() {
    setOpen(false);
  }

  function submitForm(formId: string) {
    setOpen(false);
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }

  return { open, tryLeave, stay, take, clear, close, submitForm };
}

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TemplateErrorCountContextValue = {
  count: number;
  setOverride: (count: number | null) => void;
};

const TemplateErrorCountContext =
  createContext<TemplateErrorCountContextValue | null>(null);

export function TemplateErrorCountProvider({
  count = 0,
  children,
}: {
  /** Saved problem lines. Shown until the open editor publishes a draft. */
  count?: number;
  children: ReactNode;
}) {
  const [override, setOverride] = useState<number | null>(null);
  const value = useMemo(
    () => ({ count: override ?? count, setOverride }),
    [override, count],
  );
  return (
    <TemplateErrorCountContext.Provider value={value}>
      {children}
    </TemplateErrorCountContext.Provider>
  );
}

export function useTemplateErrorCount(): number {
  return useContext(TemplateErrorCountContext)?.count ?? 0;
}

export function usePublishTemplateErrorCount(count: number) {
  const setOverride = useContext(TemplateErrorCountContext)?.setOverride;
  useEffect(() => {
    if (!setOverride) return;
    setOverride(count);
    return () => setOverride(null);
  }, [setOverride, count]);
}

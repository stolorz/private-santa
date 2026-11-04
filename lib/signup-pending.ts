import { processSingleton } from "@/lib/process-singleton";

export type PendingOrganiser = {
  name: string;
  phone: string | null;
  email: string | null;
};

const pending = processSingleton("__santaPendingSignup", () => ({
  current: null as PendingOrganiser | null,
}));

export function setPendingOrganiser(data: PendingOrganiser): void {
  pending.current = data;
}

export function takePendingOrganiser(): PendingOrganiser | null {
  const value = pending.current;
  pending.current = null;
  return value;
}

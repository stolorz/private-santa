import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function qty(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Throw when a DB write that should return a row does not. */
export function mustExist<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

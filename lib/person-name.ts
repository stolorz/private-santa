/** Compare guest names without caring about case or extra spaces. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Up to two uppercase initials, from the first two words. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/** Alphabetical guest names, case-insensitive, Polish-aware. */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "pl", { sensitivity: "base" });
}

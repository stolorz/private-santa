import { genderLabel, type Gender } from "@/lib/gender";
import { languageLabel } from "@/lib/language";
import { digitsOnly, formatPhone } from "@/lib/phone";

export type GuestContact = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
};

export function normalizeGuestEmail(
  value: string | null | undefined,
): string | null {
  const s = value?.trim().toLowerCase() ?? "";
  return s || null;
}

export function normalizeGuestPhone(
  value: string | null | undefined,
): string | null {
  const s = digitsOnly(value ?? "");
  return s || null;
}

/** True when a new guest is being saved, or phone/email actually changed. */
export function contactDraftChanged(
  previous: { phone: string | null; email: string | null } | undefined,
  draft: { phone?: string | null; email?: string | null },
): boolean {
  if (!previous) return true;
  return (
    normalizeGuestPhone(draft.phone) !== normalizeGuestPhone(previous.phone) ||
    normalizeGuestEmail(draft.email) !== normalizeGuestEmail(previous.email)
  );
}

export type SharedContactIssue = {
  field: "phone" | "email";
  stored: string;
  label: string;
  names: string[];
};

/** English list: one name, "A and B", or "A, B, and C". */
export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function sharedContactIssuesForDraft(
  guests: GuestContact[],
  draft: { id?: number; phone?: string | null; email?: string | null },
): SharedContactIssue[] {
  const issues: SharedContactIssue[] = [];
  const phone = normalizeGuestPhone(draft.phone);
  if (phone) {
    const others = guests.filter(
      (g) => g.id !== draft.id && normalizeGuestPhone(g.phone) === phone,
    );
    if (others.length > 0) {
      issues.push({
        field: "phone",
        stored: phone,
        label: formatPhone(phone),
        names: others.map((g) => g.name),
      });
    }
  }
  const email = normalizeGuestEmail(draft.email);
  if (email) {
    const others = guests.filter(
      (g) => g.id !== draft.id && normalizeGuestEmail(g.email) === email,
    );
    if (others.length > 0) {
      issues.push({
        field: "email",
        stored: email,
        label: email,
        names: others.map((g) => g.name),
      });
    }
  }
  return issues;
}

export function sharedContactsByGuestId(
  guests: GuestContact[],
): Map<number, SharedContactIssue[]> {
  const map = new Map<number, SharedContactIssue[]>();
  for (const guest of guests) {
    const issues = sharedContactIssuesForDraft(guests, guest);
    if (issues.length > 0) map.set(guest.id, issues);
  }
  return map;
}

export function sharedContactTitle(issues: SharedContactIssue[]): string {
  const phone = issues.some((issue) => issue.field === "phone");
  const email = issues.some((issue) => issue.field === "email");
  if (phone && email) return "Shared contact details";
  if (phone) return "Shared phone number";
  return "Shared email address";
}

export function sharedContactWarningLines(
  issues: SharedContactIssue[],
): string[] {
  return issues.map((issue) => {
    return `${issue.label} is already used by ${joinNames(issue.names)}.`;
  });
}

export function guestContactSummary(guest: {
  phone: string | null;
  email: string | null;
  language: string;
  gender: Gender | null;
}): string {
  return [
    guest.phone ? formatPhone(guest.phone) : null,
    guest.email,
    languageLabel(guest.language),
    genderLabel(guest.gender),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function sharedContactTooltip(issues: SharedContactIssue[]): string {
  return issues
    .map((issue) => {
      const who = joinNames(issue.names);
      return issue.field === "phone"
        ? `Same phone as ${who}`
        : `Same email as ${who}`;
    })
    .join(". ");
}

import type { Person } from "@/lib/db/schema";

export type GuestDeleteScope = "event" | "person";

/** An edition this person is seated in. */
export type PersonEventSeat = {
  id: number;
  code: string;
  name: string;
  occursOn: string;
};

export type PersonWithEvents = Person & {
  events: PersonEventSeat[];
};

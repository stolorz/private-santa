import { describe, expect, it } from "vitest";
import {
  eventLocationFrom,
  locationVars,
  missingEventLocation,
  missingEventLocationMessage,
  missingEventLocationSendReason,
  normalizeLocation,
} from "@/lib/event-location";

const katowice = { location: "Katowice", locationGdzie: "w Katowicach" };

describe("normalizeLocation", () => {
  it("trims, and turns blank and whitespace into null", () => {
    expect(normalizeLocation("  Katowice ")).toBe("Katowice");
    expect(normalizeLocation("   ")).toBeNull();
    expect(normalizeLocation("")).toBeNull();
    expect(normalizeLocation(null)).toBeNull();
    expect(normalizeLocation(undefined)).toBeNull();
  });
});

describe("eventLocationFrom", () => {
  it("keeps both fields and drops whitespace", () => {
    expect(eventLocationFrom(katowice)).toEqual(katowice);
    expect(
      eventLocationFrom({ location: " Wrocław ", locationGdzie: "  " }),
    ).toEqual({ location: "Wrocław", locationGdzie: null });
    expect(eventLocationFrom(null)).toEqual({
      location: null,
      locationGdzie: null,
    });
  });
});

describe("missingEventLocation", () => {
  it("names each blank field", () => {
    expect(missingEventLocation(null)).toEqual([
      "place name",
      "Polish phrase (gdzie?)",
    ]);
    expect(missingEventLocation({ location: "Katowice", locationGdzie: " " })).toEqual([
      "Polish phrase (gdzie?)",
    ]);
    expect(missingEventLocation(katowice)).toEqual([]);
  });

  it("explains a save refusal and a send refusal, and stays quiet when both are set", () => {
    const partial = { location: "  ", locationGdzie: "u babci" };
    expect(missingEventLocationMessage(partial)).toBe(
      "Enter the missing location: place name.",
    );
    expect(missingEventLocationMessage(null)).toBe(
      "Enter the missing location: place name, Polish phrase (gdzie?).",
    );
    expect(missingEventLocationSendReason(partial)).toBe(
      "Cannot send invitations because the event is missing its location: place name.",
    );
    expect(missingEventLocationMessage(katowice)).toBeNull();
    expect(missingEventLocationSendReason(katowice)).toBeNull();
  });
});

describe("locationVars", () => {
  it("fills {location} and {location_gdzie} with trimmed values", () => {
    expect(
      locationVars({ location: " Katowice ", locationGdzie: "w Katowicach" }),
    ).toEqual({ location: "Katowice", location_gdzie: "w Katowicach" });
  });

  it("omits blank fields so the token stays visible", () => {
    expect(locationVars({ location: "Katowice", locationGdzie: "" })).toEqual({
      location: "Katowice",
    });
    expect(locationVars(undefined)).toEqual({});
  });
});

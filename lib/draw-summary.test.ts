import { describe, expect, it } from "vitest";
import { drawConstraintSummary } from "@/lib/draw-summary";

describe("drawConstraintSummary", () => {
  it("keeps the old sentence for draws stored before history stats", () => {
    expect(
      drawConstraintSummary({
        avoidPastPairings: true,
        historyLayers: null,
        layersDropped: null,
        relaxedRestrictions: true,
      }),
    ).toBe("Past pairings were relaxed to find a valid assignment.");
    expect(
      drawConstraintSummary({
        avoidPastPairings: true,
        historyLayers: null,
        layersDropped: null,
        relaxedRestrictions: false,
      }),
    ).toBe("All restrictions were kept.");
  });

  it("says this event has no earlier editions instead of implying a choice", () => {
    expect(
      drawConstraintSummary(
        {
          avoidPastPairings: false,
          historyLayers: 0,
          layersDropped: 0,
          relaxedRestrictions: false,
        },
        { hasEarlierEditions: false },
      ),
    ).toBe("This event has no earlier editions.");
    expect(
      drawConstraintSummary(
        {
          avoidPastPairings: true,
          historyLayers: null,
          layersDropped: null,
          relaxedRestrictions: true,
        },
        { hasEarlierEditions: false },
      ),
    ).toBe("This event has no earlier editions.");
  });

  it("says when there was nothing earlier to avoid", () => {
    expect(
      drawConstraintSummary({
        avoidPastPairings: true,
        historyLayers: 0,
        layersDropped: 0,
        relaxedRestrictions: false,
      }),
    ).toBe("No earlier pairings to avoid.");
    expect(
      drawConstraintSummary({
        avoidPastPairings: false,
        historyLayers: 0,
        layersDropped: 0,
        relaxedRestrictions: false,
      }),
    ).toBe("Past pairings were not considered.");
  });

  it("reports how many earlier draws were kept or dropped", () => {
    expect(
      drawConstraintSummary({
        avoidPastPairings: true,
        historyLayers: 1,
        layersDropped: 0,
        relaxedRestrictions: false,
      }),
    ).toBe("Avoided pairings from 1 earlier draw.");
    expect(
      drawConstraintSummary({
        avoidPastPairings: true,
        historyLayers: 2,
        layersDropped: 0,
        relaxedRestrictions: false,
      }),
    ).toBe("Avoided pairings from 2 earlier draws.");
    expect(
      drawConstraintSummary({
        avoidPastPairings: true,
        historyLayers: 3,
        layersDropped: 1,
        relaxedRestrictions: true,
      }),
    ).toBe("Dropped the oldest of 3 earlier draws; kept the rest.");
    expect(
      drawConstraintSummary({
        avoidPastPairings: true,
        historyLayers: 3,
        layersDropped: 2,
        relaxedRestrictions: true,
      }),
    ).toBe("Dropped the 2 oldest of 3 earlier draws; kept the rest.");
    expect(
      drawConstraintSummary({
        avoidPastPairings: true,
        historyLayers: 2,
        layersDropped: 2,
        relaxedRestrictions: true,
      }),
    ).toBe("Dropped all 2 earlier draws; those pairings were allowed.");
    expect(
      drawConstraintSummary({
        avoidPastPairings: true,
        historyLayers: 1,
        layersDropped: 1,
        relaxedRestrictions: true,
      }),
    ).toBe("Dropped the only earlier draw; those pairings were allowed.");
  });
});

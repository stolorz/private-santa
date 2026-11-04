/** One-line explanation of how past-pairing constraints were applied. */

export function drawConstraintSummary(
  draw: {
    avoidPastPairings: boolean;
    historyLayers: number | null;
    layersDropped: number | null;
    relaxedRestrictions: boolean;
  },
  opts?: { hasEarlierEditions?: boolean },
): string {
  if (opts?.hasEarlierEditions === false) {
    return "This event has no earlier editions.";
  }

  const considered = draw.historyLayers;
  const dropped = draw.layersDropped;

  if (considered == null || dropped == null) {
    return draw.relaxedRestrictions
      ? "Past pairings were relaxed to find a valid assignment."
      : "All restrictions were kept.";
  }

  if (considered === 0) {
    return draw.avoidPastPairings
      ? "No earlier pairings to avoid."
      : "Past pairings were not considered.";
  }

  if (dropped === 0) {
    return considered === 1
      ? "Avoided pairings from 1 earlier draw."
      : `Avoided pairings from ${considered} earlier draws.`;
  }

  if (dropped >= considered) {
    return considered === 1
      ? "Dropped the only earlier draw; those pairings were allowed."
      : `Dropped all ${considered} earlier draws; those pairings were allowed.`;
  }

  if (dropped === 1) {
    return `Dropped the oldest of ${considered} earlier draws; kept the rest.`;
  }
  return `Dropped the ${dropped} oldest of ${considered} earlier draws; kept the rest.`;
}

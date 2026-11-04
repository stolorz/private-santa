import { isValidOccursOn } from "@/lib/occurs-on";
import { compareNames } from "@/lib/person-name";

export type DrawResultRow = {
  giver: string;
  receiver: string;
};

/** `draw_results_YYYY.csv` from a real party date, otherwise `draw_results.csv`. */
export function drawResultsFilename(occursOn: string): string {
  if (!isValidOccursOn(occursOn)) return "draw_results.csv";
  return `draw_results_${occursOn.slice(0, 4)}.csv`;
}

function csvField(value: string): string {
  if (/[",\r\n]/.test(value) || value !== value.trim()) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/**
 * Current-draw archive: header `giver,receiver`, pairs sorted by giver then
 * receiver. UTF-8 BOM and CRLF so Excel keeps Polish names.
 */
export function renderDrawResultsCsv(rows: readonly DrawResultRow[]): string {
  const sorted = [...rows].sort(
    (a, b) =>
      compareNames(a.giver, b.giver) || compareNames(a.receiver, b.receiver),
  );
  const lines = [
    "giver,receiver",
    ...sorted.map(
      (row) => `${csvField(row.giver)},${csvField(row.receiver)}`,
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

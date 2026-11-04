import { describe, expect, it } from "vitest";
import {
  drawResultsFilename,
  renderDrawResultsCsv,
  type DrawResultRow,
} from "@/lib/draw-results-csv";

const BOM = "\uFEFF";

function parseCsv(body: string): string[][] {
  expect(body.startsWith(BOM)).toBe(true);
  expect(body.endsWith("\r\n")).toBe(true);
  const text = body.slice(BOM.length);
  const rows: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      fields.push(current);
      current = "";
      continue;
    }
    if (char === "\r" && text[i + 1] === "\n") {
      fields.push(current);
      rows.push(fields);
      fields = [];
      current = "";
      i += 1;
      continue;
    }
    current += char;
  }
  if (current.length > 0 || fields.length > 0) {
    fields.push(current);
    rows.push(fields);
  }
  return rows;
}

describe("drawResultsFilename", () => {
  it("uses the party year", () => {
    expect(drawResultsFilename("2026-12-24")).toBe("draw_results_2026.csv");
    expect(drawResultsFilename("2024-02-29")).toBe("draw_results_2024.csv");
  });

  it("drops the year when the date is blank or not a real day", () => {
    expect(drawResultsFilename("")).toBe("draw_results.csv");
    expect(drawResultsFilename("   ")).toBe("draw_results.csv");
    expect(drawResultsFilename("2026-02-31")).toBe("draw_results.csv");
    expect(drawResultsFilename("2026-13-01")).toBe("draw_results.csv");
    expect(drawResultsFilename("26-12-24")).toBe("draw_results.csv");
    expect(drawResultsFilename("2026/12/24")).toBe("draw_results.csv");
  });
});

describe("renderDrawResultsCsv", () => {
  it("writes a header and nothing else when there are no pairs", () => {
    expect(parseCsv(renderDrawResultsCsv([]))).toEqual([["giver", "receiver"]]);
  });

  it("sorts by giver, then receiver, with Polish letters in dictionary order", () => {
    const rows: DrawResultRow[] = [
      { giver: "Żaneta", receiver: "Ada" },
      { giver: "Łucja", receiver: "Bea" },
      { giver: "ada", receiver: "Zofia" },
      { giver: "Ada", receiver: "ćma" },
      { giver: "Ada", receiver: "Czesław" },
      { giver: "Bea", receiver: "Łucja" },
    ];
    expect(parseCsv(renderDrawResultsCsv(rows))).toEqual([
      ["giver", "receiver"],
      ["Ada", "Czesław"],
      ["Ada", "ćma"],
      ["ada", "Zofia"],
      ["Bea", "Łucja"],
      ["Łucja", "Bea"],
      ["Żaneta", "Ada"],
    ]);
  });

  it("keeps a self-draw as one row with the same name twice", () => {
    expect(
      parseCsv(renderDrawResultsCsv([{ giver: "Ada", receiver: "Ada" }])),
    ).toEqual([
      ["giver", "receiver"],
      ["Ada", "Ada"],
    ]);
  });

  it("quotes commas, quotes, line breaks, and surrounding spaces", () => {
    const rows: DrawResultRow[] = [
      { giver: 'Ann "Annie" Smith', receiver: "Bea, Jr." },
      { giver: " Ada", receiver: "Bea " },
      { giver: "Line\nBreak", receiver: "Carriage\rReturn" },
      { giver: "Both\r\nBreaks", receiver: 'Say "hi", please' },
      { giver: "  padded  ", receiver: "plain name" },
    ];
    const body = renderDrawResultsCsv(rows);
    expect(body.startsWith(BOM)).toBe(true);
    expect(body.includes("\r\n")).toBe(true);
    expect(body.includes("\n")).toBe(true);
    expect(parseCsv(body)).toEqual([
      ["giver", "receiver"],
      ["  padded  ", "plain name"],
      [" Ada", "Bea "],
      ['Ann "Annie" Smith', "Bea, Jr."],
      ["Both\r\nBreaks", 'Say "hi", please'],
      ["Line\nBreak", "Carriage\rReturn"],
    ]);
  });

  it("leaves internal spaces and Polish letters unquoted", () => {
    const body = renderDrawResultsCsv([
      { giver: "Mary Ann", receiver: "Zofia Łucja" },
    ]);
    expect(body).toBe(`${BOM}giver,receiver\r\nMary Ann,Zofia Łucja\r\n`);
  });

  it("does not mutate the caller's row list", () => {
    const rows = [
      { giver: "Bea", receiver: "Ada" },
      { giver: "Ada", receiver: "Bea" },
    ];
    renderDrawResultsCsv(rows);
    expect(rows.map((row) => row.giver)).toEqual(["Bea", "Ada"]);
  });
});

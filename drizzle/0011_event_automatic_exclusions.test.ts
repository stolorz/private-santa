import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeDraw, makeEvent, makeSeries } from "@/test/helpers/fixtures";

const sql = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "0011_event_automatic_exclusions.sql",
  ),
  "utf8",
);

function applyBackfill() {
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (!trimmed || trimmed.startsWith("ALTER")) continue;
    mockDb.sqlite.exec(trimmed);
  }
}

describe("0011 automatic exclusions backfill", () => {
  it("copies both flags from the newest draw", () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.draw, [
      makeDraw({
        id: 1,
        allowSelfDraw: false,
        avoidPastPairings: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      makeDraw({
        id: 2,
        allowSelfDraw: true,
        avoidPastPairings: true,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ]);

    applyBackfill();

    expect(mockDb.rows(schema.event)[0]).toMatchObject({
      allowSelfDraw: true,
      avoidPastPairings: true,
    });
  });

  it("turns avoidPastPairings on when there is no draw and an earlier edition exists", () => {
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [
      makeEvent({
        id: 1,
        occursOn: "2025-01-01",
        code: "older1",
        avoidPastPairings: false,
      }),
      makeEvent({
        id: 2,
        occursOn: "2026-01-01",
        code: "newer1",
        avoidPastPairings: false,
      }),
    ]);

    applyBackfill();

    expect(
      mockDb.rows(schema.event).find((row) => row.id === 1)?.avoidPastPairings,
    ).toBe(false);
    expect(
      mockDb.rows(schema.event).find((row) => row.id === 2)?.avoidPastPairings,
    ).toBe(true);
  });
});

/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  makeEvent,
  makeEventPhoto,
  makeSeries,
} from "@/test/helpers/fixtures";
import { codeParams } from "@/test/helpers/request";

const requireAdminPage = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/session", () => ({
  requireAdminPage: (...args: unknown[]) => requireAdminPage(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

import EventAdminPhotosPage from "./page";

describe("EventAdminPhotosPage", () => {
  beforeEach(() => {
    vi.stubEnv("PHOTO_WORKER_HEARTBEAT", "data/missing-photo-worker.heartbeat");
    requireAdminPage.mockReset();
    requireAdminPage.mockResolvedValue({ id: "admin", role: "admin" });
    notFound.mockClear();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
  });

  it("renders the photos tab for an admin", async () => {
    const ui = await EventAdminPhotosPage(codeParams());
    render(ui);
    expect(requireAdminPage).toHaveBeenCalled();
    expect(screen.getByText("No photos yet.")).toBeTruthy();
    expect(screen.getByText("Gallery (0)")).toBeTruthy();
  });

  it("passes the edition's photos into the tab", async () => {
    mockDb.seed(schema.eventPhoto, [makeEventPhoto()]);
    const ui = await EventAdminPhotosPage(codeParams());
    render(ui);
    expect(screen.getByText("Gallery (1)")).toBeTruthy();
    expect(screen.getByText("IMG_1.JPG")).toBeTruthy();
  });

  it("404s an unknown edition", async () => {
    await expect(EventAdminPhotosPage(codeParams("nope01"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });
});

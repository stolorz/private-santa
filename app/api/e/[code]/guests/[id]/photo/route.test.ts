import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import {
  FIXTURE_EVENT_CODE,
  makeEvent,
  makeGuest,
  makePerson,
  makeSeries,
} from "@/test/helpers/fixtures";
import {
  codeParams,
  emptyRequest,
  formRequest,
  jpegForm,
} from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/session", async () => {
  const { sessionMockModule } = await import("@/test/helpers/session");
  return sessionMockModule();
});

vi.mock("@/lib/photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/photo")>();
  return {
    ...actual,
    savePhoto: vi.fn(),
    deletePhoto: vi.fn(),
  };
});

import { PHOTO_MAX_BYTES, deletePhoto, savePhoto } from "@/lib/photo";
import { DELETE, POST } from "./route";
import { asAdmin, asAnonymous } from "@/test/helpers/session";

const savePhotoMock = vi.mocked(savePhoto);
const deletePhotoMock = vi.mocked(deletePhoto);

function params(id: string) {
  return codeParams(FIXTURE_EVENT_CODE, { id });
}

describe("POST /api/e/[code]/guests/[id]/photo", () => {
  beforeEach(async () => {
    await asAdmin();
    savePhotoMock.mockReset();
    deletePhotoMock.mockReset();
    savePhotoMock.mockResolvedValue(`${"ab".repeat(24)}.jpg`);
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [makePerson({ id: 1, name: "Ada" })]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await POST(
      formRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1/photo`,
        jpegForm(new File([new Uint8Array([1])], "ada.jpg", { type: "image/jpeg" })),
      ),
      params("1"),
    );
    expect(res.status).toBe(401);
    expect(savePhotoMock).not.toHaveBeenCalled();
  });

  it("rejects a non-image", async () => {
    const res = await POST(
      formRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1/photo`,
        jpegForm(new File([new Uint8Array([1])], "ada.pdf", { type: "application/pdf" })),
      ),
      params("1"),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Photo must be JPEG, PNG, or WebP.",
    });
    expect(savePhotoMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized file", async () => {
    const res = await POST(
      formRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1/photo`,
        jpegForm(
          new File([new Uint8Array(PHOTO_MAX_BYTES + 1)], "ada.jpg", {
            type: "image/jpeg",
          }),
        ),
      ),
      params("1"),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Photo must be 2 MB or smaller.",
    });
    expect(savePhotoMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the guest is missing", async () => {
    const res = await POST(
      formRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/9/photo`,
        jpegForm(new File([new Uint8Array([1])], "ada.jpg", { type: "image/jpeg" })),
      ),
      params("9"),
    );
    expect(res.status).toBe(404);
  });

  it("stores the filename on the person", async () => {
    const res = await POST(
      formRequest(
        `/api/e/${FIXTURE_EVENT_CODE}/guests/1/photo`,
        jpegForm(new File([new Uint8Array([1, 2, 3])], "ada.jpg", { type: "image/jpeg" })),
      ),
      params("1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 1,
      photo: `${"ab".repeat(24)}.jpg`,
    });
    expect(savePhotoMock).toHaveBeenCalled();
    expect(deletePhotoMock).toHaveBeenCalledWith(null);
  });
});

describe("DELETE /api/e/[code]/guests/[id]/photo", () => {
  beforeEach(async () => {
    await asAdmin();
    deletePhotoMock.mockReset();
    mockDb.seed(schema.eventSeries, [makeSeries()]);
    mockDb.seed(schema.event, [makeEvent()]);
    mockDb.seed(schema.person, [
      makePerson({ id: 1, name: "Ada", photo: `${"ab".repeat(24)}.jpg` }),
    ]);
    mockDb.seed(schema.guest, [makeGuest({ id: 1, personId: 1 })]);
  });

  it("returns 401 when the caller is not an admin", async () => {
    await asAnonymous();
    const res = await DELETE(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests/1/photo`, {
        method: "DELETE",
      }),
      params("1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the guest is missing", async () => {
    const res = await DELETE(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests/9/photo`, {
        method: "DELETE",
      }),
      params("9"),
    );
    expect(res.status).toBe(404);
  });

  it("clears the person photo", async () => {
    const res = await DELETE(
      emptyRequest(`/api/e/${FIXTURE_EVENT_CODE}/guests/1/photo`, {
        method: "DELETE",
      }),
      params("1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ id: 1, photo: null });
    expect(deletePhotoMock).toHaveBeenCalledWith(`${"ab".repeat(24)}.jpg`);
  });
});

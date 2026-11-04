import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/photo")>();
  return {
    ...actual,
    readPhoto: vi.fn(),
  };
});

import { readPhoto } from "@/lib/photo";
import { GET } from "./route";

const readPhotoMock = vi.mocked(readPhoto);
const FILE = `${"ab".repeat(24)}.jpg`;

describe("GET /api/uploads/[file]", () => {
  beforeEach(() => {
    readPhotoMock.mockReset();
  });

  it("rejects a path that is not a stored photo name", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/uploads/../secret.jpg"),
      { params: Promise.resolve({ file: "../secret.jpg" }) },
    );
    expect(res.status).toBe(404);
    expect(readPhotoMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the stored file is missing", async () => {
    readPhotoMock.mockResolvedValue(null);
    const res = await GET(new NextRequest(`http://localhost/api/uploads/${FILE}`), {
      params: Promise.resolve({ file: FILE }),
    });
    expect(res.status).toBe(404);
  });

  it("serves the stored file", async () => {
    readPhotoMock.mockResolvedValue({
      bytes: Buffer.from([1, 2, 3]),
      mime: "image/jpeg",
    });

    const res = await GET(new NextRequest(`http://localhost/api/uploads/${FILE}`), {
      params: Promise.resolve({ file: FILE }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    await expect(res.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  displayFetchError,
  jsonBody,
  postPhoto,
  requestJson,
} from "@/lib/fetch-json";

describe("jsonBody", () => {
  it("stringifies JSON with a content-type header", () => {
    expect(jsonBody({ n: 1 })).toEqual({
      headers: { "Content-Type": "application/json" },
      body: '{"n":1}',
    });
  });
});

describe("displayFetchError", () => {
  it("returns the server message as-is", () => {
    expect(displayFetchError("Unknown event.")).toBe("Unknown event.");
  });

  it("uses the fallback for generic Request failed errors", () => {
    expect(displayFetchError("Request failed (500).", "Could not save.")).toBe(
      "Could not save.",
    );
  });
});

describe("requestJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    );
    await expect(requestJson<{ ok: boolean }>("/api/x")).resolves.toEqual({
      ok: true,
      data: { ok: true },
      error: null,
      status: 200,
    });
  });

  it("reads { error } from a failed JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Nope." }), { status: 400 }),
      ),
    );
    await expect(requestJson("/api/x")).resolves.toEqual({
      ok: false,
      data: null,
      error: "Nope.",
      status: 400,
    });
  });

  it("falls back when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 502 })),
    );
    await expect(requestJson("/api/x")).resolves.toEqual({
      ok: false,
      data: null,
      error: "Request failed (502).",
      status: 502,
    });
  });

  it("treats invalid JSON on success as null data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 })),
    );
    await expect(requestJson("/api/x")).resolves.toEqual({
      ok: true,
      data: null,
      error: null,
      status: 200,
    });
  });

  it("returns a network error when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(requestJson("/api/x")).resolves.toEqual({
      ok: false,
      data: null,
      error: "Network error.",
      status: 0,
    });
  });

  it("falls back when the error field is blank or not a string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "   " }), { status: 400 }),
      ),
    );
    await expect(requestJson("/api/x")).resolves.toEqual({
      ok: false,
      data: null,
      error: "Request failed (400).",
      status: 400,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 0,
        json: async () => ({ error: 12 }),
      })),
    );
    await expect(requestJson("/api/x")).resolves.toEqual({
      ok: false,
      data: null,
      error: "Network error.",
      status: 0,
    });
  });
});

describe("postPhoto", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts FormData with field file", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
      return new Response(JSON.stringify({ photo: "ab.jpg" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([1])], "ada.jpg", {
      type: "image/jpeg",
    });
    await expect(postPhoto<{ photo: string }>("/api/photo", file)).resolves.toEqual({
      ok: true,
      data: { photo: "ab.jpg" },
      error: null,
      status: 200,
    });
  });
});

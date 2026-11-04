import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { mockDb } from "@/test/helpers/db";
import { makeUser } from "@/test/helpers/fixtures";
import { jsonRequest } from "@/test/helpers/request";

vi.mock("@/lib/db", async () => {
  const { mockLibDb } = await import("@/test/helpers/db");
  return mockLibDb();
});

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      signUpEmail: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import * as rateLimit from "@/lib/rate-limit";
import { POST } from "./route";

const signUpEmail = vi.mocked(auth.api.signUpEmail);

function mockCreatedUser(id: string, name: string, email: string) {
  signUpEmail.mockImplementation(async () => {
    mockDb.add(schema.user, makeUser({ id, name, email }));
    return { user: { id } } as never;
  });
}

const VALID = {
  name: "Ada",
  email: "ada@example.com",
  password: "password1",
};

describe("POST /api/signup", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    vi.stubEnv("ADMIN_EMAIL", "");
  });

  it("returns 429 when the signup limiter blocks", async () => {
    vi.spyOn(rateLimit, "consumeRateLimit").mockReturnValue({
      ok: false,
      retryAfterSec: 30,
    });
    const res = await POST(jsonRequest("/api/signup", VALID));
    expect(res.status).toBe(429);
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const res = await POST(jsonRequest("/api/signup", { name: "Ada" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid data." });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects a phone that is empty after digitsOnly", async () => {
    const res = await POST(
      jsonRequest("/api/signup", { ...VALID, phone: "+++" }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid phone number.",
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("creates a person with a null phone when none is given", async () => {
    mockCreatedUser("user_ada", VALID.name, VALID.email);

    const res = await POST(jsonRequest("/api/signup", VALID));

    expect(res.status).toBe(200);
    expect(mockDb.rows(schema.person)).toEqual([
      expect.objectContaining({
        userId: "user_ada",
        name: "Ada",
        phone: null,
        email: "ada@example.com",
      }),
    ]);
  });

  it("rejects a first user who does not match ADMIN_EMAIL", async () => {
    vi.stubEnv("ADMIN_EMAIL", "ada@example.com");
    const res = await POST(
      jsonRequest("/api/signup", { ...VALID, email: "bea@example.com" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Organiser signup is not available.",
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects signup after the first organiser exists", async () => {
    mockDb.seed(schema.user, [makeUser({ id: "admin_1", role: "admin" })]);

    const res = await POST(jsonRequest("/api/signup", VALID));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "An organiser already exists. Log in instead.",
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("returns 400 with the Better Auth error message when sign-up throws", async () => {
    signUpEmail.mockRejectedValue(new Error("User already exists"));

    const res = await POST(jsonRequest("/api/signup", VALID));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "User already exists",
    });
    expect(mockDb.inserts.filter((c) => c.table === schema.person)).toHaveLength(
      0,
    );
  });

  it("returns 400 when Better Auth does not return a user id", async () => {
    signUpEmail.mockResolvedValue({ user: {} } as never);

    const res = await POST(jsonRequest("/api/signup", VALID));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Could not create account.",
    });
    expect(mockDb.inserts.filter((c) => c.table === schema.person)).toHaveLength(
      0,
    );
  });

  it("creates a person for the first user and does not auto-create an event", async () => {
    mockCreatedUser("user_ada", "Ada Lovelace", VALID.email);

    const res = await POST(
      jsonRequest("/api/signup", {
        ...VALID,
        name: "Ada Lovelace",
        phone: "+351 912 345 678",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      needsVerification: false,
    });
    expect(mockDb.rows(schema.eventSeries)).toEqual([]);
    expect(mockDb.rows(schema.event)).toEqual([]);
    expect(mockDb.rows(schema.person)).toEqual([
      expect.objectContaining({
        userId: "user_ada",
        name: "Ada Lovelace",
        phone: "351912345678",
        email: "ada@example.com",
      }),
    ]);
  });
});

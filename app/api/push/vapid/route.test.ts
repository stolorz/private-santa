import { beforeEach, describe, expect, it, vi } from "vitest";

const getPushConfig = vi.hoisted(() => vi.fn());

vi.mock("@/lib/integrations", () => ({
  getPushConfig,
}));

import { GET } from "./route";

describe("GET /api/push/vapid", () => {
  beforeEach(() => {
    getPushConfig.mockReset();
  });

  it("returns the public key when both keys are present", async () => {
    getPushConfig.mockResolvedValue({
      publicKey: "pub",
      privateKey: "priv",
      subject: "mailto:santa@test.dev",
    });

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ publicKey: "pub" });
  });

  it("returns an empty public key when push is not configured", async () => {
    getPushConfig.mockResolvedValue({
      publicKey: "pub",
      privateKey: "",
      subject: "mailto:santa@test.dev",
    });

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ publicKey: "" });
  });
});

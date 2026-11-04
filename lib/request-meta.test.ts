import { describe, expect, it } from "vitest";
import { clientIp, requestMeta } from "@/lib/request-meta";

describe("clientIp", () => {
  it("uses the first x-forwarded-for hop", () => {
    expect(
      clientIp(
        new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
      ),
    ).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
  });

  it("is null when nothing is present", () => {
    expect(clientIp(new Headers())).toBeNull();
  });

  it("skips a blank first forwarded hop and uses Cloudflare", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": " , 10.0.0.1" })),
    ).toBeNull();
    expect(
      clientIp(new Headers({ "cf-connecting-ip": "198.51.100.9" })),
    ).toBe("198.51.100.9");
  });
});

describe("requestMeta", () => {
  it("captures ip, raw UA, and parsed browser/os", () => {
    expect(
      requestMeta({
        headers: new Headers({
          "x-forwarded-for": "203.0.113.9",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
        }),
      }),
    ).toEqual({
      ip: "203.0.113.9",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
      browser: "Firefox 131",
      os: "Windows",
    });
  });
});

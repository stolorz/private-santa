import { describe, expect, it } from "vitest";
import { parseUserAgent } from "@/lib/user-agent";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const EDGE_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";
const FIREFOX_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("parseUserAgent", () => {
  it("returns nulls for a blank string", () => {
    expect(parseUserAgent("")).toEqual({ browser: null, os: null });
    expect(parseUserAgent("   ")).toEqual({ browser: null, os: null });
  });

  it("detects Chrome on macOS, not Safari", () => {
    expect(parseUserAgent(CHROME_MAC)).toEqual({
      browser: "Chrome 129",
      os: "macOS",
    });
  });

  it("prefers Edge over Chrome", () => {
    expect(parseUserAgent(EDGE_WIN)).toEqual({
      browser: "Edge 129",
      os: "Windows",
    });
  });

  it("detects Opera, Android, Chrome OS, Linux, and unknown OS", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36 OPR/129.0.0.0",
      ),
    ).toEqual({ browser: "Opera 129", os: "Android 14" });
    expect(
      parseUserAgent(
        "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36",
      ),
    ).toEqual({ browser: "Chrome 129", os: "Chrome OS" });
    expect(
      parseUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36",
      ),
    ).toEqual({ browser: "Chrome 129", os: "Linux" });
    expect(parseUserAgent("SecretSanta/1.0")).toEqual({
      browser: null,
      os: null,
    });
    expect(
      parseUserAgent(
        "Mozilla/5.0 (iPad; CPU OS like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1",
      ),
    ).toMatchObject({ os: "iOS" });
  });

  it("detects Firefox and Safari/iOS", () => {
    expect(parseUserAgent(FIREFOX_WIN)).toEqual({
      browser: "Firefox 131",
      os: "Windows",
    });
    expect(parseUserAgent(SAFARI_IOS)).toEqual({
      browser: "Safari 18",
      os: "iOS 18",
    });
  });

  it("labels Safari without a Version token", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
      ),
    ).toEqual({ browser: "Safari", os: "macOS" });
  });
});

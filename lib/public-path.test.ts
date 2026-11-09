import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiPath,
  appBasePath,
  appBaseUrl,
  authBasePath,
  authClientOrigin,
  authTrustedOrigins,
  adminGalleryMediaPath,
  eventApiPath,
  galleryMediaPath,
  galleryPath,
  photoUrl,
  publicOrigin,
  revealApiPath,
  withAuthPath,
} from "./public-path";

describe("galleryPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a <Link> href and does not prepend NEXT_PUBLIC_BASE_PATH", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    expect(galleryPath("tok", "edcode")).toBe("/tok/photos/edcode");
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/your-prefix/");
    expect(galleryPath("tok", "edcode")).toBe("/tok/photos/edcode");
  });

  it("encodes the token and edition code", () => {
    expect(galleryPath("a/b", "c d")).toBe("/a%2Fb/photos/c%20d");
  });
});

describe("appBasePath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is empty when NEXT_PUBLIC_BASE_PATH is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    expect(appBasePath()).toBe("");
    expect(apiPath("/api/draw")).toBe("/api/draw");
    expect(eventApiPath("xmas_20260101", "/guests")).toBe(
      "/api/e/xmas_20260101/guests",
    );
    expect(revealApiPath("tok")).toBe("/api/reveal/tok");
    expect(revealApiPath("tok", "/wishlist")).toBe("/api/reveal/tok/wishlist");
    expect(photoUrl(null)).toBeNull();
    expect(photoUrl("ab.jpg")).toBe("/api/uploads/ab.jpg");
    expect(galleryMediaPath("tok", "ab".repeat(16), "thumb")).toBe(
      `/api/reveal/tok/photos/${"ab".repeat(16)}/thumb`,
    );
    expect(adminGalleryMediaPath("edcode", "ab".repeat(16), "hd")).toBe(
      `/api/e/edcode/photos/${"ab".repeat(16)}/hd`,
    );
  });

  it("prefixes paths and strips a trailing slash on the env value", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/your-prefix/");
    expect(appBasePath()).toBe("/your-prefix");
    expect(apiPath("/api/draw")).toBe("/your-prefix/api/draw");
    expect(eventApiPath("friends_20260101", "/draw")).toBe(
      "/your-prefix/api/e/friends_20260101/draw",
    );
    expect(revealApiPath("tok", "/wishlist/1")).toBe(
      "/your-prefix/api/reveal/tok/wishlist/1",
    );
    expect(authBasePath()).toBe("/your-prefix/api/auth");
    expect(photoUrl("ab.jpg")).toBe("/your-prefix/api/uploads/ab.jpg");
    expect(galleryMediaPath("tok", "id", "thumb")).toBe(
      "/your-prefix/api/reveal/tok/photos/id/thumb",
    );
    expect(adminGalleryMediaPath("edcode", "id", "uhd")).toBe(
      "/your-prefix/api/e/edcode/photos/id/uhd",
    );
  });

  it("strips a path from the public origin so Better Auth can append /api/auth", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_APP_URL",
      "https://example.com/your-prefix",
    );
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/your-prefix");
    expect(publicOrigin()).toBe("https://example.com");
    expect(appBaseUrl()).toBe("https://example.com/your-prefix");
    expect(authBasePath()).toBe("/your-prefix/api/auth");
  });

  it("shares the app URL env fallback and strips a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example/");
    expect(appBaseUrl()).toBe("https://auth.example");
    expect(publicOrigin()).toBe("https://auth.example");
  });

  it("prefers NEXT_PUBLIC_APP_URL over BETTER_AUTH_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example");
    expect(appBaseUrl()).toBe("https://app.example");
  });

  it("falls back to http://localhost:3000", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(appBaseUrl()).toBe("http://localhost:3000");
  });

  it("falls back to the env origin when there is no window", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(authClientOrigin()).toBe("http://localhost:3000");
  });

  it("uses the page origin in the browser so login is not stuck on :3000", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubGlobal("window", {
      location: { origin: "http://127.0.0.1:3010" },
    });
    expect(publicOrigin()).toBe("http://localhost:3000");
    expect(authClientOrigin()).toBe("http://127.0.0.1:3010");
  });

  it("withAuthPath prefixes /api/auth when Next stripped basePath", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/your-prefix");
    const rewritten = withAuthPath(
      new Request("http://localhost/api/auth/sign-in/email"),
    );
    expect(new URL(rewritten.url).pathname).toBe(
      "/your-prefix/api/auth/sign-in/email",
    );
  });

  it("withAuthPath leaves an already-mounted auth path alone", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/your-prefix");
    const req = new Request(
      "http://localhost/your-prefix/api/auth/ok",
    );
    expect(withAuthPath(req)).toBe(req);
  });

  it("publicOrigin falls back when the configured URL is not absolute", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not a url/");
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(publicOrigin()).toBe("not a url");
  });

  it("withAuthPath leaves unrelated paths alone when basePath is set", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/your-prefix");
    const req = new Request("http://localhost/events");
    expect(withAuthPath(req)).toBe(req);
  });

  it("withAuthPath is a no-op without basePath", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    const req = new Request("http://localhost/api/auth/session");
    expect(withAuthPath(req)).toBe(req);
  });

  it("trusts any localhost port in development", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(authTrustedOrigins()).toEqual([
      "http://localhost:3000",
      "http://localhost:*",
      "http://127.0.0.1:*",
    ]);
  });

  it("prefixes relative API paths that omit the leading slash", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    expect(apiPath("api/draw")).toBe("/api/draw");
    expect(eventApiPath("xmas01", "guests")).toBe("/api/e/xmas01/guests");
    expect(revealApiPath("tok", "wishlist")).toBe("/api/reveal/tok/wishlist");
  });

  it("trusts only the public origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://santa.example");
    expect(authTrustedOrigins()).toEqual(["https://santa.example"]);
  });
});

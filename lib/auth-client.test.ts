import { afterEach, describe, expect, it, vi } from "vitest";

const createAuthClient = vi.hoisted(() =>
  vi.fn(() => ({
    signIn: {},
    signUp: {},
    signOut: {},
    useSession: {},
  })),
);

vi.mock("better-auth/react", () => ({ createAuthClient }));
vi.mock("better-auth/client/plugins", () => ({
  adminClient: () => ({}),
}));

describe("auth client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    createAuthClient.mockClear();
  });

  it("signs in against the page origin when the env URL is localhost:3000", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubGlobal("window", {
      location: { origin: "http://127.0.0.1:3010" },
    });
    vi.resetModules();

    await import("@/lib/auth-client");

    expect(createAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "http://127.0.0.1:3010",
        basePath: "/api/auth",
      }),
    );
  });
});

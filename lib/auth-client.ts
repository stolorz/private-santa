"use client";
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { authBasePath, authClientOrigin } from "@/lib/public-path";

const authClient = createAuthClient({
  baseURL: authClientOrigin(),
  basePath: authBasePath(),
  plugins: [adminClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
} = authClient;

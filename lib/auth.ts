import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin as adminPlugin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { organiserNeedsEmailVerification } from "@/lib/auth-email";
import { sendBetterAuthVerificationEmail } from "@/lib/auth-email-send";
import { beforeCreateUser, afterCreateUser } from "@/lib/auth-hooks";
import { db, schema } from "@/lib/db";
import { authBasePath, authTrustedOrigins, publicOrigin } from "@/lib/public-path";

export const auth = betterAuth({
  baseURL: publicOrigin(),
  basePath: authBasePath(),
  trustedOrigins: authTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: organiserNeedsEmailVerification(),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: sendBetterAuthVerificationEmail,
  },
  databaseHooks: {
    user: {
      create: {
        before: beforeCreateUser,
        after: afterCreateUser,
      },
    },
  },
  plugins: [
    adminPlugin(),
    // Must be last: lets server actions/route handlers set auth cookies.
    nextCookies(),
  ],
});

import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { tooManyRequests } from "@/lib/http";
import { withAuthPath } from "@/lib/public-path";
import { consumeRateLimit, isAuthRateLimitedPath } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";

const { GET: handleGet, POST: handlePost } = toNextJsHandler(auth);

export const GET = (request: Request) => handleGet(withAuthPath(request));

export const POST = (request: Request) => {
  const rewritten = withAuthPath(request);
  if (isAuthRateLimitedPath(new URL(rewritten.url).pathname)) {
    const limited = consumeRateLimit("auth", clientIp(rewritten.headers));
    if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
  }
  return handlePost(rewritten);
};

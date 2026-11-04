import { parseUserAgent } from "@/lib/user-agent";

export type ClientDebug = {
  ip: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
};

const UA_MAX = 512;

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const direct =
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    "";
  return direct || null;
}

export function requestMeta(req: { headers: Headers }): ClientDebug {
  const raw = req.headers.get("user-agent")?.trim() || "";
  const userAgent = raw ? raw.slice(0, UA_MAX) : null;
  const parsed = parseUserAgent(raw);
  return {
    ip: clientIp(req.headers),
    userAgent,
    browser: parsed.browser,
    os: parsed.os,
  };
}

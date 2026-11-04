/** Best-effort browser/OS labels from a User-Agent. Debug only. */

export function parseUserAgent(ua: string): {
  browser: string | null;
  os: string | null;
} {
  const s = ua.trim();
  if (!s) return { browser: null, os: null };
  return { browser: parseBrowser(s), os: parseOs(s) };
}

function parseBrowser(ua: string): string | null {
  const named = (re: RegExp, label: string) => {
    const m = ua.match(re);
    return m ? `${label} ${m[1]}` : null;
  };
  return (
    named(/\b(?:Edg|EdgiOS|Edge)\/(\d+)/, "Edge") ??
    named(/\b(?:OPR|Opera)\/(\d+)/, "Opera") ??
    named(/\b(?:Firefox|FxiOS)\/(\d+)/, "Firefox") ??
    named(/\b(?:CriOS|Chrome)\/(\d+)/, "Chrome") ??
    (/Safari\//.test(ua) && !/\b(?:Chrome|Chromium|CriOS|Android)\b/.test(ua)
      ? named(/Version\/(\d+)/, "Safari") ?? "Safari"
      : null)
  );
}

function parseOs(ua: string): string | null {
  if (/iPhone|iPad|iPod/.test(ua)) {
    const m = ua.match(/OS (\d+)/);
    return m ? `iOS ${m[1]}` : "iOS";
  }
  const android = ua.match(/Android ([\d.]+)/);
  if (android) return `Android ${android[1].split(".")[0]}`;
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "Chrome OS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

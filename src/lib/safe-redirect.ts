// Only allow same-site relative paths, so a login link can't bounce someone to another site.
export function safeNextPath(next: string | null | undefined, fallback = "/host") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

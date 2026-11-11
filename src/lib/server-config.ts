export function serviceKey(env: Record<string, string | undefined>): string | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.trim() !== key) return null;
  if (key.startsWith("sb_secret_") && key.length > 30) return key;
  try {
    const parts = key.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.role === "service_role" ? key : null;
  } catch { return null; }
}

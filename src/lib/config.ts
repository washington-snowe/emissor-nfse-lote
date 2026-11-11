type Environment = Record<string, string | undefined>;

export function getSupabaseConfig(env: Environment) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  try {
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      const parts = key.split(".");
      if (parts.length !== 3) return null;
      const claims = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      ) as { role?: string };
      if (claims.role !== "anon") return null;
    }
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    )
      return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

export function getSiteOrigin(env: Environment) {
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
    const local =
      env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname);
    if (
      (!local && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

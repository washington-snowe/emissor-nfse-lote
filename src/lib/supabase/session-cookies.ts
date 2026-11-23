import type { CookieOptions } from "@supabase/ssr";

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} satisfies CookieOptions;

export const sessionCookiePolicyMarker = "rex-session-private";

export function isSessionCookie(name: string, supabaseUrl: string) {
  const project = new URL(supabaseUrl).hostname.split(".")[0];
  const key = `sb-${project}-auth-token`;
  if (name === key) return true;
  return name.startsWith(key + ".") && /^\d+$/.test(name.slice(key.length + 1));
}

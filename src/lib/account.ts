export type AccountState = { error?: string; success?: string; version?: number };
export function accountProfileInput(form: FormData) {
  const name = form.get("display_name"), phone = form.get("phone");
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name) ||
    typeof phone !== "string" || phone.length > 25 || !/^[0-9+() .-]*$/.test(phone)) return null;
  return { name: name.trim(), phone: phone.trim() };
}
export function loginChangeInput(form: FormData) {
  const kind = form.get("kind"), current = form.get("current_password"), value = form.get("value"), confirm = form.get("confirm_password");
  if (typeof current !== "string" || !current || current.length > 128) return null;
  if (kind === "email" && typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return { kind, current, value: value.trim() };
  if (kind === "password" && typeof value === "string" && value.length >= 12 && value.length <= 128 && value === confirm && value !== current) return { kind, current, value };
  if (kind === "sessions") return { kind, current, value: "" };
  return null;
}
export const REFERRAL_COOKIE = "emissor_referral";
export function validReferralCode(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{20}$/.test(value); }

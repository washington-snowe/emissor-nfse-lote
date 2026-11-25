export type AuthState = {
  error?: string;
  fields?: { email?: string; phone?: string; password?: string; confirmation?: string };
  success?: string;
};

export const accountPhoneMetadata = "account_phone";
export const rememberedEmailCookie = "rex-remembered-email";

export function validateEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim() : "";
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validateSignupPhone(value: unknown) {
  if (typeof value !== "string" || value.length > 25 || !/^\+?[0-9() .-]+$/.test(value.trim())) return null;
  const phone = value.trim().replace(/[() .-]/g, "");
  if (phone.startsWith("+")) return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
  return /^[1-9]\d{9,10}$/.test(phone) ? `+55${phone}` : null;
}

export function validateNewPassword(value: unknown) {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

export function validateCredentials(
  emailValue: unknown,
  passwordValue: unknown,
  signup = false,
) {
  const email = validateEmail(emailValue) ?? "";
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const fields: NonNullable<AuthState["fields"]> = {};
  if (!email)
    fields.email = "Informe um e-mail válido.";
  if (!password || password.length > 128 || (signup && !validateNewPassword(password)))
    fields.password = signup
      ? "Use uma senha entre 12 e 128 caracteres."
      : "Informe sua senha, com até 128 caracteres.";
  return { email, password, fields, valid: Object.keys(fields).length === 0 };
}

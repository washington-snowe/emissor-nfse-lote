export type AuthState = {
  error?: string;
  fields?: { email?: string; password?: string };
  success?: string;
};

export function validateCredentials(
  emailValue: unknown,
  passwordValue: unknown,
  signup = false,
) {
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const fields: NonNullable<AuthState["fields"]> = {};
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fields.email = "Informe um e-mail válido.";
  if (!password || password.length > 128 || (signup && password.length < 12))
    fields.password = signup
      ? "Use uma senha entre 12 e 128 caracteres."
      : "Informe sua senha, com até 128 caracteres.";
  return { email, password, fields, valid: Object.keys(fields).length === 0 };
}

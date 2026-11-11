export type CompanyDraft = {
  cnpj: string;
  legal_name: string;
  trade_name: string;
  tax_regime: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  municipality_code: string;
  email: string;
  phone: string;
  secondary_phone: string;
  main_cnae: string;
  main_cnae_description: string;
  secondary_cnaes: { code: string; description: string }[];
  legal_nature: string;
  company_size: string;
  registration_status: string;
  opened_on: string;
  mei_option: boolean | null;
  simples_option: boolean | null;
};

export const emptyCompany: CompanyDraft = {
  cnpj: "",
  legal_name: "",
  trade_name: "",
  tax_regime: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  postal_code: "",
  municipality_code: "",
  email: "",
  phone: "",
  secondary_phone: "",
  main_cnae: "",
  main_cnae_description: "",
  secondary_cnaes: [],
  legal_nature: "",
  company_size: "",
  registration_status: "",
  opened_on: "",
  mei_option: null,
  simples_option: null,
};

export function normalizeCnpj(value: string) {
  return value.replace(/[.\/\-\s]/g, "").toUpperCase();
}

export function validCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj))
    return false;
  const digit = (base: string) => {
    let weight = 2,
      sum = 0;
    for (let i = base.length - 1; i >= 0; i--) {
      sum += (base.charCodeAt(i) - 48) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? "0" : String(11 - remainder);
  };
  const first = digit(cnpj.slice(0, 12));
  return cnpj.slice(12) === first + digit(cnpj.slice(0, 12) + first);
}

const text = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const code = (value: unknown, size: number) => {
  const raw = typeof value === "number" && Number.isInteger(value) && value > 0
    ? String(value) : typeof value === "string" ? value.trim().replace(/[.\/\-\s]/g, "") : "";
  return /^\d+$/.test(raw) && raw.length <= size ? raw.padStart(size, "0") : "";
};

export function normalizeRegistry(
  payload: unknown,
  cnpj: string,
): CompanyDraft | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.cnpj !== "string" ||
    normalizeCnpj(p.cnpj) !== cnpj ||
    !text(p.razao_social)
  )
    return null;
  const mei = typeof p.opcao_pelo_mei === "boolean" ? p.opcao_pelo_mei : null;
  const simples =
    typeof p.opcao_pelo_simples === "boolean" ? p.opcao_pelo_simples : null;
  return {
    ...emptyCompany,
    cnpj,
    legal_name: text(p.razao_social),
    trade_name: text(p.nome_fantasia),
    tax_regime: mei === true ? "mei" : simples === true ? "simples" : "",
    street: [text(p.descricao_tipo_de_logradouro, 40), text(p.logradouro)]
      .filter(Boolean)
      .join(" ")
      .slice(0, 200),
    number: text(p.numero, 30),
    complement: text(p.complemento, 150),
    district: text(p.bairro, 100),
    city: text(p.municipio, 100),
    state: text(p.uf, 2),
    postal_code: code(p.cep, 8),
    municipality_code: /^[1-9]\d{6}$/.test(String(p.codigo_municipio_ibge)) ? String(p.codigo_municipio_ibge) : "",
    email: text(p.email, 254),
    phone: text(p.ddd_telefone_1, 30),
    secondary_phone: text(p.ddd_telefone_2, 30),
    main_cnae: code(p.cnae_fiscal, 7),
    main_cnae_description: text(p.cnae_fiscal_descricao, 300),
    secondary_cnaes: Array.isArray(p.cnaes_secundarios)
      ? p.cnaes_secundarios.slice(0, 100).flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const c = code(item.codigo, 7);
          return c.length === 7
            ? [{ code: c, description: text(item.descricao, 300) }]
            : [];
        })
      : [],
    legal_nature: text(p.natureza_juridica, 150),
    company_size: text(p.porte, 100),
    registration_status: text(p.descricao_situacao_cadastral, 100),
    opened_on: /^\d{4}-\d{2}-\d{2}$/.test(String(p.data_inicio_atividade))
      ? String(p.data_inicio_atividade)
      : "",
    mei_option: mei,
    simples_option: simples,
  };
}

export function validateCompany(value: unknown): {
  data?: CompanyDraft;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  if (!value || typeof value !== "object")
    return { errors: { form: "Dados inválidos." } };
  const p = value as Record<string, unknown>;
  const data = { ...emptyCompany };
  const limits: Record<string, number> = {
    legal_name: 200,
    trade_name: 200,
    street: 200,
    number: 30,
    complement: 150,
    district: 100,
    city: 100,
    state: 2,
    postal_code: 8,
    municipality_code: 7,
    email: 254,
    phone: 30,
    secondary_phone: 30,
    main_cnae: 7,
    main_cnae_description: 300,
    legal_nature: 150,
    company_size: 100,
    registration_status: 100,
    opened_on: 10,
    tax_regime: 10,
    cnpj: 30,
  };
  for (const [name, max] of Object.entries(limits)) {
    const raw = p[name];
    if (typeof raw !== "string" || raw.length > max)
      errors[name] = "Confira este campo.";
    else (data as unknown as Record<string, unknown>)[name] = raw.trim();
  }
  data.cnpj = normalizeCnpj(data.cnpj);
  data.state = data.state.toUpperCase();
  if (!validCnpj(data.cnpj)) errors.cnpj = "Informe um CNPJ válido.";
  if (!data.legal_name) errors.legal_name = "Informe a razão social.";
  if (!["mei", "simples"].includes(data.tax_regime))
    errors.tax_regime =
      "Selecione MEI ou Simples Nacional. Regime normal não é atendido.";
  if (
    data.state &&
    !"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
      .split(" ")
      .includes(data.state)
  )
    errors.state = "Confira a UF.";
  for (const [name, size] of [
    ["postal_code", 8],
    ["municipality_code", 7],
    ["main_cnae", 7],
  ] as const)
    if (data[name] && !new RegExp(`^\\d{${size}}$`).test(data[name]))
      errors[name] = "Confira o código informado.";
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    errors.email = "Confira o e-mail.";
  if (
    data.opened_on &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(data.opened_on) ||
      !Number.isFinite(Date.parse(data.opened_on)) ||
      new Date(data.opened_on).toISOString().slice(0, 10) !== data.opened_on)
  )
    errors.opened_on = "Confira a data de abertura.";
  for (const name of ["mei_option", "simples_option"] as const)
    data[name] = typeof p[name] === "boolean" ? p[name] : null;
  if (
    !Array.isArray(p.secondary_cnaes) ||
    p.secondary_cnaes.length > 100 ||
    p.secondary_cnaes.some(
      (item) =>
        !item ||
        typeof item.code !== "string" ||
        !/^\d{7}$/.test(item.code) ||
        typeof item.description !== "string" ||
        item.description.length > 300,
    )
  )
    errors.secondary_cnaes = "Confira as atividades secundárias.";
  else
    data.secondary_cnaes = p.secondary_cnaes.map((item) => ({
      code: item.code,
      description: item.description,
    }));
  return Object.keys(errors).length ? { errors } : { data, errors };
}

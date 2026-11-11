"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenancy";
import { normalizeCnpj, validCnpj, validateCompany } from "@/lib/companies";
import { fetchCnpj, type LookupResult } from "@/lib/cnpj-provider";

export async function consultCompany(value: string): Promise<LookupResult> {
  if (typeof value !== "string" || value.length > 30)
    return { error: "Informe um CNPJ válido." };
  const cnpj = normalizeCnpj(value);
  if (!validCnpj(cnpj)) return { error: "Informe um CNPJ válido." };
  try {
    const client = await createSupabaseClient();
    if (!client) return { error: "Entre na sua conta para consultar." };
    const context = await getTenantContext(client);
    if (context.status !== "ready")
      return { error: "Entre na sua conta ou tente novamente em instantes." };
    const quota = await client.rpc("consume_cnpj_lookup");
    if (quota.error)
      return {
        error: "A consulta está indisponível. Você pode preencher manualmente.",
      };
    if (quota.data !== true)
      return {
        error:
          "Você atingiu 10 consultas em 10 minutos. Aguarde ou preencha manualmente.",
      };
    return await fetchCnpj(cnpj);
  } catch {
    return {
      error: "A consulta está indisponível. Você pode preencher manualmente.",
    };
  }
}

export type SaveCompanyResult = {
  id?: string;
  error?: string;
  fields?: Record<string, string>;
};

export async function saveCompany(
  input: unknown,
  id?: string,
): Promise<SaveCompanyResult> {
  const parsed = validateCompany(input);
  if (!parsed.data)
    return { error: "Confira os campos indicados.", fields: parsed.errors };
  if (id && !/^[0-9a-f-]{36}$/i.test(id))
    return { error: "Empresa não encontrada." };
  try {
    const client = await createSupabaseClient();
    if (!client) return { error: "Entre novamente na sua conta." };
    const context = await getTenantContext(client);
    if (context.status !== "ready")
      return { error: "Não foi possível validar seu espaço de trabalho." };
    const d = parsed.data;
    const values = {
      tenant_id: context.tenantId,
      cnpj: d.cnpj,
      legal_name: d.legal_name,
      trade_name: d.trade_name,
      tax_regime: d.tax_regime,
      address: {
        street: d.street,
        number: d.number,
        complement: d.complement,
        district: d.district,
        city: d.city,
        state: d.state,
        postal_code: d.postal_code,
        municipality_code: d.municipality_code,
      },
      email: d.email,
      phone: d.phone,
      secondary_phone: d.secondary_phone,
      main_cnae: d.main_cnae,
      main_cnae_description: d.main_cnae_description,
      secondary_cnaes: d.secondary_cnaes,
      legal_nature: d.legal_nature,
      company_size: d.company_size,
      registration_status: d.registration_status,
      opened_on: d.opened_on || null,
      mei_option: d.mei_option,
      simples_option: d.simples_option,
    };
    const result = id
      ? await client
          .from("companies")
          .update(values)
          .eq("id", id)
          .eq("tenant_id", context.tenantId)
          .select("id")
          .maybeSingle()
      : await client.from("companies").insert(values).select("id").single();
    if (result.error?.code === "23505")
      return {
        error: "Este CNPJ já está cadastrado na sua conta.",
        fields: { cnpj: "Empresa já cadastrada." },
      };
    if (result.error || !result.data)
      return {
        error:
          "Não foi possível salvar a empresa. Tente novamente em instantes.",
      };
    revalidatePath("/painel");
    revalidatePath("/painel/empresas");
    return { id: result.data.id };
  } catch {
    return {
      error: "Não foi possível salvar a empresa. Tente novamente em instantes.",
    };
  }
}

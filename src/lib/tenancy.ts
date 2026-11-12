type AuthUser = { id: string; email?: string };

type TenantGateway = {
  auth: {
    getUser(): PromiseLike<{
      data: { user: AuthUser | null };
      error: unknown;
    }>;
  };
  rpc(name: "ensure_tenant"): PromiseLike<{ data: unknown; error: unknown }>;
};

export type TenantContext =
  | { status: "unauthenticated" }
  | { status: "unavailable" }
  | { status: "ready"; user: AuthUser; tenantId: string };

// Called by server components; the database derives ownership from its verified JWT context.
export async function getTenantContext(
  client: TenantGateway,
): Promise<TenantContext> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { status: "unauthenticated" };
    const tenant = await client.rpc("ensure_tenant");
    if (
      tenant.error ||
      typeof tenant.data !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        tenant.data,
      )
    )
      return { status: "unavailable" };
    return { status: "ready", user: data.user, tenantId: tenant.data };
  } catch {
    return { status: "unavailable" };
  }
}

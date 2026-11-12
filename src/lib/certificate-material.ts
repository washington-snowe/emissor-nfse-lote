import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { inspectA1, openCertificate } from "@/lib/certificates";

export async function loadCertificateMaterial(context: { tenantId: string; companyId: string; certificateId: string }, purpose: "access_check" | "emit" | "reconcile") {
  const admin=createAdminClient();
  if (!admin) throw new Error("Protected service unavailable.");
  const result=await admin.rpc("certificate_material",{p_company:context.companyId,p_certificate:context.certificateId,p_purpose:purpose});
  const data=result.data;
  if (result.error || !data || data.tenant_id!==context.tenantId || data.company_id!==context.companyId || data.certificate_id!==context.certificateId)
    throw new Error("Protected certificate unavailable.");
  const material=openCertificate(data.envelope,data.key,context);
  try {
    const inspected=await inspectA1(material.pfx,material.password,data.subject_cnpj);
    if (!inspected.data || inspected.data.metadata.fingerprint!==data.fingerprint) throw new Error("Certificate verification failed.");
    return {...material,...inspected.data};
  } catch {
    material.pfx.fill(0);
    throw new Error("Certificate verification failed.");
  }
}

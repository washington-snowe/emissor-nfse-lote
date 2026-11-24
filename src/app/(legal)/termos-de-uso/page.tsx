import Link from "next/link";
import type { Metadata } from "next";
import { MINIMUM_USAGE_CHARGE_CENTS, money } from "@/lib/billing/catalog";
import { getPublicContact } from "@/lib/public-contact";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  const contact = getPublicContact();

  return <article>
    <header>
      <h1>Termos de uso</h1>
      <p>Condições para usar o Rex Notas, contratar um plano e emitir NFS-e pela plataforma.</p>
    </header>
    <section>
      <h2>1. Serviço e conta</h2>
      <p>O Rex Notas é uma ferramenta independente para afiliados da Shopee. O serviço permite importar o relatório mensal de comissões por vendedor, revisar os dados e solicitar a emissão de NFS-e em lote. As funções disponíveis dependem do plano, do perfil fiscal e da configuração da empresa.</p>
      <p>Use dados atualizados, proteja suas credenciais de acesso e cadastre apenas empresas que você pode representar. Informe ao atendimento se suspeitar de acesso indevido à conta.</p>
    </section>
    <section>
      <h2>2. Emissão e entrega das notas</h2>
      <p>Antes de confirmar o lote, confira o tomador, a competência, os valores, os dados tributários e os destinatários. Use um certificado A1 válido e autorizado para o CNPJ emissor. A confirmação autoriza o Rex a assinar e transmitir as declarações correspondentes e, quando você autorizar a entrega, a encaminhar os documentos aos e-mails revisados.</p>
      <p>A autorização da nota depende do serviço fiscal. A análise de CNPJ e a prévia do relatório ajudam na configuração. A classificação tributária da operação e as obrigações fiscais são de responsabilidade da empresa emissora. Em caso de dúvida sobre o enquadramento ou a competência, consulte a contabilidade da empresa.</p>
    </section>
    <section>
      <h2>3. Planos e cobranças</h2>
      <p>Confira o valor, o período de cobrança, a franquia mensal e a tarifa de excedente na <Link href="/#planos">página de planos</Link> e na contratação. A assinatura se renova no ciclo escolhido até ser cancelada. No plano anual, a cobrança da assinatura é anual e a franquia de notas é mensal.</p>
      <p>Somente as notas autorizadas em produção contam para a franquia. O Rex registra o valor de cada excedente conforme a tarifa do plano e cobra automaticamente quando o saldo alcança {money(MINIMUM_USAGE_CHARGE_CENTS)}, o mínimo de cobrança em reais pela Stripe.</p>
      <p>Ao subir de plano na mesma frequência, a Stripe mostra a diferença proporcional do período em andamento antes da confirmação. A renovação seguinte segue o preço do novo plano.</p>
    </section>
    <section>
      <h2>4. Cancelamento e solicitações de cobrança</h2>
      <p>Você pode cancelar a renovação em Assinatura, no painel. O cancelamento agendado encerra a assinatura no fim do período em andamento. Pagamentos pendentes e valores pelo uso já realizado seguem as condições de contratação e a legislação aplicável.</p>
      <p>Encaminhe pedidos de arrependimento, reembolso e contestação pelo atendimento. O direito de arrependimento e os demais direitos do consumidor são respeitados nos casos previstos em lei.</p>
    </section>
    <section>
      <h2>5. Uso responsável e disponibilidade</h2>
      <p>Envie relatórios legítimos que você tem autorização para tratar. Respeite os limites do serviço e preserve o acesso às contas, dados e documentos de outras pessoas. O Rex pode restringir o acesso para proteger contas ou conter fraude e abuso, conforme o caso e a legislação aplicável.</p>
      <p>A emissão e a entrega podem levar mais tempo durante falhas nos serviços fiscais, de pagamento ou de e-mail. Acompanhe o andamento pelo painel e guarde suas cópias do XML e do DANFS-e conforme as obrigações da sua empresa.</p>
    </section>
    <section>
      <h2>6. Privacidade e atendimento</h2>
      <p>A <Link href="/politica-de-privacidade">Política de privacidade</Link> explica quais dados usamos para prestar o serviço e como solicitar atendimento sobre eles.</p>
      {contact && <p>Para dúvidas sobre estes termos ou sobre sua assinatura, <a href={contact.href}>{contact.label.toLowerCase()}</a>.</p>}
    </section>
  </article>;
}

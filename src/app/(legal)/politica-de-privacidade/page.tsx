import Link from "next/link";
import type { Metadata } from "next";
import { getPublicContact } from "@/lib/public-contact";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  const contact = getPublicContact();

  return <article>
    <header>
      <h1>Política de privacidade</h1>
      <p>Como o Rex Notas trata dados na consulta pública de CNPJ, no painel e na prestação do serviço.</p>
    </header>
    <section>
      <h2>1. Dados usados pelo Rex</h2>
      <ul>
        <li><strong>Conta e empresa.</strong> E-mail, informações de perfil, CNPJ, contatos e dados cadastrais e fiscais informados no painel.</li>
        <li><strong>Relatórios e emissão.</strong> Arquivos importados, comissões, dados fiscais e de contato dos vendedores e tomadores, registros de processamento e documentos autorizados.</li>
        <li><strong>Certificado digital.</strong> O A1 e sua senha são armazenados de forma criptografada com acesso restrito para verificação, assinatura e transmissão autorizadas pela empresa.</li>
        <li><strong>Assinatura e segurança.</strong> Plano, uso da franquia, registros de pagamento e cobrança, informações de sessão e eventos técnicos para proteger o serviço e investigar falhas.</li>
      </ul>
      <p>Na consulta pública, enviamos o CNPJ informado à BrasilAPI para consultar os dados do cadastro. O simulador público de CSV lê o arquivo diretamente no navegador. Ao salvar uma importação no painel, o relatório é enviado para processamento e armazenamento privado.</p>
    </section>
    <section>
      <h2>2. Para que usamos os dados</h2>
      <p>Usamos os dados para administrar a conta, consultar cadastros, preparar e acompanhar emissões, disponibilizar documentos, enviar notas quando autorizado, cobrar a assinatura e prestar atendimento. Tratamos os dados necessários para executar o serviço, cumprir obrigações legais e fiscais, exercer direitos e proteger as contas e a infraestrutura contra falhas e fraudes, conforme o caso.</p>
    </section>
    <section>
      <h2>3. Serviços envolvidos</h2>
      <ul>
        <li>Vercel e Supabase fornecem a infraestrutura do site, autenticação e armazenamento de dados.</li>
        <li>Os serviços públicos de NFS-e recebem as declarações transmitidas para análise e autorização fiscal.</li>
        <li>A Stripe processa pagamentos. O Rex usa os registros de transação e assinatura para acompanhar o plano e as cobranças. Os dados completos do cartão são informados diretamente à Stripe.</li>
        <li>Brevo, SendPulse e Mailjet podem realizar as entregas de XML e DANFS-e aos endereços confirmados na revisão do lote.</li>
        <li>Se você abrir o atendimento no WhatsApp, a conversa segue no serviço do WhatsApp.</li>
      </ul>
      <p>O tratamento por fornecedores pode ocorrer fora do Brasil, de acordo com a infraestrutura utilizada e as regras aplicáveis de transferência internacional da LGPD.</p>
    </section>
    <section>
      <h2>4. Cookies e retenção</h2>
      <p>O painel usa cookies necessários para manter a sessão, proteger o acesso e lembrar a empresa selecionada. Usamos cookies também para lembrar o estado da barra lateral e, se você marcar a opção no formulário de acesso, preencher seu e-mail por até 90 dias. Quando você se cadastra por indicação, um cookie temporário guarda o código para associar a indicação à conta. Você pode gerenciar cookies nas configurações do navegador. Limpar os cookies de sessão encerra o acesso naquele navegador.</p>
      <p>Os dados são mantidos pelo tempo necessário para a prestação do serviço, o cumprimento de obrigações legais e fiscais, a segurança e o exercício de direitos. Uma solicitação de exclusão é avaliada conforme a finalidade do dado e os deveres de guarda aplicáveis.</p>
    </section>
    <section>
      <h2>5. Seus direitos e contato</h2>
      <p>Você pode pedir confirmação do tratamento, acesso, correção, informação sobre compartilhamento e, nos casos previstos na LGPD, portabilidade, anonimização, bloqueio ou eliminação. Também pode se opor ao tratamento nas hipóteses legais e revogar o consentimento quando ele for a base utilizada. O atendimento pode solicitar a confirmação de identidade antes de entregar informações da conta.</p>
      {contact && <p>Para exercer seus direitos ou tirar dúvidas, <a href={contact.href}>{contact.label.toLowerCase()}</a>.</p>}
      <p>Veja também os <Link href="/termos-de-uso">Termos de uso</Link> da plataforma.</p>
    </section>
  </article>;
}

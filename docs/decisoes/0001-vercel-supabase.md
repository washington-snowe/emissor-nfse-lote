# Decisão 0001 — Next.js, Vercel e Supabase

Estado: aprovado pelo usuário em conversa; implementação da primeira fatia autorizada. Substitui a recomendação original de Django/HTMX/Celery. O texto da especificação mestre permanece integralmente preservado.

## Escolha

- Next.js App Router, React e TypeScript estrito na Vercel.
- Supabase Auth para identidade, PostgreSQL para dados de negócio e Storage privado para arquivos futuros.
- Componentes de servidor por padrão; React cliente apenas onde existe interação. CSS para microinterações; Motion só quando CSS não resolver uma necessidade concreta. Nenhuma dependência de animação adicional nesta fatia.
- Não usar `output: export`: login, cookies e páginas privadas precisam de servidor. A diretriz de export estático da skill visual não se aplica à necessidade de autenticação dinâmica aprovada.
- Worker fiscal e fila em processo/hospedagem separados, ainda a escolher; não assumir que Supabase ou Vercel resolvem processamento longo, OCR ou proteção A1 por si sós.

## Consequências

O modelo conceitual de tenants, empresas, comissões, prévia, operações, tentativas, documentos e ledger da descoberta continua relevante. Sua implementação será por migrações SQL versionadas no Supabase, RLS fail-closed e chaves compostas. Nenhuma tabela de negócio foi criada nesta entrega. Identidade de Auth não substitui tenant: vínculo e autorização serão implementados antes de qualquer dado fiscal multiempresa.

As sessões usam `@supabase/ssr` e cookies; páginas privadas validam identidade com `auth.getUser()` no servidor. Nunca confiar apenas em `getSession()`, cookie decodificado ou tenant do frontend. A chave pública/publishable não dá privilégios de servidor; a configuração rejeita secret/service_role. Não há uso de chave privilegiada nesta entrega.

Não há adaptação fiscal por suposição. Recorte MEI/Simples e competência permanece requisito do usuário, cuja evidência normativa e operacional precisa de pesquisa/homologação antes de emissão.

## Custos e limites

Recalcular o orçamento com planos e termos reais Vercel/Supabase, worker, fila, storage, e-mail e KMS. Não presumir que um plano gratuito autoriza uso comercial ou atende backup, carga e disponibilidade pretendidos. A estimativa anterior é apenas hipótese de descoberta, não cotação desta stack.

## Primeira fatia

Apresentação sem métricas fictícias, páginas de acesso/cadastro, integração de sessão preparada, painel protegido e vazio, validação de configuração, testes das fronteiras, build e documentação. Multi-tenancy de negócio, CNPJs, recuperação de senha, MFA, importadores, certificados e emissão ficam para as próximas tarefas verificáveis. Fase 1 não está integralmente concluída.

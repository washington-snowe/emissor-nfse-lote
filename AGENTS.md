# Instruções de engenharia

## Estado e autorização

Este repositório está na Fase 0, apenas com documentação. Leia `docs/especificacao-mestra.md`, `docs/descoberta.md` e `docs/roadmap.md`. A implementação depende de aprovação explícita do usuário. Não trate a proposta arquitetural como código existente. Não faça commits, push, deploy, contratação de serviços ou emissão real sem autorização.

## Arquitetura proposta

Monólito modular Django, PostgreSQL central e workers Celery separados, com Redis como transporte. Interface responsiva em português com templates Django e HTMX. Infraestrutura e adaptadores dependem do domínio, nunca o inverso. Detalhes em `docs/arquitetura.md`.

Módulos propostos: identity, tenancy, companies, certificates, imports, marketplaces, commissions, recipients, tax_configuration, invoicing, integrations, jobs, documents, notifications, billing, dashboard, administration e audit. Criar apenas o necessário em cada etapa aprovada.

## Convenções e comandos

Python com tipagem nas fronteiras e regras de domínio; valores monetários com Decimal e moeda explícita, nunca float. Datas com fuso explícito; competência fiscal separada do instante UTC. Validação no backend. Mensagens do produto em pt-BR; nomes técnicos consistentes. Erros de domínio distintos dos de transporte. Dependências e ferramentas com versões fixadas e lockfile após aprovação.

Ainda não há scripts de desenvolvimento ou testes. Na Fase 1, publicar no README os comandos reais de instalação, migração, servidor, worker, testes, lint e verificação de tipos, e executá-los. Não anunciar comandos apenas propostos como disponíveis.

As tarefas cloud já são isoladas: utilizar o checkout existente; não criar worktree sem pedido explícito do usuário. Não sobrescrever alterações existentes. Inspecionar Git e instruções antes de editar.

## Segurança

- Derivar tenant da sessão autenticada e validar vínculo no servidor. Nunca confiar em tenant vindo do formulário, URL ou payload da fila.
- Provar isolamento com duas contas em testes de API, banco, jobs e documentos; acesso de suporte exige concessão temporária e auditada.
- Certificados, senhas e tokens não entram em logs, fixtures, Git, payloads de fila ou arquivos temporários em claro.
- Certificados por criptografia de envelope; chave mestra fora do banco e do repositório. Sem gerenciador de chaves aprovado, upload A1 fica indisponível.
- Usar CSRF, cookies seguros, sessões revogáveis, limites de requisições e uploads, validação de tipo real e processamento de arquivos isolado e limitado.
- Preservar TLS, checksums e assinaturas durante instalação e integração.

## Banco de dados

Migrações versionadas e revisadas; nenhuma alteração destrutiva sem plano de preservação e autorização. Constraints únicas e chaves compostas devem impedir vínculos entre tenants. Mudanças monetárias, de consumo e estados fiscais precisam de transações e testes de concorrência. Testar em PostgreSQL real, sem substituir por SQLite nas garantias de isolamento. Política de RLS deve falhar fechada e usar conexão de aplicação sem privilégios de bypass.

## Integrações fiscais

Consultar documentação oficial vigente e registrar URL, versão e evidência antes de implementar. Não inventar endpoint, XML, código tributário, regra de tomador, alíquota ou credenciamento. A1 não prova elegibilidade. HTTP 2xx não prova autorização. Timeout após envio bloqueia retransmissão e exige reconciliação oficial. Nunca misturar tomadores distintos, nem converter tomador estrangeiro em exportação automaticamente. Mocks devem estar claramente identificados e não provar homologação real.

## Conclusão

Cada tarefa aprovada deve ter critérios de aceitação, implementação, testes relevantes executados com resultado e documentação atualizada. Distinguir testes passados, falhos, ignorados e não executados. Falhas de isolamento, duplicidade ou integridade financeira impedem etapas dependentes. Não declarar produção pronta sem homologação fiscal, restauração de backup, revisão de segurança e autorização.

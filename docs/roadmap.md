# Roadmap priorizado e critérios de aceitação

> Registro original da descoberta. A stack foi posteriormente substituída por Next.js/React/TypeScript + Vercel/Supabase. Consulte [a decisão atual](decisoes/0001-vercel-supabase.md) e [o estado da fundação](fundacao.md); estimativas e tarefas específicas de Django/Celery precisam de revisão.

Execução incremental. **Nesta entrega só há documentos da Fase 0.** Fases 1–7 aguardam aprovação. Não há estimativa de prazo confiável antes de fontes, amostras e capacidade da equipe; priorização abaixo evita prometer datas sem base.

## Fase 0 — descoberta e aprovação

Entregues como proposta: diagnóstico, comparação de stack, arquitetura, esquema conceitual, pastas, filas, segurança, mapa externo, riscos, orçamento por hipóteses e roadmap. Referência de regimes/competências do usuário incorporada.

Ainda necessários para encerrar descoberta: consulta fiscal oficial (incluindo a resolução indicada), pesquisa concorrencial verificável, análise de layouts reais, regras de tomador e validação do plano. Sem isso não declarar viabilidade fiscal/comercial confirmada. Aprovação explícita do usuário é portão para implementação; não há aprovação implícita por silêncio.

Aceite: fontes rastreáveis, pendências e responsáveis claros, arquitetura aprovada e escopo de uma primeira fatia definido. A fundação pode ser aprovada separadamente sem liberar código fiscal com pressupostos não verificados.

## Fase 1 — fundação

| Tarefa sequencial | Módulos/arquivos planejados | Dependência/risco | Critério de aceitação e verificação |
| --- | --- | --- | --- |
| 1.1 Bootstrap e toolchain | pyproject/lock, config, README, CI, ops | Stack aprovada; compatibilidade e atualizações | Instalação reproduzível em ambiente limpo, migrations e comandos reais executados |
| 1.2 Identidade e tenants | identity, tenancy, audit | Sessão e contexto confiáveis | Criar duas contas; login/logout, verificação, recuperação, expiração/revogação e CSRF testados; tentativas limitadas |
| 1.3 Banco e isolamento | tenancy, migrations, testes PostgreSQL | RLS/roles e pool de conexão | Constraints bloqueiam relações cruzadas; tenant ausente falha fechado; conexão reaproveitada não herda tenant anterior |
| 1.4 Empresas e enquadramento | companies, tax_configuration | Histórico por vigência, sem inferência fiscal | Cadastro multi-CNPJ; regime normal bloqueado; ME/EPP 10/2026 e 11/2026 cobertos por testes com regras normativas aprovadas; fronteiras e mudança de regime testadas |
| 1.5 Interface inicial | templates, static, dashboard | Somente dados reais persistidos | Conta e empresas funcionam em desktop/celular; estados vazios, validações e métricas reais; sem números de demonstração disfarçados |
| 1.6 Segurança da conta | identity, administration | MFA e recuperação | MFA/TOTP, códigos de recuperação e sessões testados; acesso administrativo separado e auditado |

Isolamento será ampliado a cada módulo futuro. Não é possível provar agora isolamento de certificados, notas e pagamentos ainda inexistentes; cada um terá seu próprio portão negativo.

## Fase 2 — importação e revisão

1. Contrato de normalização, proveniência e armazenamento privado. Aceite: nenhuma consulta/download cruza tenant; limite/tipo de upload e arquivos maliciosos cobertos.
2. Escolher o primeiro layout comprovado entre as três plataformas, sem remover as demais do MVP. Implementar adaptador CSV e XLSX com fixtures anonimizadas reais; reconciliação de totais, decimais, IDs, reexportações, estornos e registros ambíguos.
3. Implementar os outros adaptadores somente com amostras/documentação. Cada layout recebe versão e testes; não usar cabeçalhos fictícios como se fossem oficiais.
4. PDF: extrair texto; OCR apenas quando necessário. Testar imagem, texto, arquivo protegido, inválido, layout desconhecido e baixa confiança. Aceite: falhas identificadas, nenhuma invenção de valor, processamento limitado e isolado.
5. Resolução de tomador e regra versionada com evidência por modalidade. Aceite: tomadores diferentes nunca se misturam; moeda, emissor, competência e tratamento fiscal incompatíveis também não; registros ambíguos ficam bloqueados.
6. Prévia e confirmação versionada. Aceite: mudança invalida confirmação; dupla confirmação concorrente não duplica operação/alocação; total da prévia concilia com linhas elegíveis.

Risco principal: dados/regras ainda indisponíveis. Sem amostras, implementar apenas infraestrutura/contrato aprovados e manter adaptador como não suportado, sem fingir suporte à plataforma.

## Fase 3 — A1 e motor fiscal

1. Selecionar KMS/Transit e provar envelope, troca de contexto, rotação e recuperação. Aceite: ciphertext não serve para outro tenant/company, papéis sem permissão falham e nenhum segredo aparece em logs/disco.
2. A1 com certificados de teste: senha incorreta, expirado, titular incompatível e formato inválido. Aceite: associação verificada, acesso mínimo e exclusão/substituição seguras com jobs em andamento.
3. Registrar contrato oficial vigente e matriz de elegibilidade. Aceite: URLs/métodos/esquemas/códigos reais, competência e credenciamento documentados; sem depender de endpoint inventado.
4. Emissão individual e consulta em ambiente oficialmente apropriado. Aceite: autorização fiscal efetiva e documentos reais de teste recuperáveis; HTTP 2xx com rejeição não autoriza. Mocks cobrem falhas, mas não substituem homologação.
5. Idempotência e resultados incertos. Aceite: envio duplicado, restart, timeout, lease vencido e resposta perdida não geram retransmissão cega; recuperação comprovada por consulta oficial ou intervenção bloqueante.
6. Rejeições, cancelamento e substituição conforme suporte comprovado. Aceite: histórico preservado, elegibilidade para correção e confirmação fiscal dos eventos; pedido não é resultado.

Sem credenciamento, certificado de teste ou mecanismo oficial de consulta, esses itens ficam explicitamente bloqueados; não declarar Fase 3 concluída por testes mockados.

## Fase 4 — processamento e entrega

Infraestrutura de outbox/filas necessária às fases 2–3 entra incrementalmente nelas; esta fase endurece operação completa, sem deixar emissão síncrona temporária como produto final.

Aceite: publicação após commit, entrega duplicada, morte do worker em cada fronteira e perda do broker testadas em banco/broker reais; recuperação sem dupla emissão. Limites por provedor/emissor, monitoramento, filas de intervenção e restauração de leases validados. Workers reiniciam pelas instruções salvas, sem depender do navegador.

Storage/XML/PDF/ZIP: checksum, autorização por objeto, tenant, prevenção de traversal e testes negativos em lote. E-mail somente após autorização comprovada; remetente verificado, tentativa/aceite/entrega separados e falha sem alteração fiscal. Timeout de envio tratado conforme capacidade de idempotência do provedor, sem prometer ausência absoluta de duplicatas.

## Fase 5 — monetização

Dependências: decisões comerciais explícitas e provedor aprovado. Implementar planos versionados, limites, reserva, consumo e excedente consentido. Testar autorização repetida, cancelamento, substituição, rejeição, incerteza, concorrência na última unidade, fechamento de ciclo e estorno comercial.

Cartão via checkout/tokenização e PIX conforme documentação real. Aceite: webhooks assinados, duplicados, fora de ordem e replays testados; falha do provedor não ativa assinatura; nenhuma informação completa de cartão armazenada. Fluxos de renovação, mudança de plano, inadimplência e cancelamento com termos claros e reconciliação.

## Fase 6 — operação e experiência

Histórico com filtros, exportações, métricas derivadas do banco, alertas A1 e consumo. Painel administrativo separado com concessões mínimas, MFA, auditoria e suporte sem acesso livre a A1. Aceite: testes de autorização de todas as rotas, navegação móvel, acessibilidade básica, filtros e totais consistentes com documentos reais. Não apresentar estimativa de tempo economizado como fato sem metodologia explícita.

## Fase 7 — preparação para produção

Portões obrigatórios: revisão de segurança e LGPD; testes de carga no volume medido; backup e restore de banco, objetos e chaves; reconciliação antes de reativar workers restaurados; alertas e runbooks de incidente; revisão de dependências; orçamento/contratos; homologação com usuários e avaliação contábil. Validar RPO/RTO propostos por exercício real.

Teste ponta a ponta final: cadastro → empresa elegível → A1 de teste → relatório real anonimizado → prévia → confirmação → worker → autorização de homologação → documentos → e-mail de teste → histórico/consumo. Testes precisam executar assertions reais; contar executados, falhos e ignorados. Nenhuma emissão de produção como teste sem autorização explícita.

Deploy, contratação, publicação e operação real requerem autorização própria; aprovação do plano não as autoriza.

## Protocolo por tarefa

Antes: objetivo, módulos afetados, dependências, riscos e critério de aceite. Depois: implementação pequena, testes apropriados executados, correções, documentação e relatório de limitações. Problemas críticos de tenant, duplicidade ou integridade monetária bloqueiam trabalho dependente. Não criar commits automaticamente.

## Verificação desta entrega documental

Validar existência dos documentos, links locais, preservação da especificação original e estado do Git. Esses checks apenas verificam integridade dos entregáveis; não são testes da aplicação e não encerram a homologação. Registrar o resultado real após executá-los.

Resultado executado nesta entrega: 8/8 documentos presentes; 7 links locais válidos; SHA-256 da especificação copiada idêntico ao arquivo fornecido; somas do orçamento e exemplos de ponto de equilíbrio conferidos por assertions Python. Git permanece sem commits e somente os novos documentos aparecem como não rastreados. Não houve instalação nem teste de aplicação, pois a implementação aguarda aprovação. Consulta final de status confirmou observações atuais, política aplicada e lista de domínios personalizados ainda vazia: a permissão proposta está salva no rascunho, mas não aplicada ao runtime.

# Segurança e recuperação do RexNotas

O navegador usa as ações do Rex para autenticação. `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SITE_URL` são configuração do servidor. O build recusa variáveis `NEXT_PUBLIC_`. O cookie de sessão usa HttpOnly, SameSite=Lax e Secure em produção. Sessões antigas recebem os atributos novos na próxima requisição autenticada.

A migração [24](../supabase/migrations/202611230024_limit_browser_metadata.sql) limita a consulta de verificação de certificado aos campos usados pelo painel. As reservas do worker, o contrato capturado e o material do A1 têm acesso restrito. Os dados fiscais exibidos pelo painel e os downloads XML/PDF exigem sessão e vínculo com a conta. As notas privadas têm cache desabilitado.

Em 23/11/2026, a API do Supabase retornou zero backups disponíveis e PITR desativado. O endpoint de agendamento retornou HTTP 402. Uma restauração de produção e a recuperação do Vault ainda precisam ser executadas com uma cópia restaurável e um destino isolado autorizado. A edição do plano deve considerar a retenção e a possibilidade de restaurar em outro projeto.

## Ensaio isolado

`npm run test:db` cria um PostgreSQL descartável sem rede. Após os testes de concorrência, ele executa `pg_dump` e `pg_restore` em um segundo banco e confere relatórios, hashes dos XMLs, histórico de envio, reservas, numeração e acesso por conta. O caso de transmissão interrompida só pode prosseguir por consulta. O ensaio usa dados sintéticos e não inclui a chave gerenciada do Vault.

`tests/integration/frontend-privacy.mjs` confere páginas públicas, arquivos estáticos e recusas a visitantes. Configure `FRONTEND_AUDIT_URL` para o domínio desejado. Para analisar todos os arquivos da compilação local, defina também `FRONTEND_AUDIT_STATIC_DIR=.next/static`. Use valores sintéticos em `SECURITY_CANARY_*` para detectar inclusão acidental no cliente. A saída informa apenas o arquivo ou a rota afetada.

## Restauração de produção

1. Registre a hora da falha e da última cópia recuperável. Preserve o estado atual e suspenda os workers de emissão e e-mail antes de restaurar.
2. Restaure em um ambiente isolado com emissão, entregas, Stripe e agendadores desligados. Use o backup gerenciado que preserve o acesso às chaves do Vault e valide isso antes de qualquer troca de ambiente. PDFs locais podem ser regenerados a partir dos XMLs autorizados. As fontes do bucket privado e a configuração da Vercel precisam de cópia própria, pois os arquivos do Storage ficam fora do backup PostgreSQL.
3. Compare as contas, as somas e quantidades dos lotes, os hashes dos relatórios e XMLs, os contadores e o histórico de envio. Confira o acesso de duas contas e a capacidade de abrir o A1 pelo servidor sem exportar a chave.
4. Confronte o período entre o backup e a falha com a SEFIN e os registros dos provedores de e-mail. Uma cópia antiga pode mostrar como pendente uma nota ou mensagem que já saiu. Mantenha essas operações suspensas até confirmar o resultado. Uma operação que iniciou transmissão só usa consulta da DPS original.
5. Valide as filas, o Vault, o Storage, os callbacks e os documentos no destino. Registre qual ponto foi recuperado e o tempo medido de recuperação antes de religar os workers.

Na operação, acompanhe a saúde do Auth e da API REST, a idade das filas e as operações incertas, o vencimento do A1 e os erros de entrega. Os workers guardam diagnósticos e retomam reservas conforme os limites no banco. Os alertas automáticos ainda precisam de um destino autorizado. O resultado aceito pelo provedor é diferente da entrega na caixa postal.

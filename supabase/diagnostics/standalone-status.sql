-- Read-only metadata check. Does not read invoices, certificates, keys or customer values.
with objects as (
  select to_regclass('public.standalone_templates') as table_id,
    to_regprocedure('public.issue_standalone(uuid,uuid,uuid,text,uuid,jsonb,jsonb,boolean,integer)') as function_id
), expected(name,type_name) as (values
  ('id','uuid'),('tenant_id','uuid'),('company_id','uuid'),('profile_id','uuid'),('version','integer'),
  ('provider','text'),('defaults','jsonb'),('created_by','uuid'),('created_at','timestamp with time zone')
)
select o.table_id is not null as tabela_existe,
  o.function_id is not null as funcao_existe,
  coalesce((select encode(sha256(convert_to(prosrc,'UTF8')),'hex')='13b3b7536fb5e0326d10d0313a329c074c3f315b76ba44b66a1b5ce090520079' from pg_proc where oid=o.function_id),false) as funcao_atual,
  (select count(*)=9 from pg_attribute a join expected e on e.name=a.attname and e.type_name=format_type(a.atttypid,a.atttypmod)
    where a.attrelid=o.table_id and a.attnum>0 and not a.attisdropped and a.attnotnull) as colunas_compativeis,
  coalesce((select relrowsecurity and relforcerowsecurity from pg_class where oid=o.table_id),false) as rls_ativa,
  coalesce((select count(*)=1 from pg_policy where polrelid=o.table_id and polname='standalone_template_owner'),false) as politica_presente,
  coalesce(has_function_privilege('service_role',o.function_id,'execute'),false) and
    not coalesce(has_function_privilege('authenticated',o.function_id,'execute'),true) and
    not coalesce(has_function_privilege('anon',o.function_id,'execute'),true) as funcao_so_servidor,
  coalesce(has_table_privilege('authenticated',o.table_id,'select'),false) and
    not coalesce(has_table_privilege('authenticated',o.table_id,'insert,update,delete'),true) as cliente_somente_leitura
from objects o;

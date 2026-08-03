# Política de produção

VERAH OS Core não acessa produção. São permanentemente proibidos nesta etapa:

- migrations, push ou reparo de histórico no banco remoto;
- alteração de schema, dados, RLS, grants ou funções remotas;
- reativação de Deploy to production do Supabase;
- deployment manual;
- dados, mensagens ou pagamentos reais;
- credenciais em arquivos, logs ou artifacts;
- bypass ou enfraquecimento do ruleset.

Testes usam infraestrutura local/efêmera e fixtures sintéticas. Uma necessidade
de produção bloqueia o ciclo e gera um pedido separado com blast radius,
rollback e evidências.

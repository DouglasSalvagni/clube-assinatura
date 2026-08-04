# Prompt para IA local — validação completa

Você tem acesso ao monorepo em execução, frontend na porta 4002, API na porta 4003 e à infraestrutura Docker/banco local.

Teste integralmente a feature descrita em `Plans/commercial-negotiation-checkout/PLAN.md` e `CHECKLIST.md`.

Antes dos testes:

1. confirme que migrations estão aplicadas;
2. execute `npm run seed:test-all`;
3. confirme que `COMMERCIAL_V2_ENABLED_UNITS` permite `filial-centro`;
4. valide no banco os usuários, memberships, equipe, ofertas, versões, políticas, funil, modelos contratuais e oportunidades criados pelos seeds.

Execute testes pela interface e API, cobrindo:

- isolamento entre matriz e sede e visibilidade por OWNER, ADMIN, MANAGER, SALES, FINANCE, SUPPORT e VIEWER;
- Kanban, atribuição, transferência e movimentação de etapas;
- negociação PF com dependentes e recálculo;
- negociação PJ dentro da alçada e acima da alçada;
- solicitação, aprovação e rejeição de exceções;
- geração, expiração e revogação do pré-checkout;
- confirmação cadastral, CEP, CPF/CNPJ, participantes, contrato, hash e aceite;
- ofertas públicas PF/PJ e criação automática da oportunidade;
- bloqueio do checkout legado com V2 ativa;
- criação do checkout Asaas em sandbox, quando a conexão estiver configurada;
- webhook e idempotência, sem criar venda/assinatura duplicada;
- preservação do snapshot, política, contrato e participantes na conversão;
- aditivo, renovação e substituição contratual;
- permissões administrativas, métricas, logs e ausência de dados sensíveis.

Consulte o banco quando necessário para comprovar resultados. Não altere código inicialmente. Quando encontrar falha, reproduza, identifique a causa provável e proponha a correção.

Entregue um relatório em Markdown com: ambiente, comandos executados, cenários PASS/FAIL/BLOCKED, evidências (requisição/resposta, tela ou consulta SQL), bugs com severidade e localização provável, divergências do checklist e recomendação objetiva para liberação ou não da feature.

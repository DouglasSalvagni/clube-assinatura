Você tem acesso ao projeto local, ao banco e à infraestrutura já em execução no Docker Desktop. Não suba nem recrie os containers.

O frontend está em `http://localhost:4002` e a API em `http://localhost:4003` — confirme nas configurações caso estejam invertidos.

Sua tarefa é validar integralmente a implementação descrita em:

- `Plans/commercial-negotiation-checkout/PLAN.md`
- `Plans/commercial-negotiation-checkout/CHECKLIST.md`
- `Plans/commercial-negotiation-checkout/DEPLOYMENT.md`

Considere também os ajustes recentes de:

- usuários e vínculos por matriz/sede;
- permissões e isolamento multiunidade;
- seeds de usuários e da feature comercial;
- integração Asaas individual por unidade;
- teste de conexão, configuração e sincronização de webhook;
- tratamento de erros e timeouts do Asaas;
- checkout hospedado do Asaas;
- contratos, pré-checkout, dependentes, aprovações e conversão;
- aditivos, renovações e substituições contratuais.

## Procedimento

1. Leia o plano, o checklist, os seeds e o código implementado.
2. Execute:
   - `npm run typecheck`
   - `npm run test -w @club-platform/api`
3. Use os usuários e dados criados pelos seeds. Consulte os arquivos dos seeds para obter e-mails, senha, unidades, oportunidades e ofertas exatas.
4. Teste pela interface, API e banco, conforme necessário.
5. Não use produção do Asaas. Utilize apenas Sandbox.
6. Não considere uma tarefa aprovada apenas porque o endpoint responde: valide efeitos no banco, permissões, estados, auditoria e isolamento entre sedes.
7. Quando encontrar um problema claro, reproduza, identifique a causa, corrija o código e repita os testes afetados.
8. Não apague dados ou resete o banco inteiro sem necessidade.

## Cenários obrigatórios

- negociador enxerga somente oportunidades próprias;
- gerente enxerga o time;
- administrador enxerga a sede;
- superadministrador enxerga todas as sedes;
- usuários de uma sede não acessam dados de outra;
- Kanban, atribuição, transferência e movimentação de etapas;
- negociação PF com preço fixo, dependentes e recálculo;
- negociação PJ com vidas, preço unitário, desconto e aprovação;
- bloqueio do checkout quando há aprovação pendente;
- políticas por sede, perfil e usuário;
- contratos versionados, snapshot JSONB, hash e aceite;
- links públicos, expiração, revogação e proteção contra reutilização;
- checkout genérico por oferta pública;
- criação do checkout Asaas após o aceite;
- formas de pagamento permitidas;
- webhook idempotente e conversão sem duplicidade;
- criação da venda, assinatura e participantes;
- preservação de preço, contrato e política;
- aditivo, renovação e substituição;
- configuração Asaas distinta por unidade;
- chave mascarada, teste de conexão e estado claro na interface;
- criação, consulta, atualização e recuperação do webhook Asaas;
- comportamento diante de chave inválida, timeout, HTML do Cloudflare e rate limit;
- métricas, logs e ausência de dados sensíveis nos logs;
- bloqueio do checkout legado quando a nova feature estiver ativa.

## Entrega

Produza um relatório em `Plans/commercial-negotiation-checkout/TEST_REPORT.md` com:

- resumo executivo;
- ambiente e comandos executados;
- resultado de cada item do checklist: `PASS`, `FAIL`, `PARCIAL` ou `NÃO TESTADO`;
- evidências objetivas: rota, usuário, payload sanitizado, resposta, registros no banco e logs;
- bugs encontrados, causa e impacto;
- arquivos corrigidos;
- testes executados após cada correção;
- pendências que dependam de credenciais ou serviços externos;
- conclusão sobre a segurança de ativar a feature em uma sede piloto.

Ao final, apresente também uma lista curta dos arquivos modificados e eventuais migrations necessárias.
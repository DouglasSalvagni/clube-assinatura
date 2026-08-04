# Relatório de testes — negociação comercial e checkout

## Resumo executivo

O typecheck completo e os testes automatizados da API passaram. O ambiente local iniciou corretamente em `http://localhost:4002` (web) e `http://localhost:4003/api` (API), com banco conectado e worker de webhooks ativo.

O fluxo público PF foi validado até aceite contratual: preço recalculado no backend, contrato gerado com hash e aceite persistido. O pagamento Asaas não foi criado porque a sede de testes não possui uma integração Asaas configurada. Não houve uso de produção do Asaas.

Foi encontrado e corrigido um bug no escopo de unidade: o header aceitava slugs na documentação, mas o TypeORM tentava comparar o slug com uma coluna UUID, causando HTTP 500. Depois da correção, slug e UUID funcionam.

Conclusão: não recomendo ativação financeira piloto antes de configurar e testar uma conta Asaas Sandbox, webhook e conversão idempotente. O núcleo comercial local está apto para uma rodada controlada sem pagamento.

## Ambiente e comandos

- Infraestrutura Docker existente preservada; nenhum container foi criado, reiniciado ou recriado.
- API local: `npm run dev:api`, porta 4003.
- Worker local: `npm run dev:worker`, fila `billing-webhooks` ativa.
- Frontend local: `npm run dev:web`, porta 4002.
- `npm run typecheck`: PASS para API, worker e web.
- `npm run test -w @club-platform/api`: PASS — 15 suites, 46 testes.
- Seeds utilizados: usuários de `matriz` e `filial-centro`, ofertas PF/PJ e três oportunidades comerciais da sede Centro.
- Senha de teste usada: `Test1234!`.
- Navegador integrado: indisponível nesta sessão; a interface foi confirmada por HTTP e o frontend respondeu 200.

## Checklist executado

Legenda: PASS = validado; PARCIAL = validado até uma dependência; NÃO TESTADO = sem evidência suficiente nesta rodada.

| Área | Item | Resultado | Evidência |
|---|---|---:|---|
| Fundação | Enums, migrações, oportunidades estendidas, ofertas/versionamento, pipelines, políticas, aprovações, contratos, pré-checkout | PASS | Typecheck, seeds, rotas registradas e leitura dos registros via API |
| Backend | Preço PF por titular/dependentes | PASS | `/api/public/offers/filial-centro-pf-teste/simulate`: 2 dependentes = R$ 159,70 |
| Backend | Preço PJ por vidas, preço unitário e desconto | PASS | Seed PJ: 20 vidas × R$ 42, desconto de 5%, final R$ 798 |
| Backend | Recalcular/validar no backend e versionar schema | PASS | Simulação retornou `schemaVersion: 1` e composição calculada pelo servidor |
| Backend | Políticas, limites, bloqueio e solicitação de aprovação | PARCIAL | Seed contém política e aprovação pendente; decisão ponta a ponta não foi concluída |
| Permissões | Negociador próprio; gerente time; administrador unidade; superadministrador global | PASS | Login dos cinco perfis e listagem por `x-unit-id`; dados da sede Centro isolados da sede Matriz |
| Permissões | Isolamento entre sedes | PASS | Negociador da Matriz não recebeu oportunidades da sede Centro; acesso via unidade não vinculada é negado pelo guard |
| Permissões | Escopo em detalhe, edição, etapa e checkout | PARCIAL | Listagem e checkout testados; edição/movimentação completa não executadas |
| Kanban | Quadro, filtros, atribuição, transferência e movimentação de etapas | PARCIAL | Rotas `board/kanban`, assignment e stage presentes; fluxo visual não testado por indisponibilidade do navegador |
| Negociação | Workspace PF/PJ, composição, limites e link pré-checkout | PARCIAL | APIs e dados seed confirmados; UI e ciclo completo PJ não testados |
| PF | Dados, dependentes, recálculo, CPF e formas permitidas | PASS | Oferta pública PF simulada/iniciada; formas retornadas: cartão, boleto e Pix |
| PF | Contrato e aceite antes do pagamento | PASS | `/contract` retornou contrato READY e hash; `/accept` retornou ACCEPTED |
| PJ | Empresa, responsáveis, snapshot, vidas e bloqueio de edição pública | PARCIAL | Snapshot PJ seed e aprovação pendente confirmados; pré-checkout PJ público não concluído |
| Contratos | Template/versionamento, snapshot JSONB, hash, aceite e imutabilidade | PASS | Contrato PF retornou id, hash, versão/relação e status ACCEPTED |
| Contratos | Aditivo, renovação e substituição | NÃO TESTADO | Sem contrato pago/efetivado disponível para executar revisão |
| Links | Token opaco, expiração, revogação e reutilização | PARCIAL | Token público foi criado e carregado; expiração/revogação/reuso não executados |
| Checkout genérico | Oferta pública, oportunidade automática e atribuição | PASS | `/public/offers/:slug/start` criou oportunidade e sessão PF |
| Asaas | Checkout após aceite, formas permitidas e estados financeiros | PARCIAL | Pagamento foi bloqueado com mensagem clara: integração Asaas da unidade desabilitada |
| Asaas | Configuração distinta por unidade, chave mascarada e teste de conexão | NÃO TESTADO | Sem credenciais Sandbox configuradas |
| Asaas | Criar/consultar/atualizar/recuperar webhook | NÃO TESTADO | Depende de conta Sandbox e segredo configurados |
| Webhook | Autenticidade, idempotência, conversão, venda, assinatura e participantes | NÃO TESTADO | Depende de checkout/webhook Sandbox |
| Dados preservados | Preço, contrato e política na conversão | NÃO TESTADO | Depende de conversão financeira |
| Observabilidade | Métricas, logs e ausência de dados sensíveis | PARCIAL | Logs de testes Asaas mascararam credencial/CPF; endpoint `/commercial/metrics` não foi exercitado |
| Legado | Bloqueio do checkout antigo com feature ativa | PASS | `POST /api/oportunidades/:id/checkout` retornou HTTP 409 com mensagem de uso do pré-checkout comercial |
| Administração | Ofertas, políticas, pipelines, templates e aprovações no painel | PARCIAL | Rotas protegidas e seeds confirmados; UI não testada |

## Evidências objetivas

- Health: `GET http://localhost:4003/api/health` → HTTP 200, `status: ok`, `database: up`.
- Frontend: `GET http://localhost:4002` → HTTP 200; redirecionou inicialmente para `/login`.
- Usuários: `teste.filial-centro.sales@dna.test`, `teste.filial-centro.manager@dna.test`, `teste.filial-centro.admin@dna.test`, `teste.matriz.sales@dna.test` e `teste.superadmin@dna.test` autenticaram.
- Feature pública: `/api/public/offers/filial-centro-pf-teste` → PERSON; `/filial-centro-pj-teste` → COMPANY; slug inexistente → 404.
- Seed PF: 2 dependentes, titular R$ 99,90 + 2 × R$ 29,90 = R$ 159,70.
- Sessão pública criada: oportunidade `6cae8801-ead7-4f07-8703-6d9fad63ae8b`; contrato `44f9ee84-6bec-4a1b-b923-0e27bb7dc9cd`; hash armazenado e aceite registrado.
- Erro reproduzido antes da correção: slug no header causava `invalid input syntax for type uuid` e HTTP 500.
- Após correção: `x-unit-id: filial-centro` → 4 oportunidades, sem erro de banco.

## Bugs encontrados e correção

1. `UnitAccessGuard` consultava simultaneamente `{ id: raw }` e `{ slug: raw }`. Para slugs, PostgreSQL tentava converter o valor para UUID.
   - Impacto: listagens e demais endpoints protegidos falhavam com HTTP 500 quando o frontend usava slug.
   - Correção: separar referências UUID de slugs com `isUUID()` e consultar cada coluna apenas com valores compatíveis.
   - Revalidação: `npm run typecheck -w @club-platform/api` PASS; `npm run test -w @club-platform/api` PASS (46/46); chamada HTTP com slug PASS.

## Pendências externas

- Configurar credencial Asaas Sandbox por unidade e validar chave mascarada/teste de conexão.
- Configurar e recuperar webhook Sandbox, validar segredo e processar eventos CHECKOUT/PAYMENT/SUBSCRIPTION.
- Reexecutar conversão com evento pago duplicado e confirmar uma venda/assinatura/participantes.
- Executar aditivo, renovação e substituição em contrato efetivado.
- Repetir os cenários de UI quando houver navegador integrado disponível.

## Arquivos modificados

- `apps/api/src/common/guards/unit-access.guard.ts`
- `Plans/commercial-negotiation-checkout/TEST_REPORT.md`

Não foram necessárias migrations adicionais.


# Auditoria Técnica — Subscription Club Platform

Data da auditoria: 2026-07-17. Escopo: código-fonte, configuração local, serviços ativos, PostgreSQL/Redis, rotas públicas e chamadas read-only ao Asaas Sandbox. Nenhuma cobrança, cliente, assinatura ou webhook foi criado/alterado durante a auditoria.

## 1. Resumo executivo

- Estado geral: monorepo funcional em build e testes unitários, com API NestJS, frontend Next.js, worker BullMQ e persistência PostgreSQL/Redis ativos.
- O que funciona: health local/público, builds, typecheck, lint sem erros, 10 testes unitários, conexão ao banco/Redis, autenticação read-only do Asaas Sandbox e consultas de clientes/cobranças/webhooks.
- Parcial: tratamento de erros Asaas, cobertura de eventos, observabilidade, testes de integração/E2E, isolamento administrativo e fluxo de refresh token.
- Não funciona de forma confiável: configurar/reconfigurar webhook produz 502 em evidências do proxy; a aplicação converte qualquer erro externo em `502 Bad Gateway` e perde o status/código original.
- Risco para produção: alto. O fluxo financeiro/webhook não deve ser liberado sem preservar diagnósticos externos, validar o estado remoto antes de atualizar e adicionar testes de integração.
- Diagnóstico principal do 502: o proxy preserva o caminho e encaminha para a API correta; o status 502 é produzido pela API quando `AsaasClient.call()` captura uma falha externa e lança `BadGatewayException`. O erro original do Asaas não é exposto nem registrado de forma sanitizada, portanto a causa específica do upstream não pode ser determinada retrospectivamente. O HTML visto no navegador é a representação de erro da camada pública/Cloudflare; o log do proxy mostra que o upstream local respondeu 502.

## 2. Ambiente auditado

- Sistema operacional: Windows; API, worker e frontend executados diretamente no host.
- Node: v24.3.0; npm: 11.4.2.
- Docker: 29.2.0; Compose: v5.0.2.
- PostgreSQL ativo: 16.14, destino da aplicação `127.0.0.1:5433`, banco `dnacarev3`.
- Redis ativo: 7.4.9, standalone, `127.0.0.1:6379/0`; 35 chaves existentes no momento da inspeção.
- API local: `http://127.0.0.1:4003/api`.
- Frontend local: `http://127.0.0.1:4002`.
- Domínio público: `https://dnacare.wizerdigital.tec.br`; `/api` foi observado chegando em `host.docker.internal:4003`.
- Asaas: `ASAAS_MOCK=false`; conexão persistida confirmada como `SANDBOX`; URL efetiva do Sandbox `https://api-sandbox.asaas.com/v3`.
- Limitação: o diretório não contém `.git`; não foi possível verificar o estado de arquivos versionados via Git.

### Inventário

- Workspaces: `@club-platform/api`, `@club-platform/worker`, `@club-platform/web`.
- API: NestJS 10.4.x, TypeORM 0.3.x, BullMQ 5.34.x, ioredis 5.4.x, pg 8.13.x, JWT/passport, throttler e Swagger.
- Frontend: Next.js 14.2.x, React 18.3.x.
- Banco: 23 tabelas, uma migration TypeORM registrada e executada.
- Módulos API: auth, units, users, people, plans, teams, opportunities, subscriptions, billing, webhooks, analytics, sales, profile, audit, lifecycle e health.
- Entidades: users, units, memberships, refresh_tokens, billing_connections, people, plans, plan_prices, teams, team_members, opportunities, opportunity_members, billing_customers, checkout_sessions, subscriptions, subscription_members, invoices, payments, sales, webhook_events, lifecycle_events e audit_logs.
- Guards: JWT, acesso à unidade e permissões; rotas públicas de recebimento de webhook e rota interna de worker ficam fora dos guards globais.
- RBAC: permissões explícitas nos controllers; administrador de instalação tem acesso especial a unidades.
- Filas: `billing-webhooks`; API persiste inbox e enfileira; worker chama `POST /api/internal/webhooks/:id/process` com token interno.

## 3. Comandos executados

| Comando | Exit code | Resultado |
|---|---:|---|
| `node --version` / `npm --version` | 0 | Node 24.3.0 / npm 11.4.2 |
| `docker --version` / `docker compose version` | 0 | Docker 29.2.0 / Compose 5.0.2 |
| `npm run typecheck` | 0 | API, worker e web passaram |
| `npm run lint` | 0 | Passou; 11 warnings API e 5 warnings web |
| `npm run test` | 0 | 4 suítes, 10 testes passaram |
| `npm run build` | 0 | API, worker e Next.js passaram; warnings do lint web permanecem |
| `GET http://127.0.0.1:4003/api/health` | 200 | JSON, API saudável |
| `GET http://127.0.0.1:4003/health` | 404 | Confirma prefixo global `/api` |
| `GET http://127.0.0.1:4002` | 200 | Frontend HTML |
| `GET https://dnacare.wizerdigital.tec.br/api/health` | 200 | JSON público |
| POST webhook público inválido, local e público | 401 | JSON; não retornou Next.js nem Cloudflare 502 |
| Consultas de metadados PostgreSQL/Redis | 0 | Conectados; sem dados pessoais exibidos |
| Chamadas Asaas Sandbox GET customers/payments/webhooks | 0 | HTTP 200, read-only, respostas sanitizadas |
| `npm ci` / `npm install` | — | Não executado: dependências já instaladas; evitada mutação desnecessária de `node_modules`/lockfile |

## 4. Diagnóstico do erro 502

### Passos e evidências

O frontend chama `POST /billing/asaas/webhook/setup` relativo a `NEXT_PUBLIC_API_URL` (`apps/web/src/app/dashboard/configuracoes/asaas/page.tsx:103-104`, `apps/web/src/lib/api.ts:26`). A API recebe `POST /api/billing/asaas/webhook/setup` em `BillingController` (`apps/api/src/modules/billing/billing.controller.ts:2`), protegido por JWT, acesso à unidade e `BILLING_MANAGE`.

O serviço monta a URL `${API_URL}/api/webhooks/asaas/${unit.slug}` (`apps/api/src/modules/billing/billing.service.ts:151-167`) e usa `POST /webhooks` na criação ou `PUT /webhooks/:id` na atualização. Como o banco já tinha `external_webhook_id`, o caminho observado é o de atualização.

O proxy registrou:

- `POST /api/billing/asaas/webhook/setup -> http://host.docker.internal:4003/` com status 502 em 110 ms.
- Repetição com status 502 em 82 ms.
- O health público foi 200 pelo mesmo destino.
- O proxy não removeu `/api` e não encaminhou a rota para o frontend.

Em `apps/api/src/modules/billing/asaas.client.ts:55-64`, qualquer erro Axios — incluindo 400, 401, 403, 404, 409, 422, 429, 500, timeout e falha TLS — é convertido em `BadGatewayException`. O status original, headers, request ID e corpo estruturado do Asaas são descartados. Isso confirma a causa do status produzido pela API, mas impede identificar qual erro remoto causou cada 502 sem logs adicionais.

### Causa raiz e contribuintes

- Raiz confirmada: tratamento genérico do erro externo como 502, sem preservar diagnóstico e sem diferenciação de status.
- Contribuinte: o método de setup sempre gera um novo `authToken` e atualiza o webhook existente (`billing.service.ts:151-170`), tornando cada clique uma alteração remota, não uma operação idempotente.
- Contribuinte: não há uma etapa de `GET /webhooks/:id` antes do `PUT`, apesar de a documentação recomendar validar o webhook existente.
- Contribuinte: a API não possui endpoint de remoção de webhook; não há rollback operacional simples para um update incorreto.
- Contribuinte: o frontend exibe `await res.text()` diretamente em qualquer erro (`apps/web/src/lib/api.ts:36`), podendo mostrar HTML bruto e não uma mensagem estruturada.

### Correção recomendada

Preservar status e metadados do Axios em uma exceção própria sanitizada; registrar apenas código/status/request ID e URL sem credenciais; tratar 401/403/422/429/5xx separadamente; consultar o webhook antes do update; tornar o setup idempotente; e retornar JSON consistente ao frontend. Adicionar teste de regressão para erro Asaas e para proxy público.

## 5. Integração Asaas

| Funcionalidade | Estado | Evidência | Problema |
|---|---|---|---|
| Salvamento da chave | Completo | `BillingService.configure`, DTO e tela | Criptografia presente; sem teste E2E |
| Criptografia | Completo | AES-256-GCM em `encryption.service.ts` | Chave de fallback de desenvolvimento existe |
| Recuperação da credencial | Completo | `AsaasClient.connection` | Descriptografa somente em memória |
| Teste de conexão | Parcial | GET `/customers?limit=1` | Exceções externas viram 502 |
| Clientes | Parcial | Métodos create/update/get/list | Sem controller/fluxo completo auditado |
| Cobranças | Parcial | `createPayment`, listagem, PIX, boleto | Sem cobertura de contrato e erros |
| Assinaturas | Parcial | create/get/delete/list/payments | Sem teste real de ciclo financeiro |
| Checkout | Parcial | `createCheckout` e eventos | Fluxo de persistência/conciliação incompleto |
| PIX/boleto/cartão | Parcial | Campos e endpoints básicos | Sem testes Sandbox de criação; não executado por risco financeiro |
| Cancelamento/reembolso | Parcial | delete subscription; webhook refund | Não há fluxo completo de reembolso externo |
| Configuração de webhook | Incorreto/instável | POST/PUT `/webhooks`; logs 502 | Erros perdem status; update não é idempotente |
| Recebimento de webhook | Parcial | `POST /api/webhooks/asaas/:slug` | 401 controlado sem token; não testado com evento válido |
| Enfileiramento/worker | Parcial | BullMQ e worker implementados | Job controlado não foi criado; sem E2E |
| Retry/dead-letter | Parcial | 8 tentativas e backoff exponencial | Estado depende de endpoint interno; sem teste de reinício |
| Paginação | Parcial | limit/offset em alguns métodos | Cliente não expõe listagem de webhooks |
| Autenticação | Completo | header `access_token` | Confirmado em chamadas Sandbox 200 |

Comparação com a documentação oficial atual: URL Sandbox, header `access_token`, endpoints `/v3/webhooks`, `PUT /v3/webhooks/{id}`, `POST /v3/webhooks/{id}/removeBackoff`, `authToken` com 32–255 caracteres e eventos de Checkout estão alinhados. A implementação não cobre todos os eventos atuais de pagamentos e não preserva os códigos oficiais de erro. Referências: [autenticação](https://docs.asaas.com/docs/authentication), [criação de webhook](https://docs.asaas.com/reference/create-new-webhook), [atualização de webhook](https://docs.asaas.com/reference/update-existing-webhook), [eventos](https://docs.asaas.com/docs/webhooks-events), [eventos de pagamento](https://docs.asaas.com/docs/payment-events).

## 6. Resultados das chamadas Asaas Sandbox

Antes das chamadas foi confirmado no banco `environment=SANDBOX`, a URL `https://api-sandbox.asaas.com/v3` e uso do segredo somente em memória. Nenhum header secreto, body pessoal ou identificador de cliente foi registrado.

| Método | URL sanitizada | Status | Content-Type | Tempo | Estrutura |
|---|---|---:|---|---:|---|
| GET | `/customers?limit=1&offset=0` | 200 | `application/json` | 296 ms | `data`, `hasMore`, `limit`, `object`, `offset`, `totalCount`; 1 item retornado, conteúdo omitido |
| GET | `/payments?limit=1&offset=0` | 200 | `application/json` | 169 ms | mesma estrutura de paginação; 1 item retornado, conteúdo omitido |
| GET | `/webhooks?limit=100&offset=0` | 200 | `application/json` | 293 ms | mesma estrutura; 2 webhooks na conta, conteúdo omitido |

Headers de rate limit foram observados na resposta de pagamentos. Nenhuma chamada mutável foi feita.

## 7. Webhooks

- Configuração: URL esperada `https://dnacare.wizerdigital.tec.br/api/webhooks/asaas/{slug}`; montagem correta quando `API_URL` não contém `/api`.
- Recebimento: rota pública existe e responde 401 JSON para payload inválido sem token; não usa JWT.
- Persistência: salva `webhook_events` antes de enfileirar.
- Fila: `billing-webhooks`, job idempotente por `event.id`.
- Worker: chama API interna com `x-internal-worker-token`; configuração local aponta para `http://127.0.0.1:4003/api`.
- Idempotência: índice único `(unit_id, deduplication_key)` e job ID por evento.
- Retry: BullMQ com 8 tentativas, backoff exponencial e status `FAILED`/`DEAD_LETTER`.
- Falhas: `safeHeaders` mascara chaves esperadas, mas o payload completo é persistido; não há teste E2E nem transação única entre persistência e enqueue. `dispatch` ignora eventos desconhecidos em vez de tratá-los como erro operacional.

## 8. Banco de dados

- Schema presente: todas as 23 entidades listadas estão materializadas; migration registrada: 1; banco responde PostgreSQL 16.14.
- A conexão de billing está em Sandbox, habilitada e com webhook externo configurado; nenhum dado pessoal foi incluído neste relatório.
- UUID, `timestamptz` e `numeric` são usados adequadamente para IDs, datas e valores monetários.
- Isolamento: a maioria dos índices únicos inclui `unit_id`; serviços consultados usam `unitId` em entidades de negócio.
- Constraints: FKs e unicidades existem para memberships, billing, clientes externos, planos/preços, assinaturas, pagamentos e eventos.
- Cascades: a migration usa `ON DELETE CASCADE` em várias relações de unidade/usuário; isso pode apagar grandes conjuntos de dados ao remover uma unidade e requer confirmação/soft-delete antes de produção.
- Divergência detectada: a migration é um arquivo monolítico inicial; não há migration incremental para evolução. O relatório não executou migrations nem reversões.
- Possível risco de consistência: `payments.invoice_id` é nullable e a criação/atualização de invoice e payment no worker não está encapsulada numa transação explícita.
- Sem verificação destrutiva: não foram procurados órfãos por seleção de dados pessoais; FKs reduzem esse risco estruturalmente.

## 9. Segurança

| Severidade | Problema |
|---|---|
| Crítico | Nenhum confirmado por teste não destrutivo |
| Alto | Erros Asaas são convertidos indiscriminadamente em 502 e podem ocultar falhas de autenticação, autorização, validação e rate limit |
| Alto | Setup de webhook gera novo segredo e altera configuração remota a cada clique; não é idempotente nem possui rollback local |
| Médio | Rota interna depende de token estático em header; não há rotação, expiração ou binding de origem |
| Médio | `localStorage` armazena access/tenant token; exposição XSS compromete sessão |
| Médio | Warnings de hooks React podem produzir carregamento obsoleto ou efeitos inconsistentes |
| Baixo | Fallbacks de segredos/chave de desenvolvimento estão no código |
| Informativo | CORS/Helmet/throttler estão habilitados; não foi feito teste autenticado de IDOR entre duas unidades porque o banco contém uma unidade |

## 10. Problemas encontrados

### [ALTO] Diagnóstico externo destruído pelo cliente Asaas

- Evidência: `apps/api/src/modules/billing/asaas.client.ts:55-64`.
- Como reproduzir: provocar erro externo em qualquer método Asaas; a aplicação retorna `502` sem o status original.
- Causa raiz: `catch` captura todos os erros e lança uma única `BadGatewayException`.
- Impacto: frontend/proxy não distinguem credencial inválida, payload inválido, recurso inexistente, rate limit ou indisponibilidade.
- Arquivos afetados: `apps/api/src/modules/billing/asaas.client.ts`, `apps/web/src/lib/api.ts`.
- Correção recomendada: exceções tipadas e logging sanitizado de status/código/request ID.
- Teste de regressão: mockar 400/401/422/429/500/timeout e verificar status JSON preservado.

### [ALTO] Configuração de webhook não idempotente

- Evidência: `billing.service.ts:151-174` sempre gera segredo novo e faz POST/PUT.
- Como reproduzir: clicar repetidamente no botão com webhook já configurado.
- Causa raiz: falta de leitura/compare antes do update e falta de operação de remoção/rollback.
- Impacto: rotação inesperada do token, falha de entregas já configuradas e possível 502 repetido.
- Correção recomendada: consultar estado remoto, atualizar somente diferenças e persistir após confirmação.
- Teste de regressão: segunda execução com estado igual deve ser no-op ou atualização controlada.

### [MÉDIO] Cobertura insuficiente de eventos Asaas

- Evidência: lista fixa em `billing.service.ts:17-32`; documentação atual lista muitos eventos adicionais de pagamentos.
- Impacto: alterações de cobrança podem ser ignoradas ou marcadas como `IGNORED`.
- Correção recomendada: catálogo versionado e política explícita para eventos desconhecidos.

### [MÉDIO] Falta de testes de integração e E2E

- Evidência: somente 4 suítes unitárias, 10 testes; nenhum teste de controller, banco, Redis, worker, proxy ou Asaas.
- Impacto: o build verde não detecta o 502 observado em produção/local integrado.
- Correção recomendada: suíte com PostgreSQL/Redis efêmeros e testes HTTP local/público.

### [MÉDIO] Cascades amplos em entidades de unidade

- Evidência: migration inicial contém várias FKs `ON DELETE CASCADE`.
- Impacto: remoção acidental de unidade pode apagar histórico financeiro/auditoria.
- Correção recomendada: soft-delete, bloqueio administrativo e teste de impacto antes de permitir remoção.

## 11. Código incompleto ou simulado

- `AsaasClient.mock()` cobre clientes, checkout, assinaturas, pagamentos, PIX e webhooks quando `ASAAS_MOCK=true`; não é prova de compatibilidade real.
- Mocks retornam sucesso genérico para caminhos não reconhecidos (`asaas.client.ts:92`).
- O worker não possui teste/job controlado automatizado no repositório.
- Não há controller de listagem direta de webhooks Asaas; somente status pelo ID persistido.
- `dispatch` de webhook retorna `false` para tipos desconhecidos e grava `IGNORED`.
- Não foram encontrados TODOs de negócio relevantes no código-fonte; ocorrências em `node_modules` foram excluídas da análise.

## 12. Testes ausentes

- Integração API + PostgreSQL para cada módulo unit-scoped.
- Integração API + Redis + worker, incluindo retry, backoff, dead-letter e reinício.
- Contratos Asaas para autenticação, paginação, webhook create/update/list/get/remove e todos os códigos de erro.
- E2E frontend: salvar, recarregar billing connection, testar conexão e configurar webhook com JSON de erro.
- E2E público via Cloudflare/proxy, preservação de `/api`, método, body e headers.
- Testes de isolamento com duas unidades e papéis distintos.
- Testes de idempotência para eventos duplicados e concorrência.

## 13. Plano de correção recomendado

### P0 — Bloqueia funcionamento

- Preservar e registrar de forma sanitizada o erro real do Asaas.
- Corrigir setup/update para validar URL pública e estado remoto antes de atualizar.
- Adicionar teste integrado que reproduza o caminho público do webhook.

### P1 — Segurança ou perda de dados

- Revisar cascades de exclusão e adotar soft-delete/bloqueios.
- Validar isolamento com múltiplas unidades e remover fallbacks de segredos em produção.
- Definir rotação segura do token de webhook.

### P2 — Confiabilidade

- Transação/outbox para persistência + enqueue.
- Observabilidade de request ID, status externo, retries e dead-letter.
- Catálogo atualizado de eventos e tratamento explícito de eventos desconhecidos.

### P3 — Evolução e manutenção

- Migrations incrementais, cobertura E2E, correção dos warnings de hooks/lint e tipagem dos payloads Asaas.

## 14. Arquivos que provavelmente precisarão ser modificados

- `apps/api/src/modules/billing/asaas.client.ts` — erros, timeouts, status e observabilidade.
- `apps/api/src/modules/billing/billing.service.ts` — setup idempotente, validação e rollback.
- `apps/api/src/modules/billing/billing.controller.ts` — contrato HTTP de erros/operações.
- `apps/api/src/modules/webhooks/webhooks.service.ts` — transação/outbox, eventos e consistência.
- `apps/worker/src/main.ts` — métricas, retry e autenticação interna.
- `apps/web/src/lib/api.ts` — parsing seguro de respostas não JSON.
- `apps/web/src/app/dashboard/configuracoes/asaas/page.tsx` — feedback e estados de erro.
- `apps/api/database/migrations/` — somente novas migrations incrementais, após revisão.
- `apps/api/src/**/*.spec.ts` e testes E2E — cobertura de regressão.

## 15. Conclusão

- Integração Asaas: **parcial e instável**; autenticação e chamadas read-only Sandbox funcionam, mas tratamento de erros e setup de webhook não estão prontos.
- Webhook: **rota de recebimento funcional em princípio**, com 401 controlado e persistência/fila implementadas; configuração/reconfiguração apresenta 502 confirmado nos logs do proxy.
- Worker: **implementado, não comprovado ponta a ponta** nesta auditoria; não foi criado job artificial para evitar mutação operacional sem harness de teste.
- Produção: **não apta** para fluxo financeiro/webhooks até resolver P0/P1.
- Bloqueadores: causa externa específica do 502 não é observável por perda do erro original; setup não idempotente; ausência de testes integrados; risco de cascades e cobertura incompleta de eventos.


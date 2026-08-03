# Arquitetura

## Limite da instalação

Uma implantação do projeto pertence a uma única organização cliente. Essa organização pode possuir várias unidades internas. Não existe compartilhamento de banco ou aplicação entre organizações clientes independentes.

```text
Instalação do cliente
  ├─ Unidade Matriz ── Conta Asaas A
  ├─ Unidade Regional ─ Conta Asaas B
  └─ Unidade Parceira ─ Conta Asaas C
```

O termo técnico usado no código é `Unit`. Algumas rotas `/tenants` foram preservadas temporariamente para compatibilidade com o frontend reaproveitado, mas representam unidades internas.

## Componentes

### Web

Next.js 14 com App Router. Mantém as telas do sistema anterior, reorganizadas para os novos endpoints. O identificador de unidade selecionada é enviado em `x-unit-id`; `x-tenant-id` permanece aceito apenas por compatibilidade.

### API

NestJS e TypeORM. A API concentra autenticação, autorização, domínio transacional, auditoria, integração com providers financeiros e analytics.

### Worker

Consome a fila `billing-webhooks` no Redis. Cada job chama um endpoint interno autenticado da API para processar o evento dentro da mesma camada de domínio e transação.

### PostgreSQL

Fonte de verdade do domínio. O estado externo do Asaas é espelhado, mas nunca substitui o histórico local. Migrations são obrigatórias; `synchronize` permanece desabilitado.

### Redis

Fila durável de webhooks com tentativas exponenciais. O evento original também permanece no PostgreSQL, permitindo auditoria, reenfileiramento administrativo e recuperação após falhas do worker.

## Contexto de unidade

Uma rota de domínio exige:

1. JWT válido.
2. `x-unit-id` com UUID ou slug.
3. Unidade ativa.
4. Associação ativa do usuário, exceto administrador da instalação.
5. Permissão necessária para a operação.

Somente o administrador da instalação pode usar `all` ou uma lista de unidades. O cliente não pode selecionar uma unidade à qual não esteja associado.

## Domínio

### Pessoa

`people` guarda a identidade civil ou empresarial. Titular e dependente são papéis temporais dentro de uma assinatura, não cópias da pessoa.

### Plano e preço

`plans` descreve o produto. `plan_prices` versiona preço, periodicidade e forma de cobrança. Uma assinatura aponta para a versão contratada, preservando o histórico mesmo quando o plano muda.

### Oportunidade

`opportunities` registra o processo comercial. `opportunity_members` representa o titular e dependentes propostos antes da contratação.

### Assinatura

`subscriptions` representa o contrato. `subscription_members` preserva entrada, saída, papel e relacionamento de cada pessoa.

O estado é dividido em:

- `status`: contrato;
- `financial_status`: adimplência;
- `access_status`: acesso aos benefícios.

Essa separação impede que um erro temporário do gateway seja interpretado como cancelamento contratual.

### Financeiro

`billing_connections`, `billing_customers`, `checkout_sessions`, `invoices` e `payments` desacoplam o domínio do formato específico do Asaas.

### Histórico

`lifecycle_events` é append-only por regra de aplicação e registra ativações, atrasos, recuperações, cancelamentos, reativações e alterações de membros. `audit_logs` registra ações administrativas e seus atores.

## Fluxo de venda

```text
Pessoa + oportunidade
       ↓
Cliente financeiro no Asaas
       ↓
Checkout ou assinatura/cobrança
       ↓
Webhook persistido
       ↓
Fila Redis
       ↓
Worker processa de forma idempotente
       ↓
Assinatura + membros + venda + evento de ciclo de vida
```

## Idempotência

O webhook calcula uma chave de deduplicação a partir do identificador do evento ou do payload. A restrição única `(unit_id, deduplication_key)` evita processamento duplicado. A conversão da oportunidade também verifica assinaturas e vendas existentes antes de gravar novos registros.


## Recuperação de webhooks

A recepção e o processamento são estados distintos. Um evento persistido como `RECEIVED` pode ser reenfileirado mesmo quando o provider repete o mesmo payload. Falhas registram mensagem, número de tentativas e próxima execução. A administração da unidade pode consultar e solicitar novo processamento sem inserir um segundo evento de domínio.

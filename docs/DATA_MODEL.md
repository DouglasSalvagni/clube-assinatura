# Modelo de dados

## Plataforma

- `users`: identidade global da instalação.
- `units`: unidades internas da organização.
- `memberships`: associação e papel do usuário na unidade.
- `refresh_tokens`: sessões renováveis e revogáveis.

## Catálogo e CRM

- `people`: pessoa física ou jurídica centralizada.
- `plans`: produto oferecido pela unidade.
- `plan_prices`: versões de preço e cobrança.
- `teams`, `team_members`: organização comercial.
- `opportunities`: negociação.
- `opportunity_members`: pessoas propostas para o contrato.

## Operação recorrente

- `subscriptions`: contrato principal.
- `subscription_members`: titular e dependentes ao longo do tempo.
- `sales`: conversão comercial e comissão.

## Financeiro

- `billing_connections`: credencial Asaas por unidade.
- `billing_customers`: vínculo pessoa ↔ cliente no provider.
- `checkout_sessions`: checkout hospedado.
- `invoices`: cobrança/fatura normalizada.
- `payments`: eventos financeiros confirmados ou recebidos.

## Confiabilidade

- `webhook_events`: inbox idempotente do provider.
- `lifecycle_events`: histórico de negócio usado em churn e coortes.
- `audit_logs`: alterações administrativas.

# Relatório de validação — gestão de assinantes e pós-venda

Data: 18/08/2026

## Resultado

A implementação foi revisada e os cenários críticos do pós-venda receberam cobertura automatizada específica.

### Validações concluídas

- validação sintática TypeScript/TSX dos arquivos modificados: **aprovada**;
- suíte-alvo do pós-venda: **48 cenários aprovados / 0 falhas** em execução local por harness de compatibilidade, usando os corpos reais dos testes do projeto;
- criação do assinante em `PENDING_PAYMENT` antes do primeiro pagamento;
- ativação somente após pagamento confirmado/recebido;
- idempotência na conversão e em webhooks repetidos;
- preço histórico preservado em PF, PJ e reativação;
- inclusão/remoção de dependentes PF mensal;
- bloqueio de novo dependente PF anual fora da renovação;
- aumento/redução de vidas PJ e limite de beneficiários;
- aplicação de aditivo na recorrência existente;
- falha do Asaas sem gravação silenciosa da alteração financeira local;
- inadimplência, carência, suspensão e recuperação;
- consolidação de múltiplas cobranças vencidas;
- cancelamento idempotente;
- aprovação obrigatória para alteração contratual fora da política comercial.

### Validação oficial do monorepo

O comando `tsc -p apps/api/tsconfig.json --noEmit` não consegue iniciar a checagem completa neste ambiente porque o ZIP não contém `node_modules`. O erro é exclusivamente de resolução dos tipos `jest` e `node`. A tentativa de `npm ci` não concluiu porque o ambiente de execução não conseguiu resolver o registry npm.

Assim, os itens `npm run typecheck` e Jest oficial devem ser executados no ambiente de desenvolvimento/CI que possua acesso ao registry antes do deploy.

Comandos:

```bash
npm ci
npm run typecheck
npm run test:subscriber-post-sale
```

## Backfill histórico

Foi criado um backfill idempotente e seguro. Por padrão ele roda em **dry-run** e não usa a tabela global atual quando não encontra uma fonte histórica segura.

Dry-run:

```bash
npm run backfill:subscriber-contracts -- --unit=<UUID_DA_UNIDADE>
```

Aplicação:

```bash
npm run backfill:subscriber-contracts -- --unit=<UUID_DA_UNIDADE> --apply
```

Assinaturas sem snapshot histórico recuperável são listadas como `unresolvedSubscriptions` e não são reprecificadas automaticamente.

## Validações externas ainda necessárias antes da liberação geral

Estas validações dependem de banco/credenciais/ambiente Asaas Sandbox e não podem ser simuladas como concluídas no código-fonte:

- executar o dry-run e depois o backfill em uma cópia do banco real;
- executar PF mensal, PF anual e PJ no Asaas Sandbox;
- validar atualização contratual na assinatura real do Sandbox;
- validar inadimplência, consolidação e replay dos webhooks no Sandbox;
- executar um piloto em uma unidade antes da liberação geral.

O roteiro operacional está em `SANDBOX-RUNBOOK.md`.

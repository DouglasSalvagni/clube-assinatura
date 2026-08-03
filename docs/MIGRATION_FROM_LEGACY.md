# Migração do sistema legado

A nova base não deve receber o dump antigo diretamente. O modelo anterior duplicava dados entre oportunidades, titulares e dependentes e não preservava todo o ciclo de vida.

## Estratégia

1. Criar todas as unidades na nova instalação.
2. Configurar e validar a conta Asaas de cada unidade.
3. Importar usuários e mapear papéis para memberships.
4. Normalizar CPF/CNPJ, telefone, e-mail e endereço em `people`.
5. Importar planos e criar a primeira versão de preço.
6. Importar oportunidades abertas.
7. Converter titulares em assinaturas e membros primários.
8. Vincular dependentes a `subscription_members`.
9. Criar `billing_customers` e `external_subscription_id` com IDs existentes do Asaas.
10. Importar vendas e comissões.
11. Gerar eventos de ciclo de vida com nível de confiança explícito.
12. Reconciliar clientes, assinaturas e cobranças diretamente no Asaas.
13. Comparar contagens e valores por unidade antes do corte.

## Regras

- Nunca inventar uma data histórica não disponível.
- Registrar a origem `IMPORT` nos eventos derivados.
- Guardar o identificador legado em `metadata.legacyId`.
- Resolver duplicidades por CPF/CNPJ dentro da unidade antes de criar assinaturas.
- Não marcar uma assinatura como cancelada apenas porque a consulta ao Asaas falhou.
- Fazer a migração primeiro em uma cópia anonimizada.

## Backfill de churn

Dados históricos incompletos devem receber metadados como:

```json
{
  "confidence": "LOW",
  "derivedFrom": "legacy_current_status",
  "legacyId": "..."
}
```

Métricas oficiais devem permitir filtrar eventos importados de baixa confiança.

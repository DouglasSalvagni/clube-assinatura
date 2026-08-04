# Implantação — negociação comercial e checkout

## Pré-requisitos

1. Executar as migrações da API.
2. Configurar uma conexão Asaas ativa para cada sede.
3. Configurar e publicar:
   - um modelo contratual PF e/ou PJ;
   - uma versão de oferta vinculada ao modelo;
   - um funil padrão, quando o Kanban configurável for utilizado;
   - políticas comerciais para os perfis negociadores.
4. Configurar o webhook Asaas da sede e validar o segredo.

## Variáveis de ambiente

As variáveis abaixo já fazem parte da configuração geral do projeto e são utilizadas pelo novo fluxo:

```dotenv
APP_NAME=Gestão de Clubes
APP_URL=https://painel.exemplo.com
ASAAS_PRODUCTION_URL=https://api.asaas.com/v3
ASAAS_SANDBOX_URL=https://api-sandbox.asaas.com/v3
ASAAS_MOCK=false
ASAAS_WEBHOOK_ALERT_EMAIL=financeiro@exemplo.com
COMMERCIAL_V2_ENABLED_UNITS=matriz
ENCRYPTION_KEY=<64 caracteres hexadecimais>
```

`COMMERCIAL_V2_ENABLED_UNITS` aceita IDs ou slugs separados por vírgula. Use `*` para permitir todas as sedes no ambiente. Quando a variável não é informada, o novo fluxo permanece bloqueado.

A liberação exige duas condições: a sede deve estar permitida nessa variável e deve ser ativada em **Configurações → Comercial**. Esse duplo controle evita ativação acidental durante a implantação.

`APP_URL` deve apontar para a aplicação web pública. Ela é usada nas URLs de sucesso e cancelamento enviadas ao checkout hospedado do Asaas.

As chaves do Asaas e o segredo do webhook não devem ser colocados diretamente no arquivo de ambiente por sede. Eles são armazenados pela configuração da integração, com criptografia por `ENCRYPTION_KEY`.

## Ordem de publicação

1. Publicar a API e executar:
   ```bash
   npm run migration:run
   ```
2. Publicar o frontend.
3. Criar os modelos contratuais e publicar suas versões.
4. Criar as ofertas, associar a versão contratual e publicar a versão de preço.
5. Configurar políticas, times e responsáveis.
6. Testar em uma sede com Asaas Sandbox.
7. Validar os eventos `CHECKOUT_*`, `PAYMENT_*` e `SUBSCRIPTION_*`.
8. Ativar a oferta pública ou liberar o novo Kanban para os negociadores.

## Verificação funcional

- O negociador enxerga somente as oportunidades permitidas pelo seu escopo.
- Uma condição fora da política não gera checkout sem aprovação.
- O contrato não pode ser alterado após o aceite.
- O checkout Asaas é criado com o valor recalculado pelo backend.
- O webhook pago cria apenas uma venda e uma assinatura.
- Dependentes PF são transferidos para a assinatura.
- A quantidade de beneficiários PJ não ultrapassa as vidas contratadas.
- Eventos duplicados do Asaas não duplicam conversões.

## Rollback

As migrações novas possuem método `down`. Antes de revertê-las:

1. interromper a criação de novos pré-checkouts;
2. aguardar o processamento da fila de webhooks;
3. exportar contratos, aceites e snapshots;
4. confirmar que nenhuma assinatura ativa depende exclusivamente dos novos registros;
5. executar:
   ```bash
   npm run migration:revert
   ```

Não remover as tabelas do novo fluxo enquanto existirem contratos aceitos ou checkouts pendentes.

# Asaas por unidade

Cada registro de `units` pode possuir uma conexão própria com o Asaas. A restrição única `(unit_id, provider)` impede duas configurações concorrentes do mesmo provider na mesma unidade.

## Variáveis de ambiente

```env
ASAAS_PRODUCTION_URL=https://api.asaas.com/v3
ASAAS_SANDBOX_URL=https://api-sandbox.asaas.com/v3
ASAAS_MOCK=false
ASAAS_REQUEST_TIMEOUT_MS=12000
ASAAS_FORCE_IPV4=false
PUBLIC_API_URL=https://seu-dominio.com.br
ASAAS_WEBHOOK_ALERT_EMAIL=
```

- `PUBLIC_API_URL` precisa ser uma URL pública acessível pelo Asaas. Pode conter ou não o sufixo `/api`.
- Em ambiente real, `localhost`, `127.0.0.1` e `host.docker.internal` não são aceitos como destino do webhook.
- `ASAAS_WEBHOOK_ALERT_EMAIL` é apenas um fallback. O e-mail configurado na própria unidade tem prioridade.
- `ASAAS_FORCE_IPV4=true` deve ser usado somente quando o servidor possui problema conhecido de resolução/rota IPv6.

## Ambientes e chaves

- `SANDBOX`: `ASAAS_SANDBOX_URL`, normalmente com chave iniciada por `$aact_hmlg_`.
- `PRODUCTION`: `ASAAS_PRODUCTION_URL`, normalmente com chave iniciada por `$aact_prod_`.

A chave é armazenada com AES-256-GCM. A API devolve apenas uma indicação mascarada com os quatro últimos caracteres; a chave completa nunca retorna ao frontend.

Ao trocar o ambiente, é obrigatório informar a chave correspondente ao novo ambiente. Ao substituir a chave, mesmo no mesmo ambiente, a validação e o vínculo local do webhook são reiniciados; o setup seguinte procura e recupera o webhook da conta correta pela URL/nome antes de criar outro.

## Fluxo de configuração

1. Selecionar o ambiente.
2. Informar a chave e o e-mail de alertas.
3. Salvar a configuração.
4. Executar **Testar conexão**.
5. Executar **Configurar webhook**.
6. Confirmar que a conexão e o webhook aparecem como sincronizados.

O teste usa um endpoint de conta do Asaas e persiste a data da validação, o ambiente e uma identificação da conta retornada pelo provedor.

## Webhook

O endpoint por unidade segue o formato:

```text
{PUBLIC_API_URL}/api/webhooks/asaas/{unit.slug}
```

O setup é idempotente:

- consulta o webhook salvo antes de atualizar;
- procura um webhook existente pela URL ou nome quando o ID local foi perdido;
- reutiliza o token atual, sem rotacioná-lo a cada clique;
- atualiza somente quando há diferenças;
- inclui `apiVersion: 3`, e-mail, token de autenticação, tipo de envio e eventos;
- permite consultar status remoto, remover penalização e remover o webhook.

O token recebido do Asaas é validado pelo header `asaas-access-token` usando comparação segura do hash armazenado.

## Eventos configurados

- Pagamentos: criado, confirmado, recebido, vencido, estornado e excluído.
- Assinaturas: criada, atualizada, inativada e excluída.
- Checkout: criado, pago, expirado e cancelado.

A entrega de webhooks deve ser tratada como *at least once*. A aplicação persiste uma chave de deduplicação e processa os eventos em fila.

## Tratamento de erros

O cliente Asaas diferencia:

- credencial inválida ou ambiente incorreto;
- payload recusado;
- recurso externo inexistente;
- rate limit;
- timeout;
- indisponibilidade ou falha de rede.

Os logs incluem somente operação, status, código e request ID. A chave e o corpo sensível não são registrados. Respostas HTML de proxies ou Cloudflare não são exibidas integralmente na interface.

## Cobranças recorrentes

- Cartão de crédito e Pix podem utilizar checkout hospedado, conforme os meios aceitos pelo endpoint do Asaas Checkout.
- Boleto recorrente utiliza criação de assinatura/cobrança e retorna a URL da fatura, pois não é um `billingType` aceito pelo endpoint de Checkout hospedado atual.
- O resultado financeiro deve ser confirmado por webhook; criar checkout ou assinatura não significa pagamento confirmado.

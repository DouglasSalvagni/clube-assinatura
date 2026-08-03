# Asaas por unidade

Cada registro de `units` pode possuir exatamente uma conexão ativa com o provider Asaas. A restrição única `(unit_id, provider)` impede configurações concorrentes para a mesma unidade.

## Ambientes

- `SANDBOX`: `ASAAS_SANDBOX_URL`.
- `PRODUCTION`: `ASAAS_PRODUCTION_URL`.

## Eventos configurados

- Pagamentos: criado, confirmado, recebido, vencido, estornado e excluído.
- Assinaturas: criada, atualizada, inativada e excluída.
- Checkout: criado, pago, expirado e cancelado.

Eventos de assinatura são utilizados para reconciliação. A ativação comercial continua protegida por idempotência e pelos identificadores da oportunidade.

## Reembolso

`PAYMENT_REFUNDED` registra fatura e pagamento estornados, mas não cancela automaticamente o contrato. O cancelamento exige uma transição contratual explícita.

## Falhas externas

Falha de API, timeout ou recurso temporariamente não localizado não altera a assinatura para cancelada. O reconciliador contabiliza o erro e mantém o último estado conhecido até uma resposta confiável.


## Cobranças recorrentes

- Cartão de crédito utiliza checkout hospedado.
- Boleto cria a assinatura e retorna a primeira cobrança.
- PIX cria a assinatura, localiza a primeira cobrança pendente e retorna QR Code e código copia e cola.

O vínculo entre oportunidade, assinatura local e recursos externos é preservado por referências idempotentes.

## Processamento e reprocessamento

O endpoint público apenas valida, persiste e enfileira o evento. O worker executa a regra de negócio com tentativas exponenciais. Eventos com falha permanecem consultáveis em `GET /api/webhooks/events` e podem ser reenfileirados em `POST /api/webhooks/events/{id}/retry`, respeitando a unidade e as permissões do usuário.

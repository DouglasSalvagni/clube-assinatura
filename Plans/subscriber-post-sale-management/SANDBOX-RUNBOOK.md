# Runbook de homologação — assinantes e pós-venda

Use este roteiro em ambiente de Sandbox antes da produção.

## 1. Preparação

- [ ] Executar `npm ci`.
- [ ] Executar `npm run typecheck`.
- [ ] Executar `npm run test:subscriber-post-sale`.
- [ ] Configurar a unidade com credenciais do Asaas Sandbox.
- [ ] Confirmar `ASAAS_MOCK=false` no ambiente de homologação.
- [ ] Confirmar URL pública de webhook e segredo configurado.

## 2. Backfill

- [ ] Fazer backup do banco.
- [ ] Executar `npm run backfill:subscriber-contracts -- --unit=<UUID>` sem `--apply`.
- [ ] Revisar `unresolvedSubscriptions`.
- [ ] Corrigir manualmente assinaturas sem evidência histórica segura, se houver.
- [ ] Executar novamente o dry-run até o resultado esperado.
- [ ] Executar com `--apply`.
- [ ] Reexecutar o dry-run e confirmar ausência de mudanças inesperadas.

## 3. PF mensal

- [ ] Gerar contrato/checkout e confirmar criação local em `PENDING_PAYMENT`.
- [ ] Confirmar primeiro pagamento e verificar `ACTIVE`.
- [ ] Criar alteração contratual adicionando dependente.
- [ ] Aceitar alteração e conferir novo valor recorrente no Asaas.
- [ ] Remover dependente por alteração contratual e conferir novo valor.
- [ ] Confirmar que o cálculo usa o preço histórico do contrato.

## 4. PF anual

- [ ] Contratar plano anual.
- [ ] Confirmar bloqueio de inclusão direta de novo dependente durante a vigência.
- [ ] Confirmar inclusão somente pelo fluxo de renovação.
- [ ] Editar dados cadastrais de dependente existente e confirmar que o preço não muda.

## 5. PJ

- [ ] Contratar quantidade inicial de vidas.
- [ ] Cadastrar beneficiários até o limite.
- [ ] Confirmar bloqueio acima das vidas contratadas.
- [ ] Aumentar vidas via alteração contratual e conferir valor no Asaas.
- [ ] Reduzir vidas e confirmar bloqueio quando ficar abaixo dos beneficiários ativos.

## 6. Aprovação comercial

- [ ] Criar alteração dentro da política e confirmar fluxo normal.
- [ ] Criar alteração fora da política e confirmar criação obrigatória da aprovação.
- [ ] Aprovar e emitir a alteração.
- [ ] Alterar o contrato-base e confirmar que uma aprovação antiga não pode autorizar a nova versão.

## 7. Inadimplência e quitação

- [ ] Gerar cobrança e simular `PAYMENT_OVERDUE`.
- [ ] Confirmar `PAST_DUE` durante a carência.
- [ ] Expirar a carência e confirmar `SUSPENDED`.
- [ ] Regularizar e confirmar recuperação para `ACTIVE` somente após pagamento.
- [ ] Criar múltiplas cobranças vencidas.
- [ ] Executar “Quitar Débitos”.
- [ ] Confirmar que não permanecem cobranças substituídas exigíveis em paralelo.
- [ ] Confirmar que a regularização não ativa antes do pagamento efetivo.

## 8. Idempotência e replay

- [ ] Reenviar o mesmo webhook e confirmar ausência de duplicação.
- [ ] Reenviar evento já processado e confirmar que ele é ignorado.
- [ ] Enviar evento vencido atrasado depois de pagamento confirmado e confirmar que não ocorre regressão de estado.

## 9. Piloto

- [ ] Ativar o fluxo para uma unidade piloto.
- [ ] Acompanhar criação, pagamento, alteração contratual, vencimento e cancelamento.
- [ ] Revisar auditoria e logs.
- [ ] Liberar para as demais unidades somente após homologação do piloto.

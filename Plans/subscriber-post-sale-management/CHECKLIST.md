# Checklist — gestão de assinantes e pós-venda

> Atualizado em 18/08/2026. `[x]` indica implementação/revisão concluída e validada no nível disponível neste ambiente. Itens que dependem de banco real, instalação do monorepo, Asaas Sandbox ou piloto permanecem abertos e estão documentados em `TEST_REPORT.md` e `SANDBOX-RUNBOOK.md`.

## 1. Diagnóstico e fundação

- [x] Mapear entidades, serviços, controllers e telas atuais de assinantes, vendas, contratos e cobranças.
- [x] Mapear todos os webhooks Asaas que alteram assinatura, cobrança ou acesso.
- [x] Confirmar quais estados atuais podem ser reutilizados e quais precisam ser adicionados.
- [x] Definir formalmente as transições `PENDING_PAYMENT → ACTIVE → PAST_DUE → SUSPENDED → CANCELED`.
- [x] Definir regra e duração configurável da carência de inadimplência.
- [x] Garantir auditoria em todas as transições de estado.

## 2. Conversão em assinante

- [x] Criar/persistir assinante após contrato aceito e contratação criada no Asaas.
- [x] Iniciar nova assinatura em `PENDING_PAYMENT` quando ainda não houver primeiro pagamento confirmado.
- [x] Vincular oportunidade, negociação, contrato, venda, assinatura e IDs do Asaas.
- [x] Preservar oportunidade como `WON/CONVERTED` sem excluí-la.
- [x] Garantir idempotência para não criar dois assinantes com webhooks repetidos.
- [x] Ativar assinatura em `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED`.

## 3. Snapshot financeiro histórico

- [x] Confirmar que o contrato/snapshot vigente contém preço-base, desconto, periodicidade, quantidade e valor final.
- [x] Definir contrato/snapshot vigente como fonte de verdade para recálculos pós-venda.
- [x] Remover qualquer recálculo pós-venda baseado automaticamente na tabela global atual.
- [x] Preservar versões anteriores após aditivo, renovação ou substituição.
- [x] Criar testes que alterem a tabela global e comprovem que contratos antigos não mudam de preço. **Validado pela suíte-alvo do pós-venda.**

## 4. Cadastro do assinante

- [x] Revisar campos editáveis de PF.
- [x] Revisar campos editáveis de PJ.
- [x] Exibir e editar responsável legal PJ.
- [x] Exibir e editar responsável financeiro PJ.
- [x] Sincronizar alterações cadastrais aplicáveis com o `customer` no Asaas.
- [x] Tratar falha de sincronização sem deixar CRM e Asaas silenciosamente inconsistentes.
- [x] Registrar auditoria das alterações cadastrais.

## 5. Pessoa física mensal

- [x] Permitir adicionar dependente.
- [x] Permitir editar dependente.
- [x] Permitir remover dependente.
- [x] Recalcular usando preço histórico do contrato vigente.
- [x] Atualizar valor recorrente da assinatura no Asaas quando houver impacto financeiro.
- [x] Validar limites contratuais de dependentes.
- [x] Registrar alteração contratual quando houver impacto no preço.
- [x] Testar inclusão e remoção sem alteração da tabela histórica.

## 6. Pessoa física anual

- [x] Bloquear inclusão simples de novos dependentes durante a vigência anual.
- [x] Exibir mensagem clara explicando a regra ao operador.
- [x] Definir se inclusão será permitida por aditivo com pró-rata ou apenas na renovação. **Decisão: somente renovação; sem pró-rata automático.**
- [x] Implementar a regra escolhida quando aprovada.
- [x] Garantir que edição cadastral de dependente existente não altere preço indevidamente.

## 7. Pessoa jurídica

- [x] Exibir separadamente `vidas contratadas` e `beneficiários cadastrados`.
- [x] Faturar pela quantidade de vidas contratadas.
- [x] Impedir beneficiários ativos acima do número de vidas contratadas.
- [x] Impedir redução de vidas abaixo do total de beneficiários ativos.
- [x] Permitir aumento/redução de vidas por alteração contratual.
- [x] Recalcular usando preço por vida e desconto históricos.
- [x] Atualizar assinatura recorrente no Asaas após vigência/aceite da alteração.
- [x] Registrar histórico de cada mudança de quantidade contratada.

## 8. Aditivo, renovação e substituição

- [x] Revisar implementação atual desses três tipos de alteração.
- [x] Impedir alteração direta de preço/desconto no cadastro comum do assinante.
- [x] Criar nova versão contratual para alteração financeira relevante.
- [x] Exigir aprovação comercial quando a nova condição fugir da política.
- [x] Exigir aceite quando a regra contratual determinar.
- [x] Tornar a nova versão vigente somente após conclusão do fluxo.
- [x] Atualizar a assinatura existente no Asaas com as novas condições.
- [x] Preservar contrato e condições anteriores para auditoria.
- [x] Garantir rollback lógico em falha de atualização do Asaas.

## 9. Inadimplência e suspensão

- [x] Processar `PAYMENT_OVERDUE` como `PAST_DUE`.
- [x] Implementar carência configurável.
- [x] Suspender após término da carência sem regularização.
- [x] Suspender acesso do titular e participantes conforme regra definida.
- [x] Restaurar `ACTIVE` automaticamente quando a pendência for regularizada.
- [x] Garantir idempotência em eventos vencido/pago repetidos ou fora de ordem.
- [x] Registrar motivo, data e origem de suspensão/reativação.

## 10. Quitar débitos

- [x] Revisar a implementação atual e remover risco de duplicação de dívida.
- [x] Listar cobranças vencidas elegíveis antes da operação.
- [x] Exibir total consolidado para confirmação.
- [x] Definir estratégia correta no Asaas para substituir/consolidar cobranças.
- [x] Garantir que cobranças substituídas não permaneçam exigíveis em paralelo.
- [x] Registrar vínculo entre cobranças originais e cobrança de regularização.
- [x] Reativar assinatura somente após confirmação efetiva de pagamento.
- [x] Criar testes para múltiplas cobranças vencidas. **Validado pela suíte-alvo do pós-venda.**
- [x] Manter desconto/parcelamento fora do fluxo inicial.

## 11. Cancelamento e reativação

- [x] Revisar cancelamento local e no Asaas.
- [x] Garantir que cancelamento seja idempotente.
- [x] Definir regras de reativação para assinatura cancelada versus suspensa.
- [x] Não permitir alteração manual arbitrária de status pelo formulário comum.
- [x] Criar ações explícitas e auditáveis: suspender, reativar e cancelar.

## 12. Tela do assinante

- [x] Criar/ajustar seção Resumo.
- [x] Criar/ajustar seção Cadastro.
- [x] Criar/ajustar seção Dependentes/Beneficiários.
- [x] Exibir vidas contratadas na PJ.
- [x] Criar/ajustar seção Contrato e alterações contratuais.
- [x] Criar/ajustar seção Cobranças.
- [x] Criar/ajustar seção Histórico/Auditoria.
- [x] Exibir status financeiro de forma clara.
- [x] Exibir próxima cobrança e valor recorrente vigente.
- [x] Não expor edição comum de IDs do Asaas.

## 13. Asaas e webhooks

- [x] Revisar criação/atualização de `customer`.
- [x] Revisar criação e vínculo de `subscription`.
- [x] Implementar atualização segura do valor recorrente.
- [x] Revisar cancelamento no provider.
- [x] Mapear todos os eventos `PAYMENT_*`, `SUBSCRIPTION_*` e `CHECKOUT_*` relevantes.
- [x] Garantir processamento idempotente.
- [x] Tratar eventos fora de ordem.
- [x] Implementar reconciliação quando estado local e Asaas divergirem.
- [x] Não registrar dados sensíveis desnecessários nos logs.

## 14. Migração e compatibilidade

- [x] Avaliar necessidade de migration para novos status/campos/snapshots. **Resultado: não necessária nesta etapa; metadados/snapshots existentes suportam a implementação.**
- [ ] Executar o backfill de dados históricos nas assinaturas existentes em banco real. **Script seguro/idempotente implementado; execução depende do banco de homologação/produção.**
- [x] Definir fallback seguro quando assinatura antiga não possuir snapshot completo.
- [x] Não alterar silenciosamente valores de assinaturas já existentes.
- [x] Criar plano de rollback de migration. **N/A nesta etapa: nenhuma migration nova foi criada.**

## 15. Testes automatizados

- [x] Testar criação `PENDING_PAYMENT` antes do primeiro pagamento.
- [x] Testar ativação no primeiro pagamento.
- [x] Testar webhook duplicado sem duplicar assinante/venda.
- [x] Testar PF mensal adicionando/removendo dependente.
- [x] Testar bloqueio/regra de PF anual.
- [x] Testar PJ aumentando e reduzindo vidas.
- [x] Testar limite de beneficiários PJ.
- [x] Testar alteração de tabela global sem afetar preço histórico.
- [x] Testar aditivo com atualização da recorrência.
- [x] Testar inadimplência, carência, suspensão e recuperação.
- [x] Testar quitação com múltiplas cobranças vencidas.
- [x] Testar cancelamento e reativação.
- [x] Testar falha/timeout do Asaas sem inconsistência silenciosa.

## 16. Validação em Sandbox e entrega

- [ ] Executar typecheck completo. **Bloqueado neste ambiente: `node_modules` não veio no ZIP e `npm ci` não concluiu.**
- [ ] Executar Jest oficial da suíte unitária/de integração. **A suíte-alvo teve 48/48 cenários aprovados por harness local; Jest oficial continua dependente de `npm ci`.**
- [ ] Validar fluxo completo PF mensal no Asaas Sandbox.
- [ ] Validar fluxo completo PF anual no Asaas Sandbox.
- [ ] Validar fluxo completo PJ no Asaas Sandbox.
- [ ] Validar alteração contratual refletindo na assinatura Asaas.
- [ ] Validar cobrança vencida, carência e recuperação.
- [ ] Validar “Quitar Débitos” sem duplicação.
- [ ] Validar replay de webhooks.
- [x] Documentar variáveis/configurações novas.
- [x] Produzir relatório de testes antes de ativar em produção. **Ver `TEST_REPORT.md`.**
- [ ] Ativar em unidade piloto antes de liberação geral.

## Critérios finais de aceite

- [x] Assinante nasce no momento correto e com vínculo completo ao contrato/Asaas.
- [x] Primeiro pagamento ativa sem duplicidade.
- [x] Preço histórico nunca é substituído silenciosamente pela tabela global atual.
- [x] PF e PJ respeitam regras próprias de dependentes/vidas.
- [x] Alterações financeiras passam por fluxo contratual versionado.
- [x] A atualização enviada ao Asaas usa exatamente a condição vigente aceita. **Homologação real permanece na seção 16.**
- [x] Inadimplência, suspensão e recuperação funcionam de forma determinística.
- [x] Quitar débitos não gera cobrança duplicada.
- [x] Cadastro, contrato, participantes, cobranças e histórico ficam centralizados no assinante.
- [x] Logs, auditoria e testes permitem rastrear as mudanças críticas do pós-venda.

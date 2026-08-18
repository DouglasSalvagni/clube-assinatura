# Checklist — gestão de assinantes e pós-venda

> Checklist inicial. Marcar cada item somente após implementação e validação correspondente.

## 1. Diagnóstico e fundação

- [ ] Mapear entidades, serviços, controllers e telas atuais de assinantes, vendas, contratos e cobranças.
- [ ] Mapear todos os webhooks Asaas que alteram assinatura, cobrança ou acesso.
- [ ] Confirmar quais estados atuais podem ser reutilizados e quais precisam ser adicionados.
- [ ] Definir formalmente as transições `PENDING_PAYMENT → ACTIVE → PAST_DUE → SUSPENDED → CANCELED`.
- [ ] Definir regra e duração configurável da carência de inadimplência.
- [ ] Garantir auditoria em todas as transições de estado.

## 2. Conversão em assinante

- [ ] Criar/persistir assinante após contrato aceito e contratação criada no Asaas.
- [ ] Iniciar nova assinatura em `PENDING_PAYMENT` quando ainda não houver primeiro pagamento confirmado.
- [ ] Vincular oportunidade, negociação, contrato, venda, assinatura e IDs do Asaas.
- [ ] Preservar oportunidade como `WON/CONVERTED` sem excluí-la.
- [ ] Garantir idempotência para não criar dois assinantes com webhooks repetidos.
- [ ] Ativar assinatura em `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED`.

## 3. Snapshot financeiro histórico

- [ ] Confirmar que o contrato/snapshot vigente contém preço-base, desconto, periodicidade, quantidade e valor final.
- [ ] Definir contrato/snapshot vigente como fonte de verdade para recálculos pós-venda.
- [ ] Remover qualquer recálculo pós-venda baseado automaticamente na tabela global atual.
- [ ] Preservar versões anteriores após aditivo, renovação ou substituição.
- [ ] Criar testes que alterem a tabela global e comprovem que contratos antigos não mudam de preço.

## 4. Cadastro do assinante

- [ ] Revisar campos editáveis de PF.
- [ ] Revisar campos editáveis de PJ.
- [ ] Exibir e editar responsável legal PJ.
- [ ] Exibir e editar responsável financeiro PJ.
- [ ] Sincronizar alterações cadastrais aplicáveis com o `customer` no Asaas.
- [ ] Tratar falha de sincronização sem deixar CRM e Asaas silenciosamente inconsistentes.
- [ ] Registrar auditoria das alterações cadastrais.

## 5. Pessoa física mensal

- [ ] Permitir adicionar dependente.
- [ ] Permitir editar dependente.
- [ ] Permitir remover dependente.
- [ ] Recalcular usando preço histórico do contrato vigente.
- [ ] Atualizar valor recorrente da assinatura no Asaas quando houver impacto financeiro.
- [ ] Validar limites contratuais de dependentes.
- [ ] Registrar alteração contratual quando houver impacto no preço.
- [ ] Testar inclusão e remoção sem alteração da tabela histórica.

## 6. Pessoa física anual

- [ ] Bloquear inclusão simples de novos dependentes durante a vigência anual.
- [ ] Exibir mensagem clara explicando a regra ao operador.
- [ ] Definir se inclusão será permitida por aditivo com pró-rata ou apenas na renovação.
- [ ] Implementar a regra escolhida quando aprovada.
- [ ] Garantir que edição cadastral de dependente existente não altere preço indevidamente.

## 7. Pessoa jurídica

- [ ] Exibir separadamente `vidas contratadas` e `beneficiários cadastrados`.
- [ ] Faturar pela quantidade de vidas contratadas.
- [ ] Impedir beneficiários ativos acima do número de vidas contratadas.
- [ ] Impedir redução de vidas abaixo do total de beneficiários ativos.
- [ ] Permitir aumento/redução de vidas por alteração contratual.
- [ ] Recalcular usando preço por vida e desconto históricos.
- [ ] Atualizar assinatura recorrente no Asaas após vigência/aceite da alteração.
- [ ] Registrar histórico de cada mudança de quantidade contratada.

## 8. Aditivo, renovação e substituição

- [ ] Revisar implementação atual desses três tipos de alteração.
- [ ] Impedir alteração direta de preço/desconto no cadastro comum do assinante.
- [ ] Criar nova versão contratual para alteração financeira relevante.
- [ ] Exigir aprovação comercial quando a nova condição fugir da política.
- [ ] Exigir aceite quando a regra contratual determinar.
- [ ] Tornar a nova versão vigente somente após conclusão do fluxo.
- [ ] Atualizar a assinatura existente no Asaas com as novas condições.
- [ ] Preservar contrato e condições anteriores para auditoria.
- [ ] Garantir rollback lógico em falha de atualização do Asaas.

## 9. Inadimplência e suspensão

- [ ] Processar `PAYMENT_OVERDUE` como `PAST_DUE`.
- [ ] Implementar carência configurável.
- [ ] Suspender após término da carência sem regularização.
- [ ] Suspender acesso do titular e participantes conforme regra definida.
- [ ] Restaurar `ACTIVE` automaticamente quando a pendência for regularizada.
- [ ] Garantir idempotência em eventos vencido/pago repetidos ou fora de ordem.
- [ ] Registrar motivo, data e origem de suspensão/reativação.

## 10. Quitar débitos

- [ ] Revisar a implementação atual e remover risco de duplicação de dívida.
- [ ] Listar cobranças vencidas elegíveis antes da operação.
- [ ] Exibir total consolidado para confirmação.
- [ ] Definir estratégia correta no Asaas para substituir/consolidar cobranças.
- [ ] Garantir que cobranças substituídas não permaneçam exigíveis em paralelo.
- [ ] Registrar vínculo entre cobranças originais e cobrança de regularização.
- [ ] Reativar assinatura somente após confirmação efetiva de pagamento.
- [ ] Criar testes para múltiplas cobranças vencidas.
- [ ] Manter desconto/parcelamento fora do fluxo inicial.

## 11. Cancelamento e reativação

- [ ] Revisar cancelamento local e no Asaas.
- [ ] Garantir que cancelamento seja idempotente.
- [ ] Definir regras de reativação para assinatura cancelada versus suspensa.
- [ ] Não permitir alteração manual arbitrária de status pelo formulário comum.
- [ ] Criar ações explícitas e auditáveis: suspender, reativar e cancelar.

## 12. Tela do assinante

- [ ] Criar/ajustar seção Resumo.
- [ ] Criar/ajustar seção Cadastro.
- [ ] Criar/ajustar seção Dependentes/Beneficiários.
- [ ] Exibir vidas contratadas na PJ.
- [ ] Criar/ajustar seção Contrato e alterações contratuais.
- [ ] Criar/ajustar seção Cobranças.
- [ ] Criar/ajustar seção Histórico/Auditoria.
- [ ] Exibir status financeiro de forma clara.
- [ ] Exibir próxima cobrança e valor recorrente vigente.
- [ ] Não expor edição comum de IDs do Asaas.

## 13. Asaas e webhooks

- [ ] Revisar criação/atualização de `customer`.
- [ ] Revisar criação e vínculo de `subscription`.
- [ ] Implementar atualização segura do valor recorrente.
- [ ] Revisar cancelamento no provider.
- [ ] Mapear todos os eventos `PAYMENT_*`, `SUBSCRIPTION_*` e `CHECKOUT_*` relevantes.
- [ ] Garantir processamento idempotente.
- [ ] Tratar eventos fora de ordem.
- [ ] Implementar reconciliação quando estado local e Asaas divergirem.
- [ ] Não registrar dados sensíveis desnecessários nos logs.

## 14. Migração e compatibilidade

- [ ] Avaliar necessidade de migration para novos status/campos/snapshots.
- [ ] Preencher dados históricos necessários para assinaturas existentes.
- [ ] Definir fallback seguro quando assinatura antiga não possuir snapshot completo.
- [ ] Não alterar silenciosamente valores de assinaturas já existentes.
- [ ] Criar plano de rollback de migration.

## 15. Testes automatizados

- [ ] Testar criação `PENDING_PAYMENT` antes do primeiro pagamento.
- [ ] Testar ativação no primeiro pagamento.
- [ ] Testar webhook duplicado sem duplicar assinante/venda.
- [ ] Testar PF mensal adicionando/removendo dependente.
- [ ] Testar bloqueio/regra de PF anual.
- [ ] Testar PJ aumentando e reduzindo vidas.
- [ ] Testar limite de beneficiários PJ.
- [ ] Testar alteração de tabela global sem afetar preço histórico.
- [ ] Testar aditivo com atualização da recorrência.
- [ ] Testar inadimplência, carência, suspensão e recuperação.
- [ ] Testar quitação com múltiplas cobranças vencidas.
- [ ] Testar cancelamento e reativação.
- [ ] Testar falha/timeout do Asaas sem inconsistência silenciosa.

## 16. Validação em Sandbox e entrega

- [ ] Executar typecheck completo.
- [ ] Executar testes unitários e de integração.
- [ ] Validar fluxo completo PF mensal no Asaas Sandbox.
- [ ] Validar fluxo completo PF anual no Asaas Sandbox.
- [ ] Validar fluxo completo PJ no Asaas Sandbox.
- [ ] Validar alteração contratual refletindo na assinatura Asaas.
- [ ] Validar cobrança vencida, carência e recuperação.
- [ ] Validar “Quitar Débitos” sem duplicação.
- [ ] Validar replay de webhooks.
- [ ] Documentar variáveis/configurações novas.
- [ ] Produzir relatório de testes antes de ativar em produção.
- [ ] Ativar em unidade piloto antes de liberação geral.

## Critérios finais de aceite

- [ ] Assinante nasce no momento correto e com vínculo completo ao contrato/Asaas.
- [ ] Primeiro pagamento ativa sem duplicidade.
- [ ] Preço histórico nunca é substituído silenciosamente pela tabela global atual.
- [ ] PF e PJ respeitam regras próprias de dependentes/vidas.
- [ ] Alterações financeiras passam por fluxo contratual versionado.
- [ ] Assinatura do Asaas reflete exatamente a condição vigente aceita.
- [ ] Inadimplência, suspensão e recuperação funcionam de forma determinística.
- [ ] Quitar débitos não gera cobrança duplicada.
- [ ] Cadastro, contrato, participantes, cobranças e histórico ficam centralizados no assinante.
- [ ] Logs, auditoria e testes permitem rastrear as mudanças críticas do pós-venda.

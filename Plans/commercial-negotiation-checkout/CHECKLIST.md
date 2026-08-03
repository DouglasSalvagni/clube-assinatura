# Checklist — negociação comercial, contratos e checkout

## Fundação

- [ ] Definir enums de tipo de cliente, estado comercial, aprovação, contrato e pré-checkout.
- [ ] Criar migrações sem alterar contratos ou assinaturas existentes.
- [ ] Estender `opportunities` com etapa, time, tipo de cliente, status comercial e snapshot.
- [ ] Criar ofertas comerciais e versões imutáveis.
- [ ] Criar pipelines e etapas por unidade.
- [ ] Criar políticas comerciais e atribuições por perfil/usuário.
- [ ] Criar aprovações e decisões.
- [ ] Criar contratos, snapshots e aceites.
- [ ] Criar sessões e participantes de pré-checkout.
- [ ] Vincular pré-checkout ao `checkout_sessions` do Asaas.

## Backend comercial

- [ ] Criar `CommercialModule`.
- [ ] Implementar cálculo PF por titular e dependentes.
- [ ] Implementar cálculo PJ por vidas, preço unitário e desconto.
- [ ] Versionar o schema usado em cada cálculo.
- [ ] Recalcular e validar valores no backend em toda alteração.
- [ ] Implementar resolução de políticas global, unidade, perfil e usuário.
- [ ] Bloquear condições não permitidas.
- [ ] Criar solicitação de aprovação para exceções.
- [ ] Impedir checkout enquanto houver aprovação pendente.
- [ ] Registrar histórico e auditoria das alterações comerciais.

## Permissões e visibilidade

- [ ] Criar permissões comerciais específicas.
- [ ] Remover a dependência de `billing.manage` para geração pelo negociador.
- [ ] Restringir negociador às oportunidades próprias.
- [ ] Permitir ao gerente consultar oportunidades dos seus times.
- [ ] Permitir ao administrador consultar toda a unidade.
- [ ] Preservar acesso global do superadministrador.
- [ ] Aplicar o escopo em listagem, detalhe, edição, movimentação e checkout.
- [ ] Testar tentativas de acesso cruzado entre unidades.

## Kanban e negociação interna

- [ ] Criar API paginada/agrupada para o Kanban.
- [ ] Implementar atribuição e transferência de responsável.
- [ ] Implementar vínculo da oportunidade com time.
- [ ] Implementar movimentação de etapa com validação de transição.
- [ ] Criar Kanban no painel.
- [ ] Criar filtros por responsável, time, tipo e status.
- [ ] Criar workspace de negociação PF.
- [ ] Criar workspace de negociação PJ.
- [ ] Exibir composição do preço e limites do usuário.
- [ ] Exibir e decidir solicitações de aprovação.
- [ ] Gerar, copiar, revogar e renovar link de pré-checkout.

## Contrato

- [ ] Criar modelos e versões de contrato por modalidade.
- [ ] Definir variáveis permitidas nos modelos.
- [ ] Gerar contrato preenchido a partir do snapshot aprovado.
- [ ] Calcular e armazenar hash do conteúdo.
- [ ] Registrar identidade, IP, user-agent e data do aceite.
- [ ] Tornar o contrato imutável após o aceite.
- [ ] Prever aditivo ou novo contrato para alterações posteriores.

## Pré-checkout de pessoa física

- [ ] Carregar somente condições previamente definidas.
- [ ] Permitir confirmação de dados pessoais e endereço.
- [ ] Integrar consulta de CEP com tratamento de falha.
- [ ] Permitir adicionar e remover dependentes.
- [ ] Validar CPF e limite de dependentes.
- [ ] Atualizar a simulação em tempo real.
- [ ] Revalidar o preço no backend antes do aceite.
- [ ] Mostrar somente formas de pagamento permitidas.
- [ ] Exibir o contrato preenchido.
- [ ] Exigir aceite antes de criar checkout Asaas.

## Pré-checkout de pessoa jurídica

- [ ] Confirmar dados da empresa.
- [ ] Coletar responsável legal e responsável financeiro.
- [ ] Exibir quantidade de vidas, preço unitário, desconto e valor final.
- [ ] Impedir edição das condições aprovadas.
- [ ] Exibir condições especiais e vencimento.
- [ ] Exigir aceite do contrato.
- [ ] Permitir geração do checkout somente após aprovação.
- [ ] Preparar o controle entre vidas contratadas e cadastradas.

## Checkout genérico

- [ ] Permitir publicar ofertas por unidade.
- [ ] Criar página pública de seleção da oferta.
- [ ] Permitir seleção de dependentes quando aplicável.
- [ ] Calcular valor em tempo real pelo mesmo motor de preços.
- [ ] Criar oportunidade automaticamente.
- [ ] Aplicar regra de atribuição a vendedor/time.
- [ ] Criar contrato e pré-checkout pelo fluxo comum.
- [ ] Registrar a origem da contratação.

## Asaas, webhook e conversão

- [ ] Criar checkout Asaas a partir do contrato aceito.
- [ ] Persistir referência entre Asaas, pré-checkout, contrato e oportunidade.
- [ ] Restringir formas de pagamento conforme a oferta aprovada.
- [ ] Tratar checkout criado, pendente, pago, expirado, cancelado e falho.
- [ ] Validar assinatura/autenticidade do webhook.
- [ ] Garantir idempotência no processamento.
- [ ] Converter oportunidade em venda e assinatura uma única vez.
- [ ] Transferir participantes para a assinatura.
- [ ] Preservar preço, contrato e política utilizados.
- [ ] Registrar eventos de lifecycle e auditoria.

## Administração

- [ ] Criar tela de ofertas e versões de preço.
- [ ] Criar tela de políticas e limites de negociação.
- [ ] Criar atribuição de política por perfil e usuário.
- [ ] Criar tela de pipelines e etapas.
- [ ] Criar tela de modelos contratuais.
- [ ] Criar consulta de aprovações e auditoria.
- [ ] Aplicar permissões de sede e superadmin nas telas.

## Qualidade e entrega

- [ ] Criar testes unitários de preços e políticas.
- [ ] Criar testes de integração de aprovação e checkout.
- [ ] Criar testes de isolamento multiunidade.
- [ ] Criar E2E para PF negociada.
- [ ] Criar E2E para PJ com aprovação.
- [ ] Criar E2E para checkout genérico.
- [ ] Testar expiração e revogação de links.
- [ ] Não registrar CPF, contrato integral ou tokens em logs.
- [ ] Adicionar métricas de conversão, falhas e tempo por etapa.
- [ ] Documentar variáveis de ambiente e configuração do Asaas.
- [ ] Ativar por feature flag em unidade piloto.
- [ ] Validar migração e plano de rollback.
- [ ] Remover o fluxo antigo somente após estabilização.

## Critério de conclusão

- [ ] Um negociador visualiza somente seus leads e consegue concluir negociações autorizadas.
- [ ] Exceções comerciais exigem e registram aprovação.
- [ ] PF recalcula dependentes sem permitir alteração do preço-base.
- [ ] PJ preserva quantidade, preço por vida, desconto e condições aprovadas.
- [ ] Todo checkout financeiro é criado no Asaas após o aceite.
- [ ] Todo contrato convertido possui snapshot JSONB, versão e evidência de aceite.
- [ ] Webhooks não geram vendas ou assinaturas duplicadas.
- [ ] Administradores gerenciam ofertas, limites, permissões e contratos pelo painel.

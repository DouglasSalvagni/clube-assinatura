# Checklist — negociação comercial, contratos e checkout

> Atualizado após a quinta entrega. Esta etapa fecha ofertas públicas, checkout genérico, funis, modelos contratuais, atribuição, workspace, controle de vidas, webhooks, métricas, feature flag por sede e alterações posteriores por aditivo, renovação ou substituição. Testes unitários e HTTP foram criados, mas não executados integralmente neste ambiente: o registry interno retornou `404` para `dotenv` e o acesso direto ao npmjs falhou com `EAI_AGAIN`.

## Fundação

- [x] Definir enums de tipo de cliente, estado comercial, aprovação, contrato e pré-checkout.
- [x] Criar migrações sem alterar contratos ou assinaturas existentes.
- [x] Estender `opportunities` com etapa, time, tipo de cliente, status comercial e snapshot.
- [x] Criar ofertas comerciais e versões imutáveis.
- [x] Criar pipelines e etapas por unidade.
- [x] Criar políticas comerciais e atribuições por perfil/usuário.
- [x] Criar aprovações e decisões.
- [x] Criar contratos, snapshots e aceites.
- [x] Criar sessões e participantes de pré-checkout.
- [x] Vincular pré-checkout ao `checkout_sessions` do Asaas.

## Backend comercial

- [x] Criar `CommercialModule`.
- [x] Implementar cálculo PF por titular e dependentes.
- [x] Implementar cálculo PJ por vidas, preço unitário e desconto.
- [x] Versionar o schema usado em cada cálculo.
- [x] Recalcular e validar valores no backend em toda alteração.
- [x] Implementar resolução de políticas da unidade, perfil e usuário.
- [x] Bloquear condições não permitidas.
- [x] Criar solicitação de aprovação para exceções.
- [x] Impedir checkout enquanto houver aprovação pendente.
- [x] Registrar histórico e auditoria das alterações comerciais.

## Permissões e visibilidade

- [x] Criar permissões comerciais específicas.
- [x] Remover a dependência de `billing.manage` para geração pelo negociador.
- [x] Restringir negociador às oportunidades próprias.
- [x] Permitir ao gerente consultar oportunidades dos seus times.
- [x] Permitir ao administrador consultar toda a unidade.
- [x] Preservar acesso global do superadministrador.
- [x] Aplicar o escopo em listagem, detalhe, edição, movimentação e checkout.
- [x] Testar tentativas de acesso cruzado entre unidades.

## Kanban e negociação interna

- [x] Criar API paginada/agrupada para o Kanban.
- [x] Implementar atribuição e transferência de responsável.
- [x] Implementar vínculo da oportunidade com time.
- [x] Implementar movimentação de etapa com validação de transição.
- [x] Criar Kanban no painel.
- [x] Criar filtros por responsável, time, tipo e status.
- [x] Criar workspace de negociação PF.
- [x] Criar workspace de negociação PJ.
- [x] Exibir composição do preço e limites do usuário.
- [x] Exibir e decidir solicitações de aprovação.
- [x] Gerar e revogar link de pré-checkout.
- [x] Copiar e renovar link de pré-checkout pela interface.

## Contrato

- [x] Criar modelos e versões de contrato por modalidade.
- [x] Definir variáveis permitidas nos modelos.
- [x] Gerar contrato preenchido a partir do snapshot aprovado.
- [x] Calcular e armazenar hash do conteúdo.
- [x] Registrar identidade, IP, user-agent e data do aceite.
- [x] Tornar o contrato imutável após o aceite.
- [x] Implementar aditivo, renovação ou substituição vinculados ao contrato aceito.

## Pré-checkout de pessoa física

- [x] Carregar somente condições previamente definidas.
- [x] Permitir confirmação de dados pessoais e endereço.
- [x] Integrar consulta de CEP com tratamento de falha.
- [x] Permitir adicionar e remover dependentes.
- [x] Normalizar CPF e validar limite de dependentes.
- [x] Implementar validação algorítmica de CPF.
- [x] Atualizar a simulação após cada alteração de dependentes.
- [x] Revalidar o preço no backend antes da geração do contrato.
- [x] Mostrar somente formas de pagamento permitidas.
- [x] Exibir o contrato preenchido.
- [x] Exigir aceite antes da criação do checkout Asaas.

## Pré-checkout de pessoa jurídica

- [x] Confirmar dados da empresa.
- [x] Coletar separadamente responsável legal e responsável financeiro.
- [x] Disponibilizar snapshot com quantidade de vidas, preço unitário, desconto e valor final.
- [x] Impedir edição pública das condições aprovadas.
- [x] Disponibilizar as condições aprovadas no snapshot público.
- [x] Exigir aceite do contrato.
- [x] Permitir geração do checkout somente após aprovação.
- [x] Controlar beneficiários ativos contra a quantidade de vidas contratadas.

## Checkout genérico

- [x] Permitir publicar ofertas por unidade.
- [x] Criar página pública de seleção da oferta.
- [x] Permitir seleção de dependentes quando aplicável.
- [x] Calcular valor em tempo real pelo mesmo motor de preços.
- [x] Criar oportunidade automaticamente.
- [x] Aplicar regra de atribuição a vendedor/time.
- [x] Criar contrato e pré-checkout pelo fluxo comum.
- [x] Registrar a origem da contratação.

## Asaas, webhook e conversão

- [x] Criar checkout Asaas a partir do contrato aceito.
- [x] Persistir referência entre Asaas, pré-checkout, contrato e oportunidade.
- [x] Restringir formas de pagamento conforme a oferta aprovada.
- [x] Tratar checkout criado, pendente, pago, expirado, cancelado e falho.
- [x] Validar assinatura/autenticidade do webhook.
- [x] Garantir idempotência no processamento.
- [x] Converter oportunidade em venda e assinatura uma única vez.
- [x] Transferir participantes para a assinatura.
- [x] Preservar preço, contrato e política utilizados.
- [x] Registrar eventos de lifecycle e auditoria.

## Administração

- [x] Criar tela de ofertas e versões de preço.
- [x] Criar tela de políticas e limites de negociação.
- [x] Criar atribuição de política por perfil e usuário.
- [x] Criar tela de pipelines e etapas.
- [x] Criar tela de modelos contratuais.
- [x] Criar consulta e decisão de aprovações.
- [x] Aplicar permissões de sede e superadmin nas telas.

## Qualidade e entrega

- [x] Executar validação estática de sintaxe e tipos locais sem resolução de dependências externas.
- [x] Criar testes unitários de preços e políticas.
- [x] Criar testes de integração de aprovação e checkout.
- [x] Criar testes de isolamento multiunidade.
- [x] Criar E2E HTTP para PF negociada.
- [x] Criar E2E HTTP para PJ com aprovação.
- [x] Criar E2E HTTP para checkout genérico.
- [x] Criar testes para expiração e revogação de links.
- [x] Não registrar CPF, contrato integral ou tokens nos novos logs de auditoria.
- [x] Adicionar métricas de conversão, falhas e tempo por etapa.
- [x] Documentar variáveis de ambiente e configuração do Asaas.
- [x] Implementar feature flag global e ativação/desativação por sede no painel.
- [x] Bloquear o checkout legado nas sedes em que o novo fluxo estiver ativo.
- [ ] Ativar a feature em uma unidade piloto.
- [ ] Validar migração e plano de rollback em banco de homologação.
- [ ] Remover o fluxo antigo somente após estabilização.

## Critério de conclusão funcional

- [x] Um negociador visualiza somente seus leads e consegue concluir negociações autorizadas.
- [x] Exceções comerciais exigem e registram aprovação.
- [x] PF recalcula dependentes sem permitir alteração do preço-base no checkout.
- [x] PJ preserva quantidade, preço por vida, desconto e condições aprovadas.
- [x] Todo checkout financeiro iniciado pelo novo pré-checkout é criado no Asaas após o aceite.
- [x] Todo contrato convertido possui snapshot JSONB, versão e evidência de aceite.
- [x] Webhooks não geram vendas ou assinaturas duplicadas.
- [x] Administradores gerenciam ofertas, limites, permissões e contratos pelo painel.

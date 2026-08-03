# Planejamento técnico — negociação comercial, contratos e checkout

## 1. Objetivo

Implementar um fluxo comercial multiunidade que cubra:

- Kanban de oportunidades com visibilidade por responsável, time, unidade ou instalação.
- Negociação de pessoa física e pessoa jurídica com regras administráveis.
- Limites comerciais e aprovações configuráveis por sede, perfil e usuário.
- Contrato imutável com snapshot JSONB de todas as condições aprovadas.
- Pré-checkout público para cadastro, dependentes/beneficiários, cálculo e aceite.
- Checkout hospedado do Asaas como etapa final de pagamento para PF e PJ.
- Checkout genérico iniciado por oferta pública, sem oportunidade prévia.

A implementação deve aproveitar os módulos atuais de `opportunities`, `plans`, `teams`, `billing`, `webhooks`, `subscriptions`, `audit` e `lifecycle`, evitando duplicar responsabilidades.

---

## 2. Decisões arquiteturais

1. **O sistema é a fonte das condições comerciais.** O Asaas recebe somente condições já validadas e aprovadas.
2. **Pré-checkout e checkout financeiro são sessões diferentes.**
   - Pré-checkout próprio: dados, participantes, preço, contrato e aceite.
   - Checkout Asaas: pagamento e recorrência.
3. **Todo cálculo é refeito no backend.** O frontend apresenta simulações, mas nunca determina o valor final.
4. **JSONB guarda o snapshot completo**, porém campos operacionais e pesquisáveis continuam normalizados.
5. **Preço, política e contrato são versionados.** Alterações administrativas não modificam negociações ou contratos antigos.
6. **Contrato aceito é imutável.** Alterações posteriores geram aditivo, renovação ou novo contrato.
7. **Escopo de acesso é aplicado no backend**, não apenas escondido na interface.
8. **Webhooks devem ser idempotentes.** Uma oportunidade não pode gerar duas vendas ou assinaturas.

---

## 3. Modelo de dados

### 3.1 Evolução de oportunidades

Estender `opportunities` com:

- `customer_type`: `PERSON` ou `COMPANY`;
- `pipeline_stage_id`;
- `team_id`;
- `owner_user_id`;
- `commercial_status`: rascunho, negociação, aprovação, aprovada, checkout enviado, convertida, perdida;
- `offer_version_id`;
- `negotiation_snapshot` JSONB;
- `pricing_schema_version`;
- `approved_at` e `approved_by`;
- `checkout_expires_at`.

Manter normalizados para filtros e relatórios:

- valor-base;
- desconto;
- valor final;
- periodicidade;
- quantidade de vidas/dependentes;
- preço unitário;
- forma de pagamento principal.

### 3.2 Configuração comercial

Criar entidades para:

- `commercial_offers`: produto/modalidade por unidade;
- `commercial_offer_versions`: preços e regras imutáveis por vigência;
- `negotiation_policies`: limites de negociação;
- `negotiation_policy_assignments`: aplicação por unidade, perfil ou usuário;
- `approval_requests` e `approval_decisions`;
- `pipelines` e `pipeline_stages`;
- `contract_templates` e `contract_template_versions`.

A versão de oferta deve definir, conforme PF ou PJ:

- periodicidades disponíveis;
- formas de pagamento;
- valores de titular, dependente ou vida;
- limites de participantes;
- vencimentos permitidos;
- regras para boleto, Pix e cartão;
- schema da negociação;
- modelo contratual aplicável.

### 3.3 Contrato e checkout

Criar:

- `contracts`: identificação, estado, versão e vínculos;
- `contract_snapshots`: JSONB imutável com partes, preços, aprovações, participantes e condições;
- `contract_acceptances`: data, IP, user-agent, identidade do aceitante, hash e versão;
- `precheckout_sessions`: token público, validade, estado e progresso;
- `precheckout_participants`: titular, dependentes, empresa e responsáveis;
- vínculo entre `precheckout_sessions` e o `checkout_sessions` atual do Asaas.

O token público deve ser opaco, armazenado apenas por hash, revogável e com expiração.

---

## 4. Motor de precificação e negociação

Criar um módulo `commercial` no backend com serviços separados:

- `PricingService`: cálculo determinístico.
- `PolicyResolverService`: resolve limites globais, da sede, do perfil e do usuário.
- `NegotiationService`: valida alterações e registra o snapshot corrente.
- `ApprovalService`: cria e decide exceções.
- `ContractService`: gera e congela o contrato.
- `PrecheckoutService`: coordena a sessão pública.
- `AsaasCheckoutService`: cria o checkout financeiro a partir do contrato aceito.

### Pessoa física

A oferta define previamente:

- valor do titular;
- valor por dependente;
- periodicidade fixa;
- máximo de dependentes;
- formas de pagamento autorizáveis.

O cliente pode alterar somente seus dados e a quantidade de dependentes. O backend recalcula:

`valor final = titular + dependentes × valor por dependente + adicionais aprovados`

O cliente não altera preço-base, periodicidade ou desconto.

### Pessoa jurídica

A negociação pode conter:

- quantidade contratada de vidas;
- preço-base por vida;
- desconto;
- valor final;
- vencimento;
- periodicidade;
- formas de pagamento;
- condições especiais.

Cada alteração passa pelo `PolicyResolverService`. Exceções colocam a negociação em `PENDING_APPROVAL` e impedem a geração do checkout até decisão favorável.

---

## 5. Permissões e escopo comercial

Não usar `billing.manage` para autorizar o vendedor a gerar checkout. Criar permissões específicas:

- `opportunities.read.own`;
- `opportunities.read.team`;
- `opportunities.read.unit`;
- `opportunities.assign`;
- `negotiations.edit`;
- `negotiations.request_approval`;
- `negotiations.approve`;
- `checkout.generate`;
- `commercial_offers.manage`;
- `negotiation_policies.manage`;
- `contract_templates.manage`.

Regras de visibilidade:

- negociador: somente oportunidades atribuídas a ele;
- gerente: oportunidades dos times administrados;
- administrador da sede: toda a unidade;
- superadministrador: todas as unidades.

Os limites comerciais devem ser configuráveis no painel por sede, perfil e usuário. A resolução deve registrar qual regra autorizou ou bloqueou cada condição.

---

## 6. APIs previstas

### Administração

- CRUD e publicação de ofertas/versionamentos.
- CRUD de políticas e atribuições.
- CRUD de pipelines e etapas.
- CRUD e publicação de modelos contratuais.
- Simulação de política para usuário e condição comercial.

### Oportunidades e Kanban

- listar quadro com escopo de acesso;
- criar, atribuir e transferir oportunidade;
- mover etapa;
- configurar negociação PF/PJ;
- recalcular proposta;
- enviar para aprovação;
- aprovar ou rejeitar exceções;
- gerar/revogar link de pré-checkout;
- consultar histórico de alterações.

### API pública de pré-checkout

- carregar sessão por token;
- confirmar dados e consultar CEP;
- adicionar/remover dependentes;
- recalcular preço;
- carregar contrato preenchido;
- registrar aceite;
- criar checkout Asaas;
- consultar o estado da contratação.

### Checkout genérico

- listar ofertas públicas válidas;
- iniciar pré-checkout por oferta;
- criar oportunidade e atribuição automática;
- seguir o mesmo fluxo de contrato, Asaas, webhook e conversão.

---

## 7. Interfaces

### Painel interno

1. **Kanban de oportunidades**
   - colunas por etapa;
   - filtros por responsável, time, tipo e status;
   - drag-and-drop validado pelo backend;
   - indicadores por coluna.

2. **Workspace da negociação**
   - dados do cliente;
   - formulário específico para PF ou PJ;
   - composição do preço;
   - limites do negociador;
   - alertas de exceção;
   - aprovação;
   - contrato;
   - geração e cópia do link.

3. **Administração comercial**
   - ofertas e preços;
   - políticas e permissões;
   - pipelines;
   - modelos contratuais;
   - auditoria.

### Área pública

Criar páginas fora do layout autenticado para:

- pré-checkout de negociação;
- pré-checkout genérico;
- confirmação cadastral;
- dependentes/beneficiários;
- resumo financeiro;
- contrato e aceite;
- redirecionamento para o checkout Asaas;
- retorno e acompanhamento do pagamento.

---

## 8. Integração com Asaas e conversão

Fluxo obrigatório:

`negociação/oferta → pré-checkout → aceite → checkout Asaas → webhook → contrato efetivado → assinatura`

Regras:

- gerar checkout somente para negociação aprovada e contrato aceito;
- enviar ao Asaas valor, periodicidade e formas permitidas já validados;
- persistir identificadores externos e payload sanitizado;
- usar referência externa para correlacionar unidade, contrato e oportunidade;
- converter somente após evento financeiro válido;
- manter estados de pagamento pendente, pago, expirado, cancelado e falho;
- impedir reprocessamento duplicado por idempotência e bloqueio transacional.

---

## 9. Testes e segurança

Cobertura mínima:

- testes unitários do motor de preços e resolução de políticas;
- testes de escopo: próprio, time, unidade e instalação;
- integração de aprovação e geração de checkout;
- integração de webhook e conversão idempotente;
- E2E de PF negociada, PJ aprovada e checkout genérico;
- validação de expiração, revogação e reutilização de token;
- auditoria de mudanças de preço, aprovações e aceite;
- mascaramento de dados sensíveis em logs.

---

## 10. Sequência de implementação

1. Migrações, entidades e estados.
2. Motor de precificação, políticas e permissões.
3. APIs de ofertas, oportunidades, aprovações e Kanban.
4. Contratos, snapshots e aceite.
5. Pré-checkout público PF/PJ.
6. Adapter de checkout Asaas e webhooks.
7. Checkout genérico.
8. Interfaces administrativas.
9. Testes E2E, observabilidade e ativação gradual.

A entrega deve ser protegida por feature flag por unidade, permitindo validar o novo fluxo antes de substituir o checkout atual.

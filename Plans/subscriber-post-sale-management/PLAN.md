# Plano de implementação — gestão de assinantes e pós-venda

## 1. Objetivo

Completar o ciclo pós-venda do novo fluxo comercial, tratando o assinante como o contrato ativo/pós-aceite vinculado ao Asaas, preservando o histórico comercial e garantindo que alterações posteriores nunca recalcularem silenciosamente preços pela tabela global atual.

Fluxo-alvo:

`Oportunidade → Negociação → Contrato aceito → Assinante PENDING_PAYMENT → Pagamento → ACTIVE`

A oportunidade deve permanecer registrada como histórico comercial (`WON/CONVERTED`) e não deve ser apagada após a contratação.

---

## 2. Decisões de produto e arquitetura

1. **Criar o assinante após o aceite contratual e a criação da contratação no Asaas**, mesmo antes do primeiro pagamento.
2. Novo assinante inicia em `PENDING_PAYMENT`.
3. Pagamento confirmado/recebido ativa a assinatura (`ACTIVE`).
4. Inadimplência passa primeiro por `PAST_DUE`; após carência configurável, pode evoluir para `SUSPENDED`.
5. Oportunidade, negociação, contrato, venda e assinatura permanecem vinculados para rastreabilidade.
6. **Snapshot histórico do contrato é a fonte de verdade financeira do assinante.**
7. Alterações cadastrais podem ser feitas diretamente e sincronizadas com o `customer` do Asaas.
8. Alterações contratuais/financeiras devem ocorrer por **aditivo, renovação ou substituição**, nunca por edição livre do valor da assinatura.
9. Alteração de dependentes/vidas que impacte preço deve recalcular usando o preço-base e desconto históricos do contrato vigente ou as condições explicitamente aprovadas em um novo aditivo.
10. Não permitir edição livre de IDs do Asaas nem mudança manual arbitrária de status na operação normal.

---

## 3. Ciclo de vida do assinante

### Estados principais

- `PENDING_PAYMENT`: contrato aceito e contratação criada, aguardando primeiro pagamento.
- `ACTIVE`: assinatura adimplente e ativa.
- `PAST_DUE`: existe cobrança vencida dentro do período de carência.
- `SUSPENDED`: acesso suspenso após regra de inadimplência ou ação administrativa controlada.
- `CANCELED`: assinatura encerrada.

Avaliar compatibilidade com os enums atuais antes de criar novos valores. Se já houver estados equivalentes, reutilizá-los e migrar apenas o necessário.

### Transições

- contrato aceito + contratação Asaas criada → `PENDING_PAYMENT`;
- `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → `ACTIVE`;
- `PAYMENT_OVERDUE` → `PAST_DUE`;
- fim da carência sem regularização → `SUSPENDED`;
- pagamento que regulariza a pendência → `ACTIVE`;
- cancelamento → `CANCELED`.

Toda transição deve ser idempotente, auditável e vinculada ao evento que a causou.

---

## 4. Snapshot contratual e preço histórico

O assinante deve preservar de forma explícita, direta ou via contrato vigente:

- modalidade PF/PJ;
- periodicidade;
- preço-base do titular, dependente ou vida;
- quantidade contratada;
- desconto aplicado;
- valor recorrente final;
- regras de cobrança;
- versão da oferta;
- contrato/snapshot vigente;
- data de vigência.

### Regra obrigatória

Nenhuma alteração pós-venda pode recalcular a assinatura usando automaticamente a tabela global atual.

Ao alterar dependentes ou vidas:

1. carregar o contrato/snapshot vigente;
2. usar os valores históricos desse contrato;
3. calcular a nova recorrência;
4. quando a mudança for contratual, gerar aditivo/renovação/substituição;
5. após aceite, atualizar a recorrência no Asaas;
6. registrar nova versão vigente sem destruir a anterior.

---

## 5. Gestão de pessoa física

### PF mensal

Permitir:

- editar dados cadastrais;
- adicionar, editar e remover dependentes;
- recalcular a recorrência com base no preço histórico do contrato;
- atualizar a assinatura correspondente no Asaas quando houver impacto financeiro.

A inclusão/remoção deve respeitar limites contratuais e políticas vigentes.

### PF anual

Não permitir inclusão simples de novo dependente diretamente na assinatura vigente.

Mudanças que ampliem a cobertura devem ocorrer por fluxo contratual explícito, por exemplo:

- aditivo com cobrança proporcional, se essa regra for adotada; ou
- alteração válida apenas na renovação.

A implementação inicial pode bloquear a inclusão e deixar a cobrança proporcional como evolução posterior, desde que a regra esteja explícita na interface.

---

## 6. Gestão de pessoa jurídica

Separar claramente:

- **vidas contratadas**: quantidade faturada;
- **beneficiários cadastrados**: pessoas efetivamente registradas.

Regras:

- faturamento usa `vidas contratadas`, não a quantidade de beneficiários cadastrados;
- beneficiários ativos nunca podem exceder as vidas contratadas;
- redução de vidas não pode ficar abaixo dos beneficiários ativos;
- alteração de vidas deve usar preço por vida e desconto históricos do contrato vigente;
- após aceite da alteração contratual, atualizar o valor da assinatura no Asaas.

A tela do assinante PJ também deve permitir visualizar/editar os responsáveis legal e financeiro, observando quais dados devem ou não ser sincronizados com o Asaas.

---

## 7. Alterações cadastrais x contratuais

### Alterações cadastrais

Podem ser aplicadas diretamente:

- nome/razão social;
- e-mail;
- telefone;
- CPF/CNPJ quando juridicamente permitido pelo fluxo;
- endereço;
- responsável financeiro;
- demais dados sem impacto comercial.

Quando aplicável, sincronizar com o `customer` do Asaas e registrar auditoria.

### Alterações contratuais

Devem passar por aditivo/renovação/substituição:

- preço;
- desconto;
- periodicidade;
- quantidade de vidas contratadas;
- dependentes quando a alteração impactar financeiramente o contrato;
- demais condições comerciais.

O contrato vigente continua imutável. Uma nova versão passa a vigorar somente após o fluxo definido de aceite/aprovação.

---

## 8. Integração com Asaas

Revisar e completar o serviço de assinaturas para suportar:

- criação do vínculo local imediatamente após a contratação no Asaas;
- persistência segura de `customer`, `subscription`, cobranças e referências do checkout;
- atualização de cadastro do cliente;
- atualização do valor recorrente após alteração contratual aceita;
- cancelamento;
- suspensão/reativação conforme capacidade real da API e regra local;
- idempotência de webhooks;
- reconciliação de estados locais com estados do Asaas.

Nunca alterar o valor no Asaas antes da condição contratual correspondente estar válida no sistema.

---

## 9. Inadimplência

### Fluxo recomendado

1. cobrança vence;
2. assinatura entra em `PAST_DUE`;
3. inicia prazo de carência configurável por unidade/plano;
4. se regularizar, volta a `ACTIVE`;
5. se a carência terminar sem pagamento, vai para `SUSPENDED`;
6. titular e dependentes/beneficiários seguem a mesma regra de acesso.

### Quitar débitos

Refazer a ação atual para evitar duplicidade de dívida.

Antes de implementar consolidação, definir exatamente a estratégia aceita pelo Asaas. O fluxo deve garantir que cobranças antigas não permaneçam exigíveis junto com uma nova cobrança consolidada.

A primeira versão deve suportar:

- listar débitos que serão incluídos;
- mostrar valor total;
- confirmar a operação;
- criar/ajustar a cobrança de regularização;
- cancelar/remover corretamente as cobranças substituídas quando permitido;
- registrar vínculo entre dívida original e cobrança de regularização;
- reativar somente após confirmação do pagamento.

Desconto e parcelamento de inadimplência ficam fora do escopo inicial e devem ser tratados futuramente como uma funcionalidade própria de negociação financeira.

---

## 10. Tela do assinante

Organizar o cadastro em áreas claras:

1. **Resumo**
   - status;
   - plano/modalidade;
   - valor recorrente;
   - periodicidade;
   - próxima cobrança;
   - data de início;
   - situação financeira.

2. **Cadastro**
   - titular/empresa;
   - endereço e contato;
   - responsáveis PJ.

3. **Dependentes / Beneficiários**
   - PF: dependentes;
   - PJ: vidas contratadas + beneficiários cadastrados.

4. **Contrato**
   - contrato vigente;
   - snapshot financeiro;
   - aditivos/renovações/substituições;
   - histórico de vigência.

5. **Cobranças**
   - cobranças do Asaas;
   - vencidas;
   - pagas;
   - ação controlada de regularização.

6. **Histórico**
   - mudanças cadastrais;
   - mudanças contratuais;
   - mudanças de status;
   - eventos relevantes do Asaas.

---

## 11. O que não replicar do legado

Não implementar como comportamento padrão:

- apagar a oportunidade após conversão;
- recalcular contrato antigo usando a tabela global atual;
- editar livremente `ACTIVE/SUSPENDED/PENDING` sem ação de negócio correspondente;
- permitir edição comum de IDs internos do Asaas;
- alterar preço/desconto diretamente no cadastro do assinante;
- consolidar cobranças criando uma nova dívida sem tratar corretamente as anteriores;
- manter alterações cadastrais apenas no CRM quando o dado também pertence ao `customer` do Asaas.

---

## 12. Ordem recomendada de implementação

### Fase 1 — Fundação do pós-venda

- revisar modelo atual de `subscriptions`, `sales`, contratos e webhooks;
- fechar estados e transições;
- garantir criação do assinante em `PENDING_PAYMENT`;
- garantir vínculo completo oportunidade → contrato → venda → assinante → Asaas;
- garantir snapshot financeiro histórico.

### Fase 2 — Gestão cadastral e tela do assinante

- reorganizar a tela;
- completar responsáveis PJ;
- validar sincronização cadastral com Asaas;
- adicionar histórico/auditoria.

### Fase 3 — Dependentes e vidas

- PF mensal com recálculo histórico e atualização Asaas;
- regra de PF anual;
- PJ com vidas contratadas distintas dos beneficiários;
- atualização contratual segura.

### Fase 4 — Aditivos e alterações financeiras

- completar aditivo/renovação/substituição;
- aplicar nova versão somente após aceite;
- atualizar assinatura recorrente existente no Asaas;
- preservar versões anteriores.

### Fase 5 — Inadimplência

- `PAST_DUE` + carência + `SUSPENDED`;
- regularização automática por webhook;
- refazer “Quitar Débitos”;
- garantir que não haja duplicação de cobrança.

### Fase 6 — Testes e implantação

- testes unitários, integração e E2E;
- cenários Asaas Sandbox;
- idempotência/replay de webhooks;
- migração segura;
- ativação piloto por unidade.

---

## 13. Critérios de conclusão

A implementação estará funcionalmente concluída quando:

- um contrato aceito gerar um assinante `PENDING_PAYMENT` vinculado corretamente ao Asaas;
- o primeiro pagamento ativar o assinante sem duplicidade;
- inadimplência e recuperação alterarem o estado de forma previsível;
- alterações cadastrais sincronizarem com o Asaas quando necessário;
- PF e PJ tiverem regras próprias de dependentes/vidas;
- nenhuma mudança pós-venda usar silenciosamente preço global atual;
- toda alteração financeira relevante possuir versão contratual e histórico;
- a assinatura recorrente do Asaas refletir somente condições vigentes e aceitas;
- a tela do assinante concentrar cadastro, contrato, participantes, cobranças e histórico;
- o fluxo de quitação de débitos não puder gerar dívida duplicada.

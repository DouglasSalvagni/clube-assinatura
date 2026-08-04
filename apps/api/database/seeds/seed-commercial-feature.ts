import 'reflect-metadata';
import { In } from 'typeorm';
import AppDataSource from '../../src/database/data-source';
import {
  ApprovalRequest,
  ApprovalStatus,
  BillingCycle,
  BillingType,
  CommercialOffer,
  CommercialOfferStatus,
  CommercialOfferVersion,
  CommercialOfferVersionStatus,
  CommercialPipeline,
  CommercialPipelineStage,
  CommercialStatus,
  ContractTemplate,
  ContractTemplateStatus,
  ContractTemplateVersion,
  CustomerType,
  Membership,
  NegotiationPolicy,
  Opportunity,
  OpportunityStatus,
  Person,
  PersonKind,
  Team,
  TeamMember,
  Unit,
  UnitRole,
  User,
} from '../../src/database/entities';

async function run() {
  await AppDataSource.initialize();
  const unitSlug = process.env.SEED_COMMERCIAL_UNIT_SLUG ?? process.env.SEED_BRANCH_SLUG ?? 'filial-centro';
  const unitRepo = AppDataSource.getRepository(Unit);
  const unit = await unitRepo.findOne({ where: { slug: unitSlug, active: true } });
  if (!unit) throw new Error(`Sede '${unitSlug}' não encontrada. Execute primeiro npm run seed:test-users.`);
  const currentUnit = unit;
  currentUnit.settings = { ...(currentUnit.settings || {}), commercialNegotiationV2Enabled: true };
  await unitRepo.save(currentUnit);

  const membershipRepo = AppDataSource.getRepository(Membership);
  const memberships = await membershipRepo.find({ where: { unitId: currentUnit.id, active: true } });
  const users = await AppDataSource.getRepository(User).findBy({ id: In(memberships.map((item) => item.userId)) });
  const userForRole = (role: UnitRole) => {
    const membership = memberships.find((item) => item.role === role);
    const user = users.find((candidate) => candidate.id === membership?.userId);
    if (!user) throw new Error(`Usuário ${role} não encontrado na sede. Execute primeiro npm run seed:test-users.`);
    return user;
  };
  const manager = userForRole(UnitRole.MANAGER);
  const sales = userForRole(UnitRole.SALES);

  const teamRepo = AppDataSource.getRepository(Team);
  const team = await teamRepo.findOne({ where: { unitId: currentUnit.id, name: 'Equipe Comercial de Testes' } });
  if (!team) throw new Error('Equipe comercial de testes não encontrada. Execute primeiro npm run seed:test-users.');
  const currentTeam = team;
  const teamMemberRepo = AppDataSource.getRepository(TeamMember);
  for (const user of [manager, sales]) {
    if (!await teamMemberRepo.exists({ where: { unitId: currentUnit.id, teamId: currentTeam.id, userId: user.id } })) {
      await teamMemberRepo.save(teamMemberRepo.create({ unitId: currentUnit.id, teamId: currentTeam.id, userId: user.id }));
    }
  }

  const templateRepo = AppDataSource.getRepository(ContractTemplate);
  const templateVersionRepo = AppDataSource.getRepository(ContractTemplateVersion);
  async function ensureTemplate(code: string, name: string, customerType: CustomerType, content: string, variables: string[]) {
    let template = await templateRepo.findOne({ where: { unitId: currentUnit.id, code } });
    if (!template) template = await templateRepo.save(templateRepo.create({ unitId: currentUnit.id, code, name, customerType, active: true, metadata: { seeded: true } }));
    let version = await templateVersionRepo.findOne({ where: { unitId: currentUnit.id, templateId: template.id, version: 1 } });
    if (!version) version = templateVersionRepo.create({ unitId: currentUnit.id, templateId: template.id, version: 1, status: ContractTemplateStatus.PUBLISHED, content, variables, publishedAt: new Date() });
    else Object.assign(version, { status: ContractTemplateStatus.PUBLISHED, content, variables, publishedAt: version.publishedAt || new Date() });
    return templateVersionRepo.save(version);
  }

  const pfTemplate = await ensureTemplate(
    'TEST_PF',
    'Contrato PF de Testes',
    CustomerType.PERSON,
    'CONTRATO DE ADESÃO PF\nContratante: {{customer.name}} — CPF {{customer.taxId}}.\nValor: R$ {{negotiation.pricing.finalAmount}}.\nPeriodicidade: {{negotiation.cycle}}.\nDependentes: {{negotiation.participants.dependentCount}}.',
    ['customer.name', 'customer.taxId', 'negotiation.pricing.finalAmount', 'negotiation.cycle', 'negotiation.participants.dependentCount'],
  );
  const pjTemplate = await ensureTemplate(
    'TEST_PJ',
    'Contrato PJ de Testes',
    CustomerType.COMPANY,
    'CONTRATO EMPRESARIAL\nEmpresa: {{customer.name}} — CNPJ {{customer.taxId}}.\nVidas: {{negotiation.participants.contractedLives}}.\nValor unitário: R$ {{negotiation.pricing.unitPrice}}.\nValor final: R$ {{negotiation.pricing.finalAmount}}.',
    ['customer.name', 'customer.taxId', 'negotiation.participants.contractedLives', 'negotiation.pricing.unitPrice', 'negotiation.pricing.finalAmount'],
  );

  const pipelineRepo = AppDataSource.getRepository(CommercialPipeline);
  const stageRepo = AppDataSource.getRepository(CommercialPipelineStage);
  let pipeline = await pipelineRepo.findOne({ where: { unitId: currentUnit.id, name: 'Funil Comercial de Testes' } });
  if (!pipeline) pipeline = await pipelineRepo.save(pipelineRepo.create({ unitId: currentUnit.id, name: 'Funil Comercial de Testes', isDefault: true, active: true }));
  const stageSpecs: Array<[string, string, number, CommercialStatus]> = [
    ['LEAD', 'Lead recebido', 0, CommercialStatus.DRAFT],
    ['NEGOTIATION', 'Em negociação', 1, CommercialStatus.NEGOTIATION],
    ['APPROVAL', 'Aguardando aprovação', 2, CommercialStatus.PENDING_APPROVAL],
    ['APPROVED', 'Aprovada', 3, CommercialStatus.APPROVED],
    ['CHECKOUT', 'Checkout enviado', 4, CommercialStatus.CHECKOUT_SENT],
    ['CONVERTED', 'Convertida', 5, CommercialStatus.CONVERTED],
    ['LOST', 'Perdida', 6, CommercialStatus.LOST],
  ];
  const stages: Record<string, CommercialPipelineStage> = {};
  for (const [code, name, position, commercialStatus] of stageSpecs) {
    let stage = await stageRepo.findOne({ where: { unitId: currentUnit.id, pipelineId: pipeline.id, code } });
    if (!stage) stage = stageRepo.create({ unitId: currentUnit.id, pipelineId: pipeline.id, code, name, position, commercialStatus, active: true });
    else Object.assign(stage, { name, position, commercialStatus, active: true });
    stages[code] = await stageRepo.save(stage);
  }

  const policyRepo = AppDataSource.getRepository(NegotiationPolicy);
  async function ensurePolicy(name: string, targetRole: UnitRole | null, targetUserId: string | null, maxPercent: string, maxAmount: string | null, minPrice: string | null) {
    let policy = await policyRepo.findOne({ where: { unitId: currentUnit.id, name } });
    const values = {
      unitId: currentUnit.id,
      name,
      targetRole,
      targetUserId,
      maxDiscountPercent: maxPercent,
      maxDiscountAmount: maxAmount,
      minUnitPrice: minPrice,
      allowedBillingTypes: [BillingType.CREDIT_CARD, BillingType.BOLETO, BillingType.PIX],
      active: true,
      rules: { seeded: true, requireApprovalAboveLimit: true },
    };
    if (!policy) policy = policyRepo.create(values);
    else Object.assign(policy, values);
    return policyRepo.save(policy);
  }
  await ensurePolicy('Política padrão dos negociadores', UnitRole.SALES, null, '5.00', '500.00', '35.00');
  await ensurePolicy('Alçada do gerente comercial', UnitRole.MANAGER, null, '15.00', '2500.00', '30.00');
  await ensurePolicy('Exceção individual do negociador de testes', null, sales.id, '7.00', '700.00', '34.00');

  const offerRepo = AppDataSource.getRepository(CommercialOffer);
  const offerVersionRepo = AppDataSource.getRepository(CommercialOfferVersion);
  async function ensureOffer(input: {
    code: string; name: string; slug: string; customerType: CustomerType; templateVersionId: string;
    holderAmount?: string; dependentAmount?: string; unitPrice?: string; includedLives?: number; maxDependents?: number; minLives?: number; maxLives?: number;
  }) {
    let offer = await offerRepo.findOne({ where: { unitId: currentUnit.id, code: input.code } });
    const offerData = {
      unitId: currentUnit.id,
      code: input.code,
      name: input.name,
      description: 'Oferta publicada pelo seed para validação do novo fluxo comercial.',
      customerType: input.customerType,
      status: CommercialOfferStatus.PUBLISHED,
      publicSlug: input.slug,
      assignmentTeamId: currentTeam.id,
      assignmentUserId: sales.id,
      active: true,
      metadata: { seeded: true },
    };
    if (!offer) offer = offerRepo.create(offerData); else Object.assign(offer, offerData);
    offer = await offerRepo.save(offer);
    let version = await offerVersionRepo.findOne({ where: { unitId: currentUnit.id, offerId: offer.id, version: 1 } });
    const versionData = {
      unitId: currentUnit.id,
      offerId: offer.id,
      version: 1,
      status: CommercialOfferVersionStatus.PUBLISHED,
      billingCycle: BillingCycle.MONTHLY,
      holderAmount: input.holderAmount ?? null,
      dependentAmount: input.dependentAmount ?? null,
      unitPrice: input.unitPrice ?? null,
      includedLives: input.includedLives ?? 1,
      maxDependents: input.maxDependents ?? 0,
      minLives: input.minLives ?? 1,
      maxLives: input.maxLives ?? null,
      allowedBillingTypes: [BillingType.CREDIT_CARD, BillingType.BOLETO, BillingType.PIX],
      pricingRules: { seeded: true },
      contractTemplateVersionId: input.templateVersionId,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: null,
      publishedAt: new Date(),
      metadata: { seeded: true },
    };
    if (!version) version = offerVersionRepo.create(versionData); else Object.assign(version, versionData);
    version = await offerVersionRepo.save(version);
    return { offer, version };
  }

  const pfOffer = await ensureOffer({ code: 'TEST_PF_FAMILIAR', name: 'Plano Familiar de Testes', slug: `${currentUnit.slug}-pf-teste`, customerType: CustomerType.PERSON, templateVersionId: pfTemplate.id, holderAmount: '99.90', dependentAmount: '29.90', maxDependents: 4 });
  const pjOffer = await ensureOffer({ code: 'TEST_PJ_EMPRESARIAL', name: 'Plano Empresarial de Testes', slug: `${currentUnit.slug}-pj-teste`, customerType: CustomerType.COMPANY, templateVersionId: pjTemplate.id, unitPrice: '42.00', minLives: 5, maxLives: 500 });

  const personRepo = AppDataSource.getRepository(Person);
  async function ensurePerson(taxId: string, kind: PersonKind, name: string, email: string) {
    let person = await personRepo.findOne({ where: { unitId: currentUnit.id, taxId } });
    const data = { unitId: currentUnit.id, taxId, kind, name, email, phone: '51999990000', whatsapp: '51999990000', birthDate: null, address: 'Av. Testes', addressNumber: '100', complement: null, district: 'Centro', city: 'Porto Alegre', state: 'RS', postalCode: '90010000', metadata: { seeded: true } };
    if (!person) person = personRepo.create(data); else Object.assign(person, data);
    return personRepo.save(person);
  }
  const pfPerson = await ensurePerson('52998224725', PersonKind.PERSON, 'Cliente PF Seed', 'cliente.pf@dna.test');
  const pjPerson = await ensurePerson('19131243000197', PersonKind.COMPANY, 'Empresa Seed Ltda.', 'financeiro.empresa@dna.test');

  const opportunityRepo = AppDataSource.getRepository(Opportunity);
  async function ensureOpportunity(source: string, person: Person, customerType: CustomerType, offerVersion: CommercialOfferVersion, stage: CommercialPipelineStage, snapshot: Record<string, any>, status: CommercialStatus) {
    let opportunity = await opportunityRepo.findOne({ where: { unitId: currentUnit.id, acquisitionSource: source } });
    const values = {
      unitId: currentUnit.id,
      primaryPersonId: person.id,
      ownerUserId: sales.id,
      teamId: currentTeam.id,
      pipelineStageId: stage.id,
      offerVersionId: offerVersion.id,
      customerType,
      commercialStatus: status,
      negotiationSnapshot: snapshot,
      planPriceId: null,
      status: OpportunityStatus.OPEN,
      expectedValue: String(snapshot.pricing.finalAmount.toFixed(2)),
      billingCycle: BillingCycle.MONTHLY,
      billingType: BillingType.CREDIT_CARD,
      acquisitionSource: source,
      notes: 'Registro criado pelo seed comercial para testes.',
      lossReason: null,
      asaasCustomerId: null,
      wonAt: null,
      cancelledAt: null,
    };
    if (!opportunity) opportunity = opportunityRepo.create(values); else Object.assign(opportunity, values);
    return opportunityRepo.save(opportunity);
  }

  const pfSnapshot = {
    schemaVersion: 1, customerType: CustomerType.PERSON, cycle: BillingCycle.MONTHLY, billingType: BillingType.CREDIT_CARD,
    participants: { dependentCount: 2 },
    pricing: { baseAmount: 159.70, discountAmount: 0, finalAmount: 159.70, holderAmount: 99.90, dependentAmount: 29.90, unitPrice: null },
    discounts: [], allowedBillingTypes: [BillingType.CREDIT_CARD, BillingType.BOLETO], offerVersionId: pfOffer.version.id, seeded: true,
  };
  const pjApprovedSnapshot = {
    schemaVersion: 1, customerType: CustomerType.COMPANY, cycle: BillingCycle.MONTHLY, billingType: BillingType.BOLETO,
    participants: { contractedLives: 20 },
    pricing: { baseAmount: 840, discountAmount: 42, finalAmount: 798, unitPrice: 42, holderAmount: null, dependentAmount: null },
    discounts: [{ type: 'PERCENTAGE', value: 5, reason: 'Condição dentro da alçada' }], allowedBillingTypes: [BillingType.BOLETO, BillingType.PIX], offerVersionId: pjOffer.version.id, seeded: true,
  };
  const pjPendingSnapshot = {
    ...pjApprovedSnapshot,
    pricing: { ...pjApprovedSnapshot.pricing, discountAmount: 168, finalAmount: 672 },
    discounts: [{ type: 'PERCENTAGE', value: 20, reason: 'Condição acima da alçada para testar aprovação' }],
  };

  await ensureOpportunity('SEED_PF_NEGOTIATION', pfPerson, CustomerType.PERSON, pfOffer.version, stages.NEGOTIATION, pfSnapshot, CommercialStatus.NEGOTIATION);
  await ensureOpportunity('SEED_PJ_APPROVED', pjPerson, CustomerType.COMPANY, pjOffer.version, stages.APPROVED, pjApprovedSnapshot, CommercialStatus.APPROVED);
  const pendingOpportunity = await ensureOpportunity('SEED_PJ_PENDING_APPROVAL', pjPerson, CustomerType.COMPANY, pjOffer.version, stages.APPROVAL, pjPendingSnapshot, CommercialStatus.PENDING_APPROVAL);

  const approvalRepo = AppDataSource.getRepository(ApprovalRequest);
  let approval = await approvalRepo.findOne({ where: { unitId: currentUnit.id, opportunityId: pendingOpportunity.id, status: ApprovalStatus.PENDING } });
  if (!approval) {
    approval = approvalRepo.create({
      unitId: currentUnit.id,
      opportunityId: pendingOpportunity.id,
      requestedBy: sales.id,
      decidedBy: null,
      status: ApprovalStatus.PENDING,
      reason: 'Aprovar desconto de 20% para cenário de teste.',
      requestedConditions: pjPendingSnapshot,
      policyEvaluation: { allowed: false, violations: ['MAX_DISCOUNT_PERCENT'], seeded: true },
      decisionNotes: null,
      decidedAt: null,
    });
    await approvalRepo.save(approval);
  }

  console.log('\nSeed da feature comercial concluído.');
  console.table([
    { item: 'Sede', value: `${currentUnit.name} (${currentUnit.slug})` },
    { item: 'Negociador', value: sales.email },
    { item: 'Gerente/aprovador', value: manager.email },
    { item: 'Oferta pública PF', value: `/assinar/${pfOffer.offer.publicSlug}` },
    { item: 'Oferta pública PJ', value: `/assinar/${pjOffer.offer.publicSlug}` },
    { item: 'Oportunidade PF', value: 'SEED_PF_NEGOTIATION' },
    { item: 'Oportunidade PJ aprovada', value: 'SEED_PJ_APPROVED' },
    { item: 'Oportunidade PJ pendente', value: 'SEED_PJ_PENDING_APPROVAL' },
  ]);
  console.log('Observação: para habilitação efetiva, COMMERCIAL_V2_ENABLED_UNITS deve conter * ou o slug/id da sede.');
}

run()
  .then(async () => AppDataSource.destroy())
  .catch(async (error) => {
    console.error('Falha ao criar dados da feature comercial:', error);
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    process.exit(1);
  });

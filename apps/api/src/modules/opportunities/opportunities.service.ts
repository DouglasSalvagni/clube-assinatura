import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import {
  AccessStatus, BillingCustomer, BillingCycle, BillingProviderName, BillingType, CheckoutSession, CheckoutStatus,
  CommercialPipelineStage, CommercialStatus, Contract, ContractStatus, CustomerType, FinancialStatus, GlobalRole, LifecycleSource,
  MemberRole, Membership, Opportunity, OpportunityMember, OpportunityStatus, Person, PlanPrice, PrecheckoutSession,
  PrecheckoutStatus, Sale, Subscription, SubscriptionMember, SubscriptionMemberStatus, SubscriptionStatus,
  TeamMember, UnitRole, User,
} from '../../database/entities';
import { AsaasClient } from '../billing/asaas.client';
import { BillingService } from '../billing/billing.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { PeopleService } from '../people/people.service';
import { PricingService } from '../commercial/pricing.service';
import { CommercialFeatureService } from '../commercial/commercial-feature.service';
import { isValidCnpj, isValidCpf, normalizeTaxId } from '../../common/utils/tax-id';
import { AssignOpportunityDto, CreateOpportunityDependentDto, CreateOpportunityDto, MoveOpportunityStageDto, UpdateOpportunityDependentDto, UpdateOpportunityDto } from './opportunities.dto';

const REQUIRED = ['nome','cpfCnpj','email','telefone','endereco','enderecoNumero','bairro','cep','cidade','estado','valor','cycle','billingType'] as const;
@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity) private readonly repo:Repository<Opportunity>,
    @InjectRepository(OpportunityMember) private readonly memberRepo:Repository<OpportunityMember>,
    @InjectRepository(Person) private readonly personRepo:Repository<Person>,
    @InjectRepository(PlanPrice) private readonly priceRepo:Repository<PlanPrice>,
    @InjectRepository(BillingCustomer) private readonly customerRepo:Repository<BillingCustomer>,
    @InjectRepository(CheckoutSession) private readonly checkoutRepo:Repository<CheckoutSession>,
    @InjectRepository(Subscription) private readonly subscriptionRepo:Repository<Subscription>,
    @InjectRepository(TeamMember) private readonly teamMemberRepo:Repository<TeamMember>,
    @InjectRepository(Membership) private readonly membershipRepo:Repository<Membership>,
    @InjectRepository(CommercialPipelineStage) private readonly stageRepo:Repository<CommercialPipelineStage>,
    @InjectRepository(Contract) private readonly contractRepo:Repository<Contract>,
    @InjectRepository(PrecheckoutSession) private readonly precheckoutRepo:Repository<PrecheckoutSession>,
    private readonly people:PeopleService,
    private readonly asaas:AsaasClient,
    private readonly billing:BillingService,
    private readonly lifecycle:LifecycleService,
    private readonly pricing:PricingService,
    private readonly commercialFeature:CommercialFeatureService,
    private readonly dataSource:DataSource,
  ){}

  async create(unitId:string,userId:string,dto:CreateOpportunityDto){
    const customerType=dto.customerType||CustomerType.PERSON;
    if(dto.cpfCnpj){
      const taxId=normalizeTaxId(dto.cpfCnpj);
      const valid=customerType===CustomerType.COMPANY?isValidCnpj(taxId):isValidCpf(taxId);
      if(!valid)throw new BadRequestException(customerType===CustomerType.COMPANY?'CNPJ inválido.':'CPF inválido.');
      dto.cpfCnpj=taxId;
    }
    const person=await this.people.upsertByTaxId(unitId,this.personDto(dto));
    const calculated=dto.negotiation&&dto.cycle
      ? this.pricing.calculate({...dto.negotiation,customerType:dto.customerType||CustomerType.PERSON,cycle:dto.cycle,billingType:dto.billingType} as any)
      : {};
    const snapshot=dto.negotiation&&dto.cycle
      ? {...calculated,allowedBillingTypes:dto.allowedBillingTypes?.length?dto.allowedBillingTypes:(dto.billingType?[dto.billingType]:[])}
      : {};
    const finalValue=(snapshot as any)?.pricing?.finalAmount ?? dto.valor;
    const opp=await this.repo.save(this.repo.create({unitId,primaryPersonId:person.id,ownerUserId:userId,teamId:dto.teamId||null,pipelineStageId:null,offerVersionId:null,customerType:dto.customerType||CustomerType.PERSON,commercialStatus:dto.commercialStatus||CommercialStatus.DRAFT,negotiationSnapshot:snapshot,planPriceId:dto.planPriceId||null,status:OpportunityStatus.OPEN,expectedValue:finalValue!==undefined?Number(finalValue).toFixed(2):null,billingCycle:dto.cycle||null,billingType:dto.billingType||null,acquisitionSource:dto.acquisitionSource||null,notes:dto.notes||null,lossReason:null,asaasCustomerId:null,wonAt:null,cancelledAt:null}));
    await this.memberRepo.save(this.memberRepo.create({unitId,opportunityId:opp.id,personId:person.id,role:MemberRole.PRIMARY,relationship:null}));
    await this.lifecycle.record({unitId,personId:person.id,type:'opportunity.created',source:LifecycleSource.API,actorUserId:userId,metadata:{opportunityId:opp.id}});
    return this.serialize(opp,person);
  }

  async list(
    unitIds:string[]|null,
    userId:string,
    unitRole:UnitRole|null,
    globalRole:GlobalRole,
    page=1,
    limit=15,
    search?:string,
    status?:string,
    filters?:{ownerUserId?:string;teamId?:string;customerType?:CustomerType;commercialStatus?:CommercialStatus},
  ){
    const qb=this.repo.createQueryBuilder('opp');
    if(unitIds)qb.where('opp.unit_id IN (:...unitIds)',{unitIds});
    await this.applyScope(qb,unitIds,userId,unitRole,globalRole);
    if(status)qb.andWhere('opp.status = :status',{status:this.fromLegacyStatus(status)});
    if(filters?.ownerUserId)qb.andWhere('opp.owner_user_id = :ownerUserId',{ownerUserId:filters.ownerUserId});
    if(filters?.teamId)qb.andWhere('opp.team_id = :teamId',{teamId:filters.teamId});
    if(filters?.customerType)qb.andWhere('opp.customer_type = :customerType',{customerType:filters.customerType});
    if(filters?.commercialStatus)qb.andWhere('opp.commercial_status = :commercialStatus',{commercialStatus:filters.commercialStatus});
    const opportunities=await qb.orderBy('opp.created_at','DESC').getMany();
    const people=opportunities.length?await this.personRepo.find({where:{id:In(opportunities.map(o=>o.primaryPersonId))}}):[];
    let rows=opportunities.map(o=>this.serialize(o,people.find(p=>p.id===o.primaryPersonId)!));
    if(search){
      const s=search.toLowerCase(),d=search.replace(/\D/g,'');
      rows=rows.filter(r=>r.nome.toLowerCase().includes(s)||r.email?.toLowerCase().includes(s)||(d&&r.cpfCnpj?.includes(d)));
    }
    const all=rows,total=rows.length;
    rows=rows.slice((page-1)*limit,page*limit);
    return{data:rows,total,page,limit,totalPages:Math.ceil(total/limit),indicadores:{
      total:all.length,
      valorPotencial:all.filter(x=>['aberta','checkout_gerado'].includes(x.status)).reduce((a,b)=>a+Number(b.valor||0),0),
      checkoutPendente:all.filter(x=>x.status==='checkout_gerado').length,
      convertidas:all.filter(x=>x.status==='convertida').length,
    }};
  }

  async kanban(
    unitIds:string[]|null,
    userId:string,
    unitRole:UnitRole|null,
    globalRole:GlobalRole,
    filters?:{ownerUserId?:string;teamId?:string;customerType?:CustomerType;commercialStatus?:CommercialStatus},
  ){
    const result=await this.list(unitIds,userId,unitRole,globalRole,1,1000,undefined,undefined,filters);
    const stages=await this.stageRepo.find({
      where:unitIds?{unitId:In(unitIds),active:true}:{active:true},
      order:{position:'ASC'},
    });
    if(stages.length){
      const columns=stages.map(stage=>({
        id:stage.id,
        name:stage.name,
        status:stage.commercialStatus,
        position:stage.position,
        items:result.data.filter((item:any)=>item.pipelineStageId===stage.id),
      }));
      const unassigned=result.data.filter((item:any)=>!item.pipelineStageId||!stages.some(stage=>stage.id===item.pipelineStageId));
      if(unassigned.length)columns.push({id:'UNASSIGNED',name:'Sem etapa',status:null,position:9999,items:unassigned});
      return{columns,total:result.total};
    }
    return{
      columns:Object.values(CommercialStatus).map(status=>({
        id:status,name:status,status,position:0,
        items:result.data.filter((item:any)=>item.commercialStatus===status),
      })),
      total:result.total,
    };
  }

  async detail(unitId:string,id:string,userId?:string,unitRole?:UnitRole|null,globalRole?:GlobalRole){const opp=await this.getEntity(unitId,id,userId,unitRole,globalRole);const person=await this.personRepo.findOneByOrFail({id:opp.primaryPersonId,unitId});const members=await this.memberRepo.find({where:{unitId,opportunityId:id,role:MemberRole.DEPENDENT},order:{createdAt:'ASC'}});const people=members.length?await this.personRepo.find({where:{id:In(members.map(m=>m.personId)),unitId}}):[];const checkout=await this.checkoutRepo.findOne({where:{unitId,opportunityId:id},order:{createdAt:'DESC'}});const sub=await this.subscriptionRepo.findOne({where:{unitId,sourceOpportunityId:id},order:{createdAt:'DESC'}});const result:any=this.serialize(opp,person);result.dependentes=members.map(m=>{const p=people.find(x=>x.id===m.personId)!;return{id:m.id,nome:p.name,cpf:p.taxId,dataNascimento:p.birthDate,relationship:m.relationship}});result.checkoutId=checkout?.externalId||null;result.checkoutLink=checkout?.url||null;result.checkoutExpiresAt=checkout?.expiresAt||null;result.subscriptionId=sub?.externalSubscriptionId||sub?.id||null;result.boletoUrl=checkout?.payload?.bankSlipUrl||null;result.pixPayload=checkout?.payload?.pixPayload||null;result.pixEncodedImage=checkout?.payload?.pixEncodedImage||null;result.pixExpirationDate=checkout?.payload?.pixExpirationDate||null;result.camposPendentes=this.pending(result);result.checkoutReady=result.camposPendentes.length===0;return result;}

  async update(unitId:string,id:string,dto:UpdateOpportunityDto,userId?:string,unitRole?:UnitRole|null,globalRole?:GlobalRole){const opp=await this.getEntity(unitId,id,userId,unitRole,globalRole);if(opp.status===OpportunityStatus.WON)throw new BadRequestException('Oportunidade convertida não pode ser editada.');if(dto.cpfCnpj){const customerType=dto.customerType||opp.customerType;const taxId=normalizeTaxId(dto.cpfCnpj);const valid=customerType===CustomerType.COMPANY?isValidCnpj(taxId):isValidCpf(taxId);if(!valid)throw new BadRequestException(customerType===CustomerType.COMPANY?'CNPJ inválido.':'CPF inválido.');dto.cpfCnpj=taxId;}const person=await this.personRepo.findOneByOrFail({id:opp.primaryPersonId,unitId});const p=this.personDto(dto as any);for(const[k,v]of Object.entries(p))if(v!==undefined&&v!==null&&(v!==''||k==='email'))(person as any)[k]=v;if(dto.valor!==undefined)opp.expectedValue=dto.valor.toFixed(2);if(dto.cycle!==undefined)opp.billingCycle=dto.cycle;if(dto.billingType!==undefined)opp.billingType=dto.billingType;if(dto.planPriceId!==undefined)opp.planPriceId=dto.planPriceId;if(dto.acquisitionSource!==undefined)opp.acquisitionSource=dto.acquisitionSource;if(dto.notes!==undefined)opp.notes=dto.notes;
    if(dto.customerType!==undefined)opp.customerType=dto.customerType;
    if(dto.commercialStatus!==undefined)opp.commercialStatus=dto.commercialStatus;
    if(dto.teamId!==undefined)opp.teamId=dto.teamId;
    if(dto.negotiation!==undefined){
      if(!dto.cycle&&!opp.billingCycle)throw new BadRequestException('Periodicidade obrigatória para calcular a negociação.');
      const calculation=this.pricing.calculate({...dto.negotiation,customerType:dto.customerType||opp.customerType,cycle:dto.cycle||opp.billingCycle,billingType:dto.billingType||opp.billingType} as any);
      const existingAllowed=opp.negotiationSnapshot?.allowedBillingTypes||[];
      const allowedBillingTypes=dto.allowedBillingTypes?.length
        ? dto.allowedBillingTypes
        : existingAllowed.length?existingAllowed:(dto.billingType||opp.billingType?[dto.billingType||opp.billingType]:[]);
      const snapshot={...calculation,allowedBillingTypes};
      opp.negotiationSnapshot=snapshot;
      opp.expectedValue=Number(snapshot.pricing.finalAmount).toFixed(2);
      opp.commercialStatus=CommercialStatus.NEGOTIATION;
    }
    await this.personRepo.save(person);await this.repo.save(opp);return this.detail(unitId,id,userId,unitRole,globalRole)}

  async assign(
    unitId:string,
    id:string,
    dto:AssignOpportunityDto,
    actorId:string,
    unitRole:UnitRole|null,
    globalRole:GlobalRole,
  ){
    const opportunity=await this.getEntity(unitId,id,actorId,unitRole,globalRole);
    if([OpportunityStatus.WON,OpportunityStatus.CANCELLED].includes(opportunity.status)){
      throw new BadRequestException('Oportunidade encerrada não pode ser transferida.');
    }
    if(unitRole===UnitRole.MANAGER&&globalRole!==GlobalRole.INSTALLATION_ADMIN){
      const managed=await this.teamMemberRepo.find({where:{unitId,userId:actorId}});
      const managedIds=managed.map(item=>item.teamId);
      if(dto.teamId&&!managedIds.includes(dto.teamId))throw new NotFoundException('Time não encontrado.');
    }
    if(dto.ownerUserId){
      const membership=await this.membershipRepo.findOne({where:{unitId,userId:dto.ownerUserId,active:true}});
      if(!membership)throw new NotFoundException('Responsável não pertence à unidade.');
      if(dto.teamId&&!await this.teamMemberRepo.exists({where:{unitId,teamId:dto.teamId,userId:dto.ownerUserId}})){
        throw new BadRequestException('O responsável precisa pertencer ao time selecionado.');
      }
    }
    const before={ownerUserId:opportunity.ownerUserId,teamId:opportunity.teamId};
    if(dto.ownerUserId!==undefined)opportunity.ownerUserId=dto.ownerUserId||null;
    if(dto.teamId!==undefined)opportunity.teamId=dto.teamId||null;
    await this.repo.save(opportunity);
    await this.lifecycle.record({
      unitId,personId:opportunity.primaryPersonId,type:'opportunity.assigned',source:LifecycleSource.API,
      actorUserId:actorId,metadata:{opportunityId:id,before,after:{ownerUserId:opportunity.ownerUserId,teamId:opportunity.teamId}},
    });
    return this.detail(unitId,id,actorId,unitRole,globalRole);
  }

  async moveStage(
    unitId:string,
    id:string,
    dto:MoveOpportunityStageDto,
    actorId:string,
    unitRole:UnitRole|null,
    globalRole:GlobalRole,
  ){
    const opportunity=await this.getEntity(unitId,id,actorId,unitRole,globalRole);
    if([OpportunityStatus.WON,OpportunityStatus.CANCELLED].includes(opportunity.status)){
      throw new BadRequestException('Oportunidade encerrada não pode mudar de etapa.');
    }
    const stage=await this.stageRepo.findOne({where:{unitId,id:dto.stageId,active:true}});
    if(!stage)throw new NotFoundException('Etapa não encontrada.');
    const previous=opportunity.pipelineStageId;
    opportunity.pipelineStageId=stage.id;
    if(stage.commercialStatus)opportunity.commercialStatus=stage.commercialStatus;
    await this.repo.save(opportunity);
    await this.lifecycle.record({
      unitId,personId:opportunity.primaryPersonId,type:'opportunity.stage_changed',source:LifecycleSource.API,
      actorUserId:actorId,metadata:{opportunityId:id,fromStageId:previous,toStageId:stage.id},
    });
    return this.detail(unitId,id,actorId,unitRole,globalRole);
  }

  async cancel(unitId:string,id:string,motivo:string,actorId:string,unitRole?:UnitRole|null,globalRole?:GlobalRole){const opp=await this.getEntity(unitId,id,actorId,unitRole,globalRole);if([OpportunityStatus.WON,OpportunityStatus.CANCELLED].includes(opp.status))throw new BadRequestException('Oportunidade não pode ser cancelada no status atual.');opp.status=OpportunityStatus.CANCELLED;opp.commercialStatus=CommercialStatus.LOST;opp.lossReason=motivo;opp.cancelledAt=new Date();await this.repo.save(opp);await this.lifecycle.record({unitId,personId:opp.primaryPersonId,type:'opportunity.cancelled',source:LifecycleSource.API,actorUserId:actorId,reasonCode:'CANCELLED',metadata:{opportunityId:id,reason:motivo}})}

  async addDependent(unitId:string,id:string,dto:CreateOpportunityDependentDto,userId?:string,unitRole?:UnitRole|null,globalRole?:GlobalRole){await this.getEntity(unitId,id,userId,unitRole,globalRole);dto.cpf=normalizeTaxId(dto.cpf);if(!isValidCpf(dto.cpf))throw new BadRequestException('CPF inválido.');if(await this.personRepo.exists({where:{unitId,taxId:dto.cpf}}))throw new ConflictException('CPF já cadastrado na unidade.');const p=await this.personRepo.save(this.personRepo.create({unitId,kind:'PERSON' as any,name:dto.nome,taxId:dto.cpf,email:null,phone:null,whatsapp:null,birthDate:dto.dataNascimento||null,address:null,addressNumber:null,complement:null,district:null,city:null,state:null,postalCode:null,metadata:{}}));const m=await this.memberRepo.save(this.memberRepo.create({unitId,opportunityId:id,personId:p.id,role:MemberRole.DEPENDENT,relationship:dto.relationship||null}));return{id:m.id,nome:p.name,cpf:p.taxId,dataNascimento:p.birthDate}}
  async updateDependent(unitId:string,id:string,memberId:string,dto:UpdateOpportunityDependentDto,userId?:string,unitRole?:UnitRole|null,globalRole?:GlobalRole){await this.getEntity(unitId,id,userId,unitRole,globalRole);const m=await this.memberRepo.findOne({where:{unitId,opportunityId:id,id:memberId,role:MemberRole.DEPENDENT}});if(!m)throw new NotFoundException('Dependente não encontrado.');const p=await this.personRepo.findOneByOrFail({unitId,id:m.personId});if(dto.nome!==undefined)p.name=dto.nome;if(dto.cpf!==undefined)p.taxId=dto.cpf;if(dto.dataNascimento!==undefined)p.birthDate=dto.dataNascimento;if(dto.relationship!==undefined)m.relationship=dto.relationship;await this.personRepo.save(p);await this.memberRepo.save(m);return{id:m.id,nome:p.name,cpf:p.taxId}}
  async deleteDependent(unitId:string,id:string,memberId:string,userId?:string,unitRole?:UnitRole|null,globalRole?:GlobalRole){await this.getEntity(unitId,id,userId,unitRole,globalRole);const m=await this.memberRepo.findOne({where:{unitId,opportunityId:id,id:memberId,role:MemberRole.DEPENDENT}});if(!m)throw new NotFoundException('Dependente não encontrado.');await this.memberRepo.delete(m.id)}

  async generateCheckout(unitId:string,id:string,user:User,unitRole?:UnitRole|null){
    const commercialV2=await this.commercialFeature.status(unitId);
    if(commercialV2.enabled)throw new ConflictException('O checkout legado está desativado nesta sede. Gere o pré-checkout comercial com contrato.');
    const opp=await this.getEntity(unitId,id,user.id,unitRole,user.globalRole);if(opp.customerType===CustomerType.COMPANY&&opp.commercialStatus!==CommercialStatus.APPROVED)throw new BadRequestException('Negociação de pessoa jurídica precisa estar aprovada antes do checkout.');const detail=await this.detail(unitId,id);const pending=this.pending(detail);if(pending.length)throw new BadRequestException({errors:[{code:'checkout_not_ready',description:`Campos obrigatórios pendentes: ${pending.join(', ')}`}]});const person=await this.personRepo.findOneByOrFail({unitId,id:opp.primaryPersonId});const customer=await this.ensureCustomer(unitId,opp,person);const cycle=opp.billingCycle||BillingCycle.MONTHLY;const value=Number(opp.expectedValue||0);const next=new Date();next.setDate(next.getDate()+1);const nextDueDate=next.toISOString().slice(0,10);const callback=(process.env.APP_URL||'http://localhost:4002').replace(/\/$/,'');
    if([BillingType.BOLETO,BillingType.PIX].includes(opp.billingType as BillingType)){const billingType=opp.billingType as BillingType;const external=await this.asaas.createSubscription(unitId,{customer:customer.externalId,billingType,value,nextDueDate,cycle,description:process.env.APP_NAME||'Clube de Assinatura',externalReference:opp.id});const payments=await this.asaas.subscriptionPayments(unitId,external.id,'PENDING',1);const first=payments.data?.[0];if(!first?.id)throw new BadRequestException('O Asaas criou a assinatura, mas não retornou a primeira cobrança. Execute a reconciliação antes de tentar novamente.');const local=await this.createPendingSubscription(opp,external.id);const pix=billingType===BillingType.PIX?await this.asaas.pixQrCode(unitId,first.id):null;const checkout=await this.checkoutRepo.save(this.checkoutRepo.create({unitId,opportunityId:opp.id,billingCustomerId:customer.id,provider:BillingProviderName.ASAAS,externalId:external.id,status:CheckoutStatus.PENDING,url:first?.bankSlipUrl||first?.invoiceUrl||null,expiresAt:pix?.expirationDate?new Date(pix.expirationDate):null,payload:{paymentId:first.id,bankSlipUrl:first?.bankSlipUrl||null,invoiceUrl:first?.invoiceUrl||null,subscriptionId:local.id,pixPayload:pix?.payload||null,pixEncodedImage:pix?.encodedImage||null,pixExpirationDate:pix?.expirationDate||null}}));opp.status=OpportunityStatus.CHECKOUT_PENDING;opp.commercialStatus=CommercialStatus.CHECKOUT_SENT;await this.repo.save(opp);if(billingType===BillingType.PIX)return{subscriptionId:external.id,paymentId:first.id,pixPayload:pix?.payload||null,pixEncodedImage:pix?.encodedImage||null,pixExpirationDate:pix?.expirationDate||null,invoiceUrl:first?.invoiceUrl||null};return{subscriptionId:external.id,boletoUrl:checkout.payload.bankSlipUrl||checkout.url};}
    const result=await this.asaas.createCheckout(unitId,{billingTypes:['CREDIT_CARD'],chargeTypes:['RECURRENT'],minutesToExpire:1440,externalReference:opp.id,customer:customer.externalId,items:[{name:process.env.APP_NAME||'Clube de Assinatura',quantity:1,value}],subscription:{cycle,nextDueDate},callback:{successUrl:`${callback}/dashboard/oportunidades`,cancelUrl:`${callback}/dashboard/oportunidades`}});const checkout=await this.checkoutRepo.save(this.checkoutRepo.create({unitId,opportunityId:opp.id,billingCustomerId:customer.id,provider:BillingProviderName.ASAAS,externalId:result.id,status:CheckoutStatus.PENDING,url:result.link,expiresAt:new Date(Date.now()+86400000),payload:{}}));opp.status=OpportunityStatus.CHECKOUT_PENDING;opp.commercialStatus=CommercialStatus.CHECKOUT_SENT;await this.repo.save(opp);return{checkoutId:checkout.externalId,checkoutLink:checkout.url,expiresAt:checkout.expiresAt};}

  async convert(unitId:string,opportunityId:string,input:{externalSubscriptionId?:string|null;correlationId?:string;source?:LifecycleSource;actorUserId?:string|null}){return this.dataSource.transaction(async manager=>{const opp=await manager.findOne(Opportunity,{where:{unitId,id:opportunityId},lock:{mode:'pessimistic_write'}});if(!opp)throw new NotFoundException('Oportunidade não encontrada.');let sub=await manager.findOne(Subscription,{where:{unitId,sourceOpportunityId:opp.id}});
    const contract=await manager.findOne(Contract,{where:{unitId,opportunityId:opp.id,status:ContractStatus.ACCEPTED},order:{version:'DESC'}});
    const effectiveNegotiation=contract?.snapshot?.negotiation||opp.negotiationSnapshot;
    const contractMetadata={
      contractId:contract?.id||null,
      contractVersion:contract?.version||null,
      contractHash:contract?.contentHash||null,
      contractRelationType:contract?.relationType||null,
      parentContractId:contract?.parentContractId||null,
      negotiationSnapshot:effectiveNegotiation,
      appliedPolicyIds:effectiveNegotiation?.policyEvaluation?.appliedPolicyIds||[],
      contractedLives:effectiveNegotiation?.participants?.contractedLives||null,
      offerVersionId:opp.offerVersionId,
    };
    if(contract){
      opp.negotiationSnapshot=effectiveNegotiation;
      opp.expectedValue=Number(effectiveNegotiation?.pricing?.finalAmount||opp.expectedValue||0).toFixed(2);
      opp.billingCycle=effectiveNegotiation?.cycle||opp.billingCycle;
      opp.billingType=effectiveNegotiation?.allowedBillingTypes?.[0]||opp.billingType;
    }
    if(!sub){sub=manager.create(Subscription,{unitId,primaryPersonId:opp.primaryPersonId,planPriceId:opp.planPriceId,sourceOpportunityId:opp.id,billingConnectionId:(await this.billing.connectionEntity(unitId))?.id||null,externalSubscriptionId:input.externalSubscriptionId||null,status:SubscriptionStatus.ACTIVE,financialStatus:FinancialStatus.CURRENT,accessStatus:AccessStatus.ENABLED,startedAt:new Date(),firstActiveAt:new Date(),currentPeriodStart:new Date(),currentPeriodEnd:null,cancellationScheduledAt:null,cancelledAt:null,lastReactivatedAt:null,cancellationReasonCode:null,cancellationReasonText:null,metadata:{billingCycle:opp.billingCycle,billingType:opp.billingType,...contractMetadata}});sub=await manager.save(sub);const members=await manager.find(OpportunityMember,{where:{unitId,opportunityId:opp.id}});for(const m of members)await manager.save(manager.create(SubscriptionMember,{unitId,subscriptionId:sub.id,personId:m.personId,role:m.role,status:SubscriptionMemberStatus.ACTIVE,joinedAt:new Date(),leftAt:null,relationship:m.relationship}));}else{if(input.externalSubscriptionId)sub.externalSubscriptionId=input.externalSubscriptionId;sub.status=SubscriptionStatus.ACTIVE;sub.financialStatus=FinancialStatus.CURRENT;sub.accessStatus=AccessStatus.ENABLED;sub.firstActiveAt||=new Date();sub.metadata={...(sub.metadata||{}),...contractMetadata};await manager.save(sub);}opp.status=OpportunityStatus.WON;opp.commercialStatus=CommercialStatus.CONVERTED;opp.wonAt=new Date();await manager.save(opp);const existingSale=await manager.findOne(Sale,{where:{unitId,opportunityId:opp.id}});if(!existingSale)await manager.save(manager.create(Sale,{unitId,opportunityId:opp.id,subscriptionId:sub.id,salespersonId:opp.ownerUserId,grossAmount:opp.expectedValue||'0',commissionAmount:(Number(opp.expectedValue||0)*0.1).toFixed(2),commissionPaid:false,soldAt:new Date()}));return sub;}).then(async sub=>{
    await this.precheckoutRepo.update({unitId,opportunityId},{status:PrecheckoutStatus.COMPLETED});
    await this.checkoutRepo.update({unitId,opportunityId,status:CheckoutStatus.PENDING},{status:CheckoutStatus.PAID});
    await this.lifecycle.record({
      unitId,subscriptionId:sub.id,personId:sub.primaryPersonId,type:'subscription.activated',
      fromStatus:SubscriptionStatus.PENDING_PAYMENT,toStatus:SubscriptionStatus.ACTIVE,
      source:input.source||LifecycleSource.SYSTEM,actorUserId:input.actorUserId,
      correlationId:input.correlationId,metadata:{opportunityId,contractId:sub.metadata?.contractId||null},
    });
    return sub;
  })}

  async convertByCheckout(unitId:string,checkoutExternalId:string,payload:any){const checkout=await this.checkoutRepo.findOne({where:{unitId,externalId:checkoutExternalId}});if(!checkout)throw new NotFoundException('Checkout não encontrado.');checkout.status=CheckoutStatus.PAID;await this.checkoutRepo.save(checkout);const externalSub=payload?.checkout?.subscription?.id||payload?.subscription?.id||null;return this.convert(unitId,checkout.opportunityId,{externalSubscriptionId:externalSub,correlationId:checkoutExternalId,source:LifecycleSource.WEBHOOK})}
  async convertByExternalReference(unitId:string,reference:string,externalSubscriptionId?:string|null,correlationId?:string){const opp=await this.repo.findOne({where:{unitId,id:reference}});if(!opp)return null;return this.convert(unitId,opp.id,{externalSubscriptionId,correlationId,source:LifecycleSource.WEBHOOK})}
  async paymentBook(unitId:string,id:string,userId?:string,unitRole?:UnitRole|null,globalRole?:GlobalRole){const opp=await this.getEntity(unitId,id,userId,unitRole,globalRole);const sub=await this.subscriptionRepo.findOne({where:{unitId,sourceOpportunityId:opp.id}});if(!sub?.externalSubscriptionId)throw new BadRequestException('Nenhuma assinatura externa vinculada.');if(process.env.ASAAS_MOCK==='true')return Buffer.from('Mock payment book');const now=new Date();return Buffer.from(await this.asaas.paymentBook(unitId,sub.externalSubscriptionId,now.getMonth()+1,now.getFullYear()) as any)}

  private async createPendingSubscription(opp:Opportunity,externalId:string){let sub=await this.subscriptionRepo.findOne({where:{unitId:opp.unitId,sourceOpportunityId:opp.id}});if(sub)return sub;sub=await this.subscriptionRepo.save(this.subscriptionRepo.create({unitId:opp.unitId,primaryPersonId:opp.primaryPersonId,planPriceId:opp.planPriceId,sourceOpportunityId:opp.id,billingConnectionId:(await this.billing.connectionEntity(opp.unitId))?.id||null,externalSubscriptionId:externalId,status:SubscriptionStatus.PENDING_PAYMENT,financialStatus:FinancialStatus.UNKNOWN,accessStatus:AccessStatus.DISABLED,startedAt:null,firstActiveAt:null,currentPeriodStart:null,currentPeriodEnd:null,cancellationScheduledAt:null,cancelledAt:null,lastReactivatedAt:null,cancellationReasonCode:null,cancellationReasonText:null,metadata:{billingCycle:opp.billingCycle,billingType:opp.billingType,negotiationSnapshot:opp.negotiationSnapshot,offerVersionId:opp.offerVersionId}}));const ms=await this.memberRepo.find({where:{unitId:opp.unitId,opportunityId:opp.id}});for(const m of ms)await this.dataSource.getRepository(SubscriptionMember).save(this.dataSource.getRepository(SubscriptionMember).create({unitId:opp.unitId,subscriptionId:sub.id,personId:m.personId,role:m.role,status:SubscriptionMemberStatus.ACTIVE,joinedAt:new Date(),leftAt:null,relationship:m.relationship}));return sub}
  private async ensureCustomer(unitId:string,opp:Opportunity,p:Person){let c=await this.customerRepo.findOne({where:{unitId,personId:p.id,provider:BillingProviderName.ASAAS}});if(c)return c;const x=await this.asaas.createCustomer(unitId,{name:p.name,cpfCnpj:p.taxId,email:p.email,mobilePhone:p.phone,address:p.address,addressNumber:p.addressNumber,complement:p.complement,province:p.district,postalCode:p.postalCode,state:p.state,externalReference:p.id});c=await this.customerRepo.save(this.customerRepo.create({unitId,personId:p.id,provider:BillingProviderName.ASAAS,externalId:x.id,metadata:{}}));opp.asaasCustomerId=x.id;await this.repo.save(opp);return c}
  private async getEntity(unitId:string,id:string,userId?:string,unitRole?:UnitRole|null,globalRole?:GlobalRole){
    const o=await this.repo.findOne({where:{unitId,id}});
    if(!o)throw new NotFoundException('Oportunidade não encontrada.');
    if(userId&&globalRole!==GlobalRole.INSTALLATION_ADMIN){
      if(unitRole===UnitRole.SALES&&o.ownerUserId!==userId)throw new NotFoundException('Oportunidade não encontrada.');
      if(unitRole===UnitRole.MANAGER){
        const teams=await this.teamMemberRepo.find({where:{unitId,userId}});
        if(!o.teamId||!teams.some(item=>item.teamId===o.teamId))throw new NotFoundException('Oportunidade não encontrada.');
      }
    }
    return o;
  }

  private async applyScope(
    qb:any,
    unitIds:string[]|null,
    userId:string,
    unitRole:UnitRole|null,
    globalRole:GlobalRole,
  ){
    if(globalRole===GlobalRole.INSTALLATION_ADMIN)return;
    if(unitRole===UnitRole.SALES){
      qb.andWhere('opp.owner_user_id = :scopeUserId',{scopeUserId:userId});
      return;
    }
    if(unitRole===UnitRole.MANAGER){
      const where:any={userId};
      if(unitIds)where.unitId=In(unitIds);
      const teams=await this.teamMemberRepo.find({where});
      const teamIds=[...new Set(teams.map(item=>item.teamId))];
      if(!teamIds.length)qb.andWhere('1 = 0');
      else qb.andWhere('opp.team_id IN (:...scopeTeamIds)',{scopeTeamIds:teamIds});
    }
  }
  private personDto(d:any){return{kind:'PERSON' as any,name:d.nome,taxId:d.cpfCnpj||undefined,email:d.email||undefined,phone:d.telefone||undefined,whatsapp:d.telefone||undefined,birthDate:d.dataNascimento||undefined,address:d.endereco||undefined,addressNumber:d.enderecoNumero||undefined,complement:d.complemento||undefined,district:d.bairro||undefined,city:d.cidade||undefined,state:d.estado||undefined,postalCode:d.cep||undefined,metadata:{}}}
  private serialize(o:Opportunity,p:Person){return{id:o.id,ownerUserId:o.ownerUserId,teamId:o.teamId,pipelineStageId:o.pipelineStageId,offerVersionId:o.offerVersionId,customerType:o.customerType,commercialStatus:o.commercialStatus,negotiationSnapshot:o.negotiationSnapshot,nome:p?.name||'',cpfCnpj:p?.taxId||'',telefone:p?.phone||'',email:p?.email||'',dataNascimento:p?.birthDate||'',endereco:p?.address||'',enderecoNumero:p?.addressNumber||'',complemento:p?.complement||'',bairro:p?.district||'',cidade:p?.city||'',estado:p?.state||'',cep:p?.postalCode||'',valor:Number(o.expectedValue||0),billingType:o.billingType,cycle:o.billingCycle,status:this.toLegacyStatus(o.status),motivoCancelamento:o.lossReason,createdAt:o.createdAt,convertedAt:o.wonAt,asaasCustomerId:o.asaasCustomerId}}
  private pending(d:any){return REQUIRED.filter(k=>d[k]===null||d[k]===undefined||d[k]==='')}
  private toLegacyStatus(s:OpportunityStatus){return({[OpportunityStatus.OPEN]:'aberta',[OpportunityStatus.CHECKOUT_PENDING]:'checkout_gerado',[OpportunityStatus.PAID]:'checkout_pago',[OpportunityStatus.WON]:'convertida',[OpportunityStatus.LOST]:'cancelada',[OpportunityStatus.CANCELLED]:'cancelada',[OpportunityStatus.EXPIRED]:'checkout_expirado'}as any)[s]}
  private fromLegacyStatus(s:string){return({aberta:OpportunityStatus.OPEN,checkout_gerado:OpportunityStatus.CHECKOUT_PENDING,checkout_pago:OpportunityStatus.PAID,convertida:OpportunityStatus.WON,cancelada:OpportunityStatus.CANCELLED,checkout_expirado:OpportunityStatus.EXPIRED}as any)[s]||s}
}

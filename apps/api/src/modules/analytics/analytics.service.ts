import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { LifecycleEvent, Opportunity, OpportunityStatus, Person, Plan, PlanPrice, Sale, Subscription, SubscriptionStatus, User } from '../../database/entities';

const dateFilters = [{ key: 'data_inicio', label: 'Data inicial', tipo: 'date' }, { key: 'data_fim', label: 'Data final', tipo: 'date' }];
export const REPORTS = [
  { tipo:'vendas-periodo',nome:'Vendas por Período',descricao:'Vendas concretizadas dentro do período selecionado.',categoria:'comercial',filtros:dateFilters },
  { tipo:'ticket-medio',nome:'Ticket Médio',descricao:'Valor médio das vendas concluídas.',categoria:'comercial',filtros:dateFilters },
  { tipo:'comissoes-pagar',nome:'Comissões a Pagar',descricao:'Comissões pendentes por vendedor.',categoria:'comercial',filtros:dateFilters },
  { tipo:'comissoes-vendedor',nome:'Comissões por Vendedor',descricao:'Consolidado de comissões por responsável.',categoria:'comercial',filtros:dateFilters },
  { tipo:'clientes-ativos',nome:'Clientes Ativos',descricao:'Assinaturas e membros ativos.',categoria:'clientes',filtros:[] },
  { tipo:'novos-clientes',nome:'Novos Clientes',descricao:'Ativações ocorridas no período.',categoria:'clientes',filtros:dateFilters },
  { tipo:'distribuicao-geografica',nome:'Distribuição Geográfica',descricao:'Clientes agrupados por estado e cidade.',categoria:'clientes',filtros:[] },
  { tipo:'aniversariantes',nome:'Aniversariantes',descricao:'Membros aniversariantes por mês.',categoria:'clientes',filtros:[{key:'mes',label:'Mês',tipo:'text'}] },
  { tipo:'funil-vendas',nome:'Funil de Vendas',descricao:'Oportunidades distribuídas por estágio.',categoria:'pipeline',filtros:dateFilters },
  { tipo:'taxa-conversao-vendedor',nome:'Conversão por Vendedor',descricao:'Taxa de conversão por responsável comercial.',categoria:'pipeline',filtros:dateFilters },
  { tipo:'tempo-medio-conversao',nome:'Tempo Médio de Conversão',descricao:'Dias entre criação e conversão da oportunidade.',categoria:'pipeline',filtros:dateFilters },
  { tipo:'oportunidades-abertas',nome:'Oportunidades Abertas',descricao:'Pipeline ainda em negociação.',categoria:'pipeline',filtros:[] },
  { tipo:'mrr',nome:'Receita Recorrente Mensal',descricao:'MRR normalizado das assinaturas ativas.',categoria:'financeiro',filtros:[] },
  { tipo:'faturamento-ciclo',nome:'Faturamento por Ciclo',descricao:'Receita contratada por periodicidade.',categoria:'financeiro',filtros:[] },
  { tipo:'inadimplencia',nome:'Inadimplência',descricao:'Assinaturas em atraso ou suspensas.',categoria:'financeiro',filtros:[] },
  { tipo:'churn',nome:'Churn e Retenção',descricao:'Cancelamentos, churn de clientes e receita perdida.',categoria:'financeiro',filtros:dateFilters },
];

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Subscription) private readonly subRepo:Repository<Subscription>,
    @InjectRepository(PlanPrice) private readonly priceRepo:Repository<PlanPrice>,
    @InjectRepository(Plan) private readonly planRepo:Repository<Plan>,
    @InjectRepository(Person) private readonly personRepo:Repository<Person>,
    @InjectRepository(Opportunity) private readonly oppRepo:Repository<Opportunity>,
    @InjectRepository(Sale) private readonly saleRepo:Repository<Sale>,
    @InjectRepository(User) private readonly userRepo:Repository<User>,
    @InjectRepository(LifecycleEvent) private readonly lifecycleRepo:Repository<LifecycleEvent>,
  ) {}

  catalog(){return{relatorios:REPORTS}}

  async dashboard(unitIds: string[] | null) {
    const subscriptions = await this.findSubs(unitIds);
    const opportunities = await this.findOpps(unitIds);
    const sales = await this.findSales(unitIds);
    const active = subscriptions.filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE);
    const open = opportunities.filter((opportunity) =>
      [OpportunityStatus.OPEN, OpportunityStatus.CHECKOUT_PENDING].includes(opportunity.status),
    );
    const mrr = await this.calculateMrr(active);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const churnEvents = await this.lifecycle(unitIds, since, new Date(), 'subscription.cancelled');
    const churnDenominator = active.length + churnEvents.length;

    return {
      activeSubscriptions: active.length,
      pastDueSubscriptions: subscriptions.filter((subscription) =>
        [SubscriptionStatus.PAST_DUE, SubscriptionStatus.SUSPENDED].includes(subscription.status),
      ).length,
      mrr,
      openOpportunities: open.length,
      pipelineValue: open.reduce((total, opportunity) => total + Number(opportunity.expectedValue || 0), 0),
      salesLast30Days: sales.filter((sale) => sale.soldAt >= since).length,
      churnLast30Days: churnEvents.length,
      churnRate: churnDenominator ? (churnEvents.length / churnDenominator) * 100 : 0,
    };
  }

  async generate(unitIds:string[]|null,type:string,filters:Record<string,any>){
    const meta=REPORTS.find(r=>r.tipo===type);if(!meta)return{relatorio:type,titulo:'Relatório não encontrado',indicadores:[],colunas:[],dados:[]};
    const start=filters.data_inicio?new Date(`${filters.data_inicio}T00:00:00Z`):new Date('2000-01-01');const end=filters.data_fim?new Date(`${filters.data_fim}T23:59:59Z`):new Date();
    let indicadores:any[]=[],colunas:any[]=[],dados:any[]=[];
    const subs=await this.findSubs(unitIds),opps=await this.findOpps(unitIds),sales=(await this.findSales(unitIds)).filter(s=>s.soldAt>=start&&s.soldAt<=end);
    switch(type){
      case'vendas-periodo':{const users=await this.users(sales.map(s=>s.salespersonId).filter(Boolean)as string[]);dados=sales.map(s=>({data:s.soldAt,vendedor:users.find(u=>u.id===s.salespersonId)?.name||'—',valor:Number(s.grossAmount),comissao:Number(s.commissionAmount),status:s.commissionPaid?'Paga':'Pendente'}));colunas=[{key:'data',label:'Data',tipo:'date'},{key:'vendedor',label:'Vendedor'},{key:'valor',label:'Valor',tipo:'currency'},{key:'comissao',label:'Comissão',tipo:'currency'},{key:'status',label:'Comissão'}];indicadores=[{label:'Vendas',valor:dados.length},{label:'Receita',valor:dados.reduce((a,b)=>a+b.valor,0),tipo:'currency'}];break}
      case'ticket-medio':{const total=sales.reduce((a,b)=>a+Number(b.grossAmount),0);dados=[];colunas=[];indicadores=[{label:'Vendas',valor:sales.length},{label:'Receita',valor:total,tipo:'currency'},{label:'Ticket médio',valor:sales.length?total/sales.length:0,tipo:'currency'}];break}
      case'comissoes-pagar':{const pending=sales.filter(s=>!s.commissionPaid),users=await this.users(pending.map(s=>s.salespersonId).filter(Boolean)as string[]);dados=pending.map(s=>({vendedor:users.find(u=>u.id===s.salespersonId)?.name||'—',data:s.soldAt,valor:Number(s.grossAmount),comissao:Number(s.commissionAmount)}));colunas=[{key:'vendedor',label:'Vendedor'},{key:'data',label:'Data',tipo:'date'},{key:'valor',label:'Venda',tipo:'currency'},{key:'comissao',label:'Comissão',tipo:'currency'}];indicadores=[{label:'Pendências',valor:dados.length},{label:'Total a pagar',valor:dados.reduce((a,b)=>a+b.comissao,0),tipo:'currency'}];break}
      case'comissoes-vendedor':{const users=await this.users(sales.map(s=>s.salespersonId).filter(Boolean)as string[]),map=new Map<string,any>();for(const s of sales){const key=s.salespersonId||'none',row=map.get(key)||{vendedor:users.find(u=>u.id===key)?.name||'—',vendas:0,valor:0,comissao:0};row.vendas++;row.valor+=Number(s.grossAmount);row.comissao+=Number(s.commissionAmount);map.set(key,row)}dados=[...map.values()];colunas=[{key:'vendedor',label:'Vendedor'},{key:'vendas',label:'Vendas'},{key:'valor',label:'Vendido',tipo:'currency'},{key:'comissao',label:'Comissão',tipo:'currency'}];break}
      case'clientes-ativos':case'novos-clientes':{let list=subs.filter(s=>s.status===SubscriptionStatus.ACTIVE);if(type==='novos-clientes')list=list.filter(s=>s.firstActiveAt&&s.firstActiveAt>=start&&s.firstActiveAt<=end);const people=await this.people(list.map(s=>s.primaryPersonId));dados=list.map(s=>({nome:people.find(p=>p.id===s.primaryPersonId)?.name||'—',cpf:people.find(p=>p.id===s.primaryPersonId)?.taxId||'',ativacao:s.firstActiveAt,status:s.status}));colunas=[{key:'nome',label:'Titular'},{key:'cpf',label:'CPF/CNPJ'},{key:'ativacao',label:'Ativação',tipo:'date'},{key:'status',label:'Status'}];indicadores=[{label:'Clientes',valor:dados.length}];break}
      case'distribuicao-geografica':{const people=await this.people(subs.map(s=>s.primaryPersonId));const map=new Map<string,number>();for(const p of people){const k=`${p.state||'N/I'} / ${p.city||'Não informado'}`;map.set(k,(map.get(k)||0)+1)}dados=[...map.entries()].map(([local,total])=>({local,total})).sort((a,b)=>b.total-a.total);colunas=[{key:'local',label:'Localidade'},{key:'total',label:'Clientes'}];break}
      case'aniversariantes':{const month=Number(filters.mes||new Date().getMonth()+1),people=await this.people((await this.findSubs(unitIds)).map(s=>s.primaryPersonId));dados=people.filter(p=>p.birthDate&&Number(p.birthDate.slice(5,7))===month).map(p=>({nome:p.name,data:p.birthDate,telefone:p.phone,email:p.email}));colunas=[{key:'nome',label:'Nome'},{key:'data',label:'Nascimento',tipo:'date'},{key:'telefone',label:'Telefone'},{key:'email',label:'Email'}];break}
      case'funil-vendas':{const map=new Map<string,number>();for(const o of opps.filter(o=>o.createdAt>=start&&o.createdAt<=end))map.set(o.status,(map.get(o.status)||0)+1);dados=[...map.entries()].map(([status,total])=>({status,total}));colunas=[{key:'status',label:'Status'},{key:'total',label:'Quantidade'}];indicadores=[{label:'Oportunidades',valor:dados.reduce((a,b)=>a+b.total,0)}];break}
      case'taxa-conversao-vendedor':{const filtered=opps.filter(o=>o.createdAt>=start&&o.createdAt<=end),users=await this.users(filtered.map(o=>o.ownerUserId).filter(Boolean)as string[]),map=new Map<string,any>();for(const o of filtered){const key=o.ownerUserId||'none',row=map.get(key)||{vendedor:users.find(u=>u.id===key)?.name||'—',total:0,convertidas:0};row.total++;if(o.status===OpportunityStatus.WON)row.convertidas++;map.set(key,row)}dados=[...map.values()].map(r=>({...r,taxa:r.total?r.convertidas/r.total*100:0}));colunas=[{key:'vendedor',label:'Vendedor'},{key:'total',label:'Oportunidades'},{key:'convertidas',label:'Convertidas'},{key:'taxa',label:'Conversão',tipo:'percentual'}];break}
      case'tempo-medio-conversao':{const won=opps.filter(o=>o.wonAt&&o.wonAt>=start&&o.wonAt<=end);dados=won.map(o=>({oportunidade:o.id,dias:(o.wonAt!.getTime()-o.createdAt.getTime())/86400000}));colunas=[{key:'oportunidade',label:'Oportunidade'},{key:'dias',label:'Dias'}];indicadores=[{label:'Tempo médio',valor:dados.length?dados.reduce((a,b)=>a+b.dias,0)/dados.length:0}];break}
      case'oportunidades-abertas':{const open=opps.filter(o=>[OpportunityStatus.OPEN,OpportunityStatus.CHECKOUT_PENDING].includes(o.status)),people=await this.people(open.map(o=>o.primaryPersonId));dados=open.map(o=>({nome:people.find(p=>p.id===o.primaryPersonId)?.name||'—',status:o.status,valor:Number(o.expectedValue||0),criada:o.createdAt}));colunas=[{key:'nome',label:'Contato'},{key:'status',label:'Status'},{key:'valor',label:'Valor',tipo:'currency'},{key:'criada',label:'Criada em',tipo:'date'}];break}
      case'mrr':{const active=subs.filter(s=>s.status===SubscriptionStatus.ACTIVE),mrr=await this.calculateMrr(active);dados=[];colunas=[];indicadores=[{label:'MRR',valor:mrr,tipo:'currency'},{label:'Assinaturas ativas',valor:active.length},{label:'ARPA',valor:active.length?mrr/active.length:0,tipo:'currency'}];break}
      case'faturamento-ciclo':{const prices=await this.prices(subs.map(s=>s.planPriceId).filter(Boolean)as string[]),map=new Map<string,any>();for(const s of subs.filter(s=>s.status===SubscriptionStatus.ACTIVE)){const p=prices.find(x=>x.id===s.planPriceId);if(!p)continue;const row=map.get(p.billingCycle)||{ciclo:p.billingCycle,assinaturas:0,valor:0};row.assinaturas++;row.valor+=Number(p.amount);map.set(p.billingCycle,row)}dados=[...map.values()];colunas=[{key:'ciclo',label:'Ciclo'},{key:'assinaturas',label:'Assinaturas'},{key:'valor',label:'Valor contratado',tipo:'currency'}];break}
      case'inadimplencia':{const list=subs.filter(s=>[SubscriptionStatus.PAST_DUE,SubscriptionStatus.SUSPENDED].includes(s.status)),people=await this.people(list.map(s=>s.primaryPersonId));dados=list.map(s=>({nome:people.find(p=>p.id===s.primaryPersonId)?.name||'—',status:s.status,desde:s.updatedAt}));colunas=[{key:'nome',label:'Titular'},{key:'status',label:'Status'},{key:'desde',label:'Atualizado em',tipo:'date'}];indicadores=[{label:'Inadimplentes',valor:list.length},{label:'Taxa',valor:subs.length?list.length/subs.length*100:0,tipo:'percentual'}];break}
      case'churn':{return this.churn(unitIds,start,end)}
    }
    return{relatorio:type,titulo:meta.nome,periodo:{inicio:filters.data_inicio||'',fim:filters.data_fim||''},indicadores,colunas,dados};
  }

  async churn(unitIds:string[]|null,start:Date,end:Date){const cancellations=await this.lifecycle(unitIds,start,end,'subscription.cancelled'),reactivations=await this.lifecycle(unitIds,start,end,'subscription.active');const activeAtEnd=(await this.findSubs(unitIds)).filter(s=>s.status===SubscriptionStatus.ACTIVE);const denominator=activeAtEnd.length+cancellations.length;const people=await this.people(cancellations.map(e=>e.personId).filter(Boolean)as string[]);const dados=cancellations.map(e=>({cliente:people.find(p=>p.id===e.personId)?.name||'—',data:e.effectiveAt,motivo:e.reasonCode||'Não informado',origem:e.source}));return{relatorio:'churn',titulo:'Churn e Retenção',periodo:{inicio:start.toISOString(),fim:end.toISOString()},indicadores:[{label:'Cancelamentos',valor:cancellations.length},{label:'Reativações',valor:reactivations.length},{label:'Churn',valor:denominator?cancellations.length/denominator*100:0,tipo:'percentual'}],colunas:[{key:'cliente',label:'Cliente'},{key:'data',label:'Data',tipo:'date'},{key:'motivo',label:'Motivo'},{key:'origem',label:'Origem'}],dados};}

  csv(result:any){const esc=(v:any)=>`"${String(v??'').replace(/"/g,'""')}"`;return '\ufeff'+[result.colunas.map((c:any)=>esc(c.label)).join(';'),...result.dados.map((r:any)=>result.colunas.map((c:any)=>esc(r[c.key])).join(';'))].join('\n')}
  private findSubs(ids:string[]|null){return ids?this.subRepo.find({where:{unitId:In(ids)}}):this.subRepo.find()}
  private findOpps(ids:string[]|null){return ids?this.oppRepo.find({where:{unitId:In(ids)}}):this.oppRepo.find()}
  private findSales(ids:string[]|null){return ids?this.saleRepo.find({where:{unitId:In(ids)}}):this.saleRepo.find()}
  private people(ids:string[]){return ids.length?this.personRepo.find({where:{id:In([...new Set(ids)])}}):Promise.resolve([])}
  private users(ids:string[]){return ids.length?this.userRepo.find({where:{id:In([...new Set(ids)])}}):Promise.resolve([])}
  private prices(ids:string[]){return ids.length?this.priceRepo.find({where:{id:In([...new Set(ids)])}}):Promise.resolve([])}
  private async lifecycle(ids:string[]|null,start:Date,end:Date,type:string){const qb=this.lifecycleRepo.createQueryBuilder('event').where('event.effective_at BETWEEN :start AND :end',{start,end});if(ids)qb.andWhere('event.unit_id IN (:...ids)',{ids});if(type==='subscription.active')qb.andWhere("event.type IN ('subscription.active','subscription.activated')");else qb.andWhere('event.type = :type',{type});return qb.getMany()}
  private async calculateMrr(subs:Subscription[]){const prices=await this.prices(subs.map(s=>s.planPriceId).filter(Boolean)as string[]),factor:any={WEEKLY:4.345,BIWEEKLY:2.1725,MONTHLY:1,BIMONTHLY:.5,QUARTERLY:1/3,SEMIANNUALLY:1/6,YEARLY:1/12};return subs.reduce((sum,s)=>{const p=prices.find(x=>x.id===s.planPriceId);return sum+(p?Number(p.amount)*(factor[p.billingCycle]||1):0)},0)}
}

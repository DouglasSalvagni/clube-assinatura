import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BillingCycle, BillingType, Plan, PlanPrice } from '../../database/entities';
import { CreatePlanDto, CreatePlanPriceDto, UpdatePlanDto } from './plans.dto';
@Injectable()
export class PlansService {
  constructor(@InjectRepository(Plan) private readonly planRepo: Repository<Plan>, @InjectRepository(PlanPrice) private readonly priceRepo: Repository<PlanPrice>) {}
  async list(unitIds: string[] | null) {
    const plans = unitIds ? await this.planRepo.find({ where: { unitId: In(unitIds) }, order: { name: 'ASC' } }) : await this.planRepo.find({ order: { name: 'ASC' } });
    const prices = plans.length ? await this.priceRepo.find({ where: { planId: In(plans.map((p)=>p.id)), active: true }, order: { version: 'DESC' } }) : [];
    return { data: plans.map((plan)=>({ ...plan, currentPrice: prices.find((price)=>price.planId===plan.id) || null })), total: plans.length };
  }
  async create(unitId: string, dto: CreatePlanDto) {
    const code = dto.code.trim().toUpperCase();
    if (await this.planRepo.exists({ where: { unitId, code } })) throw new ConflictException('Código de plano já utilizado.');
    const plan = await this.planRepo.save(this.planRepo.create({ unitId, code, name: dto.name, description: dto.description || null, active: true, maxDependents: dto.maxDependents || 0, benefits: dto.benefits || [], metadata: {} }));
    if (dto.amount !== undefined) await this.addPrice(unitId, plan.id, { amount: dto.amount, billingCycle: dto.billingCycle || BillingCycle.MONTHLY, billingType: dto.billingType || BillingType.UNDEFINED });
    return this.get(unitId, plan.id);
  }
  async get(unitId: string,id:string){ const plan=await this.planRepo.findOne({where:{unitId,id}}); if(!plan) throw new NotFoundException('Plano não encontrado.'); const prices=await this.priceRepo.find({where:{unitId,planId:id},order:{version:'DESC'}}); return {...plan,prices,currentPrice:prices.find((p)=>p.active)||null}; }
  async update(unitId:string,id:string,dto:UpdatePlanDto){const plan=await this.planRepo.findOne({where:{unitId,id}});if(!plan)throw new NotFoundException('Plano não encontrado.');if(dto.code&&dto.code.toUpperCase()!==plan.code&&await this.planRepo.exists({where:{unitId,code:dto.code.toUpperCase()}}))throw new ConflictException('Código já utilizado.');Object.assign(plan,{...dto,code:dto.code?.toUpperCase()||plan.code});await this.planRepo.save(plan);if(dto.amount!==undefined)await this.addPrice(unitId,id,{amount:dto.amount,billingCycle:dto.billingCycle||BillingCycle.MONTHLY,billingType:dto.billingType||BillingType.UNDEFINED});return this.get(unitId,id);}
  async addPrice(unitId:string,planId:string,dto:CreatePlanPriceDto){await this.get(unitId,planId);const latest=await this.priceRepo.findOne({where:{unitId,planId},order:{version:'DESC'}});if(latest){latest.active=false;latest.effectiveTo=new Date().toISOString().slice(0,10);await this.priceRepo.save(latest);}return this.priceRepo.save(this.priceRepo.create({unitId,planId,version:(latest?.version||0)+1,amount:dto.amount.toFixed(2),billingCycle:dto.billingCycle,billingType:dto.billingType||BillingType.UNDEFINED,effectiveFrom:dto.effectiveFrom||new Date().toISOString().slice(0,10),effectiveTo:null,active:true}));}
}

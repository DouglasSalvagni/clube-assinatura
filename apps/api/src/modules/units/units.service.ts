import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Membership, Unit, User } from '../../database/entities';
import { AuthService } from '../auth/auth.service';
import { CreateUnitDto, UpdateUnitDto } from './units.dto';

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit) private readonly repo: Repository<Unit>,
    @InjectRepository(Membership) private readonly membershipRepo: Repository<Membership>,
    private readonly auth: AuthService,
  ) {}

  async create(dto: CreateUnitDto): Promise<Unit> {
    if (await this.repo.exists({ where: { slug: dto.slug } })) throw new ConflictException('Já existe uma unidade com este slug.');
    return this.repo.save(this.repo.create({ ...dto, legalName: dto.legalName || null, taxId: dto.taxId || null, timezone: dto.timezone || 'America/Sao_Paulo', settings: dto.settings || {}, branding: dto.branding || {}, active: true }));
  }

  async list() { const data = await this.repo.find({ order: { name: 'ASC' } }); return { data, total: data.length }; }
  async publicList() { return this.repo.find({ where: { active: true }, select: ['id', 'slug', 'name'], order: { name: 'ASC' } }); }
  async available(user: User) { const data = await this.auth.availableUnits(user); return { data, total: data.length }; }

  async get(id: string): Promise<Unit> {
    const unit = await this.repo.findOne({ where: [{ id }, { slug: id }] });
    if (!unit) throw new NotFoundException('Unidade não encontrada.');
    return unit;
  }

  async update(id: string, dto: UpdateUnitDto): Promise<Unit> {
    const unit = await this.get(id);
    if (dto.slug && dto.slug !== unit.slug && await this.repo.exists({ where: { slug: dto.slug } })) throw new ConflictException('Slug já utilizado.');
    Object.assign(unit, dto);
    return this.repo.save(unit);
  }

  async deactivate(id: string): Promise<void> {
    const unit = await this.get(id);
    unit.active = false;
    await this.repo.save(unit);
    await this.membershipRepo.update({ unitId: unit.id }, { active: false });
  }
}

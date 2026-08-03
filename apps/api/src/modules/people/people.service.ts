import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { Person, PersonKind } from '../../database/entities';
import { CreatePersonDto, UpdatePersonDto } from './people.dto';

@Injectable()
export class PeopleService {
  constructor(@InjectRepository(Person) private readonly repo: Repository<Person>) {}
  async create(unitId: string, dto: CreatePersonDto): Promise<Person> {
    if (dto.taxId && await this.repo.exists({ where: { unitId, taxId: dto.taxId } })) throw new ConflictException('Já existe uma pessoa com este CPF/CNPJ na unidade.');
    return this.repo.save(this.repo.create({ ...dto, unitId, kind: dto.kind || PersonKind.PERSON, taxId: dto.taxId || null, email: dto.email || null, phone: dto.phone || null, whatsapp: dto.whatsapp || null, birthDate: dto.birthDate || null, address: dto.address || null, addressNumber: dto.addressNumber || null, complement: dto.complement || null, district: dto.district || null, city: dto.city || null, state: dto.state || null, postalCode: dto.postalCode || null, metadata: dto.metadata || {} }));
  }
  async upsertByTaxId(unitId: string, dto: CreatePersonDto): Promise<Person> {
    const existing = dto.taxId ? await this.repo.findOne({ where: { unitId, taxId: dto.taxId } }) : null;
    if (!existing) return this.create(unitId, dto);
    Object.assign(existing, Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined && value !== '')));
    return this.repo.save(existing);
  }
  async list(unitIds: string[] | null, page = 1, limit = 20, search?: string) {
    const qb = this.repo.createQueryBuilder('person');
    if (unitIds) qb.where('person.unit_id IN (:...unitIds)', { unitIds });
    if (search) qb.andWhere(new Brackets((sub) => sub.where('LOWER(person.name) LIKE :search', { search: `%${search.toLowerCase()}%` }).orWhere('person.tax_id LIKE :digits', { digits: `%${search.replace(/\D/g, '')}%` }).orWhere('LOWER(person.email) LIKE :search', { search: `%${search.toLowerCase()}%` })));
    const [data, total] = await qb.orderBy('person.created_at', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  async get(unitId: string, id: string): Promise<Person> { const value = await this.repo.findOne({ where: { unitId, id } }); if (!value) throw new NotFoundException('Pessoa não encontrada.'); return value; }
  async update(unitId: string, id: string, dto: UpdatePersonDto): Promise<Person> { const person = await this.get(unitId, id); if (dto.taxId && dto.taxId !== person.taxId && await this.repo.exists({ where: { unitId, taxId: dto.taxId } })) throw new ConflictException('CPF/CNPJ já utilizado.'); Object.assign(person, dto); return this.repo.save(person); }
}

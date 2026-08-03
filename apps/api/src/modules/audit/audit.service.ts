import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}
  async record(input: Partial<AuditLog> & Pick<AuditLog, 'unitId' | 'action' | 'resourceType'>): Promise<void> {
    await this.repo.save(this.repo.create({
      actorUserId: null, resourceId: null, beforeData: null, afterData: null, ipAddress: null, userAgent: null, metadata: {}, ...input,
    }));
  }
  async list(unitIds: string[] | null, page = 1, limit = 50) {
    const qb = this.repo.createQueryBuilder('log');
    if (unitIds) qb.where('log.unit_id IN (:...unitIds)', { unitIds });
    const [data, total] = await qb.orderBy('log.created_at', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

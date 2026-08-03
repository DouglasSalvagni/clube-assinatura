import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LifecycleEvent, LifecycleSource } from '../../database/entities';

@Injectable()
export class LifecycleService {
  constructor(@InjectRepository(LifecycleEvent) private readonly repo: Repository<LifecycleEvent>) {}

  async record(input: {
    unitId: string;
    type: string;
    personId?: string | null;
    subscriptionId?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    reasonCode?: string | null;
    effectiveAt?: Date;
    actorUserId?: string | null;
    source?: LifecycleSource;
    correlationId?: string | null;
    metadata?: Record<string, any>;
  }): Promise<LifecycleEvent> {
    return this.repo.save(this.repo.create({
      unitId: input.unitId,
      type: input.type,
      personId: input.personId || null,
      subscriptionId: input.subscriptionId || null,
      fromStatus: input.fromStatus || null,
      toStatus: input.toStatus || null,
      reasonCode: input.reasonCode || null,
      effectiveAt: input.effectiveAt || new Date(),
      actorUserId: input.actorUserId || null,
      source: input.source || LifecycleSource.SYSTEM,
      correlationId: input.correlationId || null,
      metadata: input.metadata || {},
    }));
  }
}

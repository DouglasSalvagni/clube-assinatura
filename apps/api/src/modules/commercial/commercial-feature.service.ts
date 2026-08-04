import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Unit } from '../../database/entities';

@Injectable()
export class CommercialFeatureService {
  constructor(@InjectRepository(Unit) private readonly units: Repository<Unit>) {}

  async status(unitId: string) {
    const unit = await this.units.findOne({ where: { id: unitId, active: true } });
    if (!unit) throw new NotFoundException('Sede não encontrada.');

    const configured = String(process.env.COMMERCIAL_V2_ENABLED_UNITS || '').trim();
    const environmentAllowed = configured === '*'
      || configured.split(',').map((value) => value.trim()).includes(unit.id)
      || configured.split(',').map((value) => value.trim()).includes(unit.slug);
    const unitEnabled = unit.settings?.commercialNegotiationV2Enabled === true;
    return {
      enabled: environmentAllowed && unitEnabled,
      environmentAllowed,
      unitEnabled,
      unitId: unit.id,
      unitSlug: unit.slug,
    };
  }

  async setEnabled(unitId: string, enabled: boolean) {
    const unit = await this.units.findOne({ where: { id: unitId, active: true } });
    if (!unit) throw new NotFoundException('Sede não encontrada.');
    unit.settings = {
      ...(unit.settings || {}),
      commercialNegotiationV2Enabled: enabled,
    };
    await this.units.save(unit);
    return this.status(unitId);
  }

  async assertEnabled(unitId: string) {
    const current = await this.status(unitId);
    if (!current.enabled) {
      throw new ServiceUnavailableException('O novo fluxo comercial ainda não está habilitado para esta sede.');
    }
  }
}

import { ServiceUnavailableException } from '@nestjs/common';
import { CommercialFeatureService } from './commercial-feature.service';

describe('CommercialFeatureService', () => {
  const original = process.env.COMMERCIAL_V2_ENABLED_UNITS;

  afterEach(() => {
    if (original == null) delete process.env.COMMERCIAL_V2_ENABLED_UNITS;
    else process.env.COMMERCIAL_V2_ENABLED_UNITS = original;
  });

  it('mantém a feature bloqueada sem liberação no ambiente', async () => {
    delete process.env.COMMERCIAL_V2_ENABLED_UNITS;
    const units = {
      findOne: jest.fn().mockResolvedValue({
        id: 'unit-1',
        slug: 'matriz',
        active: true,
        settings: { commercialNegotiationV2Enabled: true },
      }),
    };
    const service = new CommercialFeatureService(units as any);

    await expect(service.assertEnabled('unit-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('exige liberação no ambiente e na configuração da sede', async () => {
    process.env.COMMERCIAL_V2_ENABLED_UNITS = 'matriz';
    const units = {
      findOne: jest.fn().mockResolvedValue({
        id: 'unit-1',
        slug: 'matriz',
        active: true,
        settings: { commercialNegotiationV2Enabled: true },
      }),
    };
    const service = new CommercialFeatureService(units as any);

    await expect(service.assertEnabled('unit-1')).resolves.toBeUndefined();
  });

  it('persiste a ativação por sede', async () => {
    process.env.COMMERCIAL_V2_ENABLED_UNITS = '*';
    const unit = {
      id: 'unit-1',
      slug: 'matriz',
      active: true,
      settings: {},
    };
    const units = {
      findOne: jest.fn().mockResolvedValue(unit),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const service = new CommercialFeatureService(units as any);

    const result = await service.setEnabled('unit-1', true);

    expect(unit.settings).toEqual({ commercialNegotiationV2Enabled: true });
    expect(units.save).toHaveBeenCalledWith(unit);
    expect(result.enabled).toBe(true);
  });
});

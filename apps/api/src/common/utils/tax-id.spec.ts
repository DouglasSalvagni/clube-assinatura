import { isValidCnpj, isValidCpf, isValidTaxId, normalizeTaxId } from './tax-id';

describe('tax-id', () => {
  it('normaliza documento removendo caracteres não numéricos', () => {
    expect(normalizeTaxId('529.982.247-25')).toBe('52998224725');
  });

  it('valida CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('529.982.247-24')).toBe(false);
  });

  it('valida CNPJ', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
  });

  it('valida automaticamente pelo tamanho do documento', () => {
    expect(isValidTaxId('52998224725')).toBe(true);
    expect(isValidTaxId('11222333000181')).toBe(true);
    expect(isValidTaxId('123')).toBe(false);
  });
});

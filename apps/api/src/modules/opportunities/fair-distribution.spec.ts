import { distributeFairly } from './fair-distribution';

describe('distributeFairly', () => {
  it('equilibra a fila considerando a carga já existente', () => {
    const result = distributeFairly([
      { id: 'lead-1', ownerUserId: null, createdAt: new Date('2026-01-01') },
      { id: 'lead-2', ownerUserId: null, createdAt: new Date('2026-01-02') },
      { id: 'lead-3', ownerUserId: null, createdAt: new Date('2026-01-03') },
    ], ['seller-a', 'seller-b'], { 'seller-a': 2, 'seller-b': 0 });

    expect([...result.assignments.values()]).toEqual(['seller-b', 'seller-b', 'seller-a']);
    expect(result.finalCounts).toEqual({ 'seller-a': 3, 'seller-b': 2 });
  });

  it('preserva responsáveis atuais quando a distribuição já está equilibrada', () => {
    const result = distributeFairly([
      { id: 'lead-a', ownerUserId: 'a', createdAt: new Date('2026-01-01') },
      { id: 'lead-b', ownerUserId: 'b', createdAt: new Date('2026-01-02') },
    ], ['a', 'b'], { a: 0, b: 0 });
    expect(result.assignments.get('lead-a')).toBe('a');
    expect(result.assignments.get('lead-b')).toBe('b');
  });

  it('mantém diferença máxima de uma oportunidade ao redistribuir tudo', () => {
    const items = Array.from({ length: 7 }, (_, index) => ({
      id: `lead-${index}`,
      ownerUserId: null,
      createdAt: new Date(2026, 0, index + 1),
    }));
    const result = distributeFairly(items, ['a', 'b', 'c'], { a: 0, b: 0, c: 0 });
    const counts = Object.values(result.finalCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

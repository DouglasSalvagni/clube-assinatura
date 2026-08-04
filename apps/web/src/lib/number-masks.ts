export function normalizeDecimal(value: string | number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(numeric)) return '';
  return Math.max(0, numeric).toFixed(decimals);
}

export function parseMaskedDecimal(raw: string, decimals = 2, max?: number): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const divisor = 10 ** decimals;
  let numeric = Number(digits) / divisor;
  if (typeof max === 'number') numeric = Math.min(max, numeric);
  return numeric.toFixed(decimals);
}

export function formatCurrencyInput(value: string | number | null | undefined): string {
  const normalized = normalizeDecimal(value, 2);
  if (!normalized) return '';
  return Number(normalized).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercentageInput(value: string | number | null | undefined): string {
  const normalized = normalizeDecimal(value, 2);
  if (!normalized) return '';
  return `${Number(normalized).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

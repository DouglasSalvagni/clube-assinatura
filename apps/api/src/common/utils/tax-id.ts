export function normalizeTaxId(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function isValidCpf(value: string): boolean {
  const normalized = normalizeTaxId(value);
  if (!/^\d{11}$/.test(normalized) || /^(\d)\1+$/.test(normalized)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(normalized[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(normalized[9]) && digit(10) === Number(normalized[10]);
}

export function isValidCnpj(value: string): boolean {
  const normalized = normalizeTaxId(value);
  if (!/^\d{14}$/.test(normalized) || /^(\d)\1+$/.test(normalized)) return false;
  const calculate = (base: string, weights: number[]) => {
    const sum = base.split('').reduce(
      (total, digit, index) => total + Number(digit) * weights[index],
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calculate(normalized.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculate(`${normalized.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(normalized[12]) && second === Number(normalized[13]);
}

export function isValidTaxId(value: string): boolean {
  const normalized = normalizeTaxId(value);
  return normalized.length === 11 ? isValidCpf(normalized) : normalized.length === 14 ? isValidCnpj(normalized) : false;
}

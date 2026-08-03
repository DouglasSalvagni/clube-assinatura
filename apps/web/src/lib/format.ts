export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR');
}

function digits(v: string | null | undefined): string {
  return (v || '').replace(/\D/g, '');
}

export function formatPhone(phone: string | null | undefined): string {
  const d = digits(phone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone || '-';
}

export function formatCpfCnpj(value: string | null | undefined): string {
  const d = digits(value);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return value || '-';
}

export function formatCep(cep: string | null | undefined): string {
  const d = digits(cep);
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return cep || '-';
}

export function maskCep(value: string): string {
  const d = digits(value).slice(0, 8);
  if (d.length > 5) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return d;
}

export function maskCpf(value: string): string {
  const d = digits(value).slice(0, 11);
  let masked = d;
  if (d.length > 3) masked = `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length > 6) masked = `${masked.slice(0, 7)}.${masked.slice(7)}`;
  if (d.length > 9) masked = `${masked.slice(0, 11)}-${masked.slice(11)}`;
  return masked;
}

export function maskPhone(value: string): string {
  const d = digits(value).slice(0, 11);
  if (d.length > 7) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length > 0) return `(${d}`;
  return d;
}

export function maskCnpj(value: string): string {
  const d = digits(value).slice(0, 14);
  let masked = d;
  if (d.length > 2) masked = `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length > 5) masked = `${masked.slice(0, 6)}.${masked.slice(6)}`;
  if (d.length > 8) masked = `${masked.slice(0, 10)}/${masked.slice(10)}`;
  if (d.length > 12) masked = `${masked.slice(0, 15)}-${masked.slice(15)}`;
  return masked;
}

export function maskCpfCnpj(value: string): string {
  const d = digits(value);
  if (d.length <= 11) return maskCpf(value);
  return maskCnpj(value);
}

export function stripMask(value: string): string {
  return value.replace(/\D/g, '');
}

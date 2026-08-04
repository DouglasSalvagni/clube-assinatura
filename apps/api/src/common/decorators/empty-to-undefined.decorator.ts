import { Transform } from 'class-transformer';

/**
 * Normaliza campos opcionais enviados por formulários HTML.
 * Selects sem valor normalmente chegam como string vazia, que não deve ser
 * submetida aos validadores de UUID dos DTOs opcionais.
 */
export function EmptyToUndefined(): PropertyDecorator {
  return Transform(({ value }) => (
    typeof value === 'string' && value.trim() === '' ? undefined : value
  ));
}

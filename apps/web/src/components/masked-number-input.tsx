import { FocusEvent, InputHTMLAttributes, KeyboardEvent } from 'react';
import {
  formatCurrencyInput,
  formatPercentageInput,
  parseMaskedDecimal,
} from '@/lib/number-masks';

type MaskedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string | number | null | undefined;
  onValueChange: (value: string) => void;
};

function selectValue(event: FocusEvent<HTMLInputElement>, callback?: MaskedInputProps['onFocus']) {
  event.currentTarget.select();
  callback?.(event);
}

export function CurrencyInput({ value, onValueChange, onFocus, className = '', ...props }: MaskedInputProps) {
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={formatCurrencyInput(value)}
      onFocus={(event) => selectValue(event, onFocus)}
      onChange={(event) => onValueChange(parseMaskedDecimal(event.target.value, 2))}
      className={className}
    />
  );
}

function handlePercentageKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  value: MaskedInputProps['value'],
  onValueChange: MaskedInputProps['onValueChange'],
  callback?: MaskedInputProps['onKeyDown'],
) {
  callback?.(event);
  if (event.defaultPrevented || event.key !== 'Backspace') return;

  const input = event.currentTarget;
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;

  // A exclusão normal funciona para seleções. O tratamento especial é necessário
  // somente quando o cursor está no fim, pois o sufixo % seria recriado no render.
  if (start !== end || end < input.value.length - 1) return;

  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return;

  event.preventDefault();
  onValueChange(parseMaskedDecimal(digits.slice(0, -1), 2, 100));
}

export function PercentageInput({ value, onValueChange, onFocus, onKeyDown, className = '', ...props }: MaskedInputProps) {
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={formatPercentageInput(value)}
      onFocus={(event) => selectValue(event, onFocus)}
      onChange={(event) => onValueChange(parseMaskedDecimal(event.target.value, 2, 100))}
      onKeyDown={(event) => handlePercentageKeyDown(event, value, onValueChange, onKeyDown)}
      className={className}
    />
  );
}

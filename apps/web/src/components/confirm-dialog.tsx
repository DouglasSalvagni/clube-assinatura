'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'brand';
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  /** If true, shows a textarea for user input (prompt mode) */
  prompt?: boolean;
  promptValue?: string;
  onPromptChange?: (value: string) => void;
  promptMinLength?: number;
  promptPlaceholder?: string;
  /** Disables confirm button (e.g., when minLength not met) */
  confirmDisabled?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  hideCancel = false,
  onConfirm,
  onCancel,
  prompt: showPrompt,
  promptValue = '',
  onPromptChange,
  promptMinLength,
  promptPlaceholder = '',
  confirmDisabled,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancel) onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  useEffect(() => {
    if (open && showPrompt && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open, showPrompt]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/20" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-sm rounded-lg border border-edge bg-surface p-6 shadow-sm"
      >
        {title && <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>}
        <p className="mb-4 text-sm text-ink-secondary">{message}</p>

        {showPrompt && (
          <div className="mb-4">
            <textarea
              ref={textareaRef}
              value={promptValue}
              onChange={(e) => onPromptChange?.(e.target.value)}
              placeholder={promptPlaceholder}
              rows={3}
              className="w-full resize-none rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {promptMinLength !== undefined && (
              <p className={`mt-1 text-xs ${promptValue.length >= promptMinLength ? 'text-success' : 'text-ink-tertiary'}`}>
                {promptValue.length}/{promptMinLength} caracteres mínimos
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          {!hideCancel && (
            <button
              onClick={onCancel}
              className="rounded-lg border border-edge bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-input"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              variant === 'danger'
                ? 'bg-danger hover:bg-danger/80'
                : 'bg-brand hover:bg-brand-dark'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

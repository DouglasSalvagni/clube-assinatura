'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ConfirmDialog from '@/components/confirm-dialog';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'brand';
}

interface PromptOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'brand';
  minLength?: number;
  placeholder?: string;
}

interface DialogContextType {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (message: string) => Promise<void>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType>(null!);

type State =
  | { type: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { type: 'alert'; opts: ConfirmOptions; resolve: () => void }
  | { type: 'prompt'; opts: PromptOptions & { promptValue: string }; resolve: (v: string | null) => void }
  | null;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ type: 'confirm', opts, resolve: resolve as (v: boolean) => void });
    });
  }, []);

  const alert = useCallback((message: string) => {
    return new Promise<void>((resolve) => {
      setState({ type: 'alert', opts: { message }, resolve: resolve as () => void });
    });
  }, []);

  const prompt = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setState({ type: 'prompt', opts: { ...opts, promptValue: '' }, resolve: resolve as (v: string | null) => void });
    });
  }, []);

  const handleClose = () => {
    setState(null);
  };

  const handleConfirm = () => {
    if (state?.type === 'confirm') (state as any).resolve(true);
    handleClose();
  };

  const handleCancel = () => {
    if (state?.type === 'confirm') (state as any).resolve(false);
    else if (state?.type === 'prompt') (state as any).resolve(null);
    handleClose();
  };

  const handleAlertOk = () => {
    (state as any)?.resolve();
    handleClose();
  };

  const handlePromptConfirm = () => {
    if (state?.type !== 'prompt') return;
    const val = (state.opts as any).promptValue || '';
    (state as any).resolve(val);
    handleClose();
  };

  const handlePromptChange = (value: string) => {
    if (state?.type !== 'prompt') return;
    setState({ ...state, opts: { ...state.opts, promptValue: value } });
  };

  const isPromptConfirmDisabled = state?.type === 'prompt'
    && ((state.opts as any).promptValue || '').length < ((state.opts as any).minLength || 0);

  return (
    <DialogContext.Provider value={{ confirm, alert, prompt }}>
      {children}
      {state?.type === 'confirm' && (
        <ConfirmDialog
          open
          title={state.opts.title}
          message={state.opts.message}
          confirmLabel={state.opts.confirmLabel}
          cancelLabel={state.opts.cancelLabel}
          variant={state.opts.variant}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
      {state?.type === 'alert' && (
        <ConfirmDialog
          open
          title="Aviso"
          message={state.opts.message}
          confirmLabel="OK"
          hideCancel
          onConfirm={handleAlertOk}
        />
      )}
      {state?.type === 'prompt' && (
        <ConfirmDialog
          open
          title={state.opts.title}
          message={state.opts.message}
          confirmLabel={state.opts.confirmLabel || 'Confirmar'}
          cancelLabel={state.opts.cancelLabel || 'Cancelar'}
          variant={state.opts.variant || 'danger'}
          onConfirm={handlePromptConfirm}
          onCancel={handleCancel}
          prompt
          promptValue={(state.opts as any).promptValue}
          onPromptChange={handlePromptChange}
          promptMinLength={state.opts.minLength}
          promptPlaceholder={state.opts.placeholder}
          confirmDisabled={isPromptConfirmDisabled}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  return useContext(DialogContext);
}

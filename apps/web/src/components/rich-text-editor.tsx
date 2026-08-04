'use client';

import { ChangeEvent, ClipboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  normalizeRichText,
  richTextToPlainText,
  sanitizeRichText,
} from '@/lib/rich-text';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  variables?: string[];
  disabled?: boolean;
  minHeight?: number;
};

type ToolbarButtonProps = {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onAction: () => void;
};

function ToolbarButton({ label, title, active, disabled, onAction }: ToolbarButtonProps) {
  function handleMouseDown(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    onAction();
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={handleMouseDown}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition ${
        active
          ? 'bg-brand text-white shadow-sm'
          : 'text-ink-secondary hover:bg-surface-canvas hover:text-ink'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {label}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  variables = [],
  disabled = false,
  minHeight = 360,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const normalizedVariables = useMemo(
    () => [...new Set(variables.map((item) => item.trim()).filter(Boolean))],
    [variables],
  );

  const plainText = useMemo(() => richTextToPlainText(value), [value]);
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;

  useEffect(() => {
    if (sourceMode || !editorRef.current) return;
    const nextHtml = sanitizeRichText(value);
    if (document.activeElement !== editorRef.current && editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
      savedSelectionRef.current = null;
    }
  }, [sourceMode, value]);

  useEffect(() => {
    function updateActiveFormats() {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) return;

      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      savedSelectionRef.current = range?.cloneRange() || null;

      const commands = ['bold', 'italic', 'underline', 'strikeThrough'];
      setActiveFormats(commands.filter((command) => document.queryCommandState(command)));
    }

    document.addEventListener('selectionchange', updateActiveFormats);
    return () => document.removeEventListener('selectionchange', updateActiveFormats);
  }, []);

  function emitEditorValue() {
    if (!editorRef.current) return;
    onChange(sanitizeRichText(editorRef.current.innerHTML));
  }

  function restoreSelection() {
    const editor = editorRef.current;
    const range = savedSelectionRef.current;
    if (!editor || !range) return;

    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function runCommand(command: string, commandValue?: string) {
    if (disabled || sourceMode) return;
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, commandValue);
    emitEditorValue();
  }

  function createLink() {
    if (disabled || sourceMode) return;
    const href = window.prompt('Cole o endereço do link:');
    if (!href) return;
    runCommand('createLink', href);
  }

  function insertVariable(event: ChangeEvent<HTMLSelectElement>) {
    const variable = event.target.value;
    event.target.value = '';
    if (!variable || disabled || sourceMode) return;
    runCommand('insertText', `{{${variable}}}`);
  }

  function toggleSourceMode() {
    if (disabled) return;
    onChange(sanitizeRichText(value));
    setSourceMode((current) => !current);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emitEditorValue();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface shadow-sm focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10">
      <div className="flex flex-wrap items-center gap-1 border-b border-edge bg-surface-elevated px-2 py-2">
        <select
          aria-label="Estilo do parágrafo"
          title="Estilo do parágrafo"
          defaultValue="p"
          disabled={disabled || sourceMode}
          onChange={(event) => {
            runCommand('formatBlock', event.target.value);
            event.target.value = 'p';
          }}
          className="h-8 rounded-md border border-edge bg-surface px-2 text-xs text-ink-secondary outline-none"
        >
          <option value="p">Parágrafo</option>
          <option value="h2">Título</option>
          <option value="h3">Subtítulo</option>
          <option value="blockquote">Citação</option>
        </select>

        <span className="mx-1 h-5 w-px bg-edge" />

        <ToolbarButton label="↶" title="Desfazer" disabled={disabled || sourceMode} onAction={() => runCommand('undo')} />
        <ToolbarButton label="↷" title="Refazer" disabled={disabled || sourceMode} onAction={() => runCommand('redo')} />
        <ToolbarButton label="B" title="Negrito" active={activeFormats.includes('bold')} disabled={disabled || sourceMode} onAction={() => runCommand('bold')} />
        <ToolbarButton label="I" title="Itálico" active={activeFormats.includes('italic')} disabled={disabled || sourceMode} onAction={() => runCommand('italic')} />
        <ToolbarButton label="U" title="Sublinhado" active={activeFormats.includes('underline')} disabled={disabled || sourceMode} onAction={() => runCommand('underline')} />
        <ToolbarButton label="S" title="Tachado" active={activeFormats.includes('strikeThrough')} disabled={disabled || sourceMode} onAction={() => runCommand('strikeThrough')} />

        <span className="mx-1 h-5 w-px bg-edge" />

        <ToolbarButton label="• Lista" title="Lista com marcadores" disabled={disabled || sourceMode} onAction={() => runCommand('insertUnorderedList')} />
        <ToolbarButton label="1. Lista" title="Lista numerada" disabled={disabled || sourceMode} onAction={() => runCommand('insertOrderedList')} />
        <ToolbarButton label="↤" title="Alinhar à esquerda" disabled={disabled || sourceMode} onAction={() => runCommand('justifyLeft')} />
        <ToolbarButton label="↔" title="Centralizar" disabled={disabled || sourceMode} onAction={() => runCommand('justifyCenter')} />
        <ToolbarButton label="↦" title="Alinhar à direita" disabled={disabled || sourceMode} onAction={() => runCommand('justifyRight')} />
        <ToolbarButton label="Link" title="Inserir link" disabled={disabled || sourceMode} onAction={createLink} />
        <ToolbarButton label="Limpar" title="Remover formatação" disabled={disabled || sourceMode} onAction={() => runCommand('removeFormat')} />

        <div className="ml-auto flex items-center gap-1">
          {normalizedVariables.length > 0 && (
            <select
              aria-label="Inserir variável"
              title="Inserir variável"
              defaultValue=""
              disabled={disabled || sourceMode}
              onChange={insertVariable}
              className="h-8 max-w-48 rounded-md border border-edge bg-surface px-2 text-xs text-ink-secondary outline-none"
            >
              <option value="">Inserir variável…</option>
              {normalizedVariables.map((variable) => (
                <option key={variable} value={variable}>{`{{${variable}}}`}</option>
              ))}
            </select>
          )}
          <ToolbarButton
            label={sourceMode ? 'Visual' : '</>'}
            title={sourceMode ? 'Voltar ao editor visual' : 'Editar HTML'}
            active={sourceMode}
            disabled={disabled}
            onAction={toggleSourceMode}
          />
        </div>
      </div>

      {sourceMode ? (
        <textarea
          value={normalizeRichText(value)}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          spellCheck={false}
          className="block w-full resize-y bg-surface px-4 py-4 font-mono text-sm leading-6 text-ink outline-none disabled:opacity-60"
          style={{ minHeight }}
        />
      ) : (
        <div
          ref={editorRef}
          role="textbox"
          aria-label="Conteúdo do contrato"
          aria-multiline="true"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emitEditorValue}
          onBlur={emitEditorValue}
          onPaste={handlePaste}
          className="rich-text-content overflow-y-auto bg-surface px-5 py-5 text-sm leading-7 text-ink outline-none"
          style={{ minHeight, maxHeight: Math.max(minHeight, 560) }}
        />
      )}

      <div className="flex items-center justify-between border-t border-edge bg-surface-elevated px-3 py-2 text-[11px] text-ink-tertiary">
        <span>Formatação visual com HTML seguro</span>
        <span>{wordCount} palavra(s) · {plainText.length} caractere(s)</span>
      </div>
    </div>
  );
}

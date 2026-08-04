'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { toCommercialCode } from '@/lib/commercial-identifiers';

type TemplateVersion = {
  id: string;
  version: number;
  status: string;
  content: string;
  variables: string[];
};

type Template = {
  id: string;
  code: string;
  name: string;
  customerType: 'PERSON' | 'COMPANY';
  versions: TemplateVersion[];
};

const defaultContent = `CONTRATO DE ADESÃO

Contratante: {{customer.name}}
CPF/CNPJ: {{customer.taxId}}
Valor contratado: R$ {{negotiation.pricing.finalAmount}}
Periodicidade: {{negotiation.cycle}}

Ao aceitar este documento, o contratante confirma os dados e as condições apresentadas.`;

const defaultVariables = [
  'customer.name',
  'customer.taxId',
  'negotiation.pricing.finalAmount',
  'negotiation.cycle',
];

export default function ContractTemplatesPage() {
  const { setPageTitle } = usePageTitle();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeEdited, setCodeEdited] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    code: '',
    customerType: 'PERSON',
  });
  const [versionForm, setVersionForm] = useState({
    content: defaultContent,
    variables: defaultVariables.join('\n'),
  });

  const load = useCallback(async () => {
    try {
      const result = await api('/commercial/contract-templates');
      setTemplates(result);
      if (!selectedId && result.length) setSelectedId(result[0].id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar modelos.');
    }
  }, [selectedId]);

  useEffect(() => {
    setPageTitle('Modelos contratuais', 'Documentos versionados usados nas ofertas e negociações.');
    load();
  }, [load, setPageTitle]);

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api('/commercial/contract-templates', {
        method: 'POST',
        body: JSON.stringify(templateForm),
      });
      setSelectedId(created.id);
      setTemplateForm({ name: '', code: '', customerType: 'PERSON' });
      setCodeEdited(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao criar modelo.');
    } finally {
      setBusy(false);
    }
  }

  async function createVersion(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      await api(`/commercial/contract-templates/${selectedId}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          content: versionForm.content,
          variables: versionForm.variables
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao criar versão.');
    } finally {
      setBusy(false);
    }
  }

  async function publish(templateId: string, versionId: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/commercial/contract-templates/${templateId}/versions/${versionId}/publish`, {
        method: 'POST',
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao publicar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-8">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Novo modelo</h2>
        <form onSubmit={createTemplate} className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="font-medium">Nome</span>
            <input
              required
              value={templateForm.name}
              onChange={e => setTemplateForm({
                ...templateForm,
                name: e.target.value,
                code: codeEdited ? templateForm.code : toCommercialCode(e.target.value),
              })}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Identificador interno</span>
            <input
              placeholder="Gerado automaticamente"
              value={templateForm.code}
              onChange={e => { setCodeEdited(true); setTemplateForm({ ...templateForm, code: toCommercialCode(e.target.value) }); }}
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono"
            />
            <small className="mt-1 block text-xs text-ink-tertiary">Usado para versionamento e integrações; normalmente não precisa ser alterado.</small>
          </label>
          <select value={templateForm.customerType} onChange={e => setTemplateForm({ ...templateForm, customerType: e.target.value })} className="rounded-lg border px-3 py-2">
            <option value="PERSON">Pessoa física</option>
            <option value="COMPANY">Pessoa jurídica</option>
          </select>
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-3">Criar modelo</button>
        </form>
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Nova versão</h2>
        <form onSubmit={createVersion} className="mt-4 space-y-3">
          <select required value={selectedId} onChange={e => setSelectedId(e.target.value)} className="w-full rounded-lg border px-3 py-2">
            <option value="">Selecione um modelo</option>
            {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
          <label className="block text-sm">
            <span className="font-medium">Conteúdo</span>
            <textarea required rows={14} value={versionForm.content} onChange={e => setVersionForm({ ...versionForm, content: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Variáveis permitidas, uma por linha</span>
            <textarea required rows={6} value={versionForm.variables} onChange={e => setVersionForm({ ...versionForm, variables: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm" />
          </label>
          <button disabled={busy || !selectedId} className="rounded-lg bg-brand px-4 py-2 text-white disabled:opacity-50">Criar versão</button>
        </form>
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Modelos cadastrados</h2>
        <div className="mt-4 space-y-4">
          {templates.map(template => (
            <article key={template.id} className="rounded-lg border p-4">
              <h3 className="font-medium">{template.name}</h3>
              <p className="text-xs text-ink-tertiary">{template.code} · {template.customerType === 'PERSON' ? 'PF' : 'PJ'}</p>
              <div className="mt-3 space-y-2">
                {template.versions.map(version => (
                  <div key={version.id} className="flex items-center justify-between rounded-lg bg-surface-canvas p-3 text-sm">
                    <span>Versão {version.version} · {version.status}</span>
                    {version.status !== 'PUBLISHED' && (
                      <button disabled={busy} onClick={() => publish(template.id, version.id)} className="rounded-md border px-3 py-1 text-xs">Publicar</button>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

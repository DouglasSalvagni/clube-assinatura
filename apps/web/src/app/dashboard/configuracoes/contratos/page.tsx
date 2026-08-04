'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { toCommercialCode } from '@/lib/commercial-identifiers';
import RichTextEditor from '@/components/rich-text-editor';
import { hasRichTextContent, sanitizeRichText } from '@/lib/rich-text';

type TemplateVersion = {
  id: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  content: string;
  variables: string[];
  publishedAt?: string | null;
};

type Template = {
  id: string;
  code: string;
  name: string;
  customerType: 'PERSON' | 'COMPANY';
  active: boolean;
  versions: TemplateVersion[];
};

const defaultContent = `<h2>CONTRATO DE ADESÃO</h2>
<p><strong>Contratante:</strong> {{customer.name}}<br>
<strong>CPF/CNPJ:</strong> {{customer.taxId}}<br>
<strong>Valor contratado:</strong> R$ {{negotiation.pricing.finalAmount}}<br>
<strong>Periodicidade:</strong> {{negotiation.cycle}}</p>
<p>Ao aceitar este documento, o contratante confirma os dados e as condições apresentadas.</p>`;

const defaultVariables = [
  'customer.name',
  'customer.taxId',
  'negotiation.pricing.finalAmount',
  'negotiation.cycle',
];

const statusLabel: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicada',
  RETIRED: 'Revogada',
};

const emptyTemplateForm = {
  name: '',
  code: '',
  customerType: 'PERSON' as 'PERSON' | 'COMPANY',
};

export default function ContractTemplatesPage() {
  const { setPageTitle } = usePageTitle();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<{ templateId: string; versionId: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeEdited, setCodeEdited] = useState(false);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [versionForm, setVersionForm] = useState({
    content: defaultContent,
    variables: defaultVariables.join('\n'),
  });

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) || null,
    [templates, selectedId],
  );

  const editorVariables = useMemo(
    () => versionForm.variables
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
    [versionForm.variables],
  );

  const load = useCallback(async () => {
    try {
      const result = await api('/commercial/contract-templates');
      const items = (Array.isArray(result) ? result : result?.data || []) as Template[];
      setTemplates(items);
      setSelectedId((current) => current && items.some((template) => template.id === current)
        ? current
        : items.find((template) => template.active)?.id || items[0]?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar modelos.');
    }
  }, []);

  useEffect(() => {
    setPageTitle('Modelos contratuais', 'Documentos versionados usados nas ofertas e negociações.');
    void load();
  }, [load, setPageTitle]);

  function resetTemplateForm() {
    setEditingTemplateId(null);
    setCodeEdited(false);
    setTemplateForm(emptyTemplateForm);
  }

  function resetVersionForm() {
    setEditingVersion(null);
    setVersionForm({ content: defaultContent, variables: defaultVariables.join('\n') });
  }

  function changeTemplateName(name: string) {
    setTemplateForm((current) => ({
      ...current,
      name,
      code: codeEdited ? current.code : toCommercialCode(name),
    }));
  }

  function editTemplate(template: Template) {
    setEditingTemplateId(template.id);
    setSelectedId(template.id);
    setCodeEdited(true);
    setTemplateForm({
      name: template.name,
      code: template.code,
      customerType: template.customerType,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const path = editingTemplateId
        ? `/commercial/contract-templates/${editingTemplateId}`
        : '/commercial/contract-templates';
      const saved = await api(path, {
        method: editingTemplateId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...templateForm,
          code: templateForm.code || undefined,
          active: true,
        }),
      });
      setSelectedId(saved.id);
      setSuccess(editingTemplateId ? 'Modelo contratual atualizado.' : 'Modelo criado. Agora crie e publique ao menos uma versão.');
      resetTemplateForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar modelo.');
    } finally {
      setBusy(false);
    }
  }

  function editVersion(templateId: string, version: TemplateVersion) {
    setSelectedId(templateId);
    setEditingVersion({ templateId, versionId: version.id });
    setVersionForm({
      content: version.content,
      variables: version.variables.join('\n'),
    });
    window.scrollTo({ top: 360, behavior: 'smooth' });
  }

  async function saveVersion(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    if (!hasRichTextContent(versionForm.content)) {
      setError('Informe o conteúdo do contrato antes de salvar a versão.');
      return;
    }

    const sanitizedContent = sanitizeRichText(versionForm.content);
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        content: sanitizedContent,
        variables: versionForm.variables
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      };
      if (editingVersion) {
        await api(`/commercial/contract-templates/${editingVersion.templateId}/versions/${editingVersion.versionId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setSuccess('Rascunho contratual atualizado.');
      } else {
        await api(`/commercial/contract-templates/${selectedId}/versions`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setSuccess('Versão criada como rascunho. Publique-a para disponibilizá-la nas ofertas.');
      }
      resetVersionForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar versão.');
    } finally {
      setBusy(false);
    }
  }

  async function publish(templateId: string, versionId: string) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api(`/commercial/contract-templates/${templateId}/versions/${versionId}/publish`, {
        method: 'POST',
      });
      setSuccess('Versão publicada. Ela já pode ser vinculada a uma versão de preço compatível.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao publicar.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeTemplate(template: Template) {
    if (!window.confirm(`Revogar o modelo “${template.name}”? Novas ofertas não poderão utilizá-lo, mas contratos existentes serão preservados.`)) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api(`/commercial/contract-templates/${template.id}/revoke`, { method: 'POST' });
      setSuccess('Modelo revogado. Contratos e ofertas já vinculados foram preservados.');
      if (editingTemplateId === template.id) resetTemplateForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao revogar modelo.');
    } finally {
      setBusy(false);
    }
  }

  async function restoreTemplate(template: Template) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api(`/commercial/contract-templates/${template.id}/restore`, { method: 'POST' });
      setSuccess('Modelo contratual reativado.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao reativar modelo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <nav className="flex flex-wrap gap-2 rounded-xl border border-edge bg-surface-elevated p-2 text-sm">
        <a href="#modelos-cadastrados" className="rounded-lg px-3 py-2 text-ink-secondary hover:bg-surface-canvas hover:text-ink">Modelos cadastrados</a>
        <a href="#cadastro-modelo" className="rounded-lg px-3 py-2 text-ink-secondary hover:bg-surface-canvas hover:text-ink">Criar ou editar modelo</a>
        <a href="#versao-contratual" className="rounded-lg px-3 py-2 text-ink-secondary hover:bg-surface-canvas hover:text-ink">Criar versão contratual</a>
      </nav>

      <section id="cadastro-modelo" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{editingTemplateId ? 'Editar modelo' : 'Novo modelo'}</h2>
            <p className="mt-1 text-sm text-ink-tertiary">O modelo define o público e agrupa as versões imutáveis do documento.</p>
          </div>
          {editingTemplateId && <button type="button" onClick={resetTemplateForm} className="text-sm text-ink-tertiary">Cancelar edição</button>}
        </div>
        <form onSubmit={saveTemplate} className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="font-medium">Nome do modelo</span>
            <input
              required
              value={templateForm.name}
              onChange={(event) => changeTemplateName(event.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Identificador interno</span>
            <input
              placeholder="Gerado automaticamente"
              value={templateForm.code}
              onChange={(event) => {
                setCodeEdited(true);
                setTemplateForm({ ...templateForm, code: toCommercialCode(event.target.value) });
              }}
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono"
            />
            <small className="mt-1 block text-xs text-ink-tertiary">Usado em integrações e auditoria; normalmente não precisa ser alterado.</small>
          </label>
          <label className="text-sm">
            <span className="font-medium">Tipo de contratação</span>
            <select
              value={templateForm.customerType}
              onChange={(event) => setTemplateForm({ ...templateForm, customerType: event.target.value as 'PERSON' | 'COMPANY' })}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="PERSON">Pessoa física</option>
              <option value="COMPANY">Pessoa jurídica</option>
            </select>
          </label>
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-3 disabled:opacity-50">
            {editingTemplateId ? 'Salvar alterações' : 'Criar modelo'}
          </button>
        </form>
      </section>

      <section id="versao-contratual" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{editingVersion ? 'Editar versão em rascunho' : 'Nova versão contratual'}</h2>
            <p className="mt-1 text-sm text-ink-tertiary">Somente versões publicadas aparecem no cadastro de preços. Depois de publicada, uma versão não pode ser alterada.</p>
          </div>
          {editingVersion && <button type="button" onClick={resetVersionForm} className="text-sm text-ink-tertiary">Cancelar edição</button>}
        </div>
        <form onSubmit={saveVersion} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="font-medium">Modelo</span>
            <select
              required
              value={selectedId}
              onChange={(event) => { setSelectedId(event.target.value); setEditingVersion(null); }}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              disabled={Boolean(editingVersion)}
            >
              <option value="">Selecione um modelo ativo</option>
              {templates.filter((template) => template.active).map((template) => (
                <option key={template.id} value={template.id}>{template.name} — {template.customerType === 'PERSON' ? 'Pessoa física' : 'Pessoa jurídica'}</option>
              ))}
            </select>
          </label>
          {selectedTemplate && !selectedTemplate.active && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Este modelo está revogado. Reative-o para criar ou publicar novas versões.</div>
          )}
          <div className="block text-sm">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <span className="font-medium">Conteúdo do contrato</span>
                <p className="mt-0.5 text-xs text-ink-tertiary">
                  Use a barra de ferramentas para estruturar o documento e insira variáveis sem precisar digitá-las.
                </p>
              </div>
              <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand">
                Editor visual
              </span>
            </div>
            <RichTextEditor
              value={versionForm.content}
              onChange={(content) => setVersionForm((current) => ({ ...current, content }))}
              variables={editorVariables}
              disabled={busy}
              minHeight={390}
            />
          </div>
          <label className="block text-sm">
            <span className="font-medium">Variáveis permitidas, uma por linha</span>
            <textarea required rows={6} value={versionForm.variables} onChange={(event) => setVersionForm({ ...versionForm, variables: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm" />
            <small className="mt-1 block text-xs text-ink-tertiary">Toda variável usada como {'{{variavel}}'} no conteúdo precisa constar nesta lista.</small>
          </label>
          <button disabled={busy || !selectedId || !selectedTemplate?.active} className="rounded-lg bg-brand px-4 py-2 text-white disabled:opacity-50">
            {editingVersion ? 'Salvar rascunho' : 'Criar versão em rascunho'}
          </button>
        </form>
      </section>

      <section id="modelos-cadastrados" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Modelos cadastrados</h2>
          <span className="text-sm text-ink-tertiary">{templates.length} modelo(s)</span>
        </div>
        <div className="mt-4 space-y-4">
          {templates.map((template) => (
            <article key={template.id} className={`rounded-lg border p-4 ${template.active ? '' : 'opacity-65'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{template.name}</h3>
                    <span className="rounded-full bg-surface-canvas px-2 py-0.5 text-xs">{template.active ? 'Ativo' : 'Revogado'}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-tertiary">{template.code} · {template.customerType === 'PERSON' ? 'Pessoa física' : 'Pessoa jurídica'}</p>
                </div>
                <div className="flex gap-2">
                  {template.active ? (
                    <>
                      <button type="button" onClick={() => editTemplate(template)} className="rounded-md border px-3 py-1 text-xs">Editar</button>
                      <button type="button" onClick={() => revokeTemplate(template)} className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-700">Revogar</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => restoreTemplate(template)} className="rounded-md border px-3 py-1 text-xs">Reativar</button>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {template.versions.map((version) => (
                  <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-canvas p-3 text-sm">
                    <div>
                      <span>Versão {version.version} · {statusLabel[version.status] || version.status}</span>
                      {version.status === 'PUBLISHED' && <p className="mt-0.5 text-xs text-green-700">Disponível para vincular em Ofertas e preços.</p>}
                    </div>
                    <div className="flex gap-2">
                      {template.active && version.status === 'DRAFT' && (
                        <>
                          <button disabled={busy} onClick={() => editVersion(template.id, version)} className="rounded-md border px-3 py-1 text-xs">Editar rascunho</button>
                          <button disabled={busy} onClick={() => publish(template.id, version.id)} className="rounded-md border px-3 py-1 text-xs">Publicar</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {!template.versions.length && (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Este modelo ainda não possui versões. Crie uma versão acima e publique-a.</p>
                )}
              </div>
            </article>
          ))}
          {!templates.length && <p className="text-sm text-ink-tertiary">Nenhum modelo contratual cadastrado.</p>}
        </div>
      </section>
    </div>
  );
}

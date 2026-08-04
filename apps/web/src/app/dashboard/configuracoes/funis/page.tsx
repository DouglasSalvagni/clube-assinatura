'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { commercialStatusLabels } from '@/lib/commercial-labels';
import { toCommercialCode } from '@/lib/commercial-identifiers';

type Stage = {
  id: string;
  code: string;
  name: string;
  position: number;
  commercialStatus: string | null;
  active: boolean;
};

type Pipeline = {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
  stages: Stage[];
};

const statuses = Object.keys(commercialStatusLabels);

export default function PipelinesPage() {
  const { setPageTitle } = usePageTitle();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [codeEdited, setCodeEdited] = useState(false);
  const [pipelineForm, setPipelineForm] = useState({ name: '', isDefault: false, active: true });
  const [stageForm, setStageForm] = useState({
    name: '',
    code: '',
    position: '1',
    commercialStatus: '',
    active: true,
  });

  const selected = useMemo(
    () => pipelines.find((pipeline) => pipeline.id === selectedId) || null,
    [pipelines, selectedId],
  );

  const load = useCallback(async () => {
    try {
      const result = await api('/commercial/pipelines');
      const items = Array.isArray(result) ? result : result.data || [];
      setPipelines(items);
      setSelectedId((current) => current && items.some((item: Pipeline) => item.id === current)
        ? current
        : items[0]?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar funis.');
    }
  }, []);

  useEffect(() => {
    setPageTitle('Funis comerciais', 'Etapas configuráveis usadas no Kanban.');
    load();
  }, [load, setPageTitle]);

  function resetPipelineForm() {
    setEditingPipelineId(null);
    setPipelineForm({ name: '', isDefault: false, active: true });
  }

  function resetStageForm(nextPosition?: number) {
    setEditingStageId(null);
    setCodeEdited(false);
    setStageForm({
      name: '',
      code: '',
      position: String(nextPosition ?? ((selected?.stages.length || 0) + 1)),
      commercialStatus: '',
      active: true,
    });
  }

  async function savePipeline(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const path = editingPipelineId
        ? `/commercial/pipelines/${editingPipelineId}`
        : '/commercial/pipelines';
      const saved = await api(path, {
        method: editingPipelineId ? 'PATCH' : 'POST',
        body: JSON.stringify(pipelineForm),
      });
      setSelectedId(saved.id);
      setSuccess(editingPipelineId ? 'Funil atualizado.' : 'Funil criado.');
      resetPipelineForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar funil.');
    } finally {
      setBusy(false);
    }
  }

  async function saveStage(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const path = editingStageId
        ? `/commercial/pipelines/${selectedId}/stages/${editingStageId}`
        : `/commercial/pipelines/${selectedId}/stages`;
      await api(path, {
        method: editingStageId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...stageForm,
          code: stageForm.code || undefined,
          commercialStatus: stageForm.commercialStatus || undefined,
          position: Number(stageForm.position),
        }),
      });
      setSuccess(editingStageId ? 'Etapa atualizada.' : 'Etapa criada.');
      resetStageForm((selected?.stages.length || 0) + 1);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar etapa.');
    } finally {
      setBusy(false);
    }
  }

  function editPipeline(pipeline: Pipeline) {
    setEditingPipelineId(pipeline.id);
    setPipelineForm({ name: pipeline.name, isDefault: pipeline.isDefault, active: pipeline.active });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editStage(pipeline: Pipeline, stage: Stage) {
    setSelectedId(pipeline.id);
    setEditingStageId(stage.id);
    setCodeEdited(true);
    setStageForm({
      name: stage.name,
      code: stage.code,
      position: String(stage.position),
      commercialStatus: stage.commercialStatus || '',
      active: stage.active,
    });
  }

  async function archivePipeline(pipeline: Pipeline) {
    if (!window.confirm(`Arquivar o funil “${pipeline.name}” e suas etapas?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/commercial/pipelines/${pipeline.id}`, { method: 'DELETE' });
      setSuccess('Funil arquivado. O histórico das oportunidades foi preservado.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao arquivar funil.');
    } finally {
      setBusy(false);
    }
  }

  async function archiveStage(pipeline: Pipeline, stage: Stage) {
    if (!window.confirm(`Arquivar a etapa “${stage.name}”?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/commercial/pipelines/${pipeline.id}/stages/${stage.id}`, { method: 'DELETE' });
      setSuccess('Etapa arquivada. Oportunidades vinculadas aparecerão em “Sem etapa”.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao arquivar etapa.');
    } finally {
      setBusy(false);
    }
  }

  function changeStageName(name: string) {
    setStageForm((current) => ({
      ...current,
      name,
      code: codeEdited ? current.code : toCommercialCode(name),
    }));
  }

  return (
    <div className="space-y-6 p-8">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{editingPipelineId ? 'Editar funil' : 'Novo funil'}</h2>
          {editingPipelineId && <button type="button" onClick={resetPipelineForm} className="text-sm text-ink-tertiary">Cancelar edição</button>}
        </div>
        <form onSubmit={savePipeline} className="mt-4 grid gap-3 md:grid-cols-2">
          <input required placeholder="Nome do funil" value={pipelineForm.name} onChange={e => setPipelineForm({ ...pipelineForm, name: e.target.value })} className="rounded-lg border px-3 py-2" />
          <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <input type="checkbox" checked={pipelineForm.isDefault} onChange={e => setPipelineForm({ ...pipelineForm, isDefault: e.target.checked })} />
            Definir como funil padrão
          </label>
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-2 disabled:opacity-50">
            {editingPipelineId ? 'Salvar alterações' : 'Criar funil'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{editingStageId ? 'Editar etapa' : 'Nova etapa'}</h2>
          {editingStageId && <button type="button" onClick={() => resetStageForm()} className="text-sm text-ink-tertiary">Cancelar edição</button>}
        </div>
        <form onSubmit={saveStage} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm md:col-span-2">
            <span className="font-medium">Funil</span>
            <select required value={selectedId} onChange={e => { setSelectedId(e.target.value); resetStageForm(); }} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="">Selecione um funil</option>
              {pipelines.filter(pipeline => pipeline.active).map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">Nome da etapa</span>
            <input required placeholder="Ex.: Proposta enviada" value={stageForm.name} onChange={e => changeStageName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="font-medium">Identificador interno</span>
            <input
              placeholder="Gerado automaticamente"
              value={stageForm.code}
              onChange={e => { setCodeEdited(true); setStageForm({ ...stageForm, code: toCommercialCode(e.target.value) }); }}
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono"
            />
            <small className="mt-1 block text-xs text-ink-tertiary">Usado pela API e integrações. Normalmente não precisa ser alterado.</small>
          </label>
          <label className="text-sm">
            <span className="font-medium">Ordem no Kanban</span>
            <input required type="number" min="0" value={stageForm.position} onChange={e => setStageForm({ ...stageForm, position: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="font-medium">Efeito automático ao entrar na etapa</span>
            <select value={stageForm.commercialStatus} onChange={e => setStageForm({ ...stageForm, commercialStatus: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="">Não alterar o status da negociação</option>
              {statuses.map(status => <option key={status} value={status}>{commercialStatusLabels[status]}</option>)}
            </select>
            <small className="mt-1 block text-xs text-ink-tertiary">Esse vínculo permite que uma mudança de coluna atualize regras como aprovação, checkout e conversão.</small>
          </label>
          <button disabled={busy || !selectedId} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-2 disabled:opacity-50">
            {editingStageId ? 'Salvar etapa' : 'Criar etapa'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Funis configurados</h2>
        <div className="mt-4 space-y-4">
          {pipelines.map(pipeline => (
            <article key={pipeline.id} className={`rounded-lg border p-4 ${pipeline.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{pipeline.name}</h3>
                  {pipeline.isDefault && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">Padrão</span>}
                  {!pipeline.active && <span className="rounded-full bg-surface-canvas px-2 py-0.5 text-xs text-ink-tertiary">Arquivado</span>}
                </div>
                {pipeline.active && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => editPipeline(pipeline)} className="rounded-md border px-3 py-1 text-xs">Editar</button>
                    <button type="button" onClick={() => archivePipeline(pipeline)} className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-700">Arquivar</button>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {pipeline.stages.map(stage => (
                  <div key={stage.id} className={`rounded-lg border bg-surface-canvas px-3 py-2 text-sm ${stage.active ? '' : 'opacity-50'}`}>
                    <div>
                      <strong>{stage.position}. {stage.name}</strong>
                      <span className="ml-2 text-xs text-ink-tertiary">{stage.commercialStatus ? commercialStatusLabels[stage.commercialStatus] : 'Sem alteração automática'}</span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-ink-tertiary">{stage.code}</p>
                    {pipeline.active && stage.active && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => editStage(pipeline, stage)} className="text-xs text-brand">Editar</button>
                        <button type="button" onClick={() => archiveStage(pipeline, stage)} className="text-xs text-red-700">Arquivar</button>
                      </div>
                    )}
                  </div>
                ))}
                {!pipeline.stages.length && <p className="text-sm text-ink-tertiary">Nenhuma etapa cadastrada.</p>}
              </div>
            </article>
          ))}
          {!pipelines.length && <p className="text-sm text-ink-tertiary">Nenhum funil cadastrado.</p>}
        </div>
      </section>
    </div>
  );
}

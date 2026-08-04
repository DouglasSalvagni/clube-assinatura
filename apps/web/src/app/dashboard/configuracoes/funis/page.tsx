'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';

type Stage = { id: string; code: string; name: string; position: number; commercialStatus: string | null };
type Pipeline = { id: string; name: string; isDefault: boolean; stages: Stage[] };

const statuses = ['DRAFT', 'NEGOTIATION', 'PENDING_APPROVAL', 'APPROVED', 'CHECKOUT_SENT', 'CONVERTED', 'LOST'];

export default function PipelinesPage() {
  const { setPageTitle } = usePageTitle();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pipelineForm, setPipelineForm] = useState({ name: '', isDefault: false });
  const [stageForm, setStageForm] = useState({
    name: '',
    code: '',
    position: '0',
    commercialStatus: 'NEGOTIATION',
  });

  const load = useCallback(async () => {
    try {
      const result = await api('/commercial/pipelines');
      setPipelines(result);
      if (!selectedId && result.length) setSelectedId(result[0].id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar funis.');
    }
  }, [selectedId]);

  useEffect(() => {
    setPageTitle('Funis comerciais', 'Etapas configuráveis usadas no Kanban.');
    load();
  }, [load, setPageTitle]);

  async function createPipeline(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api('/commercial/pipelines', {
        method: 'POST',
        body: JSON.stringify(pipelineForm),
      });
      setSelectedId(created.id);
      setPipelineForm({ name: '', isDefault: false });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao criar funil.');
    } finally {
      setBusy(false);
    }
  }

  async function createStage(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      await api(`/commercial/pipelines/${selectedId}/stages`, {
        method: 'POST',
        body: JSON.stringify({
          ...stageForm,
          position: Number(stageForm.position),
        }),
      });
      setStageForm({ name: '', code: '', position: String((pipelines.find(item => item.id === selectedId)?.stages.length || 0) + 1), commercialStatus: 'NEGOTIATION' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao criar etapa.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-8">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Novo funil</h2>
        <form onSubmit={createPipeline} className="mt-4 grid gap-3 md:grid-cols-2">
          <input required placeholder="Nome do funil" value={pipelineForm.name} onChange={e => setPipelineForm({ ...pipelineForm, name: e.target.value })} className="rounded-lg border px-3 py-2" />
          <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <input type="checkbox" checked={pipelineForm.isDefault} onChange={e => setPipelineForm({ ...pipelineForm, isDefault: e.target.checked })} />
            Definir como funil padrão
          </label>
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-2">Criar funil</button>
        </form>
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Nova etapa</h2>
        <form onSubmit={createStage} className="mt-4 grid gap-3 md:grid-cols-2">
          <select required value={selectedId} onChange={e => setSelectedId(e.target.value)} className="rounded-lg border px-3 py-2 md:col-span-2">
            <option value="">Selecione um funil</option>
            {pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
          </select>
          <input required placeholder="Nome da etapa" value={stageForm.name} onChange={e => setStageForm({ ...stageForm, name: e.target.value })} className="rounded-lg border px-3 py-2" />
          <input required placeholder="Código" value={stageForm.code} onChange={e => setStageForm({ ...stageForm, code: e.target.value })} className="rounded-lg border px-3 py-2" />
          <input required type="number" min="0" placeholder="Posição" value={stageForm.position} onChange={e => setStageForm({ ...stageForm, position: e.target.value })} className="rounded-lg border px-3 py-2" />
          <select value={stageForm.commercialStatus} onChange={e => setStageForm({ ...stageForm, commercialStatus: e.target.value })} className="rounded-lg border px-3 py-2">
            {statuses.map(status => <option key={status}>{status}</option>)}
          </select>
          <button disabled={busy || !selectedId} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-2 disabled:opacity-50">Criar etapa</button>
        </form>
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Funis configurados</h2>
        <div className="mt-4 space-y-4">
          {pipelines.map(pipeline => (
            <article key={pipeline.id} className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{pipeline.name}</h3>
                {pipeline.isDefault && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">Padrão</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {pipeline.stages.map(stage => (
                  <div key={stage.id} className="rounded-lg border bg-surface-canvas px-3 py-2 text-sm">
                    <strong>{stage.position}. {stage.name}</strong>
                    <span className="ml-2 text-xs text-ink-tertiary">{stage.commercialStatus || '—'}</span>
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

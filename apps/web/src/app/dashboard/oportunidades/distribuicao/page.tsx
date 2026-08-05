'use client';

import { DragEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { useDialog } from '@/lib/dialog-context';
import { PageSkeleton } from '@/components/page-skeleton';

type UnitRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'SALES';

interface TeamSummary {
  id: string;
  name: string;
  managerId: string | null;
  activeOpportunities: number;
  queueOpportunities: number;
}

interface DistributionMember {
  userId: string;
  name: string;
  email: string;
  role: UnitRole;
  isManager: boolean;
  activeCount: number;
}

interface DistributionOpportunity {
  id: string;
  name: string;
  customerType: 'PERSON' | 'COMPANY';
  commercialStatus: string;
  status: string;
  expectedValue: number;
  ownerUserId: string | null;
  ownerName: string | null;
  createdAt: string;
}

interface DashboardData {
  team: {
    id: string;
    name: string;
    managerId: string | null;
    managerManagesMultipleTeams: boolean;
  };
  members: DistributionMember[];
  opportunities: DistributionOpportunity[];
  summary: { total: number; queue: number; assigned: number };
}

const roleLabels: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  SALES: 'Negociador',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  NEGOTIATION: 'Em negociação',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovada',
  CHECKOUT_SENT: 'Checkout enviado',
};

const formatMoney = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL',
});

export default function OpportunityDistributionPage() {
  const router = useRouter();
  const { setPageTitle } = usePageTitle();
  const { alert, confirm } = useDialog();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [teamId, setTeamId] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualOwnerId, setManualOwnerId] = useState('');
  const [includeManager, setIncludeManager] = useState(false);
  const [autoMode, setAutoMode] = useState<'QUEUE_ONLY' | 'REBALANCE_ALL'>('QUEUE_ONLY');
  const [autoUseSelection, setAutoUseSelection] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);

  useEffect(() => {
    setPageTitle('Distribuição de oportunidades', 'Distribua filas de times manualmente ou por equilíbrio de carga.');
    if (!localStorage.getItem('accessToken')) router.push('/login');
  }, [router, setPageTitle]);

  const loadTeams = useCallback(async () => {
    try {
      const response = await api('/oportunidades/distribution/teams');
      const items = (response?.data || []) as TeamSummary[];
      setTeams(items);
      const requestedTeamId = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('teamId')
        : null;
      setTeamId((current) => current || (requestedTeamId && items.some((item) => item.id === requestedTeamId) ? requestedTeamId : items[0]?.id || ''));
    } catch (reason) {
      await alert(reason instanceof Error ? reason.message : 'Não foi possível carregar os times.');
    } finally {
      setLoading(false);
    }
  }, [alert]);

  const loadDashboard = useCallback(async (selectedTeamId: string) => {
    if (!selectedTeamId) { setData(null); return; }
    setLoading(true);
    try {
      const response = await api(`/oportunidades/distribution/teams/${selectedTeamId}`);
      setData(response as DashboardData);
      setSelected(new Set());
      setManualOwnerId('');
    } catch (reason) {
      setData(null);
      await alert(reason instanceof Error ? reason.message : 'Não foi possível carregar a distribuição.');
    } finally {
      setLoading(false);
    }
  }, [alert]);

  useEffect(() => { loadTeams(); }, [loadTeams]);
  useEffect(() => { if (teamId) loadDashboard(teamId); }, [teamId, loadDashboard]);

  const filteredOpportunities = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data?.opportunities || [];
    return (data?.opportunities || []).filter((item) =>
      item.name.toLowerCase().includes(query)
      || item.ownerName?.toLowerCase().includes(query)
      || statusLabels[item.commercialStatus]?.toLowerCase().includes(query),
    );
  }, [data, search]);

  const opportunitiesByOwner = useMemo(() => {
    const result = new Map<string, DistributionOpportunity[]>();
    result.set('QUEUE', []);
    result.set('UNAVAILABLE', []);
    for (const member of data?.members || []) result.set(member.userId, []);
    for (const opportunity of filteredOpportunities) {
      const key = !opportunity.ownerUserId
        ? 'QUEUE'
        : result.has(opportunity.ownerUserId)
          ? opportunity.ownerUserId
          : 'UNAVAILABLE';
      result.get(key)!.push(opportunity);
    }
    return result;
  }, [data, filteredOpportunities]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((current) => current.size === filteredOpportunities.length
      ? new Set()
      : new Set(filteredOpportunities.map((item) => item.id)));
  }

  async function manualAssign(ownerUserId: string | null, opportunityIds?: string[]) {
    const ids = opportunityIds?.length ? opportunityIds : [...selected];
    if (!teamId || !ids.length) {
      await alert('Selecione ao menos uma oportunidade.');
      return;
    }
    setSaving(true);
    try {
      const response = await api('/oportunidades/distribution/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ teamId, opportunityIds: ids, ownerUserId }),
      });
      setData(response.dashboard as DashboardData);
      setSelected(new Set());
      setDraggingIds([]);
    } catch (reason) {
      await alert(reason instanceof Error ? reason.message : 'Não foi possível distribuir as oportunidades.');
    } finally {
      setSaving(false);
    }
  }

  async function automaticDistribution() {
    if (!teamId) return;
    const ids = autoUseSelection ? [...selected] : [];
    if (autoUseSelection && !ids.length) {
      await alert('Selecione as oportunidades que devem participar da distribuição automática.');
      return;
    }
    const description = autoUseSelection
      ? `${ids.length} oportunidade(s) selecionada(s)`
      : autoMode === 'REBALANCE_ALL'
        ? 'todas as oportunidades ativas do time, inclusive as já atribuídas'
        : 'somente as oportunidades da fila sem responsável';
    const accepted = await confirm({
      title: 'Distribuição automática',
      message: `O sistema distribuirá ${description} priorizando quem possui menor carga. Continuar?`,
      confirmLabel: 'Distribuir',
      variant: 'brand',
    });
    if (!accepted) return;

    setSaving(true);
    try {
      const response = await api('/oportunidades/distribution/auto', {
        method: 'POST',
        body: JSON.stringify({
          teamId,
          includeManager,
          mode: autoMode,
          ...(ids.length ? { opportunityIds: ids } : {}),
        }),
      });
      setData(response.dashboard as DashboardData);
      setSelected(new Set());
      await alert(`Distribuição concluída. ${response.changed} oportunidade(s) tiveram o responsável alterado.`);
    } catch (reason) {
      await alert(reason instanceof Error ? reason.message : 'Não foi possível executar a distribuição automática.');
    } finally {
      setSaving(false);
    }
  }

  function startDrag(event: DragEvent<HTMLDivElement>, opportunityId: string) {
    const ids = selected.has(opportunityId) ? [...selected] : [opportunityId];
    if (!selected.has(opportunityId)) setSelected(new Set([opportunityId]));
    setDraggingIds(ids);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify(ids));
  }

  async function dropOn(event: DragEvent<HTMLDivElement>, ownerUserId: string | null) {
    event.preventDefault();
    let ids = draggingIds;
    try {
      const parsed = JSON.parse(event.dataTransfer.getData('application/json')) as string[];
      if (Array.isArray(parsed) && parsed.length) ids = parsed;
    } catch { /* usa estado local */ }
    await manualAssign(ownerUserId, ids);
  }

  if (loading && !data) return <PageSkeleton variant="cards" />;

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Distribuição de oportunidades</h1>
          <p className="mt-1 text-sm text-ink-tertiary">Gerentes administram os times pelos quais são responsáveis. Administradores podem distribuir qualquer time da sede.</p>
        </div>
        <button onClick={() => router.push('/dashboard/oportunidades')} className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-secondary hover:text-ink">
          Voltar às oportunidades
        </button>
      </div>

      <div className="mb-6 grid gap-4 rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm lg:grid-cols-[minmax(240px,1fr)_2fr]">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Time</label>
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink">
            {teams.length === 0 && <option value="">Nenhum time disponível</option>}
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name} — {team.queueOpportunities} na fila</option>)}
          </select>
          {data?.team.managerManagesMultipleTeams && <p className="mt-2 text-xs text-brand">O gerente deste time também gerencia outros times. Cada fila permanece independente.</p>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Summary label="Total ativo" value={data?.summary.total || 0} />
          <Summary label="Na fila" value={data?.summary.queue || 0} />
          <Summary label="Atribuídas" value={data?.summary.assigned || 0} />
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Atribuição manual em massa</label>
            <div className="flex gap-2">
              <select value={manualOwnerId} onChange={(event) => setManualOwnerId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink">
                <option value="">Devolver para a fila do time</option>
                {data?.members.map((member) => <option key={member.userId} value={member.userId}>{member.name} ({member.activeCount})</option>)}
              </select>
              <button disabled={saving || selected.size === 0} onClick={() => manualAssign(manualOwnerId || null)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                Atribuir {selected.size || ''}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Distribuição automática equilibrada</label>
            <div className="flex flex-wrap gap-2">
              <select value={autoMode} onChange={(event) => setAutoMode(event.target.value as typeof autoMode)} disabled={autoUseSelection} className="rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink disabled:opacity-60">
                <option value="QUEUE_ONLY">Distribuir somente a fila</option>
                <option value="REBALANCE_ALL">Reequilibrar todo o time</option>
              </select>
              <button disabled={saving || !data?.members.length} onClick={automaticDistribution} className="rounded-lg border border-brand bg-brand/10 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/15 disabled:opacity-50">
                Distribuir automaticamente
              </button>
            </div>
          </div>
          <div className="flex flex-col justify-end gap-2 text-sm text-ink-secondary">
            <label className="flex items-center gap-2"><input type="checkbox" checked={includeManager} onChange={(event) => setIncludeManager(event.target.checked)} /> Incluir gerente na divisão</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={autoUseSelection} onChange={(event) => setAutoUseSelection(event.target.checked)} /> Usar somente a seleção</label>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-tertiary">O algoritmo considera a carga ativa atual. Na fila, cada novo lead vai para quem possui menos oportunidades. “Reequilibrar todo o time” pode alterar responsáveis já definidos.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lead, responsável ou status..." className="min-w-[260px] flex-1 rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink" />
        <button onClick={selectAllVisible} className="rounded-lg border border-edge px-3 py-2 text-sm text-ink-secondary">{selected.size === filteredOpportunities.length && filteredOpportunities.length ? 'Limpar seleção' : 'Selecionar visíveis'}</button>
        <span className="text-sm text-ink-tertiary">{selected.size} selecionada(s)</span>
      </div>

      <div className="overflow-x-auto pb-5">
        <div className="flex min-w-max gap-4">
          <DistributionColumn title="Fila do time" subtitle="Sem responsável individual" count={opportunitiesByOwner.get('QUEUE')?.length || 0} highlighted={draggingIds.length > 0} onDrop={(event) => dropOn(event, null)}>
            {(opportunitiesByOwner.get('QUEUE') || []).map((item) => <OpportunityCard key={item.id} item={item} selected={selected.has(item.id)} onToggle={() => toggleSelected(item.id)} onDragStart={(event) => startDrag(event, item.id)} onDragEnd={() => setDraggingIds([])} />)}
          </DistributionColumn>
          {(opportunitiesByOwner.get('UNAVAILABLE')?.length || 0) > 0 && (
            <DistributionColumn title="Responsável indisponível" subtitle="Usuário removido ou sem perfil comercial ativo" count={opportunitiesByOwner.get('UNAVAILABLE')?.length || 0} highlighted={draggingIds.length > 0} onDrop={(event) => dropOn(event, null)}>
              {(opportunitiesByOwner.get('UNAVAILABLE') || []).map((item) => <OpportunityCard key={item.id} item={item} selected={selected.has(item.id)} onToggle={() => toggleSelected(item.id)} onDragStart={(event) => startDrag(event, item.id)} onDragEnd={() => setDraggingIds([])} />)}
            </DistributionColumn>
          )}
          {data?.members.map((member) => (
            <DistributionColumn key={member.userId} title={member.name} subtitle={`${roleLabels[member.role] || member.role}${member.isManager ? ' · Gerente do time' : ''}`} count={opportunitiesByOwner.get(member.userId)?.length || 0} highlighted={draggingIds.length > 0} onDrop={(event) => dropOn(event, member.userId)}>
              {(opportunitiesByOwner.get(member.userId) || []).map((item) => <OpportunityCard key={item.id} item={item} selected={selected.has(item.id)} onToggle={() => toggleSelected(item.id)} onDragStart={(event) => startDrag(event, item.id)} onDragEnd={() => setDraggingIds([])} />)}
            </DistributionColumn>
          ))}
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-surface-canvas/60 p-3"><p className="text-xl font-semibold text-ink">{value}</p><p className="text-xs text-ink-tertiary">{label}</p></div>;
}

function DistributionColumn({ title, subtitle, count, children, onDrop, highlighted }: {
  title: string;
  subtitle: string;
  count: number;
  children: ReactNode;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  highlighted: boolean;
}) {
  return (
    <div onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop} className={`flex h-[calc(100vh-25rem)] min-h-[420px] w-[310px] flex-col rounded-xl border bg-surface-elevated shadow-sm transition ${highlighted ? 'border-brand/50' : 'border-edge'}`}>
      <div className="border-b border-edge p-4"><div className="flex items-center justify-between"><h2 className="font-semibold text-ink">{title}</h2><span className="rounded-full bg-surface-canvas px-2 py-0.5 text-xs text-ink-secondary">{count}</span></div><p className="mt-1 text-xs text-ink-tertiary">{subtitle}</p></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">{children || <p className="rounded-lg border border-dashed border-edge p-5 text-center text-xs text-ink-muted">Arraste oportunidades para cá.</p>}</div>
    </div>
  );
}

function OpportunityCard({ item, selected, onToggle, onDragStart, onDragEnd }: {
  item: DistributionOpportunity;
  selected: boolean;
  onToggle: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className={`cursor-grab rounded-lg border p-3 shadow-sm active:cursor-grabbing ${selected ? 'border-brand bg-brand/5' : 'border-edge bg-surface-canvas/40'}`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={selected} onChange={onToggle} onClick={(event) => event.stopPropagation()} className="mt-1" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{item.name}</p>
          <p className="mt-1 text-xs text-ink-tertiary">{statusLabels[item.commercialStatus] || item.commercialStatus}</p>
          <div className="mt-2 flex items-center justify-between text-xs"><span className="text-ink-muted">{item.customerType === 'COMPANY' ? 'Pessoa jurídica' : 'Pessoa física'}</span><span className="font-medium text-ink-secondary">{formatMoney(item.expectedValue)}</span></div>
        </div>
      </div>
    </div>
  );
}

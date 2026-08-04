'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';

const labels: Record<string, string> = {
  DRAFT: 'Rascunho',
  NEGOTIATION: 'Em negociação',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovada',
  CHECKOUT_SENT: 'Checkout enviado',
  CONVERTED: 'Convertida',
  LOST: 'Perdida',
};

interface Opportunity {
  id: string;
  nome: string;
  customerType: 'PERSON' | 'COMPANY';
  commercialStatus: string;
  ownerUserId: string | null;
  teamId: string | null;
  valor: number;
  createdAt: string;
}

interface Column {
  id: string;
  name: string;
  status: string | null;
  position: number;
  items: Opportunity[];
}

interface Team { id: string; name: string }
interface User { id: string; name: string }

export default function OpportunitiesKanbanPage() {
  const router = useRouter();
  const { setPageTitle } = usePageTitle();
  const [columns, setColumns] = useState<Column[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    teamId: '',
    ownerUserId: '',
    customerType: '',
    commercialStatus: '',
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api(`/oportunidades/board/kanban${query ? `?${query}` : ''}`);
      setColumns(response.columns ?? []);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar o quadro.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    setPageTitle('Kanban comercial', 'Oportunidades disponíveis conforme seu escopo de acesso.');
    if (!localStorage.getItem('accessToken')) {
      router.push('/login');
      return;
    }
    Promise.all([
      api('/times').catch(() => ({ data: [] })),
      api('/users').catch(() => ({ data: [] })),
    ]).then(([teamsResult, usersResult]) => {
      setTeams(teamsResult.data || []);
      setUsers(usersResult.data || []);
    });
  }, [router, setPageTitle]);

  useEffect(() => {
    load();
  }, [load]);

  async function move(opportunityId: string, stageId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(stageId)) return;
    setMoving(opportunityId);
    setError('');
    try {
      await api(`/oportunidades/${opportunityId}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stageId }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível mover a oportunidade.');
    } finally {
      setMoving('');
    }
  }

  return (
    <div className="space-y-5 p-8">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-surface-elevated p-4">
        <label className="text-xs text-ink-tertiary">
          Time
          <select value={filters.teamId} onChange={e => setFilters({ ...filters, teamId: e.target.value })} className="mt-1 block rounded-lg border px-3 py-2 text-sm text-ink">
            <option value="">Todos</option>
            {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-tertiary">
          Responsável
          <select value={filters.ownerUserId} onChange={e => setFilters({ ...filters, ownerUserId: e.target.value })} className="mt-1 block rounded-lg border px-3 py-2 text-sm text-ink">
            <option value="">Todos</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-tertiary">
          Tipo
          <select value={filters.customerType} onChange={e => setFilters({ ...filters, customerType: e.target.value })} className="mt-1 block rounded-lg border px-3 py-2 text-sm text-ink">
            <option value="">PF e PJ</option>
            <option value="PERSON">Pessoa física</option>
            <option value="COMPANY">Pessoa jurídica</option>
          </select>
        </label>
        <label className="text-xs text-ink-tertiary">
          Situação
          <select value={filters.commercialStatus} onChange={e => setFilters({ ...filters, commercialStatus: e.target.value })} className="mt-1 block rounded-lg border px-3 py-2 text-sm text-ink">
            <option value="">Todas</option>
            {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button onClick={() => router.push('/dashboard/oportunidades')} className="ml-auto rounded-lg border border-edge px-3 py-2 text-sm text-ink-secondary">
          Ver lista
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-ink-tertiary">Carregando quadro...</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <section
              key={column.id}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                const opportunityId = event.dataTransfer.getData('text/opportunity-id');
                if (opportunityId) move(opportunityId, column.id);
              }}
              className="w-80 shrink-0 rounded-xl border border-edge bg-surface-elevated"
            >
              <header className="flex items-center justify-between border-b border-edge px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">
                  {column.name || labels[column.status || ''] || column.status}
                </h2>
                <span className="rounded-full bg-surface-canvas px-2 py-0.5 text-xs text-ink-tertiary">
                  {column.items.length}
                </span>
              </header>
              <div className="min-h-32 space-y-3 p-3">
                {column.items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-ink-muted">Nenhuma oportunidade</p>
                ) : column.items.map((item) => (
                  <button
                    key={item.id}
                    draggable
                    disabled={moving === item.id}
                    onDragStart={event => event.dataTransfer.setData('text/opportunity-id', item.id)}
                    onClick={() => router.push(`/dashboard/oportunidades/${item.id}/negociacao`)}
                    className="block w-full rounded-lg border border-edge bg-surface-canvas p-3 text-left transition hover:border-brand/40 disabled:opacity-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-sm font-medium text-ink">{item.nome}</strong>
                      <span className="text-[10px] font-medium text-ink-tertiary">
                        {item.customerType === 'COMPANY' ? 'PJ' : 'PF'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-brand">
                      {Number(item.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-tertiary">
                      {labels[item.commercialStatus] || item.commercialStatus}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

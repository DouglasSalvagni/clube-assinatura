'use client';

import { CSSProperties, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { useAuth } from '@/lib/auth-context';
import { KanbanSkeleton } from '@/components/page-skeleton';

const labels: Record<string, string> = {
  DRAFT: 'Rascunho',
  NEGOTIATION: 'Em negociação',
  PENDING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovada',
  CHECKOUT_SENT: 'Checkout enviado',
  CONVERTED: 'Convertida',
  LOST: 'Perdida',
};

const columnAccents = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#06b6d4', '#22c55e', '#ef4444'];

interface Opportunity {
  id: string;
  nome: string;
  customerType: 'PERSON' | 'COMPANY';
  commercialStatus: string;
  ownerUserId: string | null;
  teamId: string | null;
  assignmentMode?: 'INDIVIDUAL' | 'TEAM_QUEUE' | 'UNASSIGNED';
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

type DragSnapshot = {
  columns: Column[];
  sourceColumnId: string;
};

function cloneColumns(columns: Column[]) {
  return columns.map((column) => ({ ...column, items: [...column.items] }));
}

function isStageId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';

  const difference = Math.max(0, Date.now() - date.getTime());
  const days = Math.floor(difference / 86_400_000);
  if (days === 0) return 'Criada hoje';
  if (days === 1) return 'Criada há 1 dia';
  if (days < 30) return `Criada há ${days} dias`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Criada há 1 mês' : `Criada há ${months} meses`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function OpportunitiesKanbanPage() {
  const router = useRouter();
  const { setPageTitle } = usePageTitle();
  const { user } = useAuth();
  const boardRef = useRef<HTMLDivElement>(null);
  const draggedIdRef = useRef('');
  const dragSnapshotRef = useRef<DragSnapshot | null>(null);
  const dropHandledRef = useRef(false);

  const [columns, setColumns] = useState<Column[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState('');
  const [draggedId, setDraggedId] = useState('');
  const [activeColumnId, setActiveColumnId] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    teamId: '',
    ownerUserId: '',
    customerType: '',
    commercialStatus: '',
  });

  const selectedUnitId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') || localStorage.getItem('unitId') : null;
  const currentMembership = user?.memberships?.find((item) => item.active && item.unitId === selectedUnitId)
    || user?.memberships?.find((item) => item.active);
  const canDistribute = Boolean(user?.is_platform_admin || ['OWNER', 'ADMIN', 'MANAGER'].includes(currentMembership?.role || ''));

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });
    return params.toString();
  }, [filters]);

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user.name])),
    [users],
  );
  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams],
  );
  const totalItems = useMemo(
    () => columns.reduce((total, column) => total + column.items.length, 0),
    [columns],
  );
  const totalValue = useMemo(
    () => columns.reduce(
      (total, column) => total + column.items.reduce((columnTotal, item) => columnTotal + Number(item.valor || 0), 0),
      0,
    ),
    [columns],
  );

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
    void load();
  }, [load]);

  function relocateCard(opportunityId: string, targetColumnId: string, requestedIndex: number) {
    setColumns((current) => {
      const sourceColumnIndex = current.findIndex((column) => column.items.some((item) => item.id === opportunityId));
      const targetColumnIndex = current.findIndex((column) => column.id === targetColumnId);
      if (sourceColumnIndex < 0 || targetColumnIndex < 0) return current;

      const sourceItemIndex = current[sourceColumnIndex].items.findIndex((item) => item.id === opportunityId);
      let targetIndex = requestedIndex;

      if (sourceColumnIndex === targetColumnIndex && sourceItemIndex < targetIndex) {
        targetIndex -= 1;
      }

      if (sourceColumnIndex === targetColumnIndex && sourceItemIndex === targetIndex) {
        return current;
      }

      const next = cloneColumns(current);
      const [item] = next[sourceColumnIndex].items.splice(sourceItemIndex, 1);
      const targetItems = next[targetColumnIndex].items;
      targetItems.splice(Math.max(0, Math.min(targetIndex, targetItems.length)), 0, item);
      return next;
    });
  }

  function scrollColumnDuringDrag(event: DragEvent<HTMLElement>) {
    const scrollContainer = event.currentTarget.closest('[data-kanban-column-scroll]') as HTMLElement | null;
    if (!scrollContainer) return;

    const bounds = scrollContainer.getBoundingClientRect();
    const edge = 64;
    if (event.clientY < bounds.top + edge) scrollContainer.scrollTop -= 14;
    if (event.clientY > bounds.bottom - edge) scrollContainer.scrollTop += 14;
  }

  function handleCardDragStart(event: DragEvent<HTMLElement>, item: Opportunity) {
    const sourceColumn = columns.find((column) => column.items.some((candidate) => candidate.id === item.id));
    if (!sourceColumn || moving) {
      event.preventDefault();
      return;
    }

    dragSnapshotRef.current = {
      columns: cloneColumns(columns),
      sourceColumnId: sourceColumn.id,
    };
    dropHandledRef.current = false;
    draggedIdRef.current = item.id;
    setDraggedId(item.id);
    setActiveColumnId(sourceColumn.id);

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/opportunity-id', item.id);
    event.dataTransfer.setData('text/source-column-id', sourceColumn.id);

    const ghost = event.currentTarget.cloneNode(true) as HTMLElement;
    ghost.style.position = 'fixed';
    ghost.style.top = '-1000px';
    ghost.style.left = '-1000px';
    ghost.style.width = `${event.currentTarget.getBoundingClientRect().width}px`;
    ghost.style.transform = 'rotate(2deg)';
    ghost.style.boxShadow = '0 24px 50px rgba(15, 23, 42, 0.22)';
    ghost.style.background = 'hsl(var(--surface))';
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 36, 28);
    window.setTimeout(() => ghost.remove(), 0);
  }

  function scrollBoardDuringDrag(clientX: number) {
    if (!boardRef.current) return;
    const bounds = boardRef.current.getBoundingClientRect();
    const edge = 96;
    if (clientX < bounds.left + edge) boardRef.current.scrollLeft -= 18;
    if (clientX > bounds.right - edge) boardRef.current.scrollLeft += 18;
  }

  function handleCardDragOver(
    event: DragEvent<HTMLElement>,
    targetColumnId: string,
    targetIndex: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const opportunityId = draggedIdRef.current;
    if (!opportunityId || moving) return;

    event.dataTransfer.dropEffect = 'move';
    setActiveColumnId(targetColumnId);
    scrollColumnDuringDrag(event);
    scrollBoardDuringDrag(event.clientX);

    const bounds = event.currentTarget.getBoundingClientRect();
    const insertAfter = event.clientY > bounds.top + bounds.height / 2;
    relocateCard(opportunityId, targetColumnId, targetIndex + (insertAfter ? 1 : 0));
  }

  function handleColumnDragOver(event: DragEvent<HTMLDivElement>, column: Column) {
    event.preventDefault();
    const opportunityId = draggedIdRef.current;
    if (!opportunityId || moving) return;

    event.dataTransfer.dropEffect = isStageId(column.id) ? 'move' : 'none';
    setActiveColumnId(column.id);
    scrollColumnDuringDrag(event);
    scrollBoardDuringDrag(event.clientX);

    const cards = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[data-kanban-card]'),
    ).filter((card) => card.dataset.opportunityId !== opportunityId);

    const nextCard = cards.find((card) => {
      const bounds = card.getBoundingClientRect();
      return event.clientY < bounds.top + bounds.height / 2;
    });
    const requestedIndex = nextCard
      ? column.items.findIndex((item) => item.id === nextCard.dataset.opportunityId)
      : column.items.length;

    relocateCard(
      opportunityId,
      column.id,
      requestedIndex < 0 ? column.items.length : requestedIndex,
    );
  }

  async function persistDrop(opportunityId: string, targetColumnId: string) {
    const snapshot = dragSnapshotRef.current;
    if (!snapshot) return;

    if (!isStageId(targetColumnId)) {
      setColumns(cloneColumns(snapshot.columns));
      setError('A coluna “Sem etapa” não aceita movimentações. Solte o card em uma etapa configurada.');
      return;
    }

    if (snapshot.sourceColumnId === targetColumnId) return;

    setMoving(opportunityId);
    setError('');
    try {
      const updated = await api(`/oportunidades/${opportunityId}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stageId: targetColumnId }),
      });

      setColumns((current) => current.map((column) => ({
        ...column,
        items: column.items.map((item) => (
          item.id === opportunityId
            ? {
              ...item,
              commercialStatus: updated?.commercialStatus || column.status || item.commercialStatus,
            }
            : item
        )),
      })));
    } catch (reason) {
      setColumns(cloneColumns(snapshot.columns));
      setError(reason instanceof Error ? reason.message : 'Não foi possível mover a oportunidade.');
    } finally {
      setMoving('');
      dragSnapshotRef.current = null;
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetColumnId: string) {
    event.preventDefault();
    event.stopPropagation();

    const opportunityId = draggedIdRef.current || event.dataTransfer.getData('text/opportunity-id');
    if (!opportunityId) return;

    dropHandledRef.current = true;
    draggedIdRef.current = '';
    setDraggedId('');
    setActiveColumnId('');
    void persistDrop(opportunityId, targetColumnId);
  }

  function handleDragEnd() {
    if (!dropHandledRef.current && dragSnapshotRef.current) {
      setColumns(cloneColumns(dragSnapshotRef.current.columns));
    }

    dropHandledRef.current = false;
    dragSnapshotRef.current = null;
    draggedIdRef.current = '';
    setDraggedId('');
    setActiveColumnId('');
  }

  function handleBoardDragOver(event: DragEvent<HTMLDivElement>) {
    if (!draggedIdRef.current) return;
    scrollBoardDuringDrag(event.clientX);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[640px] min-w-0 flex-col overflow-hidden px-6 pb-5 pt-5">
      {error && (
        <div className="mb-4 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <div className="mb-4 shrink-0 rounded-2xl border border-edge bg-surface-elevated p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-40 flex-1 text-xs font-medium text-ink-tertiary md:max-w-52">
            Time
            <select
              value={filters.teamId}
              onChange={(event) => setFilters({ ...filters, teamId: event.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-brand/10"
            >
              <option value="">Todos</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="min-w-40 flex-1 text-xs font-medium text-ink-tertiary md:max-w-52">
            Responsável
            <select
              value={filters.ownerUserId}
              onChange={(event) => setFilters({ ...filters, ownerUserId: event.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-brand/10"
            >
              <option value="">Todos</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label className="min-w-36 flex-1 text-xs font-medium text-ink-tertiary md:max-w-44">
            Tipo
            <select
              value={filters.customerType}
              onChange={(event) => setFilters({ ...filters, customerType: event.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-brand/10"
            >
              <option value="">PF e PJ</option>
              <option value="PERSON">Pessoa física</option>
              <option value="COMPANY">Pessoa jurídica</option>
            </select>
          </label>
          <label className="min-w-44 flex-1 text-xs font-medium text-ink-tertiary md:max-w-56">
            Situação
            <select
              value={filters.commercialStatus}
              onChange={(event) => setFilters({ ...filters, commercialStatus: event.target.value })}
              className="mt-1.5 block w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-brand/10"
            >
              <option value="">Todas</option>
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right lg:block">
              <p className="text-xs text-ink-tertiary">{totalItems} oportunidade(s)</p>
              <p className="text-sm font-semibold text-ink">{formatCurrency(totalValue)}</p>
            </div>
            {canDistribute && (
              <button
                onClick={() => router.push('/dashboard/oportunidades/distribuicao')}
                className="rounded-lg border border-brand/30 bg-brand/5 px-3.5 py-2 text-sm font-medium text-brand transition hover:bg-brand/10"
              >
                Distribuir
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard/oportunidades')}
              className="rounded-lg border border-edge bg-surface px-3.5 py-2 text-sm font-medium text-ink-secondary transition hover:border-edge-emphasis hover:text-ink"
            >
              Ver lista
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <KanbanSkeleton />
      ) : columns.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-edge bg-surface-elevated p-8 text-center">
          <div>
            <p className="font-medium text-ink">Nenhuma etapa disponível</p>
            <p className="mt-1 text-sm text-ink-tertiary">Configure um funil comercial ou ajuste os filtros do quadro.</p>
          </div>
        </div>
      ) : (
        <div
          ref={boardRef}
          onDragOver={handleBoardDragOver}
          className="kanban-board-scroll min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-2"
        >
          <div className="flex h-full min-h-[520px] w-max gap-4 pr-6">
            {columns.map((column, columnIndex) => {
              const accent = columnAccents[columnIndex % columnAccents.length];
              const columnValue = column.items.reduce((total, item) => total + Number(item.valor || 0), 0);
              const isActive = activeColumnId === column.id;
              const acceptsDrop = isStageId(column.id);

              return (
                <section
                  key={column.id}
                  className={`flex h-full max-h-full w-[340px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-surface-elevated shadow-sm transition-all duration-200 ${
                    isActive
                      ? acceptsDrop
                        ? 'border-brand/50 shadow-lg shadow-brand/10 ring-2 ring-brand/10'
                        : 'border-warning/50 ring-2 ring-warning/10'
                      : 'border-edge'
                  }`}
                  style={{ borderTopColor: accent, borderTopWidth: 3 } as CSSProperties}
                >
                  <header className="shrink-0 border-b border-edge bg-surface-elevated px-4 pb-3 pt-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                          <h2 className="truncate text-sm font-semibold text-ink">
                            {column.name || labels[column.status || ''] || column.status}
                          </h2>
                        </div>
                        <p className="mt-1.5 pl-[18px] text-xs text-ink-tertiary">
                          {formatCurrency(columnValue)}
                        </p>
                      </div>
                      <span className="flex h-7 min-w-7 items-center justify-center rounded-full border border-edge bg-surface px-2 text-xs font-semibold text-ink-secondary">
                        {column.items.length}
                      </span>
                    </div>
                  </header>

                  <div
                    data-kanban-column-scroll
                    onDragOver={(event) => handleColumnDragOver(event, column)}
                    onDrop={(event) => handleDrop(event, column.id)}
                    className={`kanban-column-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 transition-colors ${
                      isActive ? 'bg-brand/[0.025]' : ''
                    }`}
                  >
                    {column.items.length === 0 ? (
                      <div className={`flex min-h-36 flex-1 items-center justify-center rounded-xl border border-dashed p-5 text-center transition ${
                        isActive ? 'border-brand/40 bg-brand/5' : 'border-edge bg-surface-canvas/50'
                      }`}>
                        <div>
                          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-muted shadow-sm">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                            </svg>
                          </div>
                          <p className="mt-2 text-xs font-medium text-ink-tertiary">
                            {acceptsDrop ? 'Solte uma oportunidade aqui' : 'Nenhuma oportunidade'}
                          </p>
                        </div>
                      </div>
                    ) : column.items.map((item, itemIndex) => {
                      const ownerName = item.ownerUserId ? userById.get(item.ownerUserId) : null;
                      const teamName = item.teamId ? teamById.get(item.teamId) : null;
                      const responsibilityLabel = ownerName || (teamName ? `Fila: ${teamName}` : 'Sem atribuição');
                      const responsibilityDetail = ownerName
                        ? (teamName || 'Atribuição individual')
                        : teamName
                          ? 'Fila compartilhada do time'
                          : 'Visível somente para administradores';
                      const isDragging = draggedId === item.id;
                      const isSaving = moving === item.id;

                      return (
                        <article
                          key={item.id}
                          data-kanban-card
                          data-opportunity-id={item.id}
                          draggable={!moving}
                          onDragStart={(event) => handleCardDragStart(event, item)}
                          onDragOver={(event) => handleCardDragOver(event, column.id, itemIndex)}
                          onDrop={(event) => handleDrop(event, column.id)}
                          onDragEnd={handleDragEnd}
                          className={`group relative cursor-grab rounded-xl border bg-surface p-3.5 shadow-sm transition-all duration-200 active:cursor-grabbing ${
                            isDragging
                              ? 'scale-[0.98] border-brand/40 opacity-35 shadow-none'
                              : 'border-edge hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md'
                          } ${isSaving ? 'pointer-events-none opacity-60' : ''}`}
                        >
                          <div className="absolute left-0 top-4 h-8 w-1 rounded-r-full" style={{ backgroundColor: accent }} />

                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => router.push(`/dashboard/oportunidades/${item.id}/negociacao`)}
                            className="block w-full text-left disabled:cursor-wait"
                          >
                            <div className="flex items-start justify-between gap-3 pl-1.5">
                              <div className="min-w-0">
                                <strong className="block truncate text-sm font-semibold text-ink">{item.nome}</strong>
                                <p className="mt-1 text-[11px] text-ink-tertiary">
                                  {formatCreatedAt(item.createdAt)}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-md border border-edge bg-surface-canvas px-1.5 py-0.5 text-[10px] font-semibold text-ink-tertiary">
                                {item.customerType === 'COMPANY' ? 'PJ' : 'PF'}
                              </span>
                            </div>

                            <div className="mt-3 rounded-lg bg-surface-canvas px-3 py-2.5">
                              <p className="text-[10px] font-medium uppercase tracking-wide text-ink-tertiary">Valor potencial</p>
                              <p className="mt-0.5 text-base font-bold tracking-tight text-brand">
                                {formatCurrency(item.valor)}
                              </p>
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand/15 bg-brand/10 text-[10px] font-bold text-brand">
                                  {initials(responsibilityLabel)}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-medium text-ink-secondary">
                                    {responsibilityLabel}
                                  </p>
                                  <p className="truncate text-[10px] text-ink-tertiary">
                                    {responsibilityDetail}
                                  </p>
                                </div>
                              </div>
                              <svg className="h-4 w-4 shrink-0 text-ink-muted opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                              </svg>
                            </div>
                          </button>

                          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-edge pt-2.5">
                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/oportunidades/${item.id}`)}
                              className="rounded-lg px-2 py-1.5 text-xs font-medium text-ink-secondary transition hover:bg-surface-canvas hover:text-ink"
                            >
                              Cadastro
                            </button>
                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/oportunidades/${item.id}/negociacao`)}
                              className="rounded-lg bg-brand/10 px-2 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/15"
                            >
                              Negociação
                            </button>
                          </div>

                          {isSaving && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-surface/70 backdrop-blur-[1px]">
                              <div className="h-6 w-6 animate-spin rounded-full border-2 border-edge border-t-brand" />
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>

                  <footer className="flex shrink-0 items-center justify-between border-t border-edge bg-surface-elevated px-4 py-2 text-[10px] text-ink-tertiary">
                    <span>{acceptsDrop ? 'Arraste para reorganizar' : 'Coluna informativa'}</span>
                    <span className="font-medium">{labels[column.status || ''] || ''}</span>
                  </footer>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

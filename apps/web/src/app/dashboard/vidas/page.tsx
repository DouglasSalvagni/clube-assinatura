'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { formatPhone, formatCpfCnpj } from '@/lib/format';
import { PageSkeleton } from '@/components/page-skeleton';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

interface Vida {
  id: string;
  asaas_id: string;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  data_nascimento: string;
  cidade: string;
  estado: string;
  status: string;
  tipo: 'Titular' | 'Dependente';
}

interface PageData {
  data: Vida[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  ativos: number;
  pendentes: number;
  inadimplentes: number;
  inativos: number;
  ativosTit: number;
  ativosDep: number;
  inadTit: number;
  inadDep: number;
  inatTit: number;
  inatDep: number;
  totalTit: number;
  totalDep: number;
  estados: string[];
}

const statusMeta: Record<string, { label: string; colors: string }> = {
  ACTIVE: { label: 'Ativo', colors: 'border-success/20 bg-success/10 text-success' },
  PENDING: { label: 'Aguardando pagamento', colors: 'border-warning/20 bg-warning/10 text-warning' },
  DELINQUENT: { label: 'Inadimplente', colors: 'border-danger/20 bg-danger/10 text-danger' },
  INACTIVE: { label: 'Inativo', colors: 'border-ink-muted/20 bg-ink-muted/10 text-ink-tertiary' },
};

export default function VidasPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const { setPageTitle } = usePageTitle();
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [subscriptionFilter, setSubscriptionFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');

  useEffect(() => {
    setPageTitle('Vidas', 'Gerencie os clientes vinculados ao seu plano.');
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/login'); return; }
    setLoaded(true);
  }, [router, setPageTitle]);

  const load = useCallback(async (p: number, q: string, st: string, sub: string, uf: string) => {
    try {
      const params = new URLSearchParams({ page: String(p), limit: '15' });
      if (q) params.set('search', q);
      if (st) params.set('status', st);
      if (sub) params.set('subscription', sub);
      if (uf) params.set('estado', uf);
      const res = await api(`/vidas?${params}`);
      setPageData(res);
    } catch (err) {
      console.error('Failed to load vidas:', err);
      setPageData(null);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    load(page, search, statusFilter, subscriptionFilter, estadoFilter);
  }, [loaded, page, search, statusFilter, subscriptionFilter, estadoFilter, load]);

  const totais = useMemo(() => {
    if (!pageData) return { total: 0, ativos: 0, pendentes: 0, inadimplentes: 0, inativos: 0, ativosTit: 0, ativosDep: 0, inadTit: 0, inadDep: 0, inatTit: 0, inatDep: 0, totalTit: 0, totalDep: 0 };
    return {
      total: pageData.total,
      ativos: pageData.ativos,
      pendentes: pageData.pendentes || 0,
      inadimplentes: pageData.inadimplentes,
      inativos: pageData.inativos,
      ativosTit: pageData.ativosTit,
      ativosDep: pageData.ativosDep,
      inadTit: pageData.inadTit,
      inadDep: pageData.inadDep,
      inatTit: pageData.inatTit,
      inatDep: pageData.inatDep,
      totalTit: pageData.totalTit,
      totalDep: pageData.totalDep,
    };
  }, [pageData]);

  function goTo(p: number) {
    if (p < 1 || (pageData && p > pageData.totalPages)) return;
    setPage(p);
  }

  if (!loaded) return <PageSkeleton variant="table" />;

  return (
    <div className="p-8">
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#05966920' }}>
              <svg className="h-5 w-5 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-2xl font-semibold text-ink">{totais.total}</p>
              <p className="text-sm text-ink-tertiary">Vidas Totais</p>
              <p className="mt-0.5 text-xs text-ink-muted">Titulares: {totais.totalTit}</p>
              <p className="text-xs text-ink-muted">Dependentes: {totais.totalDep}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#16a34a20' }}>
              <svg className="h-5 w-5 text-[#16a34a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-2xl font-semibold text-[#16a34a]">{totais.ativos}</p>
              <p className="text-sm text-ink-tertiary">Ativos</p>
              <p className="mt-0.5 text-xs text-ink-muted">Titulares: {totais.ativosTit}</p>
              <p className="text-xs text-ink-muted">Dependentes: {totais.ativosDep}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#dc262620' }}>
              <svg className="h-5 w-5 text-[#dc2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-2xl font-semibold text-[#dc2626]">{totais.inadimplentes}</p>
              <p className="text-sm text-ink-tertiary">Inadimplentes</p>
              <p className="mt-0.5 text-xs text-ink-muted">Titulares: {totais.inadTit}</p>
              <p className="text-xs text-ink-muted">Dependentes: {totais.inadDep}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#94a3b820' }}>
              <svg className="h-5 w-5 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-2xl font-semibold text-ink-tertiary">{totais.inativos}</p>
              <p className="text-sm text-ink-tertiary">Inativos</p>
              <p className="mt-0.5 text-xs text-ink-muted">Titulares: {totais.inatTit}</p>
              <p className="text-xs text-ink-muted">Dependentes: {totais.inatDep}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-surface-elevated shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-edge px-5 py-4">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nome, CPF ou telefone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-edge bg-surface-input pl-9 pr-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
            <option value="">Status</option>
            <option value="ACTIVE">Ativo</option>
            <option value="PENDING">Aguardando pagamento</option>
            <option value="DELINQUENT">Inadimplente</option>
            <option value="INACTIVE">Inativo</option>
          </select>
          <select value={subscriptionFilter} onChange={(e) => { setSubscriptionFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
            <option value="">Plano</option>
            <option value="com_plano">Com Plano</option>
            <option value="sem_plano">Sem Plano</option>
          </select>
          <select value={estadoFilter} onChange={(e) => { setEstadoFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
            <option value="">UF</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
          {(statusFilter || subscriptionFilter || estadoFilter || search) && (
            <button onClick={() => { setStatusFilter(''); setSubscriptionFilter(''); setEstadoFilter(''); setSearch(''); setPage(1); }}
              className="rounded-md px-3 py-2 text-sm text-ink-tertiary transition-colors hover:text-danger">
              Limpar
            </button>
          )}
          {pageData && (
            <span className="text-xs text-ink-tertiary whitespace-nowrap">{pageData.total} registro{pageData.total !== 1 ? 's' : ''}</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-canvas/60">
              <tr className="border-b border-edge text-ink-tertiary">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">Tipo</th>
                <th className="px-5 py-3 font-medium">Telefone</th>
                <th className="px-5 py-3 font-medium">CPF</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Cidade</th>
              </tr>
            </thead>
            <tbody>
              {!pageData || pageData.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-ink-tertiary">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                pageData.data.map((t) => {
                  const meta = statusMeta[t.status] || statusMeta.INACTIVE;
                  return (
                  <tr key={`${t.tipo}-${t.id}`} className="cursor-pointer border-b border-edge/70 last:border-0 transition-colors hover:bg-surface-canvas/40"
                    onClick={() => router.push(`/dashboard/vidas/${t.asaas_id}`)}>
                    <td className="px-5 py-3 font-medium text-ink">{t.nome}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                        t.tipo === 'Titular'
                          ? 'border-brand/20 bg-brand/10 text-brand'
                          : 'border-info/20 bg-info/10 text-info'
                      }`}>
                        {t.tipo}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{formatPhone(t.telefone)}</td>
                    <td className="px-5 py-3 text-ink-secondary">{formatCpfCnpj(t.cpf)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${meta.colors}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{t.cidade ? `${t.cidade}${t.estado ? ` - ${t.estado}` : ''}` : '-'}</td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pageData && pageData.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-edge px-5 py-3">
            <button
              onClick={() => goTo(page - 1)}
              disabled={page <= 1}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-canvas disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <div className="flex items-center gap-1">
              {(() => {
                const pages: (number | string)[] = [];
                const tp = pageData.totalPages;
                const cp = page;
                if (tp <= 7) {
                  for (let i = 1; i <= tp; i++) pages.push(i);
                } else {
                  pages.push(1);
                  if (cp > 3) pages.push('...');
                  const start = Math.max(2, cp - 1);
                  const end = Math.min(tp - 1, cp + 1);
                  for (let i = start; i <= end; i++) pages.push(i);
                  if (cp < tp - 2) pages.push('...');
                  pages.push(tp);
                }
                return pages.map((p, idx) =>
                  typeof p === 'string' ? (
                    <span key={`e-${idx}`} className="px-1 text-xs text-ink-muted">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goTo(p)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-sm transition ${
                        p === page
                          ? 'bg-brand text-white shadow-sm'
                          : 'text-ink-secondary hover:bg-surface-canvas'
                      }`}
                    >
                      {p}
                    </button>
                  ),
                );
              })()}
            </div>
            <button
              onClick={() => goTo(page + 1)}
              disabled={page >= pageData.totalPages}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-canvas disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próximo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

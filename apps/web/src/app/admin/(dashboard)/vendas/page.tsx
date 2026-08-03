'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAdminTenant } from '@/lib/admin-tenant-context';
import TenantFilter from '@/components/tenant-filter';
import { usePageTitle } from '@/lib/page-title-context';
import { formatDate } from '@/lib/format';

export default function AdminVendasPage() {
  const { tenantHeader } = useAdminTenant();
  const { setPageTitle } = usePageTitle();
  const [pageData, setPageData] = useState<any>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPageTitle('Vendas', 'Visão consolidada de todas as tenants');
  }, [setPageTitle]);

  const load = useCallback(async (p: number) => {
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      const res = await api(`/vendas?${params}`, { tenantId: tenantHeader });
      setPageData(res);
    } catch { setPageData(null); }
  }, [tenantHeader]);

  useEffect(() => { load(page); }, [page, load]);

  const ind = pageData?.indicadores || {};

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Vendas</h1>
          <p className="text-sm text-ink-tertiary">Visão consolidada de todas as tenants</p>
        </div>
        <TenantFilter />
      </div>

      {pageData && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
            <p className="text-2xl font-semibold text-ink">{ind.totalVendas || 0}</p>
            <p className="text-sm text-ink-tertiary">Total Vendas</p>
          </div>
          <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
            <p className="text-2xl font-semibold text-emerald-600">{Number(ind.valorTotalVendido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            <p className="text-sm text-ink-tertiary">Valor Total Vendido</p>
          </div>
          <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
            <p className="text-2xl font-semibold text-amber-600">{Number(ind.comissoesPendentes || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            <p className="text-sm text-ink-tertiary">Comissões Pendentes</p>
          </div>
          <div className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
            <p className="text-2xl font-semibold text-emerald-600">{Number(ind.comissoesPagas || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            <p className="text-sm text-ink-tertiary">Comissões Pagas</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-edge bg-surface-elevated shadow-sm">
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <span className="text-xs text-ink-tertiary">{pageData?.total || 0} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-canvas/60">
              <tr className="border-b border-edge text-ink-tertiary">
                <th className="px-5 py-3 font-medium">Titular</th>
                <th className="px-5 py-3 font-medium">Vendedor</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Comissão</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {(!pageData || pageData.data.length === 0) ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-ink-tertiary">Nenhum registro.</td></tr>
              ) : pageData.data.map((item: any) => (
                <tr key={item.id} className="border-b border-edge/70 hover:bg-surface-canvas/40">
                  <td className="px-5 py-3 font-medium text-ink">{item.titular_nome || item.titular_id?.slice(0, 8)}</td>
                  <td className="px-5 py-3 text-ink-secondary">{item.vendedor_nome || '—'}</td>
                  <td className="px-5 py-3 text-ink">{Number(item.valor_plano || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="px-5 py-3 text-ink">{Number(item.valor_comissao || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${item.comissao_paga ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                      {item.comissao_paga ? 'Paga' : 'Pendente'}</span>
                  </td>
                  <td className="px-5 py-3 text-ink-secondary">{formatDate(item.data_fechamento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pageData && pageData.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-edge px-5 py-3">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-canvas disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-ink-tertiary">Página {page} de {pageData.totalPages}</span>
            <button
              onClick={() => setPage(page + 1)}
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

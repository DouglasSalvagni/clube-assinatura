'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api, API_BASE } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { Skeleton } from '@/components/page-skeleton';

export default function RelatorioDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tipo = params.tipo as string;
  const { setPageTitle } = usePageTitle();
  const [filtros, setFiltros] = useState<any[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPageTitle('Relatório', '');
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/login'); return; }
    setLoaded(true);
  }, [router, setPageTitle]);

  useEffect(() => {
    if (!loaded || !tipo) return;
    api('/relatorios').then((res) => {
      const r = (res.relatorios || []).find((x: any) => x.tipo === tipo);
      if (r) {
        setFiltros(r.filtros || []);
        setNome(r.nome);
        setPageTitle(r.nome, '');
        const vals: Record<string, string> = {};
        for (const f of (r.filtros || [])) vals[f.key] = '';
        setValores(vals);
      }
    }).catch(() => {});
  }, [loaded, tipo, setPageTitle]);

  const gerar = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(valores)) { if (v) p.set(k, v); }
      const res = await api(`/relatorios/${tipo}?${p}`);
      setData(res);
    } catch { setData(null); }
    setLoading(false);
  }, [tipo, valores]);

  async function exportCsv() {
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries(valores)) if (value) p.set(key, value);
    const token = localStorage.getItem('accessToken');
    const unitId = localStorage.getItem('tenantId');
    const response = await fetch(`${API_BASE}/relatorios/${tipo}/csv?${p}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(unitId ? { 'x-unit-id': unitId } : {}),
      },
    });
    if (!response.ok) throw new Error('Não foi possível exportar o relatório.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${tipo}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function formatValor(val: any, col?: any) {
    if (val === null || val === undefined) return '—';
    if (col?.tipo === 'currency') return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (col?.tipo === 'date') return String(val).slice(0, 10);
    if (col?.tipo === 'percentual') return `${Number(val).toFixed(1)}%`;
    return String(val);
  }

  return (
    <div className="p-8">
      <button onClick={() => router.push('/dashboard/relatorios')}
        className="mb-4 flex items-center gap-1 text-sm text-ink-tertiary hover:text-ink">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg> Voltar
      </button>
      <h1 className="mb-6 text-xl font-semibold text-ink">
        {nome || <Skeleton className="h-6 w-56" />}
      </h1>

      <div className="mb-6 rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          {filtros.map((f: any) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs text-ink-tertiary">{f.label}</label>
              {f.tipo === 'date' ? (
                <input type="date" value={valores[f.key] || ''} onChange={(e) => setValores(p => ({ ...p, [f.key]: e.target.value }))}
                  className="rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
              ) : f.tipo === 'select' ? (
                <select value={valores[f.key] || ''} onChange={(e) => setValores(p => ({ ...p, [f.key]: e.target.value }))}
                  className="rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
                  <option value="">Todos</option>{(f.opcoes || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type="text" value={valores[f.key] || ''} onChange={(e) => setValores(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.label} className="rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
              )}
            </div>
          ))}
          <button onClick={gerar} disabled={loading}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50">
            {loading ? 'Gerando...' : 'Gerar'}</button>
          {data && <button onClick={exportCsv}
            className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-secondary transition hover:bg-surface-canvas">Exportar CSV</button>}
        </div>
      </div>

      {data && (
        <>
          {data.indicadores.length > 0 && (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
              {data.indicadores.map((i: any) => (
                <div key={i.label} className="rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm">
                  <p className="text-2xl font-semibold text-ink">{i.tipo === 'currency' ? Number(i.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : i.tipo === 'percentual' ? `${Number(i.valor).toFixed(1)}%` : i.valor}</p>
                  <p className="text-sm text-ink-tertiary">{i.label}</p>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl border border-edge bg-surface-elevated shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-canvas/60">
                  <tr className="border-b border-edge text-ink-tertiary">
                    {data.colunas.map((c: any) => <th key={c.key} className="px-5 py-3 font-medium">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.dados.length === 0 ? (
                    <tr><td colSpan={data.colunas.length} className="px-5 py-12 text-center text-sm text-ink-tertiary">Nenhum registro.</td></tr>
                  ) : data.dados.map((row: any, i: number) => (
                    <tr key={i} className="border-b border-edge/70 last:border-0">
                      {data.colunas.map((c: any) => <td key={c.key} className="px-5 py-3 text-ink">{formatValor(row[c.key], c)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

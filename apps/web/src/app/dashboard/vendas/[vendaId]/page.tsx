'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { formatDate } from '@/lib/format';
import { DetailSkeleton } from '@/components/page-skeleton';

interface Venda {
  id: string;
  oportunidade_id: string;
  titular_id: string;
  vendedor_id: string | null;
  valor_plano: string;
  ciclo: string;
  status: string;
  data_fechamento: string;
  percentual_comissao: string;
  valor_comissao: string;
  comissao_paga: boolean;
  created_at: string;
  updated_at: string;
}

export default function VendaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.vendaId as string;
  const { setPageTitle } = usePageTitle();
  const [loaded, setLoaded] = useState(false);
  const [venda, setVenda] = useState<Venda | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setPageTitle('Detalhe da Venda', '');
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/login'); return; }
    setLoaded(true);
  }, [router, setPageTitle]);

  useEffect(() => {
    if (!loaded) return;
    api(`/vendas/${id}`).then(setVenda).catch(() => setVenda(null));
  }, [loaded, id]);

  async function handlePagarComissao() {
    setPaying(true);
    try {
      const res = await api(`/vendas/${id}/comissao`, { method: 'PATCH', body: JSON.stringify({ comissao_paga: true }) });
      if (res.success) {
        setVenda((prev) => prev ? { ...prev, comissao_paga: true } : prev);
      }
    } catch { }
    setPaying(false);
  }

  if (!venda) {
    return <DetailSkeleton />;
  }

  return (
    <div className="p-8">
      <button
        onClick={() => router.push('/dashboard/vendas')}
        className="mb-4 flex items-center gap-1 text-sm text-ink-tertiary transition-colors hover:text-ink"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Voltar
      </button>

      <div className="space-y-6">
        <div className="rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-ink">Dados da Venda</h2>
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="text-xs text-ink-tertiary">Titular</span>
              <p className="text-sm text-ink">{venda.titular_id}</p>
            </div>
            <div>
              <span className="text-xs text-ink-tertiary">Vendedor</span>
              <p className="text-sm text-ink">{venda.vendedor_id || '—'}</p>
            </div>
            <div>
              <span className="text-xs text-ink-tertiary">Valor do Plano</span>
              <p className="text-sm font-medium text-ink">
                {Number(venda.valor_plano).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div>
              <span className="text-xs text-ink-tertiary">Ciclo</span>
              <p className="text-sm text-ink">{venda.ciclo}</p>
            </div>
            <div>
              <span className="text-xs text-ink-tertiary">Status</span>
              <p className="text-sm text-ink">{venda.status === 'ativa' ? 'Ativa' : 'Cancelada'}</p>
            </div>
            <div>
              <span className="text-xs text-ink-tertiary">Data de Fechamento</span>
              <p className="text-sm text-ink">{formatDate(venda.data_fechamento)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-ink">Comissão</h2>
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="text-xs text-ink-tertiary">Percentual</span>
              <p className="text-sm text-ink">{Number(venda.percentual_comissao).toFixed(2)}%</p>
            </div>
            <div>
              <span className="text-xs text-ink-tertiary">Valor da Comissão</span>
              <p className="text-sm font-medium text-ink">
                {Number(venda.valor_comissao).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div>
              <span className="text-xs text-ink-tertiary">Status</span>
              <p className="text-sm">
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                  venda.comissao_paga
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}>
                  {venda.comissao_paga ? 'Paga' : 'Pendente'}
                </span>
              </p>
            </div>
          </div>

          {!venda.comissao_paga && (
            <div className="mt-6 border-t border-edge pt-4">
              <button
                onClick={handlePagarComissao}
                disabled={paying}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-50"
              >
                {paying ? 'Processando...' : 'Marcar Comissão como Paga'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

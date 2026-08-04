'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MetricCard from '@/components/metric-card';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { PageSkeleton } from '@/components/page-skeleton';

interface DashboardMetrics {
  activeSubscriptions: number;
  pastDueSubscriptions: number;
  mrr: number;
  openOpportunities: number;
  pipelineValue: number;
  salesLast30Days: number;
  churnLast30Days: number;
  churnRate: number;
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export default function DashboardPage() {
  const router = useRouter();
  const { setPageTitle } = usePageTitle();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPageTitle('Dashboard executivo');
    if (!localStorage.getItem('accessToken')) {
      router.push('/login');
      return;
    }
    api('/analytics/dashboard')
      .then(setMetrics)
      .catch(() => setError('Não foi possível carregar os indicadores desta unidade.'));
  }, [router, setPageTitle]);

  if (error) return <div className="p-8"><div className="rounded-xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div></div>;
  if (!metrics && !error) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="space-y-6 p-8">
      <div>
        <h2 className="text-xl font-semibold text-ink">Visão da unidade</h2>
        <p className="mt-1 text-sm text-ink-tertiary">Receita recorrente, carteira, funil comercial e retenção.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard value={String(metrics.activeSubscriptions)} label="Assinaturas ativas" stripColor="#059669" />
        <MetricCard value={money.format(metrics.mrr)} label="MRR estimado" stripColor="#0284c7" />
        <MetricCard value={String(metrics.openOpportunities)} label="Oportunidades abertas" stripColor="#7c3aed" />
        <MetricCard value={money.format(metrics.pipelineValue)} label="Valor em pipeline" stripColor="#d97706" />
        <MetricCard value={String(metrics.salesLast30Days)} label="Vendas nos últimos 30 dias" stripColor="#0891b2" />
        <MetricCard value={String(metrics.pastDueSubscriptions)} label="Assinaturas inadimplentes" stripColor="#dc2626" />
        <MetricCard value={String(metrics.churnLast30Days)} label="Cancelamentos em 30 dias" stripColor="#be123c" />
        <MetricCard value={`${percent.format(metrics.churnRate)}%`} label="Churn em 30 dias" stripColor="#9333ea" />
      </div>
    </div>
  );
}

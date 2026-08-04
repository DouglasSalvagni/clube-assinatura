'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import MetricCard from '@/components/metric-card';
import { PageSkeleton } from '@/components/page-skeleton';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const { setPageTitle } = usePageTitle();
  const [stats, setStats] = useState({ tenants: 0, users: 0 });

  useEffect(() => {
    setPageTitle('Administração', 'Visão geral das unidades da instalação.');
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/admin/login');
      return;
    }

    setLoaded(true);
    Promise.all([
      api('/tenants').then((r) => setStats((s) => ({ ...s, tenants: r.data.length }))),
      api('/users', { tenantId: 'all' }).then((r) => setStats((s) => ({ ...s, users: r.data.length }))),
    ]).catch(() => {});
  }, [router, setPageTitle]);

  if (!loaded) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard value={String(stats.tenants)} label="Unidades" stripColor="#10b981" />
        <MetricCard value={String(stats.users)} label="Usuários" stripColor="#f59e0b" />
      </div>
    </div>
  );
}

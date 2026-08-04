'use client';

import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { PageTitleProvider } from '@/lib/page-title-context';
import { DialogProvider } from '@/lib/dialog-context';
import { ReactNode, useMemo } from 'react';
import { IconDashboard, IconHeart, IconUser, IconBriefcase, IconCash, IconChart, IconUsers, IconTeam, IconSettings } from '@/components/icons';

const baseLinks = [
  { label: 'Dashboard', href: '/dashboard', icon: <IconDashboard /> },
  { label: 'Assinaturas', href: '/dashboard/vidas', icon: <IconHeart /> },
  { label: 'Oportunidades', href: '/dashboard/oportunidades', icon: <IconBriefcase /> },
  { label: 'Vendas', href: '/dashboard/vendas', icon: <IconCash /> },
  { label: 'Relatórios', href: '/dashboard/relatorios', icon: <IconChart /> },
  { label: 'Times', href: '/dashboard/times', icon: <IconTeam /> },
  { label: 'Usuários', href: '/dashboard/usuarios', icon: <IconUsers /> },
];

const commercialAdminLinks = [
  { label: 'Configurações', href: '/dashboard/configuracoes', icon: <IconSettings /> },
];

function DashboardShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME || 'ClubFlow';
  const links = useMemo(() => {
    const unitId = typeof window !== 'undefined'
      ? localStorage.getItem('tenantId') || localStorage.getItem('unitId')
      : null;
    const membership = user?.memberships?.find((item) => item.unitId === unitId && item.active);
    const canManageCommercialConfiguration = Boolean(
      user?.is_platform_admin || membership?.role === 'OWNER' || membership?.role === 'ADMIN',
    );
    const result = [...baseLinks];
    if (canManageCommercialConfiguration) result.push(...commercialAdminLinks);
    result.push({ label: 'Perfil', href: '/dashboard/profile', icon: <IconUser /> });
    return result;
  }, [user]);

  return (
    <div className="flex min-h-screen min-w-0 bg-surface-canvas text-ink">
      <Sidebar links={links} title={productName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <PageTitleProvider>
          <DialogProvider>
            <DashboardShell>{children}</DashboardShell>
          </DialogProvider>
        </PageTitleProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

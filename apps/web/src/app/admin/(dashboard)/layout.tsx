'use client';

import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { PageTitleProvider } from '@/lib/page-title-context';
import { AdminTenantProvider } from '@/lib/admin-tenant-context';
import { DialogProvider } from '@/lib/dialog-context';
import { ReactNode } from 'react';
import { IconDashboard, IconUsers, IconTenants, IconHeart, IconBriefcase, IconCash, IconChart, IconTeam } from '@/components/icons';

const links = [
  { label: 'Dashboard', href: '/admin', icon: <IconDashboard /> },
  { label: 'Assinaturas', href: '/admin/vidas', icon: <IconHeart /> },
  { label: 'Oportunidades', href: '/admin/oportunidades', icon: <IconBriefcase /> },
  { label: 'Vendas', href: '/admin/vendas', icon: <IconCash /> },
  { label: 'Relatórios', href: '/admin/relatorios', icon: <IconChart /> },
  { label: 'Times', href: '/admin/times', icon: <IconTeam /> },
  { label: 'Usuários', href: '/admin/usuarios', icon: <IconUsers /> },
  { label: 'Unidades', href: '/admin/tenants', icon: <IconTenants /> },
];

export default function AdminDashboardLayout({ children }: { children: ReactNode }) {
  const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME || 'ClubFlow';
  return (
    <AuthProvider>
      <ThemeProvider>
        <PageTitleProvider>
          <DialogProvider>
            <AdminTenantProvider>
              <div className="flex min-h-screen bg-surface-canvas text-ink">
                <Sidebar links={links} title={`${productName} Admin`} />
                <div className="flex flex-1 flex-col">
                  <Header />
                  <main className="flex-1">{children}</main>
                </div>
              </div>
            </AdminTenantProvider>
          </DialogProvider>
        </PageTitleProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

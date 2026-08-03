'use client';

import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { PageTitleProvider } from '@/lib/page-title-context';
import { DialogProvider } from '@/lib/dialog-context';
import { ReactNode } from 'react';
import { IconDashboard, IconHeart, IconUser, IconBriefcase, IconCash, IconChart, IconUsers, IconTeam, IconSettings } from '@/components/icons';

const links = [
  { label: 'Dashboard', href: '/dashboard', icon: <IconDashboard /> },
  { label: 'Assinaturas', href: '/dashboard/vidas', icon: <IconHeart /> },
  { label: 'Oportunidades', href: '/dashboard/oportunidades', icon: <IconBriefcase /> },
  { label: 'Vendas', href: '/dashboard/vendas', icon: <IconCash /> },
  { label: 'Relatórios', href: '/dashboard/relatorios', icon: <IconChart /> },
  { label: 'Times', href: '/dashboard/times', icon: <IconTeam /> },
  { label: 'Usuários', href: '/dashboard/usuarios', icon: <IconUsers /> },
  { label: 'Integração Asaas', href: '/dashboard/configuracoes/asaas', icon: <IconSettings /> },
  { label: 'Perfil', href: '/dashboard/profile', icon: <IconUser /> },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME || 'ClubFlow';
  return (
    <AuthProvider>
      <ThemeProvider>
        <PageTitleProvider>
          <DialogProvider>
            <div className="flex min-h-screen bg-surface-canvas text-ink">
              <Sidebar links={links} title={productName} />
              <div className="flex flex-1 flex-col">
                <Header />
                <main className="flex-1">{children}</main>
              </div>
            </div>
          </DialogProvider>
        </PageTitleProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

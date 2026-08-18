'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

const sections = [
  {
    label: 'Comercial',
    items: [
      { href: '/dashboard/configuracoes', label: 'Visão geral', description: 'Resumo das configurações da sede', exact: true },
      { href: '/dashboard/configuracoes/comercial', label: 'Preços e políticas', description: 'Referências, alçadas e aprovações' },
      { href: '/dashboard/configuracoes/ofertas', label: 'Ofertas públicas', description: 'Links de contratação autônoma' },
      { href: '/dashboard/configuracoes/funis', label: 'Funis comerciais', description: 'Etapas do Kanban e automações' },
      { href: '/dashboard/configuracoes/contratos', label: 'Modelos contratuais', description: 'Textos, variáveis e versões' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/dashboard/configuracoes/asaas', label: 'Integração Asaas', description: 'Conta, conexão e webhooks' },
    ],
  },
];

export default function ConfigurationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-[1680px] items-start gap-6 px-6 py-6">
      <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-64 shrink-0 self-start overflow-y-auto rounded-xl border border-edge bg-surface-elevated p-3 xl:block">
        <div className="px-3 pb-3 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Configurações da sede</p>
          <p className="mt-1 text-sm text-ink-secondary">Organize regras comerciais e integrações.</p>
        </div>
        <nav className="space-y-4">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-ink-tertiary">{section.label}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-lg px-3 py-2 transition-colors ${active ? 'bg-brand/10 text-brand' : 'text-ink-secondary hover:bg-surface-canvas hover:text-ink'}`}
                    >
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className={`mt-0.5 block text-xs ${active ? 'text-brand/75' : 'text-ink-tertiary'}`}>{item.description}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-5 flex gap-2 overflow-x-auto rounded-xl border border-edge bg-surface-elevated p-2 xl:hidden">
          {sections.flatMap((section) => section.items).map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? 'bg-brand text-white' : 'text-ink-secondary hover:bg-surface-canvas'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        {children}
      </div>
    </div>
  );
}

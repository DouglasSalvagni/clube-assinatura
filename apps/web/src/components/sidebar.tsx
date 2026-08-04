'use client';

import { ReactNode, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { logout } from '@/lib/auth';
import TenantSwitcher from './tenant-switcher';

export interface SidebarLink {
  label: string;
  href: string;
  icon: ReactNode;
}

interface SidebarProps {
  links: SidebarLink[];
  title?: string;
}

export default function Sidebar({ links, title = 'ClubFlow' }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col border-r border-edge bg-surface transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      } sticky top-0 h-screen`}
    >
      <div className="flex h-16 items-center justify-between border-b border-edge px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand shadow-sm">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
            </svg>
          </div>
          {!collapsed && <span className="text-sm font-semibold text-ink">{title}</span>}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-surface-canvas hover:text-ink"
          title={collapsed ? 'Expandir' : 'Recolher'}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={
              collapsed ? 'M8.25 4.5l7.5 7.5-7.5 7.5' : 'M15.75 19.5L8.25 12l7.5-7.5'
            } />
          </svg>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {links.map((link) => {
          const isActive = link.href === '/dashboard'
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`group relative flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                collapsed ? 'justify-center' : 'gap-3'
              } ${
                isActive
                  ? 'border border-brand/15 bg-brand/10 font-medium text-brand'
                  : 'text-ink-secondary hover:bg-surface-canvas hover:text-ink'
              }`}
            >
              {isActive && !collapsed && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand" />
              )}
              <span
                className={`shrink-0 ${
                  isActive ? 'text-brand' : 'text-ink-tertiary group-hover:text-ink-secondary'
                }`}
              >
                {link.icon}
              </span>
              {!collapsed && link.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-2">
        <TenantSwitcher collapsed={collapsed} />
      </div>

      <div className="border-t border-edge p-3">
        <button
          onClick={logout}
          className={`flex w-full items-center rounded-lg px-3 py-2 text-sm text-ink-tertiary transition-colors hover:bg-danger/10 hover:text-danger ${
            collapsed ? 'justify-center' : 'gap-3'
          }`}
          title="Sair"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  );
}

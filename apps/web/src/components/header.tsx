'use client';

import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { usePageTitle } from '@/lib/page-title-context';

export default function Header() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const { title, subtitle } = usePageTitle();
  const initials = user?.name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'AD';

  return (
    <header className="flex h-16 items-center justify-between border-b border-edge bg-surface/95 px-8 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="text-xs text-ink-tertiary">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {user?.is_platform_admin && (
          <span className="rounded-md border border-warning/20 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            Platform Admin
          </span>
        )}

        <button className="relative rounded-lg p-2 text-ink-tertiary transition-colors hover:bg-surface-canvas hover:text-ink">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
        </button>

        <button
          onClick={toggle}
          className="rounded-lg p-2 text-ink-tertiary transition-colors hover:bg-surface-canvas hover:text-ink"
          title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
        >
          {theme === 'light' ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          )}
        </button>

        <div className="h-5 w-px bg-edge" />

        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-brand/20 bg-brand/10 text-xs font-semibold text-brand">
            {initials}
          </div>
          <span className="text-sm text-ink-secondary">{user?.name || 'Admin'}</span>
        </div>

      </div>
    </header>
  );
}

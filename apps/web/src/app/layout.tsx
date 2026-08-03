import './globals.css';
import { ReactNode } from 'react';

export const metadata = { title: process.env.NEXT_PUBLIC_PRODUCT_NAME || 'ClubFlow' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const stored = localStorage.getItem('theme');
                  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  const isDark = stored ? stored === 'dark' : prefersDark;
                  document.documentElement.classList.toggle('dark', isDark);
                  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-surface-canvas text-ink">{children}</body>
    </html>
  );
}

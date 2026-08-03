'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface PageTitleState {
  title: string;
  subtitle?: string;
  setPageTitle: (title: string, subtitle?: string) => void;
}

const PageTitleContext = createContext<PageTitleState>({
  title: 'Dashboard',
  setPageTitle: () => {},
});

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState('Dashboard');
  const [subtitle, setSubtitle] = useState<string | undefined>(undefined);

  const setPageTitle = (t: string, s?: string) => {
    setTitle(t);
    setSubtitle(s);
  };

  return (
    <PageTitleContext.Provider value={{ title, subtitle, setPageTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  return useContext(PageTitleContext);
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';

interface CatalogoRelatorio {
  tipo: string;
  nome: string;
  descricao: string;
  categoria: string;
}

const CATEGORIA_META: Record<string, { label: string; colors: string }> = {
  comercial: { label: 'Comercial', colors: 'border-blue-200 bg-blue-50 text-blue-700' },
  clientes: { label: 'Clientes', colors: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  pipeline: { label: 'Pipeline', colors: 'border-purple-200 bg-purple-50 text-purple-700' },
  financeiro: { label: 'Financeiro', colors: 'border-amber-200 bg-amber-50 text-amber-700' },
};

export default function RelatoriosPage() {
  const router = useRouter();
  const { setPageTitle } = usePageTitle();
  const [loaded, setLoaded] = useState(false);
  const [relatorios, setRelatorios] = useState<CatalogoRelatorio[]>([]);

  useEffect(() => {
    setPageTitle('Relatórios', 'Relatórios comerciais, clientes, pipeline e financeiros.');
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/login'); return; }
    setLoaded(true);
  }, [router, setPageTitle]);

  useEffect(() => {
    if (!loaded) return;
    api('/relatorios').then((res) => setRelatorios(res.relatorios)).catch(() => {});
  }, [loaded]);

  return (
    <div className="p-8">

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {relatorios.map((r) => {
          const meta = CATEGORIA_META[r.categoria] || { label: r.categoria, colors: '' };
          return (
            <div
              key={r.tipo}
              onClick={() => router.push(`/dashboard/relatorios/${r.tipo}`)}
              className="cursor-pointer rounded-xl border border-edge bg-surface-elevated p-5 shadow-sm transition-all hover:border-brand/40 hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${meta.colors}`}>
                  {meta.label}
                </span>
              </div>
              <h3 className="text-base font-semibold text-ink">{r.nome}</h3>
              <p className="mt-1 text-sm text-ink-tertiary">{r.descricao}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

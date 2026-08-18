'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePageTitle } from '@/lib/page-title-context';

const cards = [
  {
    href: '/dashboard/configuracoes/comercial',
    title: 'Preços e políticas comerciais',
    description: 'Defina os preços padrão das oportunidades, contratos sugeridos, limites e alçadas.',
    action: 'Gerenciar preços e políticas',
  },
  {
    href: '/dashboard/configuracoes/ofertas',
    title: 'Ofertas públicas',
    description: 'Crie links de contratação autônoma com opções mensal e anual, preços e contrato próprios.',
    action: 'Gerenciar ofertas públicas',
  },
  {
    href: '/dashboard/configuracoes/funis',
    title: 'Funis comerciais',
    description: 'Organize as etapas do Kanban e os efeitos automáticos de cada movimentação.',
    action: 'Gerenciar funis',
  },
  {
    href: '/dashboard/configuracoes/contratos',
    title: 'Modelos contratuais',
    description: 'Crie modelos, publique versões e vincule os documentos às oportunidades e ofertas públicas.',
    action: 'Gerenciar contratos',
  },
  {
    href: '/dashboard/configuracoes/asaas',
    title: 'Integração Asaas',
    description: 'Configure a conta financeira da sede, valide a conexão e administre o webhook.',
    action: 'Configurar Asaas',
  },
];

export default function ConfigurationOverviewPage() {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle('Configurações', 'Regras comerciais, contratos, ofertas e integrações da sede.');
  }, [setPageTitle]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-xl font-semibold">Configuração da operação</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-secondary">
          As configurações abaixo determinam como oportunidades são negociadas, aprovadas, contratadas e cobradas nesta sede.
          Faça alterações com cuidado: novas versões preservam o histórico das contratações anteriores.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="group rounded-xl border border-edge bg-surface-elevated p-5 transition hover:border-brand/40 hover:shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-ink group-hover:text-brand">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-secondary">{card.description}</p>
              </div>
              <span className="text-xl text-ink-tertiary group-hover:text-brand">→</span>
            </div>
            <p className="mt-4 text-sm font-medium text-brand">{card.action}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

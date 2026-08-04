'use client';

import { usePathname, useRouter } from 'next/navigation';

type Props = {
  opportunityId: string;
};

export function OpportunityWorkspaceNav({ opportunityId }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const negotiationPath = `/dashboard/oportunidades/${opportunityId}/negociacao`;
  const detailsPath = `/dashboard/oportunidades/${opportunityId}`;
  const inNegotiation = pathname === negotiationPath;

  return (
    <div className="rounded-xl border border-edge bg-surface-elevated p-1">
      <div className="grid gap-1 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => router.push(detailsPath)}
          className={`rounded-lg px-4 py-3 text-left transition ${
            !inNegotiation
              ? 'bg-brand text-white shadow-sm'
              : 'text-ink-secondary hover:bg-surface-canvas hover:text-ink'
          }`}
        >
          <span className="block text-sm font-semibold">Cadastro e participantes</span>
          <span className={`mt-0.5 block text-xs ${!inNegotiation ? 'text-white/80' : 'text-ink-tertiary'}`}>
            Dados do cliente, endereço e dependentes.
          </span>
        </button>
        <button
          type="button"
          onClick={() => router.push(negotiationPath)}
          className={`rounded-lg px-4 py-3 text-left transition ${
            inNegotiation
              ? 'bg-brand text-white shadow-sm'
              : 'text-ink-secondary hover:bg-surface-canvas hover:text-ink'
          }`}
        >
          <span className="block text-sm font-semibold">Negociação e contrato</span>
          <span className={`mt-0.5 block text-xs ${inNegotiation ? 'text-white/80' : 'text-ink-tertiary'}`}>
            Preço, aprovação, contrato e pré-checkout.
          </span>
        </button>
      </div>
    </div>
  );
}

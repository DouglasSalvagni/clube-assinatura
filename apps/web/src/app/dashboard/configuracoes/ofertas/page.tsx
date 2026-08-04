'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';

type OfferVersion = {
  id: string;
  version: number;
  status: string;
  billingCycle: string;
  holderAmount: string | null;
  dependentAmount: string | null;
  unitPrice: string | null;
  maxDependents: number;
  minLives: number;
  maxLives: number | null;
  allowedBillingTypes: string[];
  contractTemplateVersionId: string | null;
};

type Team = { id: string; name: string };
type User = { id: string; name: string };

type ContractTemplateVersion = {
  id: string;
  version: number;
  status: string;
};

type ContractTemplate = {
  id: string;
  name: string;
  customerType: 'PERSON' | 'COMPANY';
  versions: ContractTemplateVersion[];
};

type Offer = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  customerType: 'PERSON' | 'COMPANY';
  status: string;
  publicSlug: string | null;
  versions: OfferVersion[];
};

const billingTypes = ['CREDIT_CARD', 'BOLETO', 'PIX'];
const billingCycles = ['MONTHLY', 'YEARLY', 'QUARTERLY', 'SEMIANNUALLY'];

export default function CommercialOffersPage() {
  const { setPageTitle } = usePageTitle();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offerForm, setOfferForm] = useState({
    name: '',
    code: '',
    customerType: 'PERSON',
    description: '',
    publicSlug: '',
    assignmentTeamId: '',
    assignmentUserId: '',
  });
  const [versionForm, setVersionForm] = useState({
    billingCycle: 'MONTHLY',
    holderAmount: '0',
    dependentAmount: '0',
    unitPrice: '0',
    maxDependents: '5',
    minLives: '1',
    maxLives: '',
    allowedBillingTypes: ['CREDIT_CARD'] as string[],
    contractTemplateVersionId: '',
  });

  const load = useCallback(async () => {
    try {
      const [offerResult, templateResult, teamResult, userResult] = await Promise.all([
        api('/commercial/offers'),
        api('/commercial/contract-templates'),
        api('/teams').catch(() => ({ data: [] })),
        api('/users').catch(() => ({ data: [] })),
      ]);
      setOffers(offerResult);
      setTemplates(templateResult);
      setTeams(teamResult.data || []);
      setUsers(userResult.data || []);
      if (!selectedId && offerResult.length) setSelectedId(offerResult[0].id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar ofertas.');
    }
  }, [selectedId]);

  useEffect(() => {
    setPageTitle('Ofertas comerciais', 'Produtos públicos e negociados com preços versionados.');
    load();
  }, [load, setPageTitle]);

  async function createOffer(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api('/commercial/offers', {
        method: 'POST',
        body: JSON.stringify({
          ...offerForm,
          description: offerForm.description || undefined,
          publicSlug: offerForm.publicSlug || undefined,
          assignmentTeamId: offerForm.assignmentTeamId || undefined,
          assignmentUserId: offerForm.assignmentUserId || undefined,
        }),
      });
      setOfferForm({ name: '', code: '', customerType: 'PERSON', description: '', publicSlug: '', assignmentTeamId: '', assignmentUserId: '' });
      setSelectedId(created.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao criar oferta.');
    } finally {
      setBusy(false);
    }
  }

  async function createVersion(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError('');
    const selected = offers.find((offer) => offer.id === selectedId);
    try {
      await api(`/commercial/offers/${selectedId}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          billingCycle: versionForm.billingCycle,
          holderAmount: selected?.customerType === 'PERSON' ? Number(versionForm.holderAmount) : undefined,
          dependentAmount: selected?.customerType === 'PERSON' ? Number(versionForm.dependentAmount) : undefined,
          maxDependents: selected?.customerType === 'PERSON' ? Number(versionForm.maxDependents) : 0,
          unitPrice: selected?.customerType === 'COMPANY' ? Number(versionForm.unitPrice) : undefined,
          minLives: selected?.customerType === 'COMPANY' ? Number(versionForm.minLives) : 1,
          maxLives: selected?.customerType === 'COMPANY' && versionForm.maxLives ? Number(versionForm.maxLives) : undefined,
          allowedBillingTypes: versionForm.allowedBillingTypes,
          contractTemplateVersionId: versionForm.contractTemplateVersionId || undefined,
        }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao criar versão.');
    } finally {
      setBusy(false);
    }
  }

  async function publish(offerId: string, versionId: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/commercial/offers/${offerId}/versions/${versionId}/publish`, { method: 'POST' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao publicar versão.');
    } finally {
      setBusy(false);
    }
  }

  function toggleBillingType(type: string) {
    setVersionForm((current) => ({
      ...current,
      allowedBillingTypes: current.allowedBillingTypes.includes(type)
        ? current.allowedBillingTypes.filter((item) => item !== type)
        : [...current.allowedBillingTypes, type],
    }));
  }

  const selected = offers.find((offer) => offer.id === selectedId);

  return (
    <div className="space-y-6 p-8">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Nova oferta</h2>
        <form onSubmit={createOffer} className="mt-4 grid gap-3 md:grid-cols-2">
          <input required placeholder="Nome" value={offerForm.name} onChange={e => setOfferForm({ ...offerForm, name: e.target.value })} className="rounded-lg border px-3 py-2" />
          <input required placeholder="Código" value={offerForm.code} onChange={e => setOfferForm({ ...offerForm, code: e.target.value })} className="rounded-lg border px-3 py-2" />
          <select value={offerForm.customerType} onChange={e => setOfferForm({ ...offerForm, customerType: e.target.value })} className="rounded-lg border px-3 py-2">
            <option value="PERSON">Pessoa física</option>
            <option value="COMPANY">Pessoa jurídica</option>
          </select>
          <input placeholder="Slug público, ex.: familia-mensal" value={offerForm.publicSlug} onChange={e => setOfferForm({ ...offerForm, publicSlug: e.target.value })} className="rounded-lg border px-3 py-2" />
          <select value={offerForm.assignmentTeamId} onChange={e => setOfferForm({ ...offerForm, assignmentTeamId: e.target.value })} className="rounded-lg border px-3 py-2">
            <option value="">Sem time de atribuição</option>
            {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <select value={offerForm.assignmentUserId} onChange={e => setOfferForm({ ...offerForm, assignmentUserId: e.target.value })} className="rounded-lg border px-3 py-2">
            <option value="">Distribuir no time</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <textarea placeholder="Descrição" value={offerForm.description} onChange={e => setOfferForm({ ...offerForm, description: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2" />
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-2 disabled:opacity-50">Criar oferta</button>
        </form>
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Nova versão de preço</h2>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="mt-4 w-full rounded-lg border px-3 py-2">
          <option value="">Selecione uma oferta</option>
          {offers.map(offer => <option key={offer.id} value={offer.id}>{offer.name} — {offer.customerType === 'PERSON' ? 'PF' : 'PJ'}</option>)}
        </select>
        {selected && (
          <form onSubmit={createVersion} className="mt-4 grid gap-3 md:grid-cols-2">
            <select value={versionForm.billingCycle} onChange={e => setVersionForm({ ...versionForm, billingCycle: e.target.value })} className="rounded-lg border px-3 py-2">
              {billingCycles.map(cycle => <option key={cycle}>{cycle}</option>)}
            </select>
            {selected.customerType === 'PERSON' ? (
              <>
                <input type="number" min="0" step="0.01" value={versionForm.holderAmount} onChange={e => setVersionForm({ ...versionForm, holderAmount: e.target.value })} placeholder="Valor do titular" className="rounded-lg border px-3 py-2" />
                <input type="number" min="0" step="0.01" value={versionForm.dependentAmount} onChange={e => setVersionForm({ ...versionForm, dependentAmount: e.target.value })} placeholder="Valor por dependente" className="rounded-lg border px-3 py-2" />
                <input type="number" min="0" value={versionForm.maxDependents} onChange={e => setVersionForm({ ...versionForm, maxDependents: e.target.value })} placeholder="Máximo de dependentes" className="rounded-lg border px-3 py-2" />
              </>
            ) : (
              <>
                <input type="number" min="0" step="0.01" value={versionForm.unitPrice} onChange={e => setVersionForm({ ...versionForm, unitPrice: e.target.value })} placeholder="Preço por vida" className="rounded-lg border px-3 py-2" />
                <input type="number" min="1" value={versionForm.minLives} onChange={e => setVersionForm({ ...versionForm, minLives: e.target.value })} placeholder="Mínimo de vidas" className="rounded-lg border px-3 py-2" />
                <input type="number" min="1" value={versionForm.maxLives} onChange={e => setVersionForm({ ...versionForm, maxLives: e.target.value })} placeholder="Máximo de vidas (opcional)" className="rounded-lg border px-3 py-2" />
              </>
            )}
            <select
              required
              value={versionForm.contractTemplateVersionId}
              onChange={e => setVersionForm({ ...versionForm, contractTemplateVersionId: e.target.value })}
              className="rounded-lg border px-3 py-2 md:col-span-2"
            >
              <option value="">Selecione uma versão contratual publicada</option>
              {templates
                .filter(template => template.customerType === selected.customerType)
                .flatMap(template => template.versions
                  .filter(version => version.status === 'PUBLISHED')
                  .map(version => (
                    <option key={version.id} value={version.id}>
                      {template.name} — v{version.version}
                    </option>
                  )))}
            </select>
            <fieldset className="md:col-span-2">
              <legend className="text-sm font-medium">Formas de pagamento</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {billingTypes.map(type => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={versionForm.allowedBillingTypes.includes(type)} onChange={() => toggleBillingType(type)} />
                    {type}
                  </label>
                ))}
              </div>
            </fieldset>
            <button disabled={busy || !versionForm.allowedBillingTypes.length || !versionForm.contractTemplateVersionId} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-2 disabled:opacity-50">Criar versão</button>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Ofertas cadastradas</h2>
        <div className="mt-4 space-y-4">
          {offers.map(offer => (
            <article key={offer.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{offer.name}</h3>
                  <p className="text-sm text-ink-tertiary">{offer.code} · {offer.customerType === 'PERSON' ? 'PF' : 'PJ'} · {offer.status}</p>
                  {offer.publicSlug && <p className="mt-1 text-xs text-ink-tertiary">Página: /assinar/{offer.publicSlug}</p>}
                </div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b"><th className="py-2">Versão</th><th>Status</th><th>Ciclo</th><th>Valor</th><th>Contrato</th><th></th></tr></thead>
                  <tbody>
                    {offer.versions.map(version => (
                      <tr key={version.id} className="border-b last:border-0">
                        <td className="py-2">v{version.version}</td>
                        <td>{version.status}</td>
                        <td>{version.billingCycle}</td>
                        <td>{Number(version.holderAmount || version.unitPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        <td>{version.contractTemplateVersionId ? 'Vinculado' : 'Pendente'}</td>
                        <td className="text-right">
                          {version.status !== 'PUBLISHED' && (
                            <button disabled={busy} onClick={() => publish(offer.id, version.id)} className="rounded-md border px-3 py-1 text-xs">Publicar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
          {!offers.length && <p className="text-sm text-ink-tertiary">Nenhuma oferta cadastrada.</p>}
        </div>
      </section>
    </div>
  );
}

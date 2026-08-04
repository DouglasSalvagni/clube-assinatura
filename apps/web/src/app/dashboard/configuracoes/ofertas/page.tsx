'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import {
  billingCycleLabels,
  billingTypeLabels,
  offerStatusLabels,
  offerVersionStatusLabels,
} from '@/lib/commercial-labels';
import { toCommercialCode, toPublicSlug } from '@/lib/commercial-identifiers';

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
type ContractTemplateVersion = { id: string; version: number; status: string };
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
  active: boolean;
  publicSlug: string | null;
  assignmentTeamId: string | null;
  assignmentUserId: string | null;
  versions: OfferVersion[];
};

const billingTypes = ['CREDIT_CARD', 'BOLETO', 'PIX'];
const billingCycles = ['MONTHLY', 'YEARLY', 'QUARTERLY', 'SEMIANNUALLY'];

const emptyOfferForm = {
  name: '',
  code: '',
  customerType: 'PERSON',
  description: '',
  publicSlug: '',
  assignmentTeamId: '',
  assignmentUserId: '',
};

export default function CommercialOffersPage() {
  const { setPageTitle } = usePageTitle();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [codeEdited, setCodeEdited] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [offerForm, setOfferForm] = useState(emptyOfferForm);
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

  const selected = useMemo(
    () => offers.find((offer) => offer.id === selectedId) || null,
    [offers, selectedId],
  );

  const load = useCallback(async () => {
    try {
      const [offerResult, templateResult, teamResult, userResult] = await Promise.all([
        api('/commercial/offers'),
        api('/commercial/contract-templates'),
        api('/teams').catch(() => ({ data: [] })),
        api('/users').catch(() => ({ data: [] })),
      ]);
      const offerItems = Array.isArray(offerResult) ? offerResult : offerResult.data || [];
      const templateItems = Array.isArray(templateResult) ? templateResult : templateResult.data || [];
      setOffers(offerItems);
      setTemplates(templateItems);
      setTeams(teamResult.data || []);
      setUsers(userResult.data || []);
      setSelectedId((current) => current && offerItems.some((offer: Offer) => offer.id === current)
        ? current
        : offerItems.find((offer: Offer) => offer.active)?.id || offerItems[0]?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar ofertas.');
    }
  }, []);

  useEffect(() => {
    setPageTitle('Ofertas comerciais', 'Produtos públicos e negociados com preços versionados.');
    load();
  }, [load, setPageTitle]);

  function resetOfferForm() {
    setEditingId(null);
    setCodeEdited(false);
    setSlugEdited(false);
    setOfferForm(emptyOfferForm);
  }

  function changeOfferName(name: string) {
    setOfferForm((current) => ({
      ...current,
      name,
      code: codeEdited ? current.code : toCommercialCode(name),
      publicSlug: slugEdited ? current.publicSlug : toPublicSlug(name),
    }));
  }

  function editOffer(offer: Offer) {
    setEditingId(offer.id);
    setSelectedId(offer.id);
    setCodeEdited(true);
    setSlugEdited(true);
    setOfferForm({
      name: offer.name,
      code: offer.code,
      customerType: offer.customerType,
      description: offer.description || '',
      publicSlug: offer.publicSlug || '',
      assignmentTeamId: offer.assignmentTeamId || '',
      assignmentUserId: offer.assignmentUserId || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveOffer(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const path = editingId ? `/commercial/offers/${editingId}` : '/commercial/offers';
      const saved = await api(path, {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...offerForm,
          code: offerForm.code || undefined,
          description: offerForm.description || undefined,
          publicSlug: offerForm.publicSlug,
          assignmentTeamId: offerForm.assignmentTeamId || undefined,
          assignmentUserId: offerForm.assignmentUserId || undefined,
          active: true,
        }),
      });
      setSelectedId(saved.id);
      setSuccess(editingId ? 'Oferta atualizada e mantida na listagem.' : 'Oferta criada e adicionada à listagem.');
      resetOfferForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar oferta.');
    } finally {
      setBusy(false);
    }
  }

  async function createVersion(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api(`/commercial/offers/${selectedId}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          billingCycle: versionForm.billingCycle,
          holderAmount: selected?.customerType === 'PERSON' ? Number(versionForm.holderAmount) : undefined,
          dependentAmount: selected?.customerType === 'PERSON' ? Number(versionForm.dependentAmount) : undefined,
          unitPrice: selected?.customerType === 'COMPANY' ? Number(versionForm.unitPrice) : undefined,
          maxDependents: selected?.customerType === 'PERSON' ? Number(versionForm.maxDependents) : undefined,
          minLives: selected?.customerType === 'COMPANY' ? Number(versionForm.minLives) : undefined,
          maxLives: selected?.customerType === 'COMPANY' && versionForm.maxLives ? Number(versionForm.maxLives) : undefined,
          allowedBillingTypes: versionForm.allowedBillingTypes,
          contractTemplateVersionId: versionForm.contractTemplateVersionId || undefined,
          pricingRules: selected?.customerType === 'PERSON'
            ? { allowMonthlyBoleto: versionForm.billingCycle === 'MONTHLY' && versionForm.allowedBillingTypes.includes('BOLETO') }
            : {},
        }),
      });
      setSuccess('Nova versão de preço criada.');
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
      setSuccess('Versão publicada. A oferta está disponível conforme sua configuração.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao publicar versão.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeOffer(offer: Offer) {
    if (!window.confirm(`Revogar a oferta “${offer.name}”? Ela deixará de aceitar novas contratações.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/commercial/offers/${offer.id}/revoke`, { method: 'POST' });
      setSuccess('Oferta revogada. O histórico e as contratações existentes foram preservados.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao revogar oferta.');
    } finally {
      setBusy(false);
    }
  }

  async function restoreOffer(offer: Offer) {
    setBusy(true);
    setError('');
    try {
      await api(`/commercial/offers/${offer.id}/restore`, { method: 'POST' });
      setSuccess('Oferta reativada como rascunho. Crie ou publique uma nova versão antes de utilizá-la.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao reativar oferta.');
    } finally {
      setBusy(false);
    }
  }

  function billingTypeAvailable(type: string, cycle = versionForm.billingCycle) {
    if (selected?.customerType !== 'PERSON') return true;
    if (type === 'CREDIT_CARD') return true;
    if (type === 'BOLETO') return cycle === 'MONTHLY';
    if (type === 'PIX') return cycle === 'YEARLY';
    return false;
  }

  function changeBillingCycle(cycle: string) {
    setVersionForm((current) => ({
      ...current,
      billingCycle: cycle,
      allowedBillingTypes: selected?.customerType === 'PERSON'
        ? [...new Set([
            'CREDIT_CARD',
            ...current.allowedBillingTypes.filter((type) => {
              if (type === 'BOLETO') return cycle === 'MONTHLY';
              if (type === 'PIX') return cycle === 'YEARLY';
              return type === 'CREDIT_CARD';
            }),
          ])]
        : current.allowedBillingTypes,
    }));
  }

  function toggleBillingType(type: string) {
    if (!billingTypeAvailable(type) || (selected?.customerType === 'PERSON' && type === 'CREDIT_CARD')) return;
    setVersionForm((current) => ({
      ...current,
      allowedBillingTypes: current.allowedBillingTypes.includes(type)
        ? current.allowedBillingTypes.filter((item) => item !== type)
        : [...current.allowedBillingTypes, type],
    }));
  }

  return (
    <div className="space-y-6 p-8">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{editingId ? 'Editar oferta' : 'Nova oferta'}</h2>
          {editingId && <button type="button" onClick={resetOfferForm} className="text-sm text-ink-tertiary">Cancelar edição</button>}
        </div>
        <form onSubmit={saveOffer} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Nome</span>
            <input required value={offerForm.name} onChange={e => changeOfferName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="font-medium">Identificador interno</span>
            <input
              value={offerForm.code}
              placeholder="Gerado automaticamente"
              onChange={e => { setCodeEdited(true); setOfferForm({ ...offerForm, code: toCommercialCode(e.target.value) }); }}
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono"
            />
            <small className="mt-1 block text-xs text-ink-tertiary">Usado em integrações e auditoria; não é o nome exibido ao cliente.</small>
          </label>
          <select value={offerForm.customerType} onChange={e => setOfferForm({ ...offerForm, customerType: e.target.value })} className="rounded-lg border px-3 py-2">
            <option value="PERSON">Pessoa física</option>
            <option value="COMPANY">Pessoa jurídica</option>
          </select>
          <label className="text-sm">
            <span className="font-medium">Endereço público</span>
            <div className="mt-1 flex rounded-lg border bg-surface-input">
              <span className="px-3 py-2 text-ink-tertiary">/assinar/</span>
              <input
                value={offerForm.publicSlug}
                placeholder="gerado-do-nome"
                onChange={e => { setSlugEdited(true); setOfferForm({ ...offerForm, publicSlug: toPublicSlug(e.target.value) }); }}
                className="min-w-0 flex-1 rounded-r-lg bg-transparent px-1 py-2 outline-none"
              />
            </div>
          </label>
          <select value={offerForm.assignmentTeamId} onChange={e => setOfferForm({ ...offerForm, assignmentTeamId: e.target.value, assignmentUserId: '' })} className="rounded-lg border px-3 py-2">
            <option value="">Sem time de atribuição</option>
            {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <select value={offerForm.assignmentUserId} onChange={e => setOfferForm({ ...offerForm, assignmentUserId: e.target.value })} className="rounded-lg border px-3 py-2">
            <option value="">Distribuir automaticamente no time</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <textarea placeholder="Descrição" value={offerForm.description} onChange={e => setOfferForm({ ...offerForm, description: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2" />
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-2 disabled:opacity-50">
            {editingId ? 'Salvar alterações' : 'Criar oferta'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Nova versão de preço</h2>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="mt-4 w-full rounded-lg border px-3 py-2">
          <option value="">Selecione uma oferta</option>
          {offers.filter(offer => offer.active).map(offer => <option key={offer.id} value={offer.id}>{offer.name} — {offer.customerType === 'PERSON' ? 'PF' : 'PJ'}</option>)}
        </select>
        {selected?.active && (
          <form onSubmit={createVersion} className="mt-4 grid gap-3 md:grid-cols-2">
            <select value={versionForm.billingCycle} onChange={e => changeBillingCycle(e.target.value)} className="rounded-lg border px-3 py-2">
              {billingCycles
                .filter(cycle => selected.customerType !== 'PERSON' || ['MONTHLY', 'YEARLY'].includes(cycle))
                .map(cycle => <option key={cycle} value={cycle}>{billingCycleLabels[cycle]}</option>)}
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
            <select required value={versionForm.contractTemplateVersionId} onChange={e => setVersionForm({ ...versionForm, contractTemplateVersionId: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2">
              <option value="">Selecione uma versão contratual publicada</option>
              {templates
                .filter(template => template.customerType === selected.customerType)
                .flatMap(template => template.versions
                  .filter(version => version.status === 'PUBLISHED')
                  .map(version => <option key={version.id} value={version.id}>{template.name} — v{version.version}</option>))}
            </select>
            <fieldset className="md:col-span-2">
              <legend className="text-sm font-medium">Formas de pagamento</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {billingTypes.map(type => {
                  const available = billingTypeAvailable(type);
                  const locked = selected.customerType === 'PERSON' && type === 'CREDIT_CARD';
                  return (
                    <label key={type} className={`flex items-center gap-2 text-sm ${available ? '' : 'opacity-40'}`}>
                      <input
                        type="checkbox"
                        checked={versionForm.allowedBillingTypes.includes(type)}
                        disabled={!available || locked}
                        onChange={() => toggleBillingType(type)}
                      />
                      {billingTypeLabels[type]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <button disabled={busy || !versionForm.allowedBillingTypes.length || !versionForm.contractTemplateVersionId} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-2 disabled:opacity-50">Criar versão</button>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ofertas cadastradas</h2>
          <span className="text-sm text-ink-tertiary">{offers.length} oferta(s)</span>
        </div>
        <div className="mt-4 space-y-4">
          {offers.map(offer => (
            <article key={offer.id} className={`rounded-lg border p-4 ${offer.active ? '' : 'opacity-65'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{offer.name}</h3>
                    <span className="rounded-full bg-surface-canvas px-2 py-0.5 text-xs">{offerStatusLabels[offer.status] || offer.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-tertiary">{offer.customerType === 'PERSON' ? 'Pessoa física' : 'Pessoa jurídica'} · código {offer.code}</p>
                  {offer.publicSlug && <p className="mt-1 text-xs text-ink-tertiary">Página pública: /assinar/{offer.publicSlug}</p>}
                </div>
                <div className="flex gap-2">
                  {offer.active ? (
                    <>
                      <button type="button" onClick={() => editOffer(offer)} className="rounded-md border px-3 py-1 text-xs">Editar</button>
                      <button type="button" onClick={() => revokeOffer(offer)} className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-700">Revogar</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => restoreOffer(offer)} className="rounded-md border px-3 py-1 text-xs">Reativar como rascunho</button>
                  )}
                </div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b"><th className="py-2">Versão</th><th>Status</th><th>Ciclo</th><th>Valor-base</th><th>Contrato</th><th></th></tr></thead>
                  <tbody>
                    {offer.versions.map(version => (
                      <tr key={version.id} className="border-b last:border-0">
                        <td className="py-2">v{version.version}</td>
                        <td>{offerVersionStatusLabels[version.status] || version.status}</td>
                        <td>{billingCycleLabels[version.billingCycle] || version.billingCycle}</td>
                        <td>{Number(version.holderAmount || version.unitPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        <td>{version.contractTemplateVersionId ? 'Vinculado' : 'Pendente'}</td>
                        <td className="text-right">
                          {offer.active && version.status === 'DRAFT' && (
                            <button disabled={busy} onClick={() => publish(offer.id, version.id)} className="rounded-md border px-3 py-1 text-xs">Publicar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!offer.versions.length && <tr><td colSpan={6} className="py-3 text-ink-tertiary">Nenhuma versão de preço cadastrada.</td></tr>}
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

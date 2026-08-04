'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CurrencyInput } from '@/components/masked-number-input';
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
  active: boolean;
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

  const publishedTemplateOptions = useMemo(() => {
    if (!selected) return [];
    return templates
      .filter((template) => template.active && template.customerType === selected.customerType)
      .flatMap((template) => template.versions
        .filter((version) => version.status === 'PUBLISHED')
        .map((version) => ({
          id: version.id,
          label: `${template.name} — versão ${version.version}`,
        })));
  }, [selected, templates]);

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
    const offer = offers.find((item) => item.id === offerId);
    const current = offer?.versions.find((version) => version.status === 'PUBLISHED');
    const target = offer?.versions.find((version) => version.id === versionId);
    const message = current
      ? `Publicar a versão v${target?.version || ''}? A versão v${current.version} deixará de ser vigente e será preservada no histórico.`
      : `Publicar a versão v${target?.version || ''} como versão vigente desta oferta?`;
    if (!window.confirm(message)) return;

    setBusy(true);
    setError('');
    try {
      await api(`/commercial/offers/${offerId}/versions/${versionId}/publish`, { method: 'POST' });
      setSuccess(current
        ? 'Nova versão vigente publicada. A versão anterior foi movida para o histórico.'
        : 'Versão vigente publicada. A oferta está disponível conforme sua configuração.');
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
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <nav className="flex flex-wrap gap-2 rounded-xl border border-edge bg-surface-elevated p-2 text-sm">
        <a href="#ofertas-cadastradas" className="rounded-lg px-3 py-2 text-ink-secondary hover:bg-surface-canvas hover:text-ink">Ofertas cadastradas</a>
        <a href="#cadastro-oferta" className="rounded-lg px-3 py-2 text-ink-secondary hover:bg-surface-canvas hover:text-ink">Criar ou editar oferta</a>
        <a href="#versao-preco" className="rounded-lg px-3 py-2 text-ink-secondary hover:bg-surface-canvas hover:text-ink">Criar versão de preço</a>
      </nav>

      <section id="cadastro-oferta" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
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
          <label className="text-sm">
            <span className="font-medium">Tipo de contratação</span>
            <select value={offerForm.customerType} onChange={e => setOfferForm({ ...offerForm, customerType: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="PERSON">Pessoa física</option>
              <option value="COMPANY">Pessoa jurídica</option>
            </select>
          </label>
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
            <small className="mt-1 block text-xs text-ink-tertiary">Endereço usado no checkout genérico. Pode ficar vazio para ofertas apenas negociadas internamente.</small>
          </label>
          <label className="text-sm">
            <span className="font-medium">Time responsável</span>
            <select value={offerForm.assignmentTeamId} onChange={e => setOfferForm({ ...offerForm, assignmentTeamId: e.target.value, assignmentUserId: '' })} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="">Sem time de atribuição</option>
              {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
            <small className="mt-1 block text-xs text-ink-tertiary">Novas oportunidades públicas podem ser distribuídas entre os membros deste time.</small>
          </label>
          <label className="text-sm">
            <span className="font-medium">Responsável fixo</span>
            <select value={offerForm.assignmentUserId} onChange={e => setOfferForm({ ...offerForm, assignmentUserId: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="">Distribuir automaticamente no time</option>
              {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
            <small className="mt-1 block text-xs text-ink-tertiary">Quando selecionado, todas as oportunidades desta oferta ficam com este usuário.</small>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="font-medium">Descrição pública</span>
            <textarea placeholder="Explique resumidamente o que esta oferta inclui" value={offerForm.description} onChange={e => setOfferForm({ ...offerForm, description: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-white md:col-span-2 disabled:opacity-50">
            {editingId ? 'Salvar alterações' : 'Criar oferta'}
          </button>
        </form>
      </section>

      <section id="versao-preco" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <div>
          <h2 className="text-lg font-semibold">Nova versão de preço</h2>
          <p className="mt-1 text-sm text-ink-tertiary">Cada versão congela valores, periodicidade, pagamento e contrato para preservar o histórico.</p>
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Cada oferta possui somente <strong>uma versão vigente</strong>. Ao publicar uma nova versão, a anterior é encerrada automaticamente e continua disponível apenas para consulta histórica.
          </div>
        </div>
        <label className="mt-4 block text-sm">
          <span className="font-medium">Oferta que receberá a nova versão</span>
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setVersionForm(current => ({ ...current, contractTemplateVersionId: '' })); }}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="">Selecione uma oferta</option>
            {offers.filter(offer => offer.active).map(offer => <option key={offer.id} value={offer.id}>{offer.name} — {offer.customerType === 'PERSON' ? 'Pessoa física' : 'Pessoa jurídica'}</option>)}
          </select>
        </label>
        {selected?.active && (
          <form onSubmit={createVersion} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm md:col-span-2">
              <span className="font-medium">Periodicidade da cobrança</span>
              <select value={versionForm.billingCycle} onChange={e => changeBillingCycle(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2">
                {billingCycles
                  .filter(cycle => selected.customerType !== 'PERSON' || ['MONTHLY', 'YEARLY'].includes(cycle))
                  .map(cycle => <option key={cycle} value={cycle}>{billingCycleLabels[cycle]}</option>)}
              </select>
              <small className="mt-1 block text-xs text-ink-tertiary">Esta periodicidade já chegará definida no checkout e não poderá ser alterada pelo cliente.</small>
            </label>
            {selected.customerType === 'PERSON' ? (
              <>
                <label className="text-sm">
                  <span className="font-medium">Valor do titular</span>
                  <CurrencyInput value={versionForm.holderAmount} onValueChange={(value) => setVersionForm({ ...versionForm, holderAmount: value })} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="R$ 0,00" />
                </label>
                <label className="text-sm">
                  <span className="font-medium">Valor por dependente</span>
                  <CurrencyInput value={versionForm.dependentAmount} onValueChange={(value) => setVersionForm({ ...versionForm, dependentAmount: value })} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="R$ 0,00" />
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="font-medium">Quantidade máxima de dependentes</span>
                  <input type="number" min="0" value={versionForm.maxDependents} onChange={e => setVersionForm({ ...versionForm, maxDependents: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
              </>
            ) : (
              <>
                <label className="text-sm">
                  <span className="font-medium">Preço-base por vida</span>
                  <CurrencyInput value={versionForm.unitPrice} onValueChange={(value) => setVersionForm({ ...versionForm, unitPrice: value })} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="R$ 0,00" />
                </label>
                <label className="text-sm">
                  <span className="font-medium">Quantidade mínima de vidas</span>
                  <input type="number" min="1" value={versionForm.minLives} onChange={e => setVersionForm({ ...versionForm, minLives: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
                <label className="text-sm md:col-span-2">
                  <span className="font-medium">Quantidade máxima de vidas</span>
                  <input type="number" min="1" value={versionForm.maxLives} onChange={e => setVersionForm({ ...versionForm, maxLives: e.target.value })} placeholder="Sem limite quando vazio" className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
              </>
            )}
            <label className="text-sm md:col-span-2">
              <span className="font-medium">Modelo e versão contratual</span>
              <select required value={versionForm.contractTemplateVersionId} onChange={e => setVersionForm({ ...versionForm, contractTemplateVersionId: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
                <option value="">Selecione uma versão contratual publicada</option>
                {publishedTemplateOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <small className="mt-1 block text-xs text-ink-tertiary">Apenas versões publicadas e do mesmo tipo de cliente aparecem aqui.</small>
            </label>
            {!publishedTemplateOptions.length && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 md:col-span-2">
                Nenhuma versão contratual publicada para {selected.customerType === 'PERSON' ? 'pessoa física' : 'pessoa jurídica'}.{' '}
                <Link href="/dashboard/configuracoes/contratos" className="font-medium underline">Criar ou publicar uma versão contratual</Link>.
              </div>
            )}
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

      <section id="ofertas-cadastradas" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
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
                      <tr key={version.id} className={`border-b last:border-0 ${version.status === 'PUBLISHED' ? 'bg-brand/5' : ''}`}>
                        <td className="py-2 font-medium">v{version.version}</td>
                        <td>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${
                            version.status === 'PUBLISHED'
                              ? 'bg-green-100 text-green-800'
                              : version.status === 'DRAFT'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-surface-canvas text-ink-tertiary'
                          }`}>
                            {offerVersionStatusLabels[version.status] || version.status}
                          </span>
                        </td>
                        <td>{billingCycleLabels[version.billingCycle] || version.billingCycle}</td>
                        <td>{Number(version.holderAmount || version.unitPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        <td>{version.contractTemplateVersionId ? 'Vinculado' : 'Pendente'}</td>
                        <td className="text-right">
                          {offer.active && version.status === 'DRAFT' && (
                            <button disabled={busy} onClick={() => publish(offer.id, version.id)} className="rounded-md border border-brand/30 px-3 py-1 text-xs font-medium text-brand hover:bg-brand/5">Tornar vigente</button>
                          )}
                          {version.status === 'PUBLISHED' && <span className="text-xs font-medium text-green-700">Em uso</span>}
                          {version.status === 'RETIRED' && <span className="text-xs text-ink-tertiary">Somente histórico</span>}
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

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

type CustomerType = 'PERSON' | 'COMPANY';
type BillingCycle = 'MONTHLY' | 'YEARLY';
type BillingOption = {
  id: string;
  billingCycle: BillingCycle;
  holderAmount: string | null;
  dependentAmount: string | null;
  unitPrice: string | null;
  annualDiscountPercent: string;
  allowedBillingTypes: string[];
};

type OfferVersion = {
  id: string;
  version: number;
  status: string;
  maxDependents: number;
  minLives: number;
  maxLives: number | null;
  contractTemplateVersionId: string | null;
  billingOptions?: BillingOption[];
  billingCycle: BillingCycle;
  holderAmount: string | null;
  dependentAmount: string | null;
  unitPrice: string | null;
  allowedBillingTypes: string[];
};

type Team = { id: string; name: string };
type User = { id: string; name: string };
type ContractTemplateVersion = { id: string; version: number; status: string };
type ContractTemplate = {
  id: string;
  name: string;
  customerType: CustomerType;
  active: boolean;
  versions: ContractTemplateVersion[];
};

type Offer = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  customerType: CustomerType;
  status: string;
  active: boolean;
  publicSlug: string | null;
  assignmentTeamId: string | null;
  assignmentUserId: string | null;
  versions: OfferVersion[];
};

const billingTypes = ['CREDIT_CARD', 'BOLETO', 'PIX'];
const emptyOfferForm = {
  name: '',
  code: '',
  customerType: 'PERSON' as CustomerType,
  description: '',
  publicSlug: '',
  assignmentTeamId: '',
  assignmentUserId: '',
};

const emptyVersionForm = {
  holderAmount: '0',
  dependentAmount: '0',
  unitPrice: '0',
  maxDependents: '5',
  minLives: '1',
  maxLives: '',
  monthlyEnabled: true,
  yearlyEnabled: true,
  annualDiscountPercent: '10',
  monthlyBillingTypes: ['CREDIT_CARD'] as string[],
  yearlyBillingTypes: ['CREDIT_CARD', 'PIX'] as string[],
  contractTemplateVersionId: '',
};

function money(value: unknown) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

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
  const [versionForm, setVersionForm] = useState(emptyVersionForm);

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
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar ofertas públicas.');
    }
  }, []);

  useEffect(() => {
    setPageTitle(
      'Ofertas públicas',
      'Páginas de contratação autônoma, com preços, periodicidade e contrato versionados.',
    );
    load();
  }, [load, setPageTitle]);

  useEffect(() => {
    setVersionForm((current) => ({
      ...current,
      monthlyEnabled: true,
      yearlyEnabled: selected?.customerType === 'PERSON',
      annualDiscountPercent: selected?.customerType === 'PERSON'
        ? current.annualDiscountPercent
        : '0',
      monthlyBillingTypes: ['CREDIT_CARD'],
      yearlyBillingTypes: ['CREDIT_CARD', 'PIX'],
      contractTemplateVersionId: '',
    }));
  }, [selected?.id, selected?.customerType]);

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
      setSuccess(editingId ? 'Oferta pública atualizada.' : 'Oferta pública criada como rascunho.');
      resetOfferForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar oferta pública.');
    } finally {
      setBusy(false);
    }
  }

  function toggleBillingType(cycle: BillingCycle, type: string) {
    if (type === 'CREDIT_CARD') return;
    const key = cycle === 'MONTHLY' ? 'monthlyBillingTypes' : 'yearlyBillingTypes';
    setVersionForm((current) => {
      const currentTypes = current[key];
      return {
        ...current,
        [key]: currentTypes.includes(type)
          ? currentTypes.filter((item) => item !== type)
          : [...currentTypes, type],
      };
    });
  }

  async function createVersion(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !selected) return;
    if (selected.customerType === 'PERSON' && !versionForm.monthlyEnabled && !versionForm.yearlyEnabled) {
      setError('Ative ao menos uma periodicidade para a oferta.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const billingOptions = selected.customerType === 'COMPANY'
        ? [{
            billingCycle: 'MONTHLY',
            unitPrice: Number(versionForm.unitPrice),
            annualDiscountPercent: 0,
            allowedBillingTypes: versionForm.monthlyBillingTypes,
            pricingRules: {},
          }]
        : [
            ...(versionForm.monthlyEnabled ? [{
              billingCycle: 'MONTHLY',
              holderAmount: Number(versionForm.holderAmount),
              dependentAmount: Number(versionForm.dependentAmount),
              annualDiscountPercent: 0,
              allowedBillingTypes: versionForm.monthlyBillingTypes,
              pricingRules: {
                allowMonthlyBoleto: versionForm.monthlyBillingTypes.includes('BOLETO'),
              },
            }] : []),
            ...(versionForm.yearlyEnabled ? [{
              billingCycle: 'YEARLY',
              holderAmount: Number(versionForm.holderAmount),
              dependentAmount: Number(versionForm.dependentAmount),
              annualDiscountPercent: Number(versionForm.annualDiscountPercent),
              allowedBillingTypes: versionForm.yearlyBillingTypes,
              pricingRules: {},
            }] : []),
          ];

      await api(`/commercial/offers/${selectedId}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          billingOptions,
          maxDependents: selected.customerType === 'PERSON'
            ? Number(versionForm.maxDependents)
            : undefined,
          minLives: selected.customerType === 'COMPANY'
            ? Number(versionForm.minLives)
            : undefined,
          maxLives: selected.customerType === 'COMPANY' && versionForm.maxLives
            ? Number(versionForm.maxLives)
            : undefined,
          contractTemplateVersionId: versionForm.contractTemplateVersionId || undefined,
        }),
      });
      setSuccess('Nova versão criada. Revise as condições antes de ativá-la.');
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
      ? `Ativar a versão v${target?.version || ''}? A versão v${current.version} será preservada no histórico.`
      : `Ativar a versão v${target?.version || ''} e disponibilizar a página pública?`;
    if (!window.confirm(message)) return;

    setBusy(true);
    setError('');
    try {
      await api(`/commercial/offers/${offerId}/versions/${versionId}/publish`, { method: 'POST' });
      setSuccess('Versão ativa. A página pública usa exatamente estes preços e este contrato.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao ativar versão.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeOffer(offer: Offer) {
    if (!window.confirm(`Revogar a oferta “${offer.name}”? O link deixará de aceitar novas contratações.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/commercial/offers/${offer.id}/revoke`, { method: 'POST' });
      setSuccess('Oferta revogada. Contratações e histórico foram preservados.');
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
      setSuccess('Oferta restaurada como rascunho. Ative uma versão para reabrir o link.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao restaurar oferta.');
    } finally {
      setBusy(false);
    }
  }

  function optionsOf(version: OfferVersion): BillingOption[] {
    if (version.billingOptions?.length) return version.billingOptions;
    return [{
      id: `${version.id}-${version.billingCycle}`,
      billingCycle: version.billingCycle,
      holderAmount: version.holderAmount,
      dependentAmount: version.dependentAmount,
      unitPrice: version.unitPrice,
      annualDiscountPercent: '0',
      allowedBillingTypes: version.allowedBillingTypes,
    }];
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <p className="font-semibold text-blue-950">Esta área é somente para vendas autônomas</p>
        <p className="mt-1 text-sm text-blue-900">
          Cada oferta gera um endereço público. Para negociações assistidas pelo comercial, use a
          tabela de preços padrão da oportunidade.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/dashboard/configuracoes/comercial" className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-900">
            Configurar preços das negociações
          </Link>
          <Link href="/dashboard/configuracoes/contratos" className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-900">
            Gerenciar contratos
          </Link>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-xl border border-edge bg-surface-elevated p-2 text-sm">
        <a href="#ofertas-cadastradas" className="rounded-lg px-3 py-2 text-ink-secondary hover:bg-surface-canvas hover:text-ink">Ofertas públicas</a>
        <a href="#cadastro-oferta" className="rounded-lg px-3 py-2 text-ink-secondary hover:bg-surface-canvas hover:text-ink">Criar oferta</a>
        <a href="#versao-preco" className="rounded-lg px-3 py-2 text-ink-secondary hover:bg-surface-canvas hover:text-ink">Preços e contrato</a>
      </nav>

      <section id="cadastro-oferta" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{editingId ? 'Editar oferta pública' : 'Nova oferta pública'}</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              O endereço identifica a página onde o cliente inicia a contratação sem o comercial.
            </p>
          </div>
          {editingId && (
            <button type="button" onClick={resetOfferForm} className="text-sm text-ink-tertiary">
              Cancelar edição
            </button>
          )}
        </div>

        <form onSubmit={saveOffer} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Nome da oferta</span>
            <input
              required
              value={offerForm.name}
              onChange={(event) => changeOfferName(event.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="Ex.: Plano Família"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Tipo de cliente</span>
            <select
              value={offerForm.customerType}
              disabled={Boolean(editingId)}
              onChange={(event) => setOfferForm({
                ...offerForm,
                customerType: event.target.value as CustomerType,
              })}
              className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-gray-100"
            >
              <option value="PERSON">Pessoa física</option>
              <option value="COMPANY">Pessoa jurídica</option>
            </select>
          </label>

          <label className="text-sm md:col-span-2">
            <span className="font-medium">Descrição exibida ao cliente</span>
            <textarea
              value={offerForm.description}
              onChange={(event) => setOfferForm({ ...offerForm, description: event.target.value })}
              className="mt-1 min-h-24 w-full rounded-lg border px-3 py-2"
              placeholder="Explique os benefícios e as condições principais."
            />
          </label>

          <label className="text-sm">
            <span className="font-medium">Endereço público</span>
            <div className="mt-1 flex rounded-lg border bg-white">
              <span className="border-r bg-gray-50 px-3 py-2 text-gray-500">/assinar/</span>
              <input
                required
                value={offerForm.publicSlug}
                onChange={(event) => {
                  setSlugEdited(true);
                  setOfferForm({ ...offerForm, publicSlug: toPublicSlug(event.target.value) });
                }}
                className="min-w-0 flex-1 rounded-r-lg px-3 py-2"
              />
            </div>
          </label>

          <label className="text-sm">
            <span className="font-medium">Identificador interno</span>
            <input
              value={offerForm.code}
              onChange={(event) => {
                setCodeEdited(true);
                setOfferForm({ ...offerForm, code: toCommercialCode(event.target.value) });
              }}
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono"
              placeholder="Gerado automaticamente"
            />
          </label>

          <label className="text-sm">
            <span className="font-medium">Time que receberá novos leads</span>
            <select
              value={offerForm.assignmentTeamId}
              onChange={(event) => setOfferForm({ ...offerForm, assignmentTeamId: event.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="">Sem atribuição automática</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>

          <label className="text-sm">
            <span className="font-medium">Responsável preferencial</span>
            <select
              value={offerForm.assignmentUserId}
              onChange={(event) => setOfferForm({ ...offerForm, assignmentUserId: event.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="">Distribuir pelo time</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>

          <button
            disabled={busy}
            className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50 md:col-span-2"
          >
            {busy ? 'Salvando...' : editingId ? 'Salvar oferta pública' : 'Criar oferta pública'}
          </button>
        </form>
      </section>

      <section id="ofertas-cadastradas" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <div>
          <h2 className="text-lg font-semibold">Ofertas públicas cadastradas</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Podem existir várias ofertas para o mesmo tipo de cliente. Cada endereço seleciona a sua própria oferta.
          </p>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {offers.map((offer) => {
            const current = offer.versions.find((version) => version.status === 'PUBLISHED');
            return (
              <article
                key={offer.id}
                className={`rounded-xl border p-4 ${selectedId === offer.id ? 'border-black ring-2 ring-black/5' : ''}`}
              >
                <button type="button" onClick={() => setSelectedId(offer.id)} className="w-full text-left">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{offer.name}</p>
                      <p className="mt-1 text-xs text-ink-tertiary">
                        {offer.customerType === 'PERSON' ? 'Pessoa física' : 'Pessoa jurídica'}
                      </p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">
                      {offerStatusLabels[offer.status] || offer.status}
                    </span>
                  </div>
                  <p className="mt-3 font-mono text-xs text-blue-700">
                    {offer.publicSlug ? `/assinar/${offer.publicSlug}` : 'Endereço não definido'}
                  </p>
                  <p className="mt-2 text-sm text-ink-secondary">
                    {current
                      ? `Versão v${current.version} ativa • ${optionsOf(current).map((option) => billingCycleLabels[option.billingCycle] || option.billingCycle).join(' e ')}`
                      : 'Nenhuma versão ativa'}
                  </p>
                </button>
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                  <button type="button" onClick={() => editOffer(offer)} className="rounded-lg border px-3 py-2 text-sm">
                    Editar
                  </button>
                  {offer.status === 'ARCHIVED' ? (
                    <button type="button" onClick={() => restoreOffer(offer)} className="rounded-lg border px-3 py-2 text-sm">
                      Restaurar
                    </button>
                  ) : (
                    <button type="button" onClick={() => revokeOffer(offer)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">
                      Revogar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!offers.length && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-ink-secondary lg:col-span-2">
              Crie a primeira oferta pública para habilitar uma página de contratação autônoma.
            </div>
          )}
        </div>
      </section>

      <section id="versao-preco" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <div>
          <h2 className="text-lg font-semibold">Preços, periodicidade e contrato</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            A versão ativa é congelada na oportunidade criada pela página pública.
          </p>
        </div>

        {!selected ? (
          <p className="mt-5 rounded-lg border border-dashed p-5 text-sm text-ink-secondary">
            Selecione ou crie uma oferta para configurar sua versão.
          </p>
        ) : (
          <>
            <div className="mt-5 rounded-xl bg-gray-50 p-4">
              <p className="font-medium">{selected.name}</p>
              <p className="mt-1 text-xs text-gray-600">
                {selected.customerType === 'PERSON'
                  ? 'PF pode disponibilizar mensal, anual ou ambos. O desconto anual é automático e não consome a alçada comercial.'
                  : 'PJ utiliza exclusivamente cobrança mensal por vida.'}
              </p>
            </div>

            <form onSubmit={createVersion} className="mt-5 space-y-5">
              {selected.customerType === 'PERSON' ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="text-sm">
                      <span className="font-medium">Titular por mês</span>
                      <CurrencyInput
                        value={versionForm.holderAmount}
                        onValueChange={(value) => setVersionForm({ ...versionForm, holderAmount: value })}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        placeholder="R$ 0,00"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="font-medium">Dependente por mês</span>
                      <CurrencyInput
                        value={versionForm.dependentAmount}
                        onValueChange={(value) => setVersionForm({ ...versionForm, dependentAmount: value })}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        placeholder="R$ 0,00"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="font-medium">Limite de dependentes</span>
                      <input
                        type="number"
                        min={0}
                        value={versionForm.maxDependents}
                        onChange={(event) => setVersionForm({ ...versionForm, maxDependents: event.target.value })}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className={`rounded-xl border p-4 ${versionForm.monthlyEnabled ? 'border-black' : 'opacity-60'}`}>
                      <label className="flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={versionForm.monthlyEnabled}
                          onChange={(event) => setVersionForm({ ...versionForm, monthlyEnabled: event.target.checked })}
                        />
                        Disponibilizar mensal
                      </label>
                      <p className="mt-1 text-xs text-gray-500">Cobrança recorrente a cada mês.</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {billingTypes.filter((type) => type !== 'PIX').map((type) => (
                          <label key={type} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={versionForm.monthlyBillingTypes.includes(type)}
                              disabled={type === 'CREDIT_CARD' || !versionForm.monthlyEnabled}
                              onChange={() => toggleBillingType('MONTHLY', type)}
                            />
                            {billingTypeLabels[type] || type}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className={`rounded-xl border p-4 ${versionForm.yearlyEnabled ? 'border-black' : 'opacity-60'}`}>
                      <label className="flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={versionForm.yearlyEnabled}
                          onChange={(event) => setVersionForm({ ...versionForm, yearlyEnabled: event.target.checked })}
                        />
                        Disponibilizar anual
                      </label>
                      <p className="mt-1 text-xs text-gray-500">
                        Calcula 12 meses e aplica o desconto configurado abaixo.
                      </p>
                      <label className="mt-4 block text-sm">
                        <span className="font-medium">Desconto anual automático (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          disabled={!versionForm.yearlyEnabled}
                          value={versionForm.annualDiscountPercent}
                          onChange={(event) => setVersionForm({ ...versionForm, annualDiscountPercent: event.target.value })}
                          className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-gray-100"
                        />
                      </label>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {billingTypes.filter((type) => type !== 'BOLETO').map((type) => (
                          <label key={type} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={versionForm.yearlyBillingTypes.includes(type)}
                              disabled={type === 'CREDIT_CARD' || !versionForm.yearlyEnabled}
                              onChange={() => toggleBillingType('YEARLY', type)}
                            />
                            {billingTypeLabels[type] || type}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="text-sm">
                    <span className="font-medium">Preço mensal por vida</span>
                    <CurrencyInput
                      value={versionForm.unitPrice}
                      onValueChange={(value) => setVersionForm({ ...versionForm, unitPrice: value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                      placeholder="R$ 0,00"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="font-medium">Mínimo de vidas</span>
                    <input
                      type="number"
                      min={1}
                      value={versionForm.minLives}
                      onChange={(event) => setVersionForm({ ...versionForm, minLives: event.target.value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="font-medium">Máximo de vidas</span>
                    <input
                      type="number"
                      min={1}
                      value={versionForm.maxLives}
                      onChange={(event) => setVersionForm({ ...versionForm, maxLives: event.target.value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                      placeholder="Sem limite"
                    />
                  </label>
                  <div className="md:col-span-3">
                    <p className="text-sm font-medium">Formas de pagamento mensais</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {billingTypes.map((type) => (
                        <label key={type} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={versionForm.monthlyBillingTypes.includes(type)}
                            onChange={() => {
                              setVersionForm((current) => ({
                                ...current,
                                monthlyBillingTypes: current.monthlyBillingTypes.includes(type)
                                  ? current.monthlyBillingTypes.filter((item) => item !== type)
                                  : [...current.monthlyBillingTypes, type],
                              }));
                            }}
                          />
                          {billingTypeLabels[type] || type}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <label className="block text-sm">
                <span className="font-medium">Modelo contratual desta oferta</span>
                <select
                  required
                  value={versionForm.contractTemplateVersionId}
                  onChange={(event) => setVersionForm({
                    ...versionForm,
                    contractTemplateVersionId: event.target.value,
                  })}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                >
                  <option value="">Selecione uma versão publicada</option>
                  {publishedTemplateOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <small className="mt-1 block text-xs text-ink-tertiary">
                  Esse documento aparecerá no pré-checkout e seu conteúdo será congelado no aceite.
                </small>
              </label>

              <button
                disabled={busy}
                className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Criando versão...' : 'Criar nova versão'}
              </button>
            </form>

            <div className="mt-6 border-t pt-5">
              <h3 className="font-semibold">Histórico de versões</h3>
              <div className="mt-3 space-y-3">
                {selected.versions.map((version) => (
                  <article key={version.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Versão {version.version}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">
                            {offerVersionStatusLabels[version.status] || version.status}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {optionsOf(version).map((option) => (
                            <div key={option.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                              <p className="font-medium">
                                {billingCycleLabels[option.billingCycle] || option.billingCycle}
                                {option.billingCycle === 'YEARLY' && Number(option.annualDiscountPercent) > 0
                                  ? ` • ${Number(option.annualDiscountPercent)}% de desconto`
                                  : ''}
                              </p>
                              <p className="mt-1 text-gray-600">
                                {selected.customerType === 'PERSON'
                                  ? `${money(option.holderAmount)} titular + ${money(option.dependentAmount)} por dependente`
                                  : `${money(option.unitPrice)} por vida/mês`}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                {option.allowedBillingTypes.map((type) => billingTypeLabels[type] || type).join(', ')}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                      {version.status === 'DRAFT' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => publish(selected.id, version.id)}
                          className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                        >
                          Ativar versão
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {!selected.versions.length && (
                  <p className="rounded-lg border border-dashed p-5 text-sm text-ink-secondary">
                    Nenhuma versão criada.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CurrencyInput, PercentageInput } from '@/components/masked-number-input';
import { api } from '@/lib/api';
import {
  billingTypeLabels,
  customerTypeLabels,
  unitRoleLabels,
} from '@/lib/commercial-labels';
import { usePageTitle } from '@/lib/page-title-context';

type Policy = {
  id: string;
  name: string;
  customerType: 'PERSON' | 'COMPANY' | null;
  targetRole: string | null;
  targetUserId: string | null;
  targetTeamId: string | null;
  maxDiscountPercent: string;
  maxDiscountAmount: string | null;
  minUnitPrice: string | null;
  allowedBillingTypes: string[];
  active: boolean;
  archivedAt: string | null;
  rules: { maxLives?: number; allowedBillingCycles?: string[] };
};

type CommercialMetrics = {
  periodDays: number;
  conversion: { converted: number; total: number; rate: number; averageSeconds: number };
  webhookFailuresByStatus: Record<string, number>;
  precheckoutsByStatus: Record<string, number>;
};

type CommercialFeatureStatus = {
  enabled: boolean;
  environmentAllowed: boolean;
  unitEnabled: boolean;
  unitId: string;
  unitSlug: string;
};

type User = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  globalRole?: string;
};

type Team = { id: string; name: string };

type ContractTemplateOption = {
  id: string;
  templateName: string;
  customerType: 'PERSON' | 'COMPANY';
  version: number;
  label: string;
};

type PriceTableVersion = {
  id: string;
  customerType: 'PERSON' | 'COMPANY';
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  holderAmount: string | null;
  dependentAmount: string | null;
  unitPrice: string | null;
  annualDiscountPercent: string;
  maxDependents: number;
  minLives: number;
  maxLives: number | null;
  monthlyBillingTypes: string[];
  yearlyBillingTypes: string[];
  contractTemplateVersionId: string | null;
  effectiveFrom: string | null;
};

type Approval = {
  id: string;
  opportunityId: string;
  status: string;
  reason: string;
  requestedConditions: Record<string, unknown>;
  policyEvaluation: { violations?: string[] };
  createdAt: string;
};

type PolicyForm = {
  name: string;
  customerType: 'ALL' | 'PERSON' | 'COMPANY';
  targetType: 'ROLE' | 'TEAM' | 'USER' | 'ALL';
  targetRole: string;
  targetUserId: string;
  targetTeamId: string;
  maxDiscountPercent: string;
  maxDiscountAmount: string;
  minUnitPrice: string;
  maxLives: string;
  allowedBillingTypes: string[];
  allowedBillingCycles: string[];
};

const roleValues = ['OWNER', 'ADMIN', 'MANAGER', 'SALES'];
const billingTypes = ['CREDIT_CARD', 'BOLETO', 'PIX'];
const billingCycles = ['MONTHLY', 'YEARLY'];
const legacyUserRoleLabels: Record<string, string> = {
  administrador: 'Administrador',
  gerente: 'Gerente',
  representante: 'Negociador / Comercial',
  'super-admin': 'Administrador da instalação',
};

const emptyForm: PolicyForm = {
  name: '',
  customerType: 'ALL',
  targetType: 'ROLE',
  targetRole: 'SALES',
  targetUserId: '',
  targetTeamId: '',
  maxDiscountPercent: '0.00',
  maxDiscountAmount: '',
  minUnitPrice: '',
  maxLives: '',
  allowedBillingTypes: ['CREDIT_CARD'],
  allowedBillingCycles: ['MONTHLY', 'YEARLY'],
};

const emptyPriceForm = {
  customerType: 'PERSON' as 'PERSON' | 'COMPANY',
  holderAmount: '0',
  dependentAmount: '0',
  unitPrice: '0',
  annualDiscountPercent: '10',
  maxDependents: '5',
  minLives: '1',
  maxLives: '',
  monthlyBillingTypes: ['CREDIT_CARD'] as string[],
  yearlyBillingTypes: ['CREDIT_CARD', 'PIX'] as string[],
  contractTemplateVersionId: '',
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CommercialConfigurationPage() {
  const { setPageTitle } = usePageTitle();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [priceTables, setPriceTables] = useState<PriceTableVersion[]>([]);
  const [templateOptions, setTemplateOptions] = useState<ContractTemplateOption[]>([]);
  const [metrics, setMetrics] = useState<CommercialMetrics | null>(null);
  const [featureStatus, setFeatureStatus] = useState<CommercialFeatureStatus | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PolicyForm>(emptyForm);
  const [priceForm, setPriceForm] = useState(emptyPriceForm);

  useEffect(() => {
    setPageTitle('Configuração comercial', 'Preços padrão, contratos, políticas e aprovações da sede.');
    void load();
  }, [setPageTitle]);

  async function load() {
    setError('');
    try {
      const [
        policyData,
        approvalData,
        userData,
        teamData,
        priceTableData,
        templateOptionData,
        metricsData,
        featureData,
      ] = await Promise.all([
        api('/commercial/policies'),
        api('/commercial/approvals'),
        api('/users').catch(() => ({ data: [] })),
        api('/teams').catch(() => ({ data: [] })),
        api('/commercial/price-tables').catch(() => []),
        api('/commercial/contract-template-options').catch(() => []),
        api('/commercial/metrics?days=30').catch(() => null),
        api('/commercial/feature').catch(() => null),
      ]);
      setPolicies(Array.isArray(policyData) ? policyData : policyData.data || []);
      setApprovals(Array.isArray(approvalData) ? approvalData : approvalData.data || []);
      setUsers(Array.isArray(userData) ? userData : userData.data || []);
      setTeams(Array.isArray(teamData) ? teamData : teamData.data || []);
      setPriceTables(Array.isArray(priceTableData) ? priceTableData : priceTableData.data || []);
      setTemplateOptions(Array.isArray(templateOptionData) ? templateOptionData : templateOptionData.data || []);
      setMetrics(metricsData);
      setFeatureStatus(featureData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar configurações.');
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function editPolicy(policy: Policy) {
    setEditingId(policy.id);
    setForm({
      name: policy.name,
      customerType: policy.customerType || 'ALL',
      targetType: policy.targetUserId
        ? 'USER'
        : policy.targetTeamId
          ? 'TEAM'
          : policy.targetRole
            ? 'ROLE'
            : 'ALL',
      targetRole: policy.targetRole || 'SALES',
      targetUserId: policy.targetUserId || '',
      targetTeamId: policy.targetTeamId || '',
      maxDiscountPercent: policy.maxDiscountPercent || '0.00',
      maxDiscountAmount: policy.maxDiscountAmount || '',
      minUnitPrice: policy.minUnitPrice || '',
      maxLives: policy.rules?.maxLives ? String(policy.rules.maxLives) : '',
      allowedBillingTypes: policy.allowedBillingTypes || [],
      allowedBillingCycles: policy.rules?.allowedBillingCycles || ['MONTHLY', 'YEARLY'],
    });
    document.getElementById('formulario-politica')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const existing = editingId ? policies.find((policy) => policy.id === editingId) : null;
      await api(editingId ? `/commercial/policies/${editingId}` : '/commercial/policies', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: form.name,
          customerType: form.customerType === 'ALL' ? undefined : form.customerType,
          targetRole: form.targetType === 'ROLE' ? form.targetRole : undefined,
          targetUserId: form.targetType === 'USER' ? form.targetUserId : undefined,
          targetTeamId: form.targetType === 'TEAM' ? form.targetTeamId : undefined,
          maxDiscountPercent: Number(form.maxDiscountPercent || 0),
          maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : undefined,
          minUnitPrice: form.customerType === 'PERSON' || !form.minUnitPrice
            ? undefined
            : Number(form.minUnitPrice),
          allowedBillingTypes: form.allowedBillingTypes,
          rules: {
            ...(form.customerType !== 'PERSON' && form.maxLives
              ? { maxLives: Number(form.maxLives) }
              : {}),
            allowedBillingCycles: form.customerType === 'COMPANY'
              ? ['MONTHLY']
              : form.allowedBillingCycles,
          },
          active: existing?.active ?? true,
        }),
      });
      setSuccess(editingId ? 'Política atualizada.' : 'Política criada.');
      resetForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar política.');
    } finally {
      setSaving(false);
    }
  }

  async function changePolicyState(policy: Policy, action: 'activate' | 'deactivate' | 'restore') {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api(`/commercial/policies/${policy.id}/${action}`, { method: 'POST' });
      setSuccess(
        action === 'activate'
          ? 'Política ativada.'
          : action === 'deactivate'
            ? 'Política desativada. Ela não será usada nas próximas avaliações.'
            : 'Política restaurada como inativa. Revise e ative quando estiver pronta.',
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao alterar a política.');
    } finally {
      setSaving(false);
    }
  }

  async function archivePolicy(policy: Policy) {
    if (!window.confirm(`Arquivar a política “${policy.name}”? O histórico será preservado e ela deixará de ser aplicada.`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api(`/commercial/policies/${policy.id}`, { method: 'DELETE' });
      if (editingId === policy.id) resetForm();
      setSuccess('Política arquivada.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao arquivar política.');
    } finally {
      setSaving(false);
    }
  }

  async function submitPriceTable(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api('/commercial/price-tables/versions', {
        method: 'POST',
        body: JSON.stringify({
          customerType: priceForm.customerType,
          holderAmount: priceForm.customerType === 'PERSON'
            ? Number(priceForm.holderAmount)
            : undefined,
          dependentAmount: priceForm.customerType === 'PERSON'
            ? Number(priceForm.dependentAmount)
            : undefined,
          unitPrice: priceForm.customerType === 'COMPANY'
            ? Number(priceForm.unitPrice)
            : undefined,
          annualDiscountPercent: priceForm.customerType === 'PERSON'
            ? Number(priceForm.annualDiscountPercent)
            : 0,
          maxDependents: priceForm.customerType === 'PERSON'
            ? Number(priceForm.maxDependents)
            : undefined,
          minLives: priceForm.customerType === 'COMPANY'
            ? Number(priceForm.minLives)
            : undefined,
          maxLives: priceForm.customerType === 'COMPANY' && priceForm.maxLives
            ? Number(priceForm.maxLives)
            : undefined,
          monthlyBillingTypes: priceForm.monthlyBillingTypes,
          yearlyBillingTypes: priceForm.customerType === 'PERSON'
            ? priceForm.yearlyBillingTypes
            : undefined,
          contractTemplateVersionId: priceForm.contractTemplateVersionId || undefined,
        }),
      });
      setSuccess('Nova versão da tabela padrão criada como rascunho.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao criar tabela de preços.');
    } finally {
      setSaving(false);
    }
  }

  async function publishPriceTable(version: PriceTableVersion) {
    const current = priceTables.find((item) =>
      item.customerType === version.customerType && item.status === 'PUBLISHED');
    const label = version.customerType === 'PERSON' ? 'pessoa física' : 'pessoa jurídica';
    const message = current
      ? `Ativar a versão ${version.version} para ${label}? A versão ${current.version} será preservada no histórico.`
      : `Ativar a versão ${version.version} como preço padrão para ${label}?`;
    if (!window.confirm(message)) return;
    setSaving(true);
    setError('');
    try {
      await api(`/commercial/price-tables/versions/${version.id}/publish`, { method: 'POST' });
      setSuccess('Tabela padrão ativada. Novas negociações usarão estes valores.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao ativar tabela de preços.');
    } finally {
      setSaving(false);
    }
  }

  function togglePriceBillingType(cycle: 'MONTHLY' | 'YEARLY', type: string) {
    if (priceForm.customerType === 'PERSON' && type === 'CREDIT_CARD') return;
    setPriceForm((current) => {
      const values = cycle === 'MONTHLY'
        ? current.monthlyBillingTypes
        : current.yearlyBillingTypes;
      const updated = values.includes(type)
        ? values.filter((item) => item !== type)
        : [...values, type];
      return cycle === 'MONTHLY'
        ? { ...current, monthlyBillingTypes: updated }
        : { ...current, yearlyBillingTypes: updated };
    });
  }

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setError('');
    try {
      await api(`/commercial/approvals/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao decidir aprovação.');
    }
  }

  async function toggleFeature() {
    if (!featureStatus) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api('/commercial/feature', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !featureStatus.unitEnabled }),
      });
      setFeatureStatus(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao alterar a disponibilidade do fluxo comercial.');
    } finally {
      setSaving(false);
    }
  }

  function toggleBillingType(type: string) {
    setForm((current) => ({
      ...current,
      allowedBillingTypes: current.allowedBillingTypes.includes(type)
        ? current.allowedBillingTypes.filter((item) => item !== type)
        : [...current.allowedBillingTypes, type],
    }));
  }

  function toggleBillingCycle(cycle: string) {
    setForm((current) => ({
      ...current,
      allowedBillingCycles: current.allowedBillingCycles.includes(cycle)
        ? current.allowedBillingCycles.filter((item) => item !== cycle)
        : [...current.allowedBillingCycles, cycle],
    }));
  }

  function audienceLabel(policy: Policy) {
    if (policy.targetUserId) {
      const user = users.find((item) => item.id === policy.targetUserId);
      return user ? `${user.name}${user.email ? ` — ${user.email}` : ''}` : 'Usuário específico';
    }
    if (policy.targetTeamId) {
      return teams.find((team) => team.id === policy.targetTeamId)?.name || 'Time específico';
    }
    if (policy.targetRole) return unitRoleLabels[policy.targetRole] || policy.targetRole;
    return 'Todos os usuários da sede';
  }

  function statusLabel(policy: Policy) {
    if (policy.archivedAt) return { label: 'Arquivada', classes: 'bg-surface-canvas text-ink-tertiary' };
    if (policy.active) return { label: 'Ativa', classes: 'bg-green-100 text-green-800' };
    return { label: 'Inativa', classes: 'bg-amber-100 text-amber-800' };
  }

  const negotiationUsers = users.filter((user) =>
    user.globalRole === 'INSTALLATION_ADMIN'
    || ['administrador', 'gerente', 'representante', 'super-admin'].includes(user.role || ''));

  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap gap-2 rounded-xl border border-edge bg-surface-elevated p-2 text-sm">
        <a href="#tabelas-preco" className="rounded-lg px-3 py-2 hover:bg-surface-canvas">Preços padrão</a>
        <a href="#politicas-cadastradas" className="rounded-lg px-3 py-2 hover:bg-surface-canvas">Políticas cadastradas</a>
        <a href="#formulario-politica" className="rounded-lg px-3 py-2 hover:bg-surface-canvas">Criar ou editar</a>
        <a href="#aprovacoes" className="rounded-lg px-3 py-2 hover:bg-surface-canvas">Aprovações</a>
      </nav>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      {featureStatus && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-edge bg-surface-elevated p-5">
          <div>
            <h2 className="font-semibold">Novo fluxo comercial</h2>
            <p className="mt-1 text-sm text-ink-tertiary">
              {featureStatus.enabled
                ? 'Disponível para esta sede.'
                : featureStatus.environmentAllowed
                  ? 'Desativado na configuração da sede.'
                  : 'Bloqueado pela variável COMMERCIAL_V2_ENABLED_UNITS do ambiente.'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleFeature}
            disabled={saving || !featureStatus.environmentAllowed}
            className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
          >
            {featureStatus.unitEnabled ? 'Desativar na sede' : 'Ativar na sede'}
          </button>
        </section>
      )}

      {metrics && (
        <section className="grid gap-4 md:grid-cols-4">
          <article className="rounded-xl border border-edge bg-surface-elevated p-5">
            <p className="text-xs text-ink-tertiary">Conversão em 30 dias</p>
            <p className="mt-2 text-2xl font-semibold">{metrics.conversion.rate.toLocaleString('pt-BR')}%</p>
          </article>
          <article className="rounded-xl border border-edge bg-surface-elevated p-5">
            <p className="text-xs text-ink-tertiary">Convertidas</p>
            <p className="mt-2 text-2xl font-semibold">{metrics.conversion.converted}/{metrics.conversion.total}</p>
          </article>
          <article className="rounded-xl border border-edge bg-surface-elevated p-5">
            <p className="text-xs text-ink-tertiary">Tempo médio até conversão</p>
            <p className="mt-2 text-2xl font-semibold">{Math.round(metrics.conversion.averageSeconds / 3600)}h</p>
          </article>
          <article className="rounded-xl border border-edge bg-surface-elevated p-5">
            <p className="text-xs text-ink-tertiary">Falhas de webhook</p>
            <p className="mt-2 text-2xl font-semibold">{Object.values(metrics.webhookFailuresByStatus).reduce<number>((total, value) => total + Number(value), 0)}</p>
          </article>
        </section>
      )}

      <section id="tabelas-preco" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Preços padrão das negociações</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-tertiary">
              Estes valores iniciam novas oportunidades internas. Cada oportunidade guarda a versão
              utilizada, então mudanças futuras não alteram negociações já abertas.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
            Ofertas públicas possuem preços próprios
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {(['PERSON', 'COMPANY'] as const).map((customerType) => {
            const versions = priceTables.filter((item) => item.customerType === customerType);
            const current = versions.find((item) => item.status === 'PUBLISHED');
            return (
              <article key={customerType} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {customerType === 'PERSON' ? 'Pessoa física' : 'Pessoa jurídica'}
                    </h3>
                    <p className="mt-1 text-xs text-ink-tertiary">
                      {customerType === 'PERSON'
                        ? 'Mensal ou anual; o anual aplica o desconto automático configurado.'
                        : 'Cobrança exclusivamente mensal por vida.'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${
                    current ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {current ? `Versão ${current.version} vigente` : 'Sem preço vigente'}
                  </span>
                </div>
                {current && (
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    {customerType === 'PERSON' ? (
                      <>
                        <div>
                          <dt className="text-xs text-ink-tertiary">Titular/mês</dt>
                          <dd className="mt-1 font-medium">{money.format(Number(current.holderAmount || 0))}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-tertiary">Dependente/mês</dt>
                          <dd className="mt-1 font-medium">{money.format(Number(current.dependentAmount || 0))}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-tertiary">Desconto anual</dt>
                          <dd className="mt-1 font-medium">{Number(current.annualDiscountPercent || 0)}%</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-tertiary">Máximo de dependentes</dt>
                          <dd className="mt-1 font-medium">{current.maxDependents}</dd>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <dt className="text-xs text-ink-tertiary">Preço/vida/mês</dt>
                          <dd className="mt-1 font-medium">{money.format(Number(current.unitPrice || 0))}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-ink-tertiary">Faixa de vidas</dt>
                          <dd className="mt-1 font-medium">
                            {current.minLives} a {current.maxLives || 'sem limite'}
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                )}
                <div className="mt-4 space-y-2 border-t pt-3">
                  {versions.filter((item) => item.status !== 'PUBLISHED').map((version) => (
                    <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-canvas p-3 text-sm">
                      <span>
                        Versão {version.version} · {version.status === 'DRAFT' ? 'Rascunho' : 'Histórica'}
                      </span>
                      {version.status === 'DRAFT' && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => publishPriceTable(version)}
                          className="rounded-md border bg-white px-3 py-1.5 text-xs"
                        >
                          Ativar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        <form onSubmit={submitPriceTable} className="mt-6 space-y-5 border-t pt-6">
          <div>
            <h3 className="font-semibold">Criar nova versão de preço</h3>
            <p className="mt-1 text-sm text-ink-tertiary">
              A nova versão nasce como rascunho e só afeta oportunidades depois de ser ativada.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Tipo de cliente</span>
              <select
                value={priceForm.customerType}
                onChange={(event) => setPriceForm({
                  ...emptyPriceForm,
                  customerType: event.target.value as 'PERSON' | 'COMPANY',
                  annualDiscountPercent: event.target.value === 'PERSON' ? '10' : '0',
                  yearlyBillingTypes: event.target.value === 'PERSON'
                    ? ['CREDIT_CARD', 'PIX']
                    : [],
                })}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="PERSON">Pessoa física</option>
                <option value="COMPANY">Pessoa jurídica</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Modelo contratual padrão</span>
              <select
                required
                value={priceForm.contractTemplateVersionId}
                onChange={(event) => setPriceForm({
                  ...priceForm,
                  contractTemplateVersionId: event.target.value,
                })}
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="">Selecione uma versão publicada</option>
                {templateOptions
                  .filter((option) => option.customerType === priceForm.customerType)
                  .map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
              </select>
              <small className="block text-xs text-ink-tertiary">
                Será sugerido na oportunidade e poderá ser trocado antes do pré-checkout.
              </small>
            </label>
          </div>

          {priceForm.customerType === 'PERSON' ? (
            <div className="grid gap-4 md:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Titular por mês</span>
                <CurrencyInput
                  value={priceForm.holderAmount}
                  onValueChange={(value) => setPriceForm({ ...priceForm, holderAmount: value })}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="R$ 0,00"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Dependente por mês</span>
                <CurrencyInput
                  value={priceForm.dependentAmount}
                  onValueChange={(value) => setPriceForm({ ...priceForm, dependentAmount: value })}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="R$ 0,00"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Desconto anual automático</span>
                <PercentageInput
                  value={priceForm.annualDiscountPercent}
                  onValueChange={(value) => setPriceForm({ ...priceForm, annualDiscountPercent: value })}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="0,00%"
                />
                <small className="block text-xs text-ink-tertiary">
                  Não é contabilizado como desconto comercial.
                </small>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Máximo de dependentes</span>
                <input
                  type="number"
                  min={0}
                  value={priceForm.maxDependents}
                  onChange={(event) => setPriceForm({ ...priceForm, maxDependents: event.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Preço mensal por vida</span>
                <CurrencyInput
                  value={priceForm.unitPrice}
                  onValueChange={(value) => setPriceForm({ ...priceForm, unitPrice: value })}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="R$ 0,00"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Mínimo de vidas</span>
                <input
                  type="number"
                  min={1}
                  value={priceForm.minLives}
                  onChange={(event) => setPriceForm({ ...priceForm, minLives: event.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Máximo de vidas</span>
                <input
                  type="number"
                  min={1}
                  value={priceForm.maxLives}
                  onChange={(event) => setPriceForm({ ...priceForm, maxLives: event.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Sem limite"
                />
              </label>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <fieldset className="rounded-xl border p-4">
              <legend className="px-2 text-sm font-semibold">Pagamento mensal</legend>
              <div className="flex flex-wrap gap-3">
                {billingTypes
                  .filter((type) => priceForm.customerType === 'COMPANY' || type !== 'PIX')
                  .map((type) => (
                    <label key={type} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={priceForm.monthlyBillingTypes.includes(type)}
                        disabled={priceForm.customerType === 'PERSON' && type === 'CREDIT_CARD'}
                        onChange={() => togglePriceBillingType('MONTHLY', type)}
                      />
                      {billingTypeLabels[type] || type}
                    </label>
                  ))}
              </div>
            </fieldset>
            {priceForm.customerType === 'PERSON' && (
              <fieldset className="rounded-xl border p-4">
                <legend className="px-2 text-sm font-semibold">Pagamento anual</legend>
                <div className="flex flex-wrap gap-3">
                  {billingTypes.filter((type) => type !== 'BOLETO').map((type) => (
                    <label key={type} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={priceForm.yearlyBillingTypes.includes(type)}
                        disabled={type === 'CREDIT_CARD'}
                        onChange={() => togglePriceBillingType('YEARLY', type)}
                      />
                      {billingTypeLabels[type] || type}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>

          <button
            disabled={saving || !priceForm.monthlyBillingTypes.length}
            className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Criar versão de preço
          </button>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
          <h2 className="font-semibold">Perfis e classes de usuários</h2>
          <p className="mt-2 leading-6">
            Os perfis exibidos são papéis reais dos vínculos com a sede e possuem permissão para negociar: proprietário, administrador, gerente e negociador. Financeiro, suporte e somente leitura existem no sistema, mas não aparecem aqui porque não têm permissão de negociação. Os valores internos permanecem em inglês para estabilidade técnica, mas os nomes exibidos estão traduzidos.
          </p>
        </article>
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <h2 className="font-semibold">Aprovação somente para exceções</h2>
          <p className="mt-2 leading-6">
            Negociações dentro das políticas aplicáveis seguem direto para o pré-checkout, inclusive para pessoa jurídica.
            A aprovação é solicitada apenas quando algum limite de desconto, preço, vidas, periodicidade ou pagamento é ultrapassado.
          </p>
        </article>
      </section>

      <section id="formulario-politica" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{editingId ? 'Editar política' : 'Nova política de negociação'}</h2>
            <p className="mt-1 text-sm text-ink-tertiary">Defina para quem, para qual tipo de contratação e dentro de quais limites a regra será aplicada.</p>
          </div>
          {editingId && <button type="button" onClick={resetForm} className="rounded-lg border px-3 py-2 text-sm">Cancelar edição</button>}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-6">
          <fieldset className="grid gap-4 rounded-xl border border-edge p-4 md:grid-cols-2">
            <legend className="px-2 text-sm font-semibold">Aplicação da política</legend>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Nome da política</span>
              <input className="w-full rounded-lg border px-3 py-2" value={form.name} required onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Alçada PJ dos negociadores" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Tipo de contratação</span>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={form.customerType}
                onChange={(event) => {
                  const customerType = event.target.value as PolicyForm['customerType'];
                  setForm({
                    ...form,
                    customerType,
                    allowedBillingCycles: customerType === 'COMPANY'
                      ? ['MONTHLY']
                      : form.allowedBillingCycles.length
                        ? form.allowedBillingCycles
                        : ['MONTHLY', 'YEARLY'],
                  });
                }}
              >
                <option value="ALL">Pessoa física e jurídica</option>
                <option value="PERSON">Somente pessoa física</option>
                <option value="COMPANY">Somente pessoa jurídica</option>
              </select>
              <small className="block text-xs text-ink-tertiary">Use políticas separadas quando PF e PJ tiverem alçadas ou formas de pagamento diferentes.</small>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Aplicar a</span>
              <select className="w-full rounded-lg border px-3 py-2" value={form.targetType} onChange={(event) => setForm({ ...form, targetType: event.target.value as PolicyForm['targetType'] })}>
                <option value="ROLE">Classe de usuários</option>
                <option value="TEAM">Time comercial</option>
                <option value="USER">Usuário específico</option>
                <option value="ALL">Todos da sede</option>
              </select>
            </label>
            {form.targetType === 'ROLE' && (
              <label className="space-y-1 text-sm">
                <span className="font-medium">Perfil de usuário</span>
                <select className="w-full rounded-lg border px-3 py-2" value={form.targetRole} onChange={(event) => setForm({ ...form, targetRole: event.target.value })}>
                  {roleValues.map((role) => <option key={role} value={role}>{unitRoleLabels[role]}</option>)}
                </select>
              </label>
            )}
            {form.targetType === 'TEAM' && (
              <label className="space-y-1 text-sm">
                <span className="font-medium">Time comercial</span>
                <select
                  required
                  className="w-full rounded-lg border px-3 py-2"
                  value={form.targetTeamId}
                  onChange={(event) => setForm({ ...form, targetTeamId: event.target.value })}
                >
                  <option value="">Selecione</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </label>
            )}
            {form.targetType === 'USER' && (
              <label className="space-y-1 text-sm">
                <span className="font-medium">Usuário específico</span>
                <select required className="w-full rounded-lg border px-3 py-2" value={form.targetUserId} onChange={(event) => setForm({ ...form, targetUserId: event.target.value })}>
                  <option value="">Selecione</option>
                  {negotiationUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}{user.email ? ` — ${user.email}` : ''}{user.role ? ` · ${legacyUserRoleLabels[user.role] || user.role}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>

          <fieldset className="grid gap-4 rounded-xl border border-edge p-4 md:grid-cols-2">
            <legend className="px-2 text-sm font-semibold">Limites de desconto</legend>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Desconto percentual máximo</span>
              <PercentageInput
                required
                value={form.maxDiscountPercent}
                onValueChange={(value) => setForm({ ...form, maxDiscountPercent: value })}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="0,00%"
              />
              <small className="block text-xs text-ink-tertiary">Percentual máximo sobre o valor-base da contratação.</small>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Desconto máximo em reais</span>
              <CurrencyInput
                value={form.maxDiscountAmount}
                onValueChange={(value) => setForm({ ...form, maxDiscountAmount: value })}
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Sem limite nominal quando vazio"
              />
              <small className="block text-xs text-ink-tertiary">Teto absoluto do valor abatido. Ex.: 10% com limite de R$ 500,00.</small>
            </label>
          </fieldset>

          {form.customerType !== 'PERSON' && (
            <fieldset className="grid gap-4 rounded-xl border border-edge p-4 md:grid-cols-2">
              <legend className="px-2 text-sm font-semibold">Limites empresariais</legend>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Preço-base mínimo por vida</span>
                <CurrencyInput
                  value={form.minUnitPrice}
                  onValueChange={(value) => setForm({ ...form, minUnitPrice: value })}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Sem preço mínimo quando vazio"
                />
                <span className="text-xs text-ink-tertiary">
                  Menor preço por vida que pode ser informado antes da aplicação do desconto comercial.
                </span>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Quantidade máxima de vidas</span>
                <input className="w-full rounded-lg border px-3 py-2" type="number" min="1" step="1" value={form.maxLives} onChange={(event) => setForm({ ...form, maxLives: event.target.value })} placeholder="Sem limite quando vazio" />
              </label>
            </fieldset>
          )}

          <fieldset className="rounded-xl border border-edge p-4">
            <legend className="px-2 text-sm font-semibold">Periodicidades permitidas</legend>
            <div className="flex flex-wrap gap-4">
              {billingCycles.map((cycle) => {
                const locked = form.customerType === 'COMPANY' && cycle === 'MONTHLY';
                const unavailable = form.customerType === 'COMPANY' && cycle === 'YEARLY';
                return (
                  <label key={cycle} className={`flex items-center gap-2 text-sm ${unavailable ? 'opacity-40' : ''}`}>
                    <input
                      type="checkbox"
                      checked={form.allowedBillingCycles.includes(cycle)}
                      disabled={locked || unavailable}
                      onChange={() => toggleBillingCycle(cycle)}
                    />
                    {cycle === 'MONTHLY' ? 'Mensal' : 'Anual'}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-tertiary">
              Pessoa jurídica permanece mensal. Para pessoa física, a política pode restringir a negociação a mensal, anual ou ambos.
            </p>
          </fieldset>

          <fieldset className="rounded-xl border border-edge p-4">
            <legend className="px-2 text-sm font-semibold">Formas de pagamento permitidas</legend>
            <div className="flex flex-wrap gap-4">
              {billingTypes.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.allowedBillingTypes.includes(type)} onChange={() => toggleBillingType(type)} />
                  {billingTypeLabels[type] || type}
                </label>
              ))}
            </div>
          </fieldset>

          <button disabled={saving || !form.allowedBillingTypes.length || !form.allowedBillingCycles.length} className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {editingId ? 'Salvar alterações' : 'Criar política'}
          </button>
        </form>
      </section>

      <section id="politicas-cadastradas" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Políticas cadastradas</h2>
            <p className="mt-1 text-sm text-ink-tertiary">Políticas inativas e arquivadas permanecem no histórico, mas não participam das avaliações.</p>
          </div>
          <span className="text-sm text-ink-tertiary">{policies.length} política(s)</span>
        </div>
        <div className="mt-4 space-y-3">
          {policies.map((policy) => {
            const status = statusLabel(policy);
            return (
              <article key={policy.id} className={`rounded-xl border p-4 ${policy.archivedAt ? 'opacity-65' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{policy.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${status.classes}`}>{status.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-tertiary">
                      {customerTypeLabels[policy.customerType || 'ALL']} · {audienceLabel(policy)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!policy.archivedAt && <button type="button" onClick={() => editPolicy(policy)} className="rounded-md border px-3 py-1.5 text-xs">Editar</button>}
                    {!policy.archivedAt && (
                      <button type="button" disabled={saving} onClick={() => changePolicyState(policy, policy.active ? 'deactivate' : 'activate')} className="rounded-md border px-3 py-1.5 text-xs">
                        {policy.active ? 'Desativar' : 'Ativar'}
                      </button>
                    )}
                    {!policy.archivedAt ? (
                      <button type="button" disabled={saving} onClick={() => archivePolicy(policy)} className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700">Arquivar</button>
                    ) : (
                      <button type="button" disabled={saving} onClick={() => changePolicyState(policy, 'restore')} className="rounded-md border px-3 py-1.5 text-xs">Restaurar</button>
                    )}
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
                  <div><dt className="text-xs text-ink-tertiary">Desconto percentual</dt><dd className="mt-1 font-medium">{Number(policy.maxDiscountPercent).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</dd></div>
                  <div><dt className="text-xs text-ink-tertiary">Desconto em reais</dt><dd className="mt-1 font-medium">{policy.maxDiscountAmount ? money.format(Number(policy.maxDiscountAmount)) : 'Sem teto nominal'}</dd></div>
                  <div><dt className="text-xs text-ink-tertiary">Preço-base mínimo por vida</dt><dd className="mt-1 font-medium">{policy.minUnitPrice ? money.format(Number(policy.minUnitPrice)) : 'Não definido'}</dd></div>
                  <div><dt className="text-xs text-ink-tertiary">Máximo de vidas</dt><dd className="mt-1 font-medium">{policy.rules?.maxLives || 'Não definido'}</dd></div>
                  <div>
                    <dt className="text-xs text-ink-tertiary">Periodicidade</dt>
                    <dd className="mt-1 font-medium">
                      {(policy.rules?.allowedBillingCycles || (policy.customerType === 'COMPANY' ? ['MONTHLY'] : ['MONTHLY', 'YEARLY']))
                        .map((cycle) => cycle === 'MONTHLY' ? 'Mensal' : 'Anual')
                        .join(', ')}
                    </dd>
                  </div>
                  <div><dt className="text-xs text-ink-tertiary">Pagamento</dt><dd className="mt-1 font-medium">{policy.allowedBillingTypes.map((type) => billingTypeLabels[type] || type).join(', ') || 'Nenhum'}</dd></div>
                </dl>
              </article>
            );
          })}
          {!policies.length && <p className="text-sm text-ink-tertiary">Nenhuma política cadastrada.</p>}
        </div>
      </section>

      <section id="aprovacoes" className="scroll-mt-24 rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Aprovações pendentes</h2>
        <div className="mt-4 space-y-3">
          {approvals.filter((item) => item.status === 'PENDING').map((item) => (
            <article key={item.id} className="rounded-lg border p-4">
              <p className="font-medium">Oportunidade {item.opportunityId}</p>
              <p className="mt-1 text-sm text-ink-tertiary">{item.reason}</p>
              {!!item.policyEvaluation?.violations?.length && (
                <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                  {item.policyEvaluation.violations.map((violation) => <li key={violation}>{violation}</li>)}
                </ul>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={() => decide(item.id, 'APPROVED')} className="rounded-lg bg-brand px-3 py-2 text-sm text-white">Aprovar</button>
                <button onClick={() => decide(item.id, 'REJECTED')} className="rounded-lg border px-3 py-2 text-sm">Rejeitar</button>
              </div>
            </article>
          ))}
          {!approvals.some((item) => item.status === 'PENDING') && <p className="text-sm text-ink-tertiary">Nenhuma aprovação pendente.</p>}
        </div>
      </section>
    </div>
  );
}

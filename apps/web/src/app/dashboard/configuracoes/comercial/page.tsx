'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';

type Policy = {
  id: string;
  name: string;
  targetRole: string | null;
  targetUserId: string | null;
  maxDiscountPercent: string;
  maxDiscountAmount: string | null;
  minUnitPrice: string | null;
  allowedBillingTypes: string[];
  active: boolean;
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

const roles = ['OWNER', 'ADMIN', 'MANAGER', 'SALES', 'FINANCE', 'SUPPORT', 'VIEWER'];
const billingTypes = ['CREDIT_CARD', 'BOLETO', 'PIX'];

export default function CommercialConfigurationPage() {
  const { setPageTitle } = usePageTitle();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [metrics, setMetrics] = useState<CommercialMetrics | null>(null);
  const [featureStatus, setFeatureStatus] = useState<CommercialFeatureStatus | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    targetType: 'ROLE',
    targetRole: 'SALES',
    targetUserId: '',
    maxDiscountPercent: '0',
    maxDiscountAmount: '',
    minUnitPrice: '',
    maxLives: '',
    allowedBillingTypes: ['CREDIT_CARD'] as string[],
  });

  useEffect(() => {
    setPageTitle('Configuração comercial', 'Limites de negociação e aprovações');
    void load();
  }, [setPageTitle]);

  async function load() {
    setError('');
    try {
      const [policyData, approvalData, userData, metricsData, featureData] = await Promise.all([
        api('/commercial/policies'),
        api('/commercial/approvals'),
        api('/users').catch(() => ({ data: [] })),
        api('/commercial/metrics?days=30').catch(() => null),
        api('/commercial/feature').catch(() => null),
      ]);
      setPolicies(policyData || []);
      setApprovals(approvalData || []);
      setUsers(userData.data || []);
      setMetrics(metricsData);
      setFeatureStatus(featureData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar configurações.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/commercial/policies', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          targetRole: form.targetType === 'ROLE' ? form.targetRole : undefined,
          targetUserId: form.targetType === 'USER' ? form.targetUserId : undefined,
          maxDiscountPercent: Number(form.maxDiscountPercent || 0),
          maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : undefined,
          minUnitPrice: form.minUnitPrice ? Number(form.minUnitPrice) : undefined,
          allowedBillingTypes: form.allowedBillingTypes,
          rules: form.maxLives ? { maxLives: Number(form.maxLives) } : {},
          active: true,
        }),
      });
      setForm({
        name: '',
        targetType: 'ROLE',
        targetRole: 'SALES',
        targetUserId: '',
        maxDiscountPercent: '0',
        maxDiscountAmount: '',
        minUnitPrice: '',
        maxLives: '',
        allowedBillingTypes: ['CREDIT_CARD'],
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar política.');
    } finally {
      setSaving(false);
    }
  }

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setError('');
    try {
      await api(`/commercial/approvals/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao decidir aprovação.');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao alterar a disponibilidade do fluxo comercial.');
    } finally {
      setSaving(false);
    }
  }

  function toggleBillingType(type: string) {
    setForm(current => ({
      ...current,
      allowedBillingTypes: current.allowedBillingTypes.includes(type)
        ? current.allowedBillingTypes.filter(item => item !== type)
        : [...current.allowedBillingTypes, type],
    }));
  }

  return (
    <div className="space-y-8 p-8">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

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
            <p className="mt-2 text-2xl font-semibold">{Object.values(metrics.webhookFailuresByStatus).reduce((total: number, value: number) => total + value, 0)}</p>
          </article>
        </section>
      )}

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h1 className="text-lg font-semibold">Nova política de negociação</h1>
        <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Nome</span>
            <input className="w-full rounded-lg border px-3 py-2" value={form.name} required onChange={e => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Aplicar a</span>
            <select className="w-full rounded-lg border px-3 py-2" value={form.targetType} onChange={e => setForm({ ...form, targetType: e.target.value })}>
              <option value="ROLE">Classe de usuários</option>
              <option value="USER">Usuário específico</option>
              <option value="ALL">Todos da sede</option>
            </select>
          </label>
          {form.targetType === 'ROLE' && (
            <label className="space-y-1 text-sm">
              <span>Perfil</span>
              <select className="w-full rounded-lg border px-3 py-2" value={form.targetRole} onChange={e => setForm({ ...form, targetRole: e.target.value })}>
                {roles.map(role => <option key={role}>{role}</option>)}
              </select>
            </label>
          )}
          {form.targetType === 'USER' && (
            <label className="space-y-1 text-sm">
              <span>Usuário</span>
              <select required className="w-full rounded-lg border px-3 py-2" value={form.targetUserId} onChange={e => setForm({ ...form, targetUserId: e.target.value })}>
                <option value="">Selecione</option>
                {users.map(user => <option key={user.id} value={user.id}>{user.name}{user.email ? ` — ${user.email}` : ''}</option>)}
              </select>
            </label>
          )}
          <label className="space-y-1 text-sm">
            <span>Desconto percentual máximo</span>
            <input className="w-full rounded-lg border px-3 py-2" type="number" min="0" max="100" step="0.01" value={form.maxDiscountPercent} onChange={e => setForm({ ...form, maxDiscountPercent: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Desconto nominal máximo</span>
            <input className="w-full rounded-lg border px-3 py-2" type="number" min="0" step="0.01" value={form.maxDiscountAmount} onChange={e => setForm({ ...form, maxDiscountAmount: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Preço mínimo por vida</span>
            <input className="w-full rounded-lg border px-3 py-2" type="number" min="0" step="0.01" value={form.minUnitPrice} onChange={e => setForm({ ...form, minUnitPrice: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Quantidade máxima de vidas</span>
            <input className="w-full rounded-lg border px-3 py-2" type="number" min="1" step="1" value={form.maxLives} onChange={e => setForm({ ...form, maxLives: e.target.value })} />
          </label>
          <fieldset className="space-y-2 text-sm">
            <legend>Formas permitidas</legend>
            <div className="flex flex-wrap gap-3">
              {billingTypes.map(type => (
                <label key={type} className="flex items-center gap-2">
                  <input type="checkbox" checked={form.allowedBillingTypes.includes(type)} onChange={() => toggleBillingType(type)} />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>
          <button disabled={saving || !form.allowedBillingTypes.length} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white md:col-span-2 disabled:opacity-50">
            Salvar política
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Políticas ativas</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b"><th className="py-2">Nome</th><th>Perfil</th><th>Desconto</th><th>Preço mínimo</th><th>Pagamento</th></tr></thead>
            <tbody>
              {policies.map(policy => (
                <tr key={policy.id} className="border-b last:border-0">
                  <td className="py-3">{policy.name}</td>
                  <td>{policy.targetUserId ? users.find(user => user.id === policy.targetUserId)?.name || 'Usuário específico' : policy.targetRole || 'Todos'}</td>
                  <td>{Number(policy.maxDiscountPercent).toLocaleString('pt-BR')}%</td>
                  <td>{policy.minUnitPrice ? Number(policy.minUnitPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td>
                  <td>{policy.allowedBillingTypes.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-surface-elevated p-6">
        <h2 className="text-lg font-semibold">Aprovações pendentes</h2>
        <div className="mt-4 space-y-3">
          {approvals.filter(item => item.status === 'PENDING').map(item => (
            <article key={item.id} className="rounded-lg border p-4">
              <p className="font-medium">Oportunidade {item.opportunityId}</p>
              <p className="mt-1 text-sm text-ink-tertiary">{item.reason}</p>
              {!!item.policyEvaluation?.violations?.length && (
                <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                  {item.policyEvaluation.violations.map(violation => <li key={violation}>{violation}</li>)}
                </ul>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={() => decide(item.id, 'APPROVED')} className="rounded-lg bg-brand px-3 py-2 text-sm text-white">Aprovar</button>
                <button onClick={() => decide(item.id, 'REJECTED')} className="rounded-lg border px-3 py-2 text-sm">Rejeitar</button>
              </div>
            </article>
          ))}
          {!approvals.some(item => item.status === 'PENDING') && <p className="text-sm text-ink-tertiary">Nenhuma aprovação pendente.</p>}
        </div>
      </section>
    </div>
  );
}

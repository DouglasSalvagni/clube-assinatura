'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { useAuth } from '@/lib/auth-context';
import { CurrencyInput, PercentageInput } from '@/components/masked-number-input';
import { OpportunityWorkspaceNav } from '@/components/opportunity-workspace-nav';
import { billingTypeLabels, commercialStatusLabels } from '@/lib/commercial-labels';
import { DetailSkeleton } from '@/components/page-skeleton';

type Opportunity = {
  id: string;
  nome: string;
  customerType: 'PERSON' | 'COMPANY';
  commercialStatus: string;
  cycle: string | null;
  billingType: string | null;
  negotiationSnapshot: any;
  ownerUserId: string | null;
  teamId: string | null;
  checkoutLink?: string | null;
};

type Team = { id: string; name: string };
type User = { id: string; name: string };
type ContractSummary = {
  id: string;
  version: number;
  status: string;
  relationType?: string;
  changeReason?: string | null;
  requiresPayment?: boolean;
  acceptedAt?: string | null;
  parentContractId?: string | null;
};

type ApprovalSummary = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string;
  decisionNotes?: string | null;
  decidedAt?: string | null;
  createdAt?: string | null;
};

type PolicyEvaluation = {
  allowed: boolean;
  policyAllowed?: boolean;
  approvalRequired?: boolean;
  violations?: string[];
  approval?: ApprovalSummary | null;
};

export default function NegotiationWorkspacePage() {
  const { oportunidadeId } = useParams<{ oportunidadeId: string }>();
  const router = useRouter();
  const { setPageTitle } = usePageTitle();
  const { user } = useAuth();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [evaluation, setEvaluation] = useState<PolicyEvaluation | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [revisionUrl, setRevisionUrl] = useState('');
  const [revision, setRevision] = useState({
    relationType: 'AMENDMENT',
    reason: '',
    notes: '',
    effectiveAt: '',
    requiresPayment: false,
  });
  const [assignment, setAssignment] = useState({ teamId: '', ownerUserId: '' });
  const [form, setForm] = useState({
    cycle: 'MONTHLY',
    billingType: 'CREDIT_CARD',
    allowedBillingTypes: ['CREDIT_CARD'] as string[],
    holderAmount: '0',
    dependentAmount: '0',
    dependentCount: '0',
    unitPrice: '0',
    lives: '1',
    discountPercent: '0',
  });

  const load = useCallback(async () => {
    try {
      const item = await api(`/oportunidades/${oportunidadeId}`);
      setOpportunity(item);
      setAssignment({ teamId: item.teamId || '', ownerUserId: item.ownerUserId || '' });
      const snapshot = item.negotiationSnapshot || {};
      const cycle = item.cycle || snapshot.cycle || 'MONTHLY';
      let allowedBillingTypes: string[] = snapshot.allowedBillingTypes?.length
        ? snapshot.allowedBillingTypes
        : [item.billingType || snapshot.billingType || 'CREDIT_CARD'];
      if (item.customerType === 'PERSON') {
        allowedBillingTypes = [...new Set([
          'CREDIT_CARD',
          ...allowedBillingTypes.filter((type: string) =>
            type === 'CREDIT_CARD'
            || (type === 'BOLETO' && cycle === 'MONTHLY')
            || (type === 'PIX' && cycle === 'YEARLY')),
        ])];
      }
      const preferredBillingType = item.billingType || snapshot.billingType || 'CREDIT_CARD';
      setForm({
        cycle,
        billingType: allowedBillingTypes.includes(preferredBillingType) ? preferredBillingType : 'CREDIT_CARD',
        allowedBillingTypes,
        holderAmount: String(snapshot.pricing?.holderAmount ?? item.valor ?? 0),
        dependentAmount: String(snapshot.pricing?.dependentAmount ?? 0),
        dependentCount: String(snapshot.participants?.dependentCount ?? item.dependentes?.length ?? 0),
        unitPrice: String(snapshot.pricing?.unitPrice ?? 0),
        lives: String(snapshot.participants?.contractedLives ?? 1),
        discountPercent: String(
          snapshot.discounts?.find((discount: any) => discount.type === 'PERCENTAGE')?.value ?? 0,
        ),
      });
      try {
        setEvaluation(await api(`/commercial/opportunities/${oportunidadeId}/evaluation`));
      } catch {
        setEvaluation(null);
      }
      try {
        setContracts(await api(`/commercial/opportunities/${oportunidadeId}/contracts`));
      } catch {
        setContracts([]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar negociação.');
    }
  }, [oportunidadeId]);

  useEffect(() => {
    setPageTitle('Negociação comercial', 'Precificação, aprovação e envio do pré-checkout.');
    load();
  }, [load, setPageTitle]);

  useEffect(() => {
    Promise.all([
      api('/teams').catch(() => ({ data: [] })),
      api('/users').catch(() => ({ data: [] })),
    ]).then(([teamResult, userResult]) => {
      setTeams(teamResult.data || []);
      setUsers(userResult.data || []);
    });
  }, []);

  const projected = useMemo(() => {
  
  if (!opportunity) return 0;
    const discount = Number(form.discountPercent || 0) / 100;
    if (opportunity.customerType === 'COMPANY') {
      return Number(form.unitPrice || 0) * Number(form.lives || 0) * (1 - discount);
    }
    return (
      Number(form.holderAmount || 0)
      + Number(form.dependentAmount || 0) * Number(form.dependentCount || 0)
    ) * (1 - discount);
  }, [form, opportunity]);

  const role = user?.role || user?.memberships?.find(membership => membership.active)?.role;
  const canApprove = user?.globalRole === 'INSTALLATION_ADMIN' || ['OWNER', 'ADMIN', 'MANAGER'].includes(String(role));
  const latestAcceptedContract = contracts.find(contract => contract.status === 'ACCEPTED');

  async function createRevision(event: FormEvent) {
    event.preventDefault();
    if (!latestAcceptedContract) return;
    setBusy(true);
    setError('');
    try {
      const changes: Record<string, unknown> = {
        cycle: form.cycle,
        allowedBillingTypes: form.allowedBillingTypes,
        discounts: Number(form.discountPercent) > 0
          ? [{ type: 'PERCENTAGE', value: Number(form.discountPercent), reason: revision.reason }]
          : [],
        notes: revision.notes || undefined,
        effectiveAt: revision.effectiveAt || undefined,
      };
      if (opportunity?.customerType === 'PERSON') {
        Object.assign(changes, {
          holderAmount: Number(form.holderAmount),
          dependentAmount: Number(form.dependentAmount),
          dependentCount: Number(form.dependentCount),
        });
      } else {
        Object.assign(changes, {
          unitPrice: Number(form.unitPrice),
          lives: Number(form.lives),
        });
      }
      const result = await api(`/commercial/contracts/${latestAcceptedContract.id}/revisions`, {
        method: 'POST',
        body: JSON.stringify({
          relationType: revision.relationType,
          reason: revision.reason,
          changes,
          requiresPayment: revision.requiresPayment,
        }),
      });
      const url = `${window.location.origin}${result.precheckout.url}`;
      setRevisionUrl(url);
      await navigator.clipboard?.writeText(url);
      setRevision(current => ({ ...current, reason: '', notes: '' }));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a alteração contratual.');
    } finally {
      setBusy(false);
    }
  }


  function billingTypeAvailable(type: string, cycle = form.cycle) {
    if (opportunity?.customerType !== 'PERSON') return true;
    if (type === 'CREDIT_CARD') return true;
    if (type === 'BOLETO') return cycle === 'MONTHLY';
    if (type === 'PIX') return cycle === 'YEARLY';
    return false;
  }

  function changeCycle(cycle: string) {
    setForm(current => {
      const allowedBillingTypes = opportunity?.customerType === 'PERSON'
        ? [...new Set([
            'CREDIT_CARD',
            ...current.allowedBillingTypes.filter(type => {
              if (type === 'BOLETO') return cycle === 'MONTHLY';
              if (type === 'PIX') return cycle === 'YEARLY';
              return type === 'CREDIT_CARD';
            }),
          ])]
        : current.allowedBillingTypes;
      return {
        ...current,
        cycle,
        allowedBillingTypes,
        billingType: allowedBillingTypes.includes(current.billingType)
          ? current.billingType
          : 'CREDIT_CARD',
      };
    });
  }

  function toggleBillingType(type: string) {
    if (!billingTypeAvailable(type) || (opportunity?.customerType === 'PERSON' && type === 'CREDIT_CARD')) return;
    setForm(current => {
      const allowedBillingTypes = current.allowedBillingTypes.includes(type)
        ? current.allowedBillingTypes.filter(item => item !== type)
        : [...current.allowedBillingTypes, type];
      return {
        ...current,
        allowedBillingTypes,
        billingType: allowedBillingTypes.includes(current.billingType)
          ? current.billingType
          : allowedBillingTypes[0] || 'CREDIT_CARD',
      };
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!opportunity) return;
    setBusy(true);
    setError('');
    try {
      const discounts = Number(form.discountPercent) > 0
        ? [{ type: 'PERCENTAGE', value: Number(form.discountPercent), reason: 'Negociação comercial' }]
        : [];
      await api(`/oportunidades/${oportunidadeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          customerType: opportunity.customerType,
          cycle: form.cycle,
          billingType: form.billingType,
          allowedBillingTypes: form.allowedBillingTypes,
          negotiation: opportunity.customerType === 'COMPANY'
            ? {
                baseAmount: Number(form.unitPrice),
                unitPrice: Number(form.unitPrice),
                lives: Number(form.lives),
                discounts,
              }
            : {
                baseAmount: Number(form.holderAmount),
                dependentAmount: Number(form.dependentAmount),
                dependentCount: Number(form.dependentCount),
                discounts,
              },
        }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar negociação.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment() {
    setBusy(true);
    setError('');
    try {
      await api(`/oportunidades/${oportunidadeId}/assignment`, {
        method: 'PATCH',
        body: JSON.stringify({
          teamId: assignment.teamId || undefined,
          ownerUserId: assignment.ownerUserId || undefined,
        }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao transferir oportunidade.');
    } finally {
      setBusy(false);
    }
  }

  async function requestApproval() {
    const reason = window.prompt('Justificativa para a condição excepcional:');
    if (!reason) return;
    setBusy(true);
    setError('');
    try {
      await api(`/commercial/opportunities/${oportunidadeId}/request-approval`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      await load();
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : 'Falha ao solicitar aprovação.');
    } finally {
      setBusy(false);
    }
  }

  async function generatePrecheckout() {
    setBusy(true);
    setError('');
    try {
      const result = await api(`/commercial/opportunities/${oportunidadeId}/precheckout`, {
        method: 'POST',
      });
      const absolute = `${window.location.origin}${result.url}`;
      setCheckoutUrl(absolute);
      await navigator.clipboard.writeText(absolute);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao gerar pré-checkout.');
    } finally {
      setBusy(false);
    }
  }

  async function revokePrecheckout() {
    setBusy(true);
    try {
      await api(`/commercial/opportunities/${oportunidadeId}/precheckout/revoke`, {
        method: 'POST',
      });
      setCheckoutUrl('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao revogar link.');
    } finally {
      setBusy(false);
    }
  }

  if (!opportunity && !error) {
    return <DetailSkeleton />;
  }

  return (
    <div className="space-y-6 p-8">
      <button onClick={() => router.push('/dashboard/oportunidades/kanban')} className="text-sm text-ink-tertiary hover:text-ink">
        ← Voltar ao Kanban
      </button>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {opportunity && (
        <>
          <section className="rounded-xl border border-edge bg-surface-elevated p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold">{opportunity.nome}</h1>
                <p className="mt-1 text-sm text-ink-tertiary">
                  {opportunity.customerType === 'COMPANY' ? 'Pessoa jurídica' : 'Pessoa física'} · {commercialStatusLabels[opportunity.commercialStatus] || opportunity.commercialStatus}
                </p>
              </div>
              <span className="rounded-full bg-brand/10 px-3 py-1 text-sm text-brand">
                {projected.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </section>

          <section className="rounded-xl border border-edge bg-surface-elevated p-6">
            <h2 className="text-lg font-semibold">Responsabilidade comercial</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span>Time</span>
                <select value={assignment.teamId} onChange={e => setAssignment({ ...assignment, teamId: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="">Sem time</option>
                  {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span>Responsável</span>
                <select value={assignment.ownerUserId} onChange={e => setAssignment({ ...assignment, ownerUserId: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="">Sem responsável</option>
                  {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
            </div>
            <button type="button" onClick={saveAssignment} disabled={busy} className="mt-4 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">
              Salvar atribuição
            </button>
          </section>

          <form onSubmit={save} className="rounded-xl border border-edge bg-surface-elevated p-6">
            <h2 className="text-lg font-semibold">Condições comerciais</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span>Periodicidade</span>
                <select value={form.cycle} onChange={e => changeCycle(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="MONTHLY">Mensal</option>
                  <option value="YEARLY">Anual</option>
                  {opportunity.customerType === 'COMPANY' && <option value="QUARTERLY">Trimestral</option>}
                  {opportunity.customerType === 'COMPANY' && <option value="SEMIANNUALLY">Semestral</option>}
                </select>
              </label>
              <label className="text-sm">
                <span>Forma principal de pagamento</span>
                <select value={form.billingType} onChange={e => setForm({ ...form, billingType: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
                  {form.allowedBillingTypes.map(type => (
                    <option key={type} value={type}>{billingTypeLabels[type] || type}</option>
                  ))}
                </select>
              </label>
              <fieldset className="text-sm md:col-span-2">
                <legend>Formas permitidas no checkout</legend>
                <div className="mt-2 flex flex-wrap gap-4">
                  {['CREDIT_CARD', 'BOLETO', 'PIX'].map(type => {
                    const available = billingTypeAvailable(type);
                    const locked = opportunity.customerType === 'PERSON' && type === 'CREDIT_CARD';
                    return (
                      <label key={type} className={`flex items-center gap-2 ${available ? '' : 'opacity-40'}`}>
                        <input
                          type="checkbox"
                          checked={form.allowedBillingTypes.includes(type)}
                          disabled={!available || locked}
                          onChange={() => toggleBillingType(type)}
                        />
                        {billingTypeLabels[type] || type}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {opportunity.customerType === 'PERSON' ? (
                <>
                  <label className="text-sm">
                    <span>Valor do titular</span>
                    <CurrencyInput value={form.holderAmount} onValueChange={(value) => setForm({ ...form, holderAmount: value })} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="R$ 0,00" />
                  </label>
                  <label className="text-sm">
                    <span>Valor por dependente</span>
                    <CurrencyInput value={form.dependentAmount} onValueChange={(value) => setForm({ ...form, dependentAmount: value })} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="R$ 0,00" />
                  </label>
                  <label className="text-sm">
                    <span>Quantidade de dependentes</span>
                    <input type="number" min="0" value={form.dependentCount} onChange={e => setForm({ ...form, dependentCount: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                    <small className="mt-1 block text-xs text-ink-tertiary">
                      Ao gerar o pré-checkout, o sistema sincroniza esta quantidade com os dependentes efetivamente cadastrados.
                    </small>
                  </label>
                </>
              ) : (
                <>
                  <label className="text-sm">
                    <span>Preço por vida</span>
                    <CurrencyInput value={form.unitPrice} onValueChange={(value) => setForm({ ...form, unitPrice: value })} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="R$ 0,00" />
                  </label>
                  <label className="text-sm">
                    <span>Vidas contratadas</span>
                    <input type="number" min="1" value={form.lives} onChange={e => setForm({ ...form, lives: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                  </label>
                </>
              )}

              <label className="text-sm">
                <span>Desconto percentual</span>
                <PercentageInput value={form.discountPercent} onValueChange={(value) => setForm({ ...form, discountPercent: value })} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="0,00%" />
              </label>
            </div>
            <button disabled={busy || !form.allowedBillingTypes.length} className="mt-5 rounded-lg bg-brand px-4 py-2 text-white disabled:opacity-50">
              Salvar e recalcular
            </button>
          </form>

          <section className="rounded-xl border border-edge bg-surface-elevated p-6">
            <h2 className="text-lg font-semibold">Política e aprovação</h2>
            {evaluation ? (
              <div className="mt-3 space-y-3">
                {evaluation.approval?.status === 'APPROVED' ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                    <p className="font-semibold">Condição excepcional aprovada</p>
                    <p className="mt-1">Esta aprovação continua válida enquanto as condições comerciais não forem alteradas.</p>
                    {evaluation.approval.decisionNotes && <p className="mt-2">Observação: {evaluation.approval.decisionNotes}</p>}
                    {evaluation.approval.decidedAt && (
                      <p className="mt-1 text-xs text-green-700">Aprovada em {new Date(evaluation.approval.decidedAt).toLocaleString('pt-BR')}.</p>
                    )}
                  </div>
                ) : evaluation.approval?.status === 'PENDING' ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-semibold">Aguardando aprovação</p>
                    <p className="mt-1">Solicitação enviada: {evaluation.approval.reason}</p>
                  </div>
                ) : evaluation.approval?.status === 'REJECTED' ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <p className="font-semibold">Condição rejeitada</p>
                    {evaluation.approval.decisionNotes && <p className="mt-1">Motivo: {evaluation.approval.decisionNotes}</p>}
                  </div>
                ) : null}

                <p className={`text-sm font-medium ${evaluation.allowed ? 'text-green-700' : 'text-red-700'}`}>
                  {evaluation.allowed
                    ? evaluation.policyAllowed === false
                      ? 'A negociação está liberada pela aprovação concedida.'
                      : 'Condições dentro dos limites do usuário.'
                    : opportunity.customerType === 'COMPANY' && evaluation.policyAllowed
                      ? 'A negociação jurídica precisa de aprovação final antes do checkout.'
                      : 'A negociação possui exceções que exigem aprovação.'}
                </p>
                {!!evaluation.violations?.length && evaluation.policyAllowed === false && (
                  <ul className="list-disc pl-5 text-sm text-red-700">
                    {evaluation.violations.map((violation: string) => <li key={violation}>{violation}</li>)}
                  </ul>
                )}
                {evaluation.approvalRequired && evaluation.approval?.status !== 'PENDING' && (
                  <button onClick={requestApproval} disabled={busy} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">
                    Solicitar aprovação
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-tertiary">A avaliação será exibida após salvar a negociação.</p>
            )}
          </section>

          <section className="rounded-xl border border-edge bg-surface-elevated p-6">
            <h2 className="text-lg font-semibold">Pré-checkout do cliente</h2>
            <p className="mt-1 text-sm text-ink-tertiary">
              O cliente confirma dados, participantes, contrato e segue para o checkout hospedado do Asaas.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={generatePrecheckout}
                disabled={busy || evaluation?.approvalRequired === true || evaluation?.approval?.status === 'PENDING'}
                className="rounded-lg bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Gerar e copiar link
              </button>
              <button onClick={revokePrecheckout} disabled={busy} className="rounded-lg border px-4 py-2 text-sm">
                Revogar links ativos
              </button>
            </div>
            {checkoutUrl && (
              <div className="mt-4 flex gap-2">
                <input readOnly value={checkoutUrl} className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
                <a href={checkoutUrl} target="_blank" rel="noreferrer" className="rounded-lg border px-4 py-2 text-sm">Abrir</a>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-edge bg-surface-elevated p-6">
            <h2 className="text-lg font-semibold">Histórico contratual</h2>
            <div className="mt-4 space-y-2">
              {!contracts.length && <p className="text-sm text-ink-tertiary">Nenhum contrato gerado.</p>}
              {contracts.map(contract => (
                <div key={contract.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">
                      Versão {contract.version} — {contract.relationType || 'ORIGINAL'}
                    </p>
                    <p className="text-ink-tertiary">
                      {contract.status}
                      {contract.changeReason ? ` · ${contract.changeReason}` : ''}
                    </p>
                  </div>
                  <span>{contract.requiresPayment === false ? 'Sem nova cobrança' : 'Com cobrança'}</span>
                </div>
              ))}
            </div>

            {canApprove && latestAcceptedContract && (
              <form onSubmit={createRevision} className="mt-6 grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span>Tipo de alteração</span>
                  <select
                    value={revision.relationType}
                    onChange={event => setRevision({ ...revision, relationType: event.target.value })}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  >
                    <option value="AMENDMENT">Aditivo</option>
                    <option value="RENEWAL">Renovação</option>
                    <option value="REPLACEMENT">Substituição</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span>Início da vigência</span>
                  <input
                    type="date"
                    value={revision.effectiveAt}
                    onChange={event => setRevision({ ...revision, effectiveAt: event.target.value })}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  <span>Motivo</span>
                  <input
                    required
                    minLength={5}
                    value={revision.reason}
                    onChange={event => setRevision({ ...revision, reason: event.target.value })}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  <span>Observações da alteração</span>
                  <textarea
                    value={revision.notes}
                    onChange={event => setRevision({ ...revision, notes: event.target.value })}
                    className="mt-1 min-h-24 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={revision.requiresPayment}
                    onChange={event => setRevision({ ...revision, requiresPayment: event.target.checked })}
                  />
                  Exigir novo checkout Asaas após o aceite
                </label>
                <button disabled={busy} className="rounded-lg border px-4 py-2 text-sm md:col-span-2">
                  Criar alteração e copiar link
                </button>
              </form>
            )}
            {revisionUrl && (
              <div className="mt-4 flex gap-2">
                <input readOnly value={revisionUrl} className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
                <a href={revisionUrl} target="_blank" rel="noreferrer" className="rounded-lg border px-4 py-2 text-sm">Abrir</a>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

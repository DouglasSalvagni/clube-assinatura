'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { useAuth } from '@/lib/auth-context';

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

export default function NegotiationWorkspacePage() {
  const { oportunidadeId } = useParams<{ oportunidadeId: string }>();
  const router = useRouter();
  const { setPageTitle } = usePageTitle();
  const { user } = useAuth();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [evaluation, setEvaluation] = useState<any>(null);
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
      setForm({
        cycle: item.cycle || snapshot.cycle || 'MONTHLY',
        billingType: item.billingType || snapshot.billingType || 'CREDIT_CARD',
        allowedBillingTypes: snapshot.allowedBillingTypes?.length
          ? snapshot.allowedBillingTypes
          : [item.billingType || snapshot.billingType || 'CREDIT_CARD'],
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


  function toggleBillingType(type: string) {
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
    return <div className="p-8 text-sm text-ink-tertiary">Carregando negociação...</div>;
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
                  {opportunity.customerType === 'COMPANY' ? 'Pessoa jurídica' : 'Pessoa física'} · {opportunity.commercialStatus}
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
                <select value={form.cycle} onChange={e => setForm({ ...form, cycle: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="MONTHLY">Mensal</option>
                  <option value="YEARLY">Anual</option>
                  <option value="QUARTERLY">Trimestral</option>
                  <option value="SEMIANNUALLY">Semestral</option>
                </select>
              </label>
              <label className="text-sm">
                <span>Forma principal de pagamento</span>
                <select value={form.billingType} onChange={e => setForm({ ...form, billingType: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="CREDIT_CARD">Cartão</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="PIX">Pix</option>
                </select>
              </label>
              <fieldset className="text-sm md:col-span-2">
                <legend>Formas permitidas no checkout</legend>
                <div className="mt-2 flex flex-wrap gap-4">
                  {['CREDIT_CARD', 'BOLETO', 'PIX'].map(type => (
                    <label key={type} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.allowedBillingTypes.includes(type)}
                        onChange={() => toggleBillingType(type)}
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </fieldset>

              {opportunity.customerType === 'PERSON' ? (
                <>
                  <label className="text-sm">
                    <span>Valor do titular</span>
                    <input type="number" min="0" step="0.01" value={form.holderAmount} onChange={e => setForm({ ...form, holderAmount: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                  </label>
                  <label className="text-sm">
                    <span>Valor por dependente</span>
                    <input type="number" min="0" step="0.01" value={form.dependentAmount} onChange={e => setForm({ ...form, dependentAmount: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                  </label>
                  <label className="text-sm">
                    <span>Quantidade prevista de dependentes</span>
                    <input type="number" min="0" value={form.dependentCount} onChange={e => setForm({ ...form, dependentCount: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                  </label>
                </>
              ) : (
                <>
                  <label className="text-sm">
                    <span>Preço por vida</span>
                    <input type="number" min="0" step="0.01" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                  </label>
                  <label className="text-sm">
                    <span>Vidas contratadas</span>
                    <input type="number" min="1" value={form.lives} onChange={e => setForm({ ...form, lives: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
                  </label>
                </>
              )}

              <label className="text-sm">
                <span>Desconto percentual</span>
                <input type="number" min="0" max="100" step="0.01" value={form.discountPercent} onChange={e => setForm({ ...form, discountPercent: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
            </div>
            <button disabled={busy || !form.allowedBillingTypes.length} className="mt-5 rounded-lg bg-brand px-4 py-2 text-white disabled:opacity-50">
              Salvar e recalcular
            </button>
          </form>

          <section className="rounded-xl border border-edge bg-surface-elevated p-6">
            <h2 className="text-lg font-semibold">Política e aprovação</h2>
            {evaluation ? (
              <div className="mt-3">
                <p className={`text-sm font-medium ${evaluation.allowed ? 'text-green-700' : 'text-red-700'}`}>
                  {evaluation.allowed ? 'Condições dentro dos limites.' : 'A negociação possui exceções.'}
                </p>
                {!!evaluation.violations?.length && (
                  <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                    {evaluation.violations.map((violation: string) => <li key={violation}>{violation}</li>)}
                  </ul>
                )}
                {!evaluation.allowed && (
                  <button onClick={requestApproval} disabled={busy || opportunity.commercialStatus === 'PENDING_APPROVAL'} className="mt-4 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">
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
                disabled={busy || opportunity.commercialStatus === 'PENDING_APPROVAL'}
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

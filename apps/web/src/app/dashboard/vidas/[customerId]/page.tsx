'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { CurrencyInput } from '@/components/masked-number-input';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { useDialog } from '@/lib/dialog-context';
import { formatDate, formatPhone, formatCpfCnpj, formatCep, maskCpfCnpj, maskPhone, maskCep, stripMask } from '@/lib/format';
import { PageSkeleton, TableSkeleton } from '@/components/page-skeleton';

const statusMeta: Record<string, { label: string; colors: string }> = {
  ACTIVE: { label: 'Ativo', colors: 'border-success/20 bg-success/10 text-success' },
  DELINQUENT: { label: 'Inadimplente', colors: 'border-danger/20 bg-danger/10 text-danger' },
  INACTIVE: { label: 'Inativo', colors: 'border-ink-muted/20 bg-ink-muted/10 text-ink-tertiary' },
};

const cycleLabels: Record<string, string> = {
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quinzenal',
  MONTHLY: 'Mensal',
  BIMONTHLY: 'Bimestral',
  QUARTERLY: 'Trimestral',
  SEMIANNUALLY: 'Semestral',
  YEARLY: 'Anual',
};

interface Titular {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpfCnpj: string;
  endereco: string;
  enderecoNumero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  status: string;
  cycle: string | null;
}

interface Dependente {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  status: string;
}

interface Invoice {
  id: string;
  dueDate: string;
  value: number;
  status: string;
  description: string;
  bankSlipUrl: string | null;
  invoiceUrl: string;
  transactionReceiptUrl: string | null;
  billingType: string;
}

const statusLabels: Record<string, string> = {
  PENDING: 'pendente',
  RECEIVED: 'recebida',
  CONFIRMED: 'confirmada',
  OVERDUE: 'vencida',
  REFUNDED: 'estornada',
  REFUND_REQUESTED: 'estorno solicitado',
  REFUND_IN_PROGRESS: 'estornando',
  RECEIVED_IN_CASH: 'recebida em dinheiro',
  CHARGEBACK_REQUESTED: 'chargeback',
  AWAITING_RISK_ANALYSIS: 'em análise',
  DUNNING_REQUESTED: 'negativação solicitada',
  DUNNING_RECEIVED: 'negativação recebida',
  CANCELLED: 'cancelada',
};

export default function VidaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params.customerId as string;

  const [loaded, setLoaded] = useState(false);
  const { setPageTitle } = usePageTitle();
  const { confirm, alert } = useDialog();
  const [titular, setTitular] = useState<Titular | null>(null);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nome: '', cpf: '',
  });
  const [showEditTitular, setShowEditTitular] = useState(false);
  const [titularForm, setTitularForm] = useState({
    nome: '', email: '', telefone: '', endereco: '', enderecoNumero: '',
    complemento: '', bairro: '', cidade: '', estado: '', cep: '',
  });
  const [savingTitular, setSavingTitular] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentValue, setPaymentValue] = useState('0.00');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [paymentBillingType, setPaymentBillingType] = useState('BOLETO');
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);

  useEffect(() => {
    setPageTitle('Detalhes da Vida');
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/login'); return; }
    setLoaded(true);
    loadPlanDetails();
    loadInvoices();
  }, [router, customerId, setPageTitle]);

  async function loadPlanDetails() {
    try {
      const res = await api(`/vidas/${customerId}`);
      setTitular(res.titular || null);
      setDependentes(res.dependentes || []);
      if (res.warning) setWarning(res.warning);
    } catch {
      setWarning('Erro ao carregar dados do plano');
    }
  }

  async function loadInvoices() {
    setLoadingInvoices(true);
    try {
      const res = await api(`/vidas/${customerId}/invoices?limit=20`);
      setInvoices(res.data || []);
      setTotalInvoices(res.totalCount || 0);
    } catch {
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  }

  function resetForm() {
    setFormData({ nome: '', cpf: '' });
    setEditingId(null);
    setShowForm(false);
  }

  function openEdit(d: Dependente) {
    setFormData({ nome: d.nome, cpf: d.cpf });
    setEditingId(d.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingId) {
        await api(`/vidas/${customerId}/dependents/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(formData),
        });
      } else {
        await api(`/vidas/${customerId}/dependents`, {
          method: 'POST',
          body: JSON.stringify(formData),
        });
      }
      resetForm();
      loadPlanDetails();
    } catch (err: any) {
      await alert(err.message);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ message: 'Remover este dependente?' });
    if (!ok) return;
    await api(`/vidas/${customerId}/dependents/${id}`, { method: 'DELETE' });
    loadPlanDetails();
  }

  function openEditTitular() {
    if (!titular) return;
    setTitularForm({
      nome: titular.nome,
      email: titular.email || '',
      telefone: titular.telefone || '',
      endereco: titular.endereco || '',
      enderecoNumero: titular.enderecoNumero || '',
      complemento: titular.complemento || '',
      bairro: titular.bairro || '',
      cidade: titular.cidade || '',
      estado: titular.estado || '',
      cep: titular.cep || '',
    });
    setShowEditTitular(true);
  }

  async function handleEditTitular(e: React.FormEvent) {
    e.preventDefault();
    setSavingTitular(true);
    try {
      await api(`/vidas/${customerId}`, {
        method: 'PATCH',
        body: JSON.stringify(titularForm),
      });
      setShowEditTitular(false);
      loadPlanDetails();
    } catch (err: any) {
      await alert(err.message);
    } finally {
      setSavingTitular(false);
    }
  }

  async function handleCancelPlan() {
    const ok = await confirm({ message: 'Tem certeza que deseja cancelar o plano deste titular?' });
    if (!ok) return;
    try {
      await api(`/vidas/${customerId}/cancel`, { method: 'POST' });
      loadPlanDetails();
    } catch (err: any) {
      await alert(err.message);
    }
  }

  async function handleReactivate() {
    const ok = await confirm({ message: 'Reativar o plano deste titular?' });
    if (!ok) return;
    try {
      await api(`/vidas/${customerId}/reactivate`, { method: 'POST' });
      loadPlanDetails();
    } catch (err: any) {
      await alert(err.message);
    }
  }

  if (!loaded) return <PageSkeleton variant="detail" />;

  const totalRecebido = invoices
    .filter((inv) => inv.status === 'RECEIVED' || inv.status === 'CONFIRMED')
    .reduce((acc, inv) => acc + (inv.value || 0), 0);

  const totalDevido = invoices
    .filter((inv) => inv.status === 'PENDING' || inv.status === 'OVERDUE')
    .reduce((acc, inv) => acc + (inv.value || 0), 0);

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const statusColors: Record<string, string> = {
    RECEIVED: 'border-success/20 bg-success/10 text-success',
    CONFIRMED: 'border-success/20 bg-success/10 text-success',
    PENDING: 'border-warning/20 bg-warning/10 text-warning',
    OVERDUE: 'border-danger/20 bg-danger/10 text-danger',
    REFUNDED: 'border-ink-muted/20 bg-ink-muted/10 text-ink-tertiary',
    CANCELLED: 'border-ink-muted/20 bg-ink-muted/10 text-ink-tertiary',
  };

  const statusBadge = (status: string) => {
    const c = statusColors[status] || 'border-ink-muted/20 bg-ink-muted/10 text-ink-tertiary';
    return `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${c}`;
  };

  return (
    <div className="p-8">
      <button onClick={() => router.push('/dashboard/vidas')} className="mb-4 flex items-center gap-1 text-sm text-ink-tertiary hover:text-ink">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Voltar para Vidas
      </button>

      {warning && (
        <div className="mb-6 rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          {warning}
        </div>
      )}

      {titular && (
        <div className="mb-8 flex items-center justify-end gap-3">
          <button onClick={openEditTitular}
            className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-canvas hover:text-ink">
            Editar Dados
          </button>
          {titular.status === 'INACTIVE' || titular.status === 'DELINQUENT' ? (
            <button onClick={handleReactivate}
              className="rounded-lg bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-success/80">
              Reativar Plano
            </button>
          ) : (
            <button onClick={handleCancelPlan}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/80">
              Cancelar Plano
            </button>
          )}
        </div>
      )}

      <div className="mb-8 rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-ink">Detalhes do Plano</h2>

        {titular && (
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-medium text-ink-secondary">
              Titular
              <span className="ml-2 inline-flex items-center rounded-md border border-brand/20 bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">Titular</span>
              {(() => { const m = statusMeta[titular.status] || statusMeta.INACTIVE; return <span className={`ml-2 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${m.colors}`}>{m.label}</span> })()}
            </h3>
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              <div><span className="text-xs text-ink-tertiary">Nome</span><p className="text-sm text-ink">{titular.nome}</p></div>
              <div><span className="text-xs text-ink-tertiary">CPF/CNPJ</span><p className="text-sm text-ink">{formatCpfCnpj(titular.cpfCnpj)}</p></div>
              <div><span className="text-xs text-ink-tertiary">Telefone</span><p className="text-sm text-ink">{formatPhone(titular.telefone)}</p></div>
              <div><span className="text-xs text-ink-tertiary">Email</span><p className="text-sm text-ink">{titular.email}</p></div>
              {titular.cycle && (
                <div><span className="text-xs text-ink-tertiary">Período de Renovação</span><p className="text-sm text-ink">{cycleLabels[titular.cycle] || titular.cycle}</p></div>
              )}
              <div><span className="text-xs text-ink-tertiary">Endereço</span><p className="text-sm text-ink">{titular.endereco}, {titular.enderecoNumero}{titular.complemento ? ` - ${titular.complemento}` : ''}</p></div>
              <div><span className="text-xs text-ink-tertiary">Bairro</span><p className="text-sm text-ink">{titular.bairro}</p></div>
              <div><span className="text-xs text-ink-tertiary">Cidade/UF</span><p className="text-sm text-ink">{titular.cidade} - {titular.estado}</p></div>
              <div><span className="text-xs text-ink-tertiary">CEP</span><p className="text-sm text-ink">{formatCep(titular.cep)}</p></div>
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink-secondary">Dependentes</h3>
            <button onClick={() => { resetForm(); setShowForm(true); }}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-dark">
              + Adicionar Dependente
            </button>
          </div>

          {dependentes.length === 0 && !showForm && (
            <p className="text-sm text-ink-tertiary">Nenhum dependente vinculado.</p>
          )}

          {dependentes.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-edge">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-canvas/60">
                  <tr className="border-b border-edge text-ink-tertiary">
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-4 py-2 font-medium">CPF</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Telefone</th>
                    <th className="px-4 py-2 font-medium">Nascimento</th>
                    <th className="px-4 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {dependentes.map((d) => {
                    const meta = statusMeta[d.status] || statusMeta.INACTIVE;
                    return (
                    <tr key={d.id} className="border-b border-edge/70 last:border-0">
                      <td className="px-4 py-2 font-medium text-ink">{d.nome}</td>
                      <td className="px-4 py-2 text-ink-secondary">{formatCpfCnpj(d.cpf)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${meta.colors}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-ink-secondary">{formatPhone(d.telefone)}</td>
                      <td className="px-4 py-2 text-ink-secondary">{formatDate(d.dataNascimento)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(d)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-canvas hover:text-ink">
                            Editar
                          </button>
                          <button onClick={() => handleDelete(d.id)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10">
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
              <div className="w-full max-w-lg rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
                <h3 className="mb-4 text-lg font-semibold text-ink">
                  {editingId ? 'Editar Dependente' : 'Adicionar Dependente'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-secondary">Nome *</label>
                    <input required className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-secondary">CPF *</label>
                    <input required className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      value={maskCpfCnpj(formData.cpf)} onChange={(e) => setFormData({ ...formData, cpf: stripMask(e.target.value) })} />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={resetForm}
                      className="rounded-lg border border-edge px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas">
                      Cancelar
                    </button>
                    <button type="submit"
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
                      {editingId ? 'Atualizar' : 'Adicionar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-success/20 bg-success/5 p-5 shadow-sm">
          <p className="text-sm text-ink-tertiary">Total Recebido</p>
          <p className="mt-1 text-2xl font-semibold text-success">{fmtBRL(totalRecebido)}</p>
        </div>
        <div className="rounded-xl border border-danger/20 bg-danger/5 p-5 shadow-sm">
          <p className="text-sm text-ink-tertiary">Total Devido</p>
          <p className="mt-1 text-2xl font-semibold text-danger">{fmtBRL(totalDevido)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Histórico de Faturas</h2>
          {invoices.length > 0 && (
            <button onClick={() => {
              const devidas = invoices.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE');
              setPaymentValue(devidas.reduce((a, i) => a + (i.value || 0), 0).toFixed(2));
              setPaymentDueDate(new Date().toISOString().slice(0, 10));
              setPaymentBillingType('BOLETO');
              setPaymentResult(null);
              setShowPaymentModal(true);
            }}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
              Quitar Débitos
            </button>
          )}
        </div>
        {loadingInvoices ? (
          <TableSkeleton rows={4} columns={4} />
        ) : invoices.length === 0 ? (
          <p className="text-sm text-ink-tertiary">Nenhuma fatura encontrada.</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-edge">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-canvas/60">
                  <tr className="border-b border-edge text-ink-tertiary">
                    <th className="px-4 py-2 font-medium">Vencimento</th>
                    <th className="px-4 py-2 font-medium">Valor</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Tipo</th>
                    <th className="px-4 py-2 font-medium">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-edge/70 last:border-0">
                      <td className="px-4 py-2 text-ink-secondary whitespace-nowrap">{formatDate(inv.dueDate)}</td>
                      <td className="px-4 py-2 text-ink whitespace-nowrap">
                        {(inv.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-4 py-2">
                        <span className={statusBadge(inv.status)}>{statusLabels[inv.status] || inv.status}</span>
                      </td>
                      <td className="px-4 py-2 text-ink-secondary text-xs">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                          inv.billingType === 'PIX' ? 'border-info/20 bg-info/10 text-info' :
                          inv.billingType === 'BOLETO' ? 'border-warning/20 bg-warning/10 text-warning' :
                          'border-ink-muted/20 bg-ink-muted/10 text-ink-tertiary'
                        }`}>
                          {inv.billingType === 'BOLETO' ? 'Boleto' :
                           inv.billingType === 'PIX' ? 'PIX' :
                           inv.billingType === 'CREDIT_CARD' ? 'Cartão' : inv.billingType}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {inv.invoiceUrl && (
                            <a href={inv.invoiceUrl} target="_blank" rel="noopener noreferrer"
                              className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-canvas hover:text-brand"
                              title="Fatura">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                              </svg>
                            </a>
                          )}
                          {inv.bankSlipUrl && (inv.status === 'PENDING' || inv.status === 'OVERDUE') && (
                            <a href={inv.bankSlipUrl} target="_blank" rel="noopener noreferrer"
                              className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-canvas hover:text-brand"
                              title="Boleto">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                              </svg>
                            </a>
                          )}
                          {inv.transactionReceiptUrl && (
                            <a href={inv.transactionReceiptUrl} target="_blank" rel="noopener noreferrer"
                              className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-canvas hover:text-brand"
                              title="Comprovante">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                              </svg>
                            </a>
                          )}
                          {!inv.invoiceUrl && !(inv.bankSlipUrl && (inv.status === 'PENDING' || inv.status === 'OVERDUE')) && !inv.transactionReceiptUrl && (
                            <span className="text-xs text-ink-muted">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-tertiary">Total: {totalInvoices} fatura{totalInvoices !== 1 ? 's' : ''}</p>
          </>
        )}
      </div>

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
            {!paymentResult ? (
              <>
                <h3 className="mb-4 text-lg font-semibold text-ink">Quitar Débitos</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setCreatingPayment(true);
                  try {
                    const res = await api(`/vidas/${customerId}/create-payment`, {
                      method: 'POST',
                      body: JSON.stringify({
                        value: Number(paymentValue || 0),
                        dueDate: paymentDueDate,
                        billingType: paymentBillingType,
                      }),
                    });
                    setPaymentResult(res);
                  } catch (err: any) {
                    await alert(err.message);
                  } finally {
                    setCreatingPayment(false);
                  }
                }} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-secondary">Valor</label>
                    <CurrencyInput required
                      className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      value={paymentValue} onValueChange={setPaymentValue} placeholder="R$ 0,00" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-secondary">Data de Vencimento</label>
                    <input type="date" required
                      className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-secondary">Forma de Pagamento</label>
                    <select required
                      className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      value={paymentBillingType} onChange={(e) => setPaymentBillingType(e.target.value)}>
                      <option value="BOLETO">Boleto</option>
                      <option value="PIX">PIX</option>
                      <option value="CREDIT_CARD">Cartão de Crédito</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setShowPaymentModal(false)}
                      className="rounded-lg border border-edge px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas">
                      Cancelar
                    </button>
                    <button type="submit" disabled={creatingPayment}
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
                      {creatingPayment ? 'Criando...' : 'Criar Cobrança'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3 className="mb-4 text-lg font-semibold text-ink">Cobrança Criada</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-ink-tertiary">Valor</span>
                    <p className="text-sm text-ink font-medium">
                      {(paymentResult.payment.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                  {paymentResult.payment.invoiceUrl && (
                    <a href={paymentResult.payment.invoiceUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-edge px-4 py-3 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas hover:text-brand">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                      Visualizar Fatura
                    </a>
                  )}
                  {paymentResult.payment.bankSlipUrl && (
                    <a href={paymentResult.payment.bankSlipUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-edge px-4 py-3 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas hover:text-brand">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                      </svg>
                      Baixar Boleto
                    </a>
                  )}
                  {paymentResult.pixQrCode && (
                    <>
                      {paymentResult.pixQrCode.encodedImage && (
                        <div className="flex justify-center">
                          <img src={`data:image/png;base64,${paymentResult.pixQrCode.encodedImage}`} alt="PIX QR Code"
                            className="h-40 w-40" />
                        </div>
                      )}
                      {paymentResult.pixQrCode.payload && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-ink-secondary">Código PIX</label>
                          <div className="flex gap-2">
                            <input readOnly className="flex-1 rounded-lg border border-edge bg-surface-input px-3 py-2 text-xs text-ink"
                              value={paymentResult.pixQrCode.payload} />
                            <button onClick={() => navigator.clipboard.writeText(paymentResult.pixQrCode.payload)}
                              className="rounded-lg border border-edge px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas">
                              Copiar
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="mt-6 flex justify-end">
                  <button onClick={() => { setShowPaymentModal(false); loadInvoices(); }}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
                    Concluído
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showEditTitular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-ink">Editar Dados do Titular</h3>
            <p className="mb-4 text-xs text-ink-tertiary">Alterações serão refletidas no Asaas.</p>
            <form onSubmit={handleEditTitular} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-ink-secondary">Nome</label>
                  <input required className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    value={titularForm.nome} onChange={(e) => setTitularForm({ ...titularForm, nome: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-secondary">Email</label>
                  <input className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    value={titularForm.email} onChange={(e) => setTitularForm({ ...titularForm, email: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-secondary">Telefone</label>
                  <input className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    value={maskPhone(titularForm.telefone)} onChange={(e) => setTitularForm({ ...titularForm, telefone: stripMask(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-ink-secondary">CEP</label>
                  <input placeholder="_____-___" className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    value={maskCep(titularForm.cep)} onChange={async (e) => {
                      const raw = stripMask(e.target.value).slice(0, 8);
                      setTitularForm({ ...titularForm, cep: raw });
                      if (raw.length === 8) {
                        try {
                          const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
                          if (res.ok) {
                            const data = await res.json();
                            if (!data.erro) {
                              setTitularForm((prev) => ({
                                ...prev,
                                cep: raw,
                                endereco: data.logradouro || prev.endereco,
                                complemento: data.complemento || prev.complemento,
                                bairro: data.bairro || prev.bairro,
                                cidade: data.localidade || prev.cidade,
                                estado: data.uf || prev.estado,
                              }));
                            }
                          }
                        } catch {
                          // ignore viacep errors
                        }
                      }
                    }} />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-ink-secondary">Endereço</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input placeholder="Rua" className="col-span-2 rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      value={titularForm.endereco} onChange={(e) => setTitularForm({ ...titularForm, endereco: e.target.value })} />
                    <input placeholder="Nº" className="rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      value={titularForm.enderecoNumero} onChange={(e) => setTitularForm({ ...titularForm, enderecoNumero: e.target.value })} />
                  </div>
                </div>
                <div>
                  <input placeholder="Complemento" className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    value={titularForm.complemento} onChange={(e) => setTitularForm({ ...titularForm, complemento: e.target.value })} />
                </div>
                <div>
                  <input placeholder="Bairro" className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    value={titularForm.bairro} onChange={(e) => setTitularForm({ ...titularForm, bairro: e.target.value })} />
                </div>
                <div>
                  <input placeholder="Cidade" className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    value={titularForm.cidade} onChange={(e) => setTitularForm({ ...titularForm, cidade: e.target.value })} />
                </div>
                <div>
                  <input placeholder="UF" className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    value={titularForm.estado} onChange={(e) => setTitularForm({ ...titularForm, estado: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEditTitular(false)}
                  className="rounded-lg border border-edge px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas">
                  Cancelar
                </button>
                <button type="submit" disabled={savingTitular}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
                  {savingTitular ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

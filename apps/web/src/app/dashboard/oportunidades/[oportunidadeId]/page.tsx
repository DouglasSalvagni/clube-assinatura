'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api, API_BASE } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { useDialog } from '@/lib/dialog-context';
import { formatPhone, formatCpfCnpj, formatCep, maskCpfCnpj, maskPhone, maskCep, stripMask } from '@/lib/format';
import { CurrencyInput } from '@/components/masked-number-input';
import { OpportunityWorkspaceNav } from '@/components/opportunity-workspace-nav';

const cycleOptions = [
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'BIWEEKLY', label: 'Quinzenal' },
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'BIMONTHLY', label: 'Bimestral' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUALLY', label: 'Semestral' },
  { value: 'YEARLY', label: 'Anual' },
];

const billingTypeOptions = [
  { value: 'CREDIT_CARD', label: 'Cartão de Crédito' },
  { value: 'PIX', label: 'PIX' },
  { value: 'BOLETO', label: 'Boleto Bancário' },
];

const statusMeta: Record<string, { label: string; colors: string }> = {
  aberta: { label: 'Aberta', colors: 'border-ink-muted/20 bg-ink-muted/10 text-ink-tertiary' },
  checkout_gerado: { label: 'Checkout Gerado', colors: 'border-warning/20 bg-warning/10 text-warning' },
  checkout_pago: { label: 'Pago', colors: 'border-success/20 bg-success/10 text-success' },
  checkout_expirado: { label: 'Expirado', colors: 'border-danger/20 bg-danger/10 text-danger' },
  convertida: { label: 'Convertida', colors: 'border-brand/20 bg-brand/10 text-brand' },
  cancelada: { label: 'Cancelada', colors: 'border-ink-muted/20 bg-ink-muted/10 text-ink-tertiary' },
};

interface Dependente {
  id: string;
  nome: string;
  cpf: string;
}

export default function OportunidadeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.oportunidadeId as string;
  const { setPageTitle } = usePageTitle();
  const { confirm, alert, prompt } = useDialog();

  const [loaded, setLoaded] = useState(false);
  const [opp, setOpp] = useState<any>(null);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});

  const [showDepForm, setShowDepForm] = useState(false);
  const [editingDepId, setEditingDepId] = useState<string | null>(null);
  const [depForm, setDepForm] = useState({ nome: '', cpf: '' });

  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<{ checkoutId: string; checkoutLink: string } | null>(null);
  const [pixResult, setPixResult] = useState<{ subscriptionId: string; pixPayload: string; pixEncodedImage?: string | null; pixExpirationDate?: string | null } | null>(null);

  useEffect(() => {
    setPageTitle('Cadastro da oportunidade', 'Dados do cliente, endereço e participantes.');
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/login'); return; }
    setLoaded(true);
    loadOpp();
  }, [router, id, setPageTitle]);

  async function loadOpp() {
    try {
      const res = await api(`/oportunidades/${id}`);
      setOpp(res);
      setDependentes(res.dependentes || []);
      setForm({
        nome: res.nome || '',
        cpfCnpj: res.cpfCnpj || '',
        email: res.email || '',
        telefone: res.telefone || '',
        dataNascimento: res.dataNascimento || '',
        endereco: res.endereco || '',
        enderecoNumero: res.enderecoNumero || '',
        complemento: res.complemento || '',
        bairro: res.bairro || '',
        cidade: res.cidade || '',
        estado: res.estado || '',
        cep: res.cep || '',
        valor: res.valor || '',
        cycle: res.cycle || '',
        billingType: res.billingType || 'CREDIT_CARD',
      });
      if (res.warning) setWarning(res.warning);
    } catch {
      setWarning('Erro ao carregar dados da oportunidade');
    }
  }

  async function handleSave() {
    try {
      const body: any = {};
      for (const key of Object.keys(form)) {
        if (form[key] !== (opp as any)[key]) body[key] = form[key];
      }
      if (body.valor !== undefined) body.valor = Number(body.valor);
      for (const k of ['dataNascimento', 'cycle', 'billingType', 'complemento', 'enderecoNumero', 'cidade', 'bairro', 'estado', 'cep', 'endereco']) {
        if (body[k] === '') body[k] = null;
      }
      if (Object.keys(body).length === 0) { setEditing(false); return; }
      await api(`/oportunidades/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setEditing(false);
      loadOpp();
    } catch (err: any) {
      await alert(err.message);
    }
  }

  async function handleCancel() {
    const motivo = await prompt({
      title: 'Cancelar Oportunidade',
      message: 'Tem certeza que deseja cancelar esta oportunidade? Informe o motivo:',
      confirmLabel: 'Cancelar Oportunidade',
      variant: 'danger',
      minLength: 20,
      placeholder: 'Digite o motivo do cancelamento...',
    });
    if (!motivo) return;
    try {
      await api(`/oportunidades/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ motivo }),
      });
      router.push('/dashboard/oportunidades');
    } catch (err: any) {
      await alert(err.message);
    }
  }

  const [boletoResult, setBoletoResult] = useState<{ subscriptionId: string; boletoUrl: string } | null>(null);

  async function handleGenerateCheckout() {
    setCreatingCheckout(true);
    try {
      const res = await api(`/oportunidades/${id}/checkout`, { method: 'POST' });
      if (res.checkoutLink) {
        setCheckoutResult({ checkoutId: res.checkoutId, checkoutLink: res.checkoutLink });
      } else if (res.boletoUrl) {
        setBoletoResult({ subscriptionId: res.subscriptionId, boletoUrl: res.boletoUrl });
      } else if (res.pixPayload) {
        setPixResult({ subscriptionId: res.subscriptionId, pixPayload: res.pixPayload, pixEncodedImage: res.pixEncodedImage, pixExpirationDate: res.pixExpirationDate });
      }
      loadOpp();
    } catch (err: any) {
      await alert(err.message);
    } finally {
      setCreatingCheckout(false);
    }
  }

  function openDepEdit(d: Dependente) {
    setDepForm({ nome: d.nome, cpf: d.cpf });
    setEditingDepId(d.id);
    setShowDepForm(true);
  }

  function resetDepForm() {
    setDepForm({ nome: '', cpf: '' });
    setEditingDepId(null);
    setShowDepForm(false);
  }

  async function handleDepSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingDepId) {
        await api(`/oportunidades/${id}/dependentes/${editingDepId}`, {
          method: 'PATCH',
          body: JSON.stringify(depForm),
        });
      } else {
        await api(`/oportunidades/${id}/dependentes`, {
          method: 'POST',
          body: JSON.stringify(depForm),
        });
      }
      resetDepForm();
      loadOpp();
    } catch (err: any) {
      await alert(err.message);
    }
  }

  async function handleDepDelete(depId: string) {
    const ok = await confirm({ message: 'Remover este dependente?' });
    if (!ok) return;
    await api(`/oportunidades/${id}/dependentes/${depId}`, { method: 'DELETE' });
    loadOpp();
  }

  if (!loaded) return null;

  const workspaceNav = <OpportunityWorkspaceNav opportunityId={id} />;

  const fmtBRL = (v: number) =>
    (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const renderField = (label: string, key: string, type = 'text') => {
    const val = editing ? form[key] : opp?.[key];
    return (
      <div>
        <span className="text-xs text-ink-tertiary">{label}</span>
        {editing ? (
          type === 'select' ? (
            <select
              className="mt-0.5 w-full rounded-lg border border-edge bg-surface-input px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              value={val || ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            >
              <option value="">Selecionar</option>
              {(key === 'billingType' ? billingTypeOptions : cycleOptions).map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : key === 'cep' ? (
            <input
              type="text"
              className="mt-0.5 w-full rounded-lg border border-edge bg-surface-input px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              value={maskCep(val || '')}
              onChange={async (e) => {
                const raw = stripMask(e.target.value).slice(0, 8);
                setForm({ ...form, [key]: raw });
                if (raw.length === 8) {
                  try {
                    const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
                    if (res.ok) {
                      const data = await res.json();
                      if (!data.erro) {
                        setForm((prev: any) => ({
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
                  } catch { /* ignore viacep errors */ }
                }
              }}
            />
          ) : key === 'cpfCnpj' ? (
            <input
              type="text"
              className="mt-0.5 w-full rounded-lg border border-edge bg-surface-input px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              value={maskCpfCnpj(val || '')}
              onChange={(e) => setForm({ ...form, cpfCnpj: stripMask(e.target.value) })}
            />
          ) : key === 'telefone' ? (
            <input
              type="text"
              className="mt-0.5 w-full rounded-lg border border-edge bg-surface-input px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              value={maskPhone(val || '')}
              onChange={(e) => setForm({ ...form, telefone: stripMask(e.target.value).slice(0, 11) })}
            />
          ) : type === 'currency' ? (
            <CurrencyInput
              className="mt-0.5 w-full rounded-lg border border-edge bg-surface-input px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              value={val || ''}
              onValueChange={(value) => setForm({ ...form, [key]: value })}
              placeholder="R$ 0,00"
            />
          ) : (
            <input
              type={type}
              className="mt-0.5 w-full rounded-lg border border-edge bg-surface-input px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              value={val || ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          )
        ) : (
          <p className="text-sm text-ink">
            {type === 'currency' ? fmtBRL(Number(val)) :
             key === 'cpfCnpj' ? formatCpfCnpj(val) :
             key === 'telefone' ? formatPhone(val) :
             key === 'cep' ? formatCep(val) :
             key === 'cycle' ? (cycleOptions.find((o) => o.value === val)?.label || val || '-') :
             key === 'billingType' ? (billingTypeOptions.find((o) => o.value === val)?.label || val || '-') :
             val || '-'}
          </p>
        )}
      </div>
    );
  };

  const statusCheck = opp?.checkoutReady === true;
  const camposPendentes: string[] = opp?.camposPendentes || [];
  const canCheckout = statusCheck && opp?.status === 'aberta';

  return (
    <div className="space-y-5 p-8">
      {workspaceNav}
      <div>
      <button onClick={() => router.push('/dashboard/oportunidades')}
        className="mb-4 flex items-center gap-1 text-sm text-ink-tertiary hover:text-ink">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Voltar para Oportunidades
      </button>

      {warning && (
        <div className="mb-6 rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">{warning}</div>
      )}

      {opp && (
        <>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${(statusMeta[opp.status] || statusMeta.aberta).colors}`}>
                {(statusMeta[opp.status] || statusMeta.aberta).label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {editing ? (
                <>
                  <button onClick={() => { setEditing(false); loadOpp(); }}
                    className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-canvas">
                    Cancelar
                  </button>
                  <button onClick={handleSave}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
                    Salvar
                  </button>
                </>
              ) : (
                <>
                  {(opp.status === 'aberta' || opp.status === 'checkout_expirado') && (
                    <button onClick={() => setEditing(true)}
                      className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-canvas hover:text-ink">
                      Editar Dados
                    </button>
                  )}
                  {(opp.status === 'aberta' || opp.status === 'checkout_gerado' || opp.status === 'checkout_expirado') && (
                    <button onClick={handleCancel}
                      className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/80">
                      Cancelar Oportunidade
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {!statusCheck && opp.status === 'aberta' && camposPendentes.length > 0 && (
            <div className="mb-6 rounded-lg border border-warning/20 bg-warning/5 px-4 py-3">
              <p className="text-sm font-medium text-warning">Campos pendentes para liberar o checkout:</p>
              <ul className="mt-1 list-inside list-disc text-xs text-ink-tertiary">
                {camposPendentes.map((f) => {
                  const labels: Record<string, string> = {
                    nome: 'Nome', cpfCnpj: 'CPF/CNPJ', email: 'Email', telefone: 'Telefone',
                    cep: 'CEP', endereco: 'Endereço', enderecoNumero: 'Número',
                    bairro: 'Bairro', cidade: 'Cidade',
                    estado: 'UF', valor: 'Valor da Venda', cycle: 'Período de Renovação', billingType: 'Forma de Pagamento',
                  };
                  return <li key={f}>{labels[f] || f}</li>;
                })}
              </ul>
            </div>
          )}

          {opp.checkoutLink && (
            <div className="mb-6 rounded-xl border border-info/20 bg-info/5 p-5 shadow-sm">
              <p className="text-sm font-medium text-info">Checkout Gerado</p>
              <div className="mt-2 flex items-center gap-2">
                <input readOnly
                  className="flex-1 rounded-lg border border-edge bg-surface-input px-3 py-2 text-xs text-ink"
                  value={opp.checkoutLink} />
                <button onClick={() => navigator.clipboard.writeText(opp.checkoutLink)}
                  className="rounded-lg border border-edge px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas">
                  Copiar
                </button>
                <a href={opp.checkoutLink} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
                  Abrir
                </a>
              </div>
            </div>
          )}

          {opp.boletoUrl && (
            <div className="mb-6 rounded-xl border border-info/20 bg-info/5 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-info">Boleto Gerado</p>
                <span className="text-xs text-ink-tertiary">Assinatura: {opp.subscriptionId}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <a href={opp.boletoUrl} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
                  Baixar Boleto
                </a>
                <button                   onClick={async () => {
                  try {
                    const token = localStorage.getItem('accessToken');
                    const tid = localStorage.getItem('tenantId');
                    if (!tid) {
                      await alert('Selecione uma matriz antes de gerar o carnê.');
                      return;
                    }
                    const res = await fetch(`${API_BASE}/oportunidades/${id}/payment-book`, {
                      headers: { 'x-tenant-id': tid, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      await alert(err.errors?.[0]?.description || 'Erro ao gerar carnê');
                      return;
                    }
                    window.open(URL.createObjectURL(await res.blob()), '_blank');
                  } catch (e: any) {
                    await alert(e.message);
                  }
                }}
                  className="rounded-lg border border-edge px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas">
                  Gerar Carnê
                </button>
              </div>
            </div>
          )}

          <div className="mb-8 rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-ink">Cadastro da oportunidade</h2>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {renderField('Nome', 'nome')}
              {renderField('CPF/CNPJ', 'cpfCnpj')}
              {renderField('Telefone', 'telefone')}
              {renderField('Email', 'email')}
              {renderField('Data de Nascimento', 'dataNascimento', 'date')}
              {renderField('Valor da Venda', 'valor', 'currency')}
              {renderField('Forma de Pagamento', 'billingType', 'select')}
              {renderField('Período de Renovação', 'cycle', 'select')}
              {renderField('CEP', 'cep')}
              {renderField('Endereço', 'endereco')}
              {renderField('Número', 'enderecoNumero')}
              {renderField('Complemento', 'complemento')}
              {renderField('Bairro', 'bairro')}
              {renderField('Cidade', 'cidade')}
              {renderField('UF', 'estado')}
            </div>
          </div>

          {canCheckout && (
            <div className="mb-8">
              <button
                onClick={handleGenerateCheckout}
                disabled={creatingCheckout}
                className="w-full rounded-xl bg-brand px-6 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-60"
              >
                {creatingCheckout
                  ? 'Gerando...'
                  : (opp.billingType === 'BOLETO' ? 'Gerar Boleto' : opp.billingType === 'PIX' ? 'Gerar PIX' : 'Gerar Checkout')}
              </button>
            </div>
          )}

          {checkoutResult && (
            <div className="mb-8 rounded-xl border border-success/20 bg-success/5 p-5 shadow-sm">
              <p className="text-sm font-medium text-success">Checkout criado com sucesso!</p>
              <div className="mt-2 flex items-center gap-2">
                <input readOnly
                  className="flex-1 rounded-lg border border-edge bg-surface-input px-3 py-2 text-xs text-ink"
                  value={checkoutResult.checkoutLink} />
                <button onClick={() => navigator.clipboard.writeText(checkoutResult.checkoutLink)}
                  className="rounded-lg border border-edge px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas">
                  Copiar
                </button>
                <a href={checkoutResult.checkoutLink} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
                  Abrir
                </a>
              </div>
            </div>
          )}

          {(pixResult || opp.pixPayload) && (
            <div className="mb-8 rounded-xl border border-success/20 bg-success/5 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-success">PIX gerado com sucesso!</p>
                  {(pixResult?.pixExpirationDate || opp.pixExpirationDate) && (
                    <p className="mt-1 text-xs text-ink-tertiary">Expira em {new Date(pixResult?.pixExpirationDate || opp.pixExpirationDate).toLocaleString('pt-BR')}</p>
                  )}
                </div>
                {(pixResult?.pixEncodedImage || opp.pixEncodedImage) && (
                  <img className="h-28 w-28 rounded-lg bg-white p-2" alt="QR Code PIX" src={`data:image/png;base64,${pixResult?.pixEncodedImage || opp.pixEncodedImage}`} />
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input readOnly className="min-w-0 flex-1 rounded-lg border border-edge bg-surface-input px-3 py-2 text-xs text-ink" value={pixResult?.pixPayload || opp.pixPayload} />
                <button onClick={() => navigator.clipboard.writeText(pixResult?.pixPayload || opp.pixPayload)} className="rounded-lg border border-edge px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas">Copiar PIX</button>
              </div>
            </div>
          )}

          {boletoResult && (
            <div className="mb-8 rounded-xl border border-success/20 bg-success/5 p-5 shadow-sm">
              <p className="text-sm font-medium text-success">Boleto gerado com sucesso!</p>
              <div className="mt-3 flex items-center gap-2">
                <a href={boletoResult.boletoUrl} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
                  Baixar Boleto
                </a>
                <button onClick={async () => {
                  try {
                    const token = localStorage.getItem('accessToken');
                    const tid = localStorage.getItem('tenantId');
                    if (!tid) {
                      await alert('Selecione uma matriz antes de gerar o carnê.');
                      return;
                    }
                    const res = await fetch(`${API_BASE}/oportunidades/${id}/payment-book`, {
                      headers: { 'x-tenant-id': tid, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    });
                    if (!res.ok) {
                      const err = await res.json();
                      await alert(err.errors?.[0]?.description || 'Erro ao gerar carnê');
                      return;
                    }
                    window.open(URL.createObjectURL(await res.blob()), '_blank');
                  } catch (e: any) {
                    await alert(e.message);
                  }
                }}
                  className="rounded-lg border border-edge px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas">
                  Gerar Carnê
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-ink-secondary">Dependentes</h3>
              {opp.status !== 'convertida' && opp.status !== 'cancelada' && (
                <button onClick={() => { resetDepForm(); setShowDepForm(true); }}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-dark">
                  + Adicionar Dependente
                </button>
              )}
            </div>

            {dependentes.length === 0 && !showDepForm && (
              <p className="text-sm text-ink-tertiary">Nenhum dependente vinculado.</p>
            )}

            {dependentes.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-edge">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-canvas/60">
                    <tr className="border-b border-edge text-ink-tertiary">
                      <th className="px-4 py-2 font-medium">Nome</th>
                      <th className="px-4 py-2 font-medium">CPF</th>
                      <th className="px-4 py-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dependentes.map((d) => (
                      <tr key={d.id} className="border-b border-edge/70 last:border-0">
                        <td className="px-4 py-2 font-medium text-ink">{d.nome}</td>
                        <td className="px-4 py-2 text-ink-secondary">{formatCpfCnpj(d.cpf)}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openDepEdit(d)}
                              className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-canvas hover:text-ink">
                              Editar
                            </button>
                            <button onClick={() => handleDepDelete(d.id)}
                              className="rounded-md px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10">
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showDepForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
                <div className="w-full max-w-lg rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
                  <h3 className="mb-4 text-lg font-semibold text-ink">
                    {editingDepId ? 'Editar Dependente' : 'Adicionar Dependente'}
                  </h3>
                  <form onSubmit={handleDepSubmit} className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-secondary">Nome *</label>
                      <input required
                        className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                        value={depForm.nome} onChange={(e) => setDepForm({ ...depForm, nome: e.target.value })} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-secondary">CPF *</label>
                      <input required
                        className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                        value={maskCpfCnpj(depForm.cpf)} onChange={(e) => setDepForm({ ...depForm, cpf: stripMask(e.target.value) })} />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button type="button" onClick={resetDepForm}
                        className="rounded-lg border border-edge px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-surface-canvas">
                        Cancelar
                      </button>
                      <button type="submit"
                        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
                        {editingDepId ? 'Atualizar' : 'Adicionar'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
    </div>
  );
}

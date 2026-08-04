'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE } from '@/lib/api';

type BillingType = 'CREDIT_CARD' | 'BOLETO' | 'PIX';
type CheckoutData = {
  status: string;
  customerType: 'PERSON' | 'COMPANY';
  customer: Record<string, string | null>;
  pricing: any;
  allowedBillingTypes: BillingType[];
  participants: Array<{ id: string; name: string; taxId: string; relationship?: string }>;
  contract?: {
    content: string;
    hash: string;
    status: string;
    relationType?: 'ORIGINAL' | 'AMENDMENT' | 'RENEWAL' | 'REPLACEMENT';
    requiresPayment?: boolean;
  } | null;
};

async function publicApi(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body);
      throw new Error(parsed.message || parsed.error || body);
    } catch {
      throw new Error(body || 'Falha na operação.');
    }
  }
  return response.json();
}

const labels: Record<string, string> = {
  CREDIT_CARD: 'Cartão de crédito',
  BOLETO: 'Boleto',
  PIX: 'Pix',
};

export default function PublicCheckoutPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<CheckoutData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [billingType, setBillingType] = useState<BillingType>('CREDIT_CARD');
  const [customer, setCustomer] = useState({
    name: '', taxId: '', email: '', phone: '', postalCode: '', address: '',
    addressNumber: '', district: '', city: '', state: '', complement: '',
  });
  const [dependent, setDependent] = useState({ name: '', taxId: '', relationship: '' });
  const [companyContacts, setCompanyContacts] = useState({
    legalRepresentativeName: '',
    legalRepresentativeTaxId: '',
    financialContactName: '',
    financialEmail: '',
    financialPhone: '',
  });
  const [accepted, setAccepted] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await publicApi(`/public/precheckout/${token}`);
      setData(result);
      setCustomer(current => ({ ...current, ...Object.fromEntries(Object.entries(result.customer || {}).filter(([, value]) => value != null)) }));
      if (result.allowedBillingTypes?.length) setBillingType(result.allowedBillingTypes[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o checkout.');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => Number(data?.pricing?.pricing?.finalAmount || 0), [data]);
  const isRevision = Boolean(data?.contract?.relationType && data.contract.relationType !== 'ORIGINAL');

  async function lookupPostalCode() {
    const postalCode = customer.postalCode.replace(/\D/g, '');
    if (postalCode.length !== 8) return;
    setBusy(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
      if (!response.ok) throw new Error('Falha ao consultar CEP.');
      const address = await response.json();
      if (address.erro) throw new Error('CEP não encontrado.');
      setCustomer(current => ({
        ...current,
        address: address.logradouro || current.address,
        district: address.bairro || current.district,
        city: address.localidade || current.city,
        state: address.uf || current.state,
        complement: address.complemento || current.complement,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar o CEP.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomer(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      setData(await publicApi(`/public/precheckout/${token}/customer`, { method: 'PATCH', body: JSON.stringify(customer) }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar os dados.'); }
    finally { setBusy(false); }
  }

  async function saveCompanyContacts(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      setData(await publicApi(`/public/precheckout/${token}/company-contacts`, {
        method: 'PATCH',
        body: JSON.stringify(companyContacts),
      }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar os responsáveis.'); }
    finally { setBusy(false); }
  }

  async function addDependent(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      setData(await publicApi(`/public/precheckout/${token}/participants`, { method: 'POST', body: JSON.stringify(dependent) }));
      setDependent({ name: '', taxId: '', relationship: '' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao adicionar dependente.'); }
    finally { setBusy(false); }
  }

  async function removeDependent(id: string) {
    setBusy(true);
    try { setData(await publicApi(`/public/precheckout/${token}/participants/${id}/remove`, { method: 'POST' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao remover dependente.'); }
    finally { setBusy(false); }
  }

  async function generateContract() {
    setBusy(true); setError('');
    try { setData(await publicApi(`/public/precheckout/${token}/contract`, { method: 'POST' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao gerar o contrato.'); }
    finally { setBusy(false); }
  }

  async function acceptContract() {
    if (!accepted || !data) return;
    setBusy(true); setError('');
    try {
      setData(await publicApi(`/public/precheckout/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify({ accepted: true, acceptedByName: customer.name, acceptedByTaxId: customer.taxId }),
      }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao registrar o aceite.'); }
    finally { setBusy(false); }
  }

  async function startPayment() {
    setBusy(true); setError('');
    try {
      const result = await publicApi(`/public/precheckout/${token}/payment`, {
        method: 'POST',
        body: JSON.stringify({ billingType }),
      });
      if (!result.checkoutLink) throw new Error('O Asaas não retornou o link do checkout.');
      window.location.assign(result.checkoutLink);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao iniciar o pagamento.');
      setBusy(false);
    }
  }

  if (!data && !error) return <main className="mx-auto max-w-3xl p-8">Carregando...</main>;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{isRevision ? 'Alteração contratual' : 'Confirmação da assinatura'}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {isRevision
            ? 'Revise e aceite as condições do aditivo, renovação ou substituição contratual.'
            : 'Revise seus dados, participantes e condições antes do pagamento.'}
        </p>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!isRevision && (
        <section className="rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">Dados do contratante</h2>
          <form onSubmit={saveCustomer} className="grid gap-3 md:grid-cols-2">
            {Object.entries(customer).map(([key, value]) => (
              <input key={key} value={value} required={!['complement'].includes(key)}
                onBlur={key === 'postalCode' ? lookupPostalCode : undefined}
                onChange={e => setCustomer({ ...customer, [key]: e.target.value })}
                placeholder={{ name:'Nome',taxId:'CPF/CNPJ',email:'E-mail',phone:'Telefone',postalCode:'CEP',address:'Endereço',addressNumber:'Número',district:'Bairro',city:'Cidade',state:'UF',complement:'Complemento' }[key]}
                className="rounded-lg border px-3 py-2 text-sm" />
            ))}
            <button disabled={busy} className="rounded-lg bg-black px-4 py-2 text-white md:col-span-2">Confirmar dados</button>
          </form>
        </section>
      )}

      {isRevision && (
        <section className="rounded-xl border p-5 text-sm">
          <p className="font-medium">Dados preservados do contrato original</p>
          <p className="mt-1 text-gray-600">
            Nesta etapa somente o aceite das novas condições é permitido. Dados cadastrais e participantes permanecem vinculados ao contrato de origem.
          </p>
        </section>
      )}

      {!isRevision && data?.customerType === 'COMPANY' && (
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Responsáveis da contratação</h2>
          <form onSubmit={saveCompanyContacts} className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              required
              value={companyContacts.legalRepresentativeName}
              onChange={e => setCompanyContacts({ ...companyContacts, legalRepresentativeName: e.target.value })}
              placeholder="Responsável legal"
              className="rounded-lg border px-3 py-2"
            />
            <input
              required
              value={companyContacts.legalRepresentativeTaxId}
              onChange={e => setCompanyContacts({ ...companyContacts, legalRepresentativeTaxId: e.target.value })}
              placeholder="CPF do responsável legal"
              className="rounded-lg border px-3 py-2"
            />
            <input
              required
              value={companyContacts.financialContactName}
              onChange={e => setCompanyContacts({ ...companyContacts, financialContactName: e.target.value })}
              placeholder="Responsável financeiro"
              className="rounded-lg border px-3 py-2"
            />
            <input
              required
              type="email"
              value={companyContacts.financialEmail}
              onChange={e => setCompanyContacts({ ...companyContacts, financialEmail: e.target.value })}
              placeholder="E-mail financeiro"
              className="rounded-lg border px-3 py-2"
            />
            <input
              required
              value={companyContacts.financialPhone}
              onChange={e => setCompanyContacts({ ...companyContacts, financialPhone: e.target.value })}
              placeholder="Telefone financeiro"
              className="rounded-lg border px-3 py-2"
            />
            <button disabled={busy} className="rounded-lg border px-4 py-2 md:col-span-2">
              Confirmar responsáveis
            </button>
          </form>
        </section>
      )}

      {!isRevision && data?.customerType === 'PERSON' && (
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Dependentes</h2>
          <form onSubmit={addDependent} className="mt-4 grid gap-3 md:grid-cols-3">
            <input value={dependent.name} onChange={e=>setDependent({...dependent,name:e.target.value})} required placeholder="Nome" className="rounded-lg border px-3 py-2" />
            <input value={dependent.taxId} onChange={e=>setDependent({...dependent,taxId:e.target.value})} required placeholder="CPF" className="rounded-lg border px-3 py-2" />
            <input value={dependent.relationship} onChange={e=>setDependent({...dependent,relationship:e.target.value})} placeholder="Parentesco" className="rounded-lg border px-3 py-2" />
            <button disabled={busy} className="rounded-lg border px-4 py-2 md:col-span-3">Adicionar dependente</button>
          </form>
          <div className="mt-4 space-y-2">
            {data.participants.map(item => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
                <span>{item.name} — {item.taxId}</span>
                <button onClick={()=>removeDependent(item.id)} disabled={busy} className="text-red-600">Remover</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border p-5">
        <h2 className="font-semibold">Resumo financeiro</h2>
        <p className="mt-3 text-3xl font-semibold">{total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
        <p className="text-sm text-gray-600">Periodicidade: {data?.pricing?.cycle || '-'}</p>
      </section>

      <section className="rounded-xl border p-5">
        <h2 className="font-semibold">Contrato</h2>
        {!data?.contract ? (
          <button onClick={generateContract} disabled={busy} className="mt-4 rounded-lg bg-black px-4 py-2 text-white">Gerar contrato</button>
        ) : (
          <>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm">{data.contract.content}</pre>
            {data.contract.status !== 'ACCEPTED' ? (
              <div className="mt-4">
                <label className="flex gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} /> Li e aceito os termos.</label>
                <button onClick={acceptContract} disabled={!accepted || busy} className="mt-3 rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40">Aceitar contrato</button>
              </div>
            ) : data.contract.requiresPayment === false ? (
              <div className="mt-5 rounded-lg bg-green-50 p-4 text-sm font-medium text-green-700">
                Alteração contratual aceita e aplicada. Não há nova cobrança para esta alteração.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <p className="font-medium text-green-700">Contrato aceito. Escolha como deseja pagar.</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(data.allowedBillingTypes || []).map(type => (
                    <label key={type} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
                      <input type="radio" name="billingType" value={type} checked={billingType === type} onChange={() => setBillingType(type)} />
                      {labels[type] || type}
                    </label>
                  ))}
                </div>
                <button onClick={startPayment} disabled={busy || !billingType} className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40">
                  Ir para o checkout do Asaas
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

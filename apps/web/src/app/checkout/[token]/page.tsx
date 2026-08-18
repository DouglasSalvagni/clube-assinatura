'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { API_BASE } from '@/lib/api';
import SafeRichText from '@/components/safe-rich-text';
import { PublicPageSkeleton } from '@/components/page-skeleton';

type BillingType = 'CREDIT_CARD' | 'BOLETO' | 'PIX';
type CustomerForm = {
  name: string;
  taxId: string;
  email: string;
  phone: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  district: string;
  city: string;
  state: string;
  complement: string;
};
type CompanyContactsForm = {
  legalRepresentativeName: string;
  legalRepresentativeTaxId: string;
  financialContactName: string;
  financialEmail: string;
  financialPhone: string;
};
type CheckoutData = {
  status: string;
  expiresAt?: string;
  customerType: 'PERSON' | 'COMPANY';
  participantEditingAllowed: boolean;
  customer: Partial<CustomerForm> & {
    legalRepresentative?: { name?: string; taxId?: string };
    financialContact?: { name?: string; email?: string; phone?: string };
  };
  pricing: any;
  allowedBillingTypes: BillingType[];
  participants: Array<{ id: string; name: string; taxId: string; relationship?: string }>;
  contractTemplate?: { name: string; code: string; version: number; versionId: string } | null;
  contract?: {
    content: string;
    hash: string;
    status: string;
    relationType?: 'ORIGINAL' | 'AMENDMENT' | 'RENEWAL' | 'REPLACEMENT';
    requiresPayment?: boolean;
    templateName?: string | null;
    templateCode?: string | null;
    templateVersion?: number | null;
  } | null;
};

const emptyCustomer: CustomerForm = {
  name: '', taxId: '', email: '', phone: '', postalCode: '', address: '',
  addressNumber: '', district: '', city: '', state: '', complement: '',
};

const emptyCompanyContacts: CompanyContactsForm = {
  legalRepresentativeName: '',
  legalRepresentativeTaxId: '',
  financialContactName: '',
  financialEmail: '',
  financialPhone: '',
};

async function publicApi(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const raw = await response.text();
  let body: any = {};
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }
  if (!response.ok) {
    const providerMessage = typeof body === 'object' ? body?.message : null;
    const message = Array.isArray(providerMessage)
      ? providerMessage.join(' ')
      : providerMessage || (typeof body === 'object' ? body?.error : null) || raw;
    throw new Error(message || 'Falha na operação.');
  }
  return body;
}

const labels: Record<string, string> = {
  CREDIT_CARD: 'Cartão de crédito',
  BOLETO: 'Boleto',
  PIX: 'Pix',
};

const billingDescriptions: Record<string, string> = {
  CREDIT_CARD: 'Pagamento seguro no ambiente do Asaas.',
  BOLETO: 'A primeira cobrança será emitida pelo Asaas.',
  PIX: 'Pagamento via Pix, quando disponível para esta contratação.',
};

const cycleLabels: Record<string, string> = {
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
};

function money(value: unknown) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function customerFrom(raw: CheckoutData['customer'] | undefined): CustomerForm {
  return Object.fromEntries(
    Object.keys(emptyCustomer).map((key) => [key, String(raw?.[key as keyof CustomerForm] ?? '')]),
  ) as CustomerForm;
}

function companyContactsFrom(raw: CheckoutData['customer'] | undefined): CompanyContactsForm {
  return {
    legalRepresentativeName: String(raw?.legalRepresentative?.name || ''),
    legalRepresentativeTaxId: String(raw?.legalRepresentative?.taxId || ''),
    financialContactName: String(raw?.financialContact?.name || ''),
    financialEmail: String(raw?.financialContact?.email || ''),
    financialPhone: String(raw?.financialContact?.phone || ''),
  };
}

function InputField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  maxLength?: number;
  onBlur?: () => void;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${props.className || ''}`}>
      <span className="mb-1.5 block font-medium text-gray-800">{props.label}</span>
      <input
        value={props.value}
        required={props.required}
        disabled={props.disabled}
        type={props.type || 'text'}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        onBlur={props.onBlur}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-950 caret-gray-950 outline-none transition placeholder:font-normal placeholder:text-gray-500 focus:border-gray-500 focus:ring-2 focus:ring-gray-900/5 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-700"
      />
    </label>
  );
}

export default function PublicCheckoutPage() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const [data, setData] = useState<CheckoutData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [postalLookupBusy, setPostalLookupBusy] = useState(false);
  const [billingType, setBillingType] = useState<BillingType>('CREDIT_CARD');
  const [customer, setCustomer] = useState<CustomerForm>(emptyCustomer);
  const [dependent, setDependent] = useState({ name: '', taxId: '', relationship: '' });
  const [companyContacts, setCompanyContacts] = useState<CompanyContactsForm>(emptyCompanyContacts);
  const [accepted, setAccepted] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(true);

  const applyServerData = useCallback((result: CheckoutData) => {
    setData(result);
    setCustomer(customerFrom(result.customer));
    setCompanyContacts(companyContactsFrom(result.customer));
    if (result.allowedBillingTypes?.length) {
      setBillingType((current) => result.allowedBillingTypes.includes(current)
        ? current
        : result.allowedBillingTypes[0]);
    }
    setEditingCustomer(!result.contract);
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await publicApi(`/public/precheckout/${token}`);
      applyServerData(result);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o checkout.');
    }
  }, [applyServerData, token]);

  useEffect(() => { load(); }, [load]);

  const pricing = data?.pricing?.pricing || {};
  const total = useMemo(() => Number(pricing.finalAmount || 0), [pricing.finalAmount]);
  const isRevision = Boolean(data?.contract?.relationType && data.contract.relationType !== 'ORIGINAL');
  const contractAccepted = data?.contract?.status === 'ACCEPTED';
  const contractReady = Boolean(data?.contract && !contractAccepted);
  const customerEditable = !isRevision && !contractAccepted && (!contractReady || editingCustomer);
  const requiredCustomerKeys: Array<keyof CustomerForm> = [
    'name', 'taxId', 'email', 'phone', 'postalCode', 'address', 'addressNumber', 'district', 'city', 'state',
  ];
  const customerComplete = requiredCustomerKeys.every((key) => customer[key].trim().length > 0);
  const companyContactsComplete = data?.customerType !== 'COMPANY'
    || Object.values(companyContacts).every((value) => String(value).trim().length > 0);
  const negotiatedDependentCount = data?.customerType === 'PERSON'
    ? Math.max(0, Number(data?.pricing?.participants?.dependentCount ?? 0) || 0)
    : 0;
  const fixedNegotiationDependents = data?.customerType === 'PERSON'
    && data?.pricing?.source !== 'PUBLIC_OFFER';
  const dependentsComplete = !fixedNegotiationDependents
    || data.participants.length === negotiatedDependentCount;
  const registrationComplete = customerComplete && companyContactsComplete && dependentsComplete;
  const paymentReturn = searchParams.get('payment');

  async function lookupPostalCode() {
    const postalCode = customer.postalCode.replace(/\D/g, '');
    if (postalCode.length !== 8 || !customerEditable) return;
    setPostalLookupBusy(true);
    setError('');
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
      if (!response.ok) throw new Error('Falha ao consultar CEP.');
      const address = await response.json();
      if (address.erro) throw new Error('CEP não encontrado.');
      setCustomer((current) => ({
        ...current,
        postalCode,
        address: address.logradouro || current.address,
        district: address.bairro || current.district,
        city: address.localidade || current.city,
        state: address.uf || current.state,
        complement: current.complement || address.complemento || '',
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível consultar o CEP.');
    } finally {
      setPostalLookupBusy(false);
    }
  }

  async function saveCustomerData() {
    const result = await publicApi(`/public/precheckout/${token}/customer`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...customer,
        state: customer.state.trim().toUpperCase(),
      }),
    });
    applyServerData(result);
    return result as CheckoutData;
  }

  async function saveCompanyContactsData() {
    const result = await publicApi(`/public/precheckout/${token}/company-contacts`, {
      method: 'PATCH',
      body: JSON.stringify(companyContacts),
    });
    applyServerData(result);
    return result as CheckoutData;
  }

  async function saveCustomer(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveCustomerData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar os dados.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCompanyContacts(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveCompanyContactsData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar os responsáveis.');
    } finally {
      setBusy(false);
    }
  }

  async function addDependent(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await publicApi(`/public/precheckout/${token}/participants`, {
        method: 'POST',
        body: JSON.stringify(dependent),
      });
      applyServerData(result);
      setDependent({ name: '', taxId: '', relationship: '' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao adicionar dependente.');
    } finally {
      setBusy(false);
    }
  }

  async function removeDependent(id: string) {
    setBusy(true);
    setError('');
    try {
      const result = await publicApi(`/public/precheckout/${token}/participants/${id}/remove`, { method: 'POST' });
      applyServerData(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao remover dependente.');
    } finally {
      setBusy(false);
    }
  }

  async function generateContract() {
    if (!dependentsComplete) {
      setError(`Informe os dados dos ${negotiatedDependentCount} dependente(s) previstos na negociação.`);
      return;
    }
    if (!registrationComplete) {
      setError('Preencha todos os dados obrigatórios antes de gerar o contrato.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      // Persistir sempre o que está visível antes de congelar o contrato evita divergência entre tela e backend.
      await saveCustomerData();
      if (data?.customerType === 'COMPANY') await saveCompanyContactsData();
      const result = await publicApi(`/public/precheckout/${token}/contract`, { method: 'POST' });
      applyServerData(result);
      setEditingCustomer(false);
      setAccepted(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao gerar o contrato.');
    } finally {
      setBusy(false);
    }
  }

  async function acceptContract() {
    if (!accepted || !data || editingCustomer) return;
    setBusy(true);
    setError('');
    try {
      const acceptedByName = data.customerType === 'COMPANY'
        ? companyContacts.legalRepresentativeName
        : customer.name;
      const acceptedByTaxId = data.customerType === 'COMPANY'
        ? companyContacts.legalRepresentativeTaxId
        : customer.taxId;
      const result = await publicApi(`/public/precheckout/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify({ accepted: true, acceptedByName, acceptedByTaxId }),
      });
      applyServerData(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao registrar o aceite.');
    } finally {
      setBusy(false);
    }
  }

  async function startPayment() {
    setBusy(true);
    setError('');
    try {
      const result = await publicApi(`/public/precheckout/${token}/payment`, {
        method: 'POST',
        body: JSON.stringify({ billingType }),
      });
      if (!result.checkoutLink) throw new Error('O Asaas não retornou o link do checkout.');
      window.location.assign(result.checkoutLink);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao iniciar o pagamento.');
      setBusy(false);
    }
  }

  if (!data && !error) return <PublicPageSkeleton />;
  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg rounded-3xl border border-red-100 bg-white p-7 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-500">Checkout indisponível</p>
          <h1 className="mt-2 text-xl font-semibold text-gray-950">Não foi possível carregar esta contratação</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-5 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Contratação segura
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
                  {isRevision ? 'Alteração contratual' : 'Revise e confirme sua contratação'}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                  {isRevision
                    ? 'Confira as novas condições, aceite o documento e conclua a etapa financeira quando aplicável.'
                    : 'Seus dados, as condições negociadas e o contrato são confirmados antes de você seguir para o ambiente de pagamento do Asaas.'}
                </p>
              </div>
              <div className="rounded-2xl bg-gray-950 px-4 py-3 text-white">
                <p className="text-[11px] uppercase tracking-wider text-gray-400">Valor contratado</p>
                <p className="mt-1 text-xl font-semibold">{money(total)}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-100 bg-gray-50/70 text-center text-xs sm:text-sm">
            <div className={`px-3 py-3 font-medium ${registrationComplete || isRevision ? 'text-green-700' : 'text-gray-600'}`}>
              1. Dados
            </div>
            <div className={`px-3 py-3 font-medium ${data?.contract ? 'text-green-700' : 'text-gray-600'}`}>
              2. Contrato
            </div>
            <div className={`px-3 py-3 font-medium ${contractAccepted ? 'text-green-700' : 'text-gray-600'}`}>
              3. Pagamento
            </div>
          </div>
        </header>

        {paymentReturn && (
          <div className={`mt-5 rounded-2xl border p-4 text-sm ${
            paymentReturn === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            {paymentReturn === 'success'
              ? 'Você retornou do Asaas após a etapa de pagamento. A confirmação financeira será atualizada pelo processamento da cobrança.'
              : paymentReturn === 'expired'
                ? 'O checkout do Asaas expirou. Tente iniciar o pagamento novamente.'
                : 'O checkout do Asaas foi cancelado. Você pode escolher novamente a forma de pagamento.'}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
            <strong className="font-semibold">Não foi possível continuar.</strong> {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-6">
            {!isRevision && (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Etapa 1</p>
                    <h2 className="mt-1 text-lg font-semibold text-gray-950">Dados do contratante</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Confira as informações. O CEP completa automaticamente os principais campos do endereço.
                    </p>
                  </div>
                  {contractReady && !editingCustomer && (
                    <button
                      type="button"
                      onClick={() => setEditingCustomer(true)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Corrigir dados
                    </button>
                  )}
                  {contractAccepted && (
                    <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
                      Dados vinculados ao contrato aceito
                    </span>
                  )}
                </div>

                {contractReady && editingCustomer && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    Ao salvar uma correção, o contrato atual será invalidado e deverá ser gerado novamente antes do aceite.
                  </div>
                )}

                <form onSubmit={saveCustomer} className="mt-5 grid gap-4 sm:grid-cols-2">
                  <InputField
                    label={data?.customerType === 'COMPANY' ? 'Razão social / nome' : 'Nome completo'}
                    value={customer.name}
                    onChange={(value) => setCustomer({ ...customer, name: value })}
                    required
                    disabled={!customerEditable || busy}
                    autoComplete="name"
                    className="sm:col-span-2"
                  />
                  <InputField
                    label={data?.customerType === 'COMPANY' ? 'CNPJ' : 'CPF'}
                    value={customer.taxId}
                    onChange={(value) => setCustomer({ ...customer, taxId: value })}
                    required
                    disabled={!customerEditable || busy}
                  />
                  <InputField
                    label="Telefone"
                    value={customer.phone}
                    onChange={(value) => setCustomer({ ...customer, phone: value })}
                    required
                    disabled={!customerEditable || busy}
                    type="tel"
                    autoComplete="tel"
                  />
                  <InputField
                    label="E-mail"
                    value={customer.email}
                    onChange={(value) => setCustomer({ ...customer, email: value })}
                    required
                    disabled={!customerEditable || busy}
                    type="email"
                    autoComplete="email"
                    className="sm:col-span-2"
                  />
                  <InputField
                    label={postalLookupBusy ? 'CEP — consultando...' : 'CEP'}
                    value={customer.postalCode}
                    onChange={(value) => setCustomer({ ...customer, postalCode: value })}
                    onBlur={lookupPostalCode}
                    required
                    disabled={!customerEditable || busy}
                    autoComplete="postal-code"
                  />
                  <InputField
                    label="Número"
                    value={customer.addressNumber}
                    onChange={(value) => setCustomer({ ...customer, addressNumber: value })}
                    required
                    disabled={!customerEditable || busy}
                    autoComplete="address-line2"
                  />
                  <InputField
                    label="Endereço"
                    value={customer.address}
                    onChange={(value) => setCustomer({ ...customer, address: value })}
                    required
                    disabled={!customerEditable || busy}
                    autoComplete="street-address"
                    className="sm:col-span-2"
                  />
                  <InputField
                    label="Bairro"
                    value={customer.district}
                    onChange={(value) => setCustomer({ ...customer, district: value })}
                    required
                    disabled={!customerEditable || busy}
                  />
                  <InputField
                    label="Complemento"
                    value={customer.complement}
                    onChange={(value) => setCustomer({ ...customer, complement: value })}
                    disabled={!customerEditable || busy}
                    placeholder="Opcional"
                  />
                  <InputField
                    label="Cidade"
                    value={customer.city}
                    onChange={(value) => setCustomer({ ...customer, city: value })}
                    required
                    disabled={!customerEditable || busy}
                    autoComplete="address-level2"
                  />
                  <InputField
                    label="UF"
                    value={customer.state}
                    onChange={(value) => setCustomer({ ...customer, state: value.toUpperCase() })}
                    required
                    disabled={!customerEditable || busy}
                    autoComplete="address-level1"
                    maxLength={2}
                  />
                  {customerEditable && (
                    <button
                      disabled={busy || !customerComplete}
                      className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2"
                    >
                      {contractReady ? 'Salvar correção dos dados' : 'Salvar dados cadastrais'}
                    </button>
                  )}
                </form>
              </section>
            )}

            {isRevision && (
              <section className="rounded-3xl border border-gray-200 bg-white p-6 text-sm shadow-sm">
                <h2 className="font-semibold text-gray-950">Dados preservados do contrato original</h2>
                <p className="mt-2 leading-6 text-gray-600">
                  Nesta etapa somente o aceite das novas condições é permitido. Dados cadastrais e participantes permanecem vinculados ao contrato de origem.
                </p>
              </section>
            )}

            {!isRevision && data?.customerType === 'COMPANY' && (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-semibold text-gray-950">Responsáveis da contratação</h2>
                <p className="mt-1 text-sm text-gray-600">Informe quem representa a empresa e quem receberá as comunicações financeiras.</p>
                <form onSubmit={saveCompanyContacts} className="mt-5 grid gap-4 sm:grid-cols-2">
                  <InputField
                    label="Responsável legal"
                    value={companyContacts.legalRepresentativeName}
                    onChange={(value) => setCompanyContacts({ ...companyContacts, legalRepresentativeName: value })}
                    required
                    disabled={!customerEditable || busy}
                    className="sm:col-span-2"
                  />
                  <InputField
                    label="CPF do responsável legal"
                    value={companyContacts.legalRepresentativeTaxId}
                    onChange={(value) => setCompanyContacts({ ...companyContacts, legalRepresentativeTaxId: value })}
                    required
                    disabled={!customerEditable || busy}
                    className="sm:col-span-2"
                  />
                  <InputField
                    label="Responsável financeiro"
                    value={companyContacts.financialContactName}
                    onChange={(value) => setCompanyContacts({ ...companyContacts, financialContactName: value })}
                    required
                    disabled={!customerEditable || busy}
                  />
                  <InputField
                    label="Telefone financeiro"
                    value={companyContacts.financialPhone}
                    onChange={(value) => setCompanyContacts({ ...companyContacts, financialPhone: value })}
                    required
                    disabled={!customerEditable || busy}
                    type="tel"
                  />
                  <InputField
                    label="E-mail financeiro"
                    value={companyContacts.financialEmail}
                    onChange={(value) => setCompanyContacts({ ...companyContacts, financialEmail: value })}
                    required
                    disabled={!customerEditable || busy}
                    type="email"
                    className="sm:col-span-2"
                  />
                  {customerEditable && (
                    <button
                      disabled={busy || !companyContactsComplete}
                      className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40 sm:col-span-2"
                    >
                      Salvar responsáveis
                    </button>
                  )}
                </form>
              </section>
            )}

            {!isRevision && data?.customerType === 'PERSON' && (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-semibold text-gray-950">Dependentes</h2>
                {data.participantEditingAllowed ? (
                  <>
                    <p className="mt-1 text-sm text-gray-600">
                      {fixedNegotiationDependents
                        ? `A negociação prevê ${negotiatedDependentCount} dependente(s). Preencha os dados abaixo; o valor negociado não será alterado.`
                        : 'Você pode ajustar os dependentes antes do contrato. O valor é recalculado pelo servidor.'}
                    </p>
                    {fixedNegotiationDependents && (
                      <p className="mt-2 text-xs font-medium text-gray-500">
                        {data.participants.length} de {negotiatedDependentCount} dependente(s) informado(s)
                      </p>
                    )}
                    <form onSubmit={addDependent} className="mt-5 grid gap-3 sm:grid-cols-3">
                      <input value={dependent.name} onChange={(event) => setDependent({ ...dependent, name: event.target.value })} required placeholder="Nome completo" className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-950 caret-gray-950 outline-none placeholder:font-normal placeholder:text-gray-500 focus:border-gray-500" />
                      <input value={dependent.taxId} onChange={(event) => setDependent({ ...dependent, taxId: event.target.value })} required placeholder="CPF" className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-950 caret-gray-950 outline-none placeholder:font-normal placeholder:text-gray-500 focus:border-gray-500" />
                      <input value={dependent.relationship} onChange={(event) => setDependent({ ...dependent, relationship: event.target.value })} placeholder="Parentesco" className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-950 caret-gray-950 outline-none placeholder:font-normal placeholder:text-gray-500 focus:border-gray-500" />
                      <button
                        disabled={busy || Boolean(data.contract) || (fixedNegotiationDependents && data.participants.length >= negotiatedDependentCount)}
                        className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 sm:col-span-3"
                      >
                        Adicionar dependente
                      </button>
                    </form>
                  </>
                ) : (
                  <p className="mt-3 rounded-2xl bg-gray-50 p-4 text-sm leading-6 text-gray-600">
                    Os dados dos dependentes abaixo fazem parte do contrato gerado.
                  </p>
                )}
                <div className="mt-4 space-y-2">
                  {data.participants.length === 0 && (
                    <p className="text-sm text-gray-500">
                      {fixedNegotiationDependents && negotiatedDependentCount > 0
                        ? `Informe os dados dos ${negotiatedDependentCount} dependente(s) previstos na negociação.`
                        : 'Nenhum dependente incluído.'}
                    </p>
                  )}
                  {data.participants.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{item.taxId}{item.relationship ? ` · ${item.relationship}` : ''}</p>
                      </div>
                      {data.participantEditingAllowed && !data.contract && (
                        <button type="button" onClick={() => removeDependent(item.id)} disabled={busy} className="text-xs font-medium text-red-600">Remover</button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Etapa 2</p>
                  <h2 className="mt-1 text-lg font-semibold text-gray-950">Contrato</h2>
                  {data?.contractTemplate && (
                    <p className="mt-1 text-sm text-gray-500">
                      {data.contractTemplate.name} · versão {data.contractTemplate.version}
                    </p>
                  )}
                </div>
                {data?.contract?.status === 'ACCEPTED' && (
                  <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">Aceito</span>
                )}
              </div>

              {!data?.contract ? (
                <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm leading-6 text-gray-600">
                    Ao gerar o contrato, o sistema salva novamente os dados exibidos nesta página e congela as condições comerciais para o aceite.
                  </p>
                  <button
                    type="button"
                    onClick={generateContract}
                    disabled={busy || !registrationComplete}
                    className="mt-4 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Salvar dados e gerar contrato
                  </button>
                </div>
              ) : (
                <>
                  {(data.contract.templateName || data.contract.templateVersion) && (
                    <div className="mt-5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                      <span className="font-medium">{data.contract.templateName || 'Modelo contratual'}</span>
                      {data.contract.templateVersion ? ` · versão ${data.contract.templateVersion}` : ''}
                    </div>
                  )}
                  <SafeRichText content={data.contract.content} className="mt-4 max-h-[520px] overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 p-5 text-sm leading-6 text-gray-800" />
                  {data.contract.status !== 'ACCEPTED' ? (
                    editingCustomer ? (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Finalize a correção cadastral e gere novamente o contrato antes do aceite.
                      </div>
                    ) : (
                      <div className="mt-5 border-t border-gray-100 pt-5">
                        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-gray-700">
                          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4" />
                          <span>Li o documento acima, conferi as condições comerciais e aceito os termos apresentados.</span>
                        </label>
                        <button
                          type="button"
                          onClick={acceptContract}
                          disabled={!accepted || busy}
                          className="mt-4 rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
                        >
                          Aceitar contrato
                        </button>
                      </div>
                    )
                  ) : data.contract.requiresPayment === false ? (
                    <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700">
                      Alteração contratual aceita e aplicada. Não há nova cobrança para esta alteração.
                    </div>
                  ) : null}
                </>
              )}
            </section>

            {data?.contract?.status === 'ACCEPTED' && data.contract.requiresPayment !== false && (
              <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Etapa 3</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-950">Forma de pagamento</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  A cobrança será criada com o valor e a periodicidade congelados no contrato aceito.
                </p>

                {!registrationComplete && !isRevision && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
                    Este contrato foi aceito com dados cadastrais incompletos. Por segurança, o pagamento não deve prosseguir neste link; solicite um novo pré-checkout ao responsável comercial.
                  </div>
                )}

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(data.allowedBillingTypes || []).map((type) => (
                    <label
                      key={type}
                      className={`cursor-pointer rounded-2xl border p-4 transition ${
                        billingType === type
                          ? 'border-gray-950 bg-gray-50 ring-2 ring-gray-950/5'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input type="radio" name="billingType" value={type} checked={billingType === type} onChange={() => setBillingType(type)} />
                        <span className="text-sm font-semibold text-gray-900">{labels[type] || type}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-500">{billingDescriptions[type]}</p>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={startPayment}
                  disabled={busy || !billingType || (!registrationComplete && !isRevision)}
                  className="mt-5 w-full rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  Continuar para pagamento no Asaas
                </button>
                <p className="mt-3 text-xs leading-5 text-gray-500">
                  Você será redirecionado para o ambiente do Asaas para concluir os dados específicos do meio de pagamento.
                </p>
              </section>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Resumo da negociação</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">{money(total)}</p>
              <p className="mt-1 text-sm text-gray-600">
                {cycleLabels[data?.pricing?.cycle || ''] || data?.pricing?.cycle || '-'}
                {data?.pricing?.cycle === 'YEARLY'
                  ? ` · ${money(pricing.monthlyEquivalent)} / mês equivalente`
                  : ''}
              </p>

              <dl className="mt-5 space-y-3 border-t border-gray-100 pt-4 text-sm">
                {data?.customerType === 'PERSON' && pricing.holderAmount != null && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Titular</dt>
                    <dd className="font-medium text-gray-800">{money(pricing.holderAmount)}</dd>
                  </div>
                )}
                {data?.customerType === 'PERSON' && Number(data?.pricing?.participants?.dependentCount || 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">
                      {data.pricing.participants.dependentCount} dependente(s)
                    </dt>
                    <dd className="font-medium text-gray-800">{money(pricing.dependentAmount)} cada</dd>
                  </div>
                )}
                {data?.customerType === 'COMPANY' && pricing.unitPrice != null && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Preço por vida</dt>
                    <dd className="font-medium text-gray-800">{money(pricing.unitPrice)}</dd>
                  </div>
                )}
                {data?.customerType === 'COMPANY' && data?.pricing?.participants?.contractedLives && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Vidas contratadas</dt>
                    <dd className="font-medium text-gray-800">{data.pricing.participants.contractedLives}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">
                    {data?.pricing?.cycle === 'YEARLY' ? 'Projeção de 12 meses' : 'Subtotal mensal'}
                  </dt>
                  <dd className="font-medium text-gray-800">{money(pricing.grossPeriodAmount || pricing.monthlySubtotal)}</dd>
                </div>
                {Number(pricing.annualDiscountAmount || 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Desconto anual ({Number(pricing.annualDiscountPercent || 0)}%)</dt>
                    <dd className="font-medium text-green-700">− {money(pricing.annualDiscountAmount)}</dd>
                  </div>
                )}
                {Number(pricing.commercialDiscountAmount || 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Desconto comercial</dt>
                    <dd className="font-medium text-green-700">− {money(pricing.commercialDiscountAmount)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-gray-100 pt-3">
                  <dt className="font-semibold text-gray-900">Total contratado</dt>
                  <dd className="font-semibold text-gray-950">{money(total)}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-3xl border border-gray-200 bg-white p-5 text-sm shadow-sm">
              <h3 className="font-semibold text-gray-900">Antes de continuar</h3>
              <ul className="mt-3 space-y-2 text-gray-600">
                <li>• Confira nome, documento e endereço.</li>
                <li>• Valide o valor final e os descontos negociados.</li>
                <li>• Leia o contrato antes de registrar o aceite.</li>
              </ul>
              {data?.expiresAt && (
                <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                  Link válido até {new Date(data.expiresAt).toLocaleString('pt-BR')}.
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

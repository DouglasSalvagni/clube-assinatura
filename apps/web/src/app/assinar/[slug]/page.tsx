'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { API_BASE } from '@/lib/api';

type Offer = {
  name: string;
  description?: string | null;
  customerType: 'PERSON' | 'COMPANY';
  version: {
    billingCycle: string;
    maxDependents: number;
    minLives: number;
    maxLives: number | null;
    allowedBillingTypes: string[];
  };
  simulation: any;
};

type Participant = { name: string; taxId: string; relationship: string };

async function publicApi(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(message || body.error || 'Não foi possível concluir a operação.');
  }
  return body;
}

export default function PublicOfferPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [simulation, setSimulation] = useState<any>(null);
  const [dependentCount, setDependentCount] = useState(0);
  const [lives, setLives] = useState(1);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [customer, setCustomer] = useState({
    name: '',
    taxId: '',
    email: '',
    phone: '',
    postalCode: '',
    address: '',
    addressNumber: '',
    district: '',
    city: '',
    state: '',
    complement: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await publicApi(`/public/offers/${slug}`);
      setOffer(result);
      setSimulation(result.simulation);
      setLives(result.version?.minLives || 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Oferta não encontrada.');
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setParticipants((current) => {
      if (current.length === dependentCount) return current;
      if (current.length > dependentCount) return current.slice(0, dependentCount);
      return [
        ...current,
        ...Array.from({ length: dependentCount - current.length }, () => ({
          name: '',
          taxId: '',
          relationship: '',
        })),
      ];
    });
  }, [dependentCount]);

  useEffect(() => {
    if (!offer) return;
    const timer = window.setTimeout(async () => {
      try {
        const result = await publicApi(`/public/offers/${slug}/simulate`, {
          method: 'POST',
          body: JSON.stringify(
            offer.customerType === 'PERSON' ? { dependentCount } : { lives },
          ),
        });
        setSimulation(result);
        setError('');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível calcular a oferta.');
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [dependentCount, lives, offer, slug]);

  const total = useMemo(
    () => Number(simulation?.pricing?.finalAmount || 0),
    [simulation],
  );

  async function lookupPostalCode() {
    const postalCode = customer.postalCode.replace(/\D/g, '');
    if (postalCode.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
      const data = await response.json();
      if (!response.ok || data.erro) throw new Error('CEP não encontrado.');
      setCustomer((current) => ({
        ...current,
        address: data.logradouro || current.address,
        district: data.bairro || current.district,
        city: data.localidade || current.city,
        state: data.uf || current.state,
        complement: data.complemento || current.complement,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao consultar o CEP.');
    }
  }

  function updateParticipant(index: number, field: keyof Participant, value: string) {
    setParticipants((current) =>
      current.map((participant, currentIndex) =>
        currentIndex === index ? { ...participant, [field]: value } : participant,
      ),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!offer) return;
    setBusy(true);
    setError('');
    try {
      const result = await publicApi(`/public/offers/${slug}/start`, {
        method: 'POST',
        body: JSON.stringify({
          ...customer,
          dependentCount: offer.customerType === 'PERSON' ? dependentCount : undefined,
          lives: offer.customerType === 'COMPANY' ? lives : undefined,
          participants: offer.customerType === 'PERSON' ? participants : undefined,
        }),
      });
      router.push(result.checkoutPath);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao iniciar a assinatura.');
      setBusy(false);
    }
  }

  if (!offer && !error) {
    return <main className="mx-auto max-w-4xl p-8">Carregando oferta...</main>;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-10">
      <header className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Adesão online
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{offer?.name || 'Oferta indisponível'}</h1>
        {offer?.description && <p className="mt-2 text-gray-600">{offer.description}</p>}
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {offer && (
        <form onSubmit={submit} className="space-y-6">
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Configure sua contratação</h2>
            {offer.customerType === 'PERSON' ? (
              <label className="mt-4 block max-w-sm text-sm">
                <span className="font-medium">Quantidade de dependentes</span>
                <input
                  type="number"
                  min={0}
                  max={offer.version.maxDependents}
                  value={dependentCount}
                  onChange={(event) => setDependentCount(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Limite: {offer.version.maxDependents}
                </span>
              </label>
            ) : (
              <label className="mt-4 block max-w-sm text-sm">
                <span className="font-medium">Quantidade de vidas</span>
                <input
                  type="number"
                  min={offer.version.minLives}
                  max={offer.version.maxLives || undefined}
                  value={lives}
                  onChange={(event) => setLives(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
            )}
            <div className="mt-5 rounded-xl bg-gray-50 p-5">
              <p className="text-sm text-gray-600">Valor atualizado</p>
              <p className="mt-1 text-3xl font-semibold">
                {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Periodicidade: {offer.version.billingCycle}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              {offer.customerType === 'COMPANY' ? 'Dados da empresa' : 'Dados do titular'}
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(customer).map(([key, value]) => (
                <input
                  key={key}
                  value={value}
                  required={key !== 'complement'}
                  onBlur={key === 'postalCode' ? lookupPostalCode : undefined}
                  onChange={(event) => setCustomer({ ...customer, [key]: event.target.value })}
                  placeholder={{
                    name: offer.customerType === 'COMPANY' ? 'Razão social' : 'Nome completo',
                    taxId: offer.customerType === 'COMPANY' ? 'CNPJ' : 'CPF',
                    email: 'E-mail',
                    phone: 'Telefone',
                    postalCode: 'CEP',
                    address: 'Endereço',
                    addressNumber: 'Número',
                    district: 'Bairro',
                    city: 'Cidade',
                    state: 'UF',
                    complement: 'Complemento',
                  }[key]}
                  className="rounded-lg border px-3 py-2 text-sm"
                />
              ))}
            </div>
          </section>

          {offer.customerType === 'PERSON' && participants.length > 0 && (
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Dados dos dependentes</h2>
              <div className="mt-4 space-y-4">
                {participants.map((participant, index) => (
                  <div key={index} className="grid gap-3 rounded-xl border p-4 md:grid-cols-3">
                    <input
                      required
                      value={participant.name}
                      onChange={(event) => updateParticipant(index, 'name', event.target.value)}
                      placeholder={`Nome do dependente ${index + 1}`}
                      className="rounded-lg border px-3 py-2 text-sm"
                    />
                    <input
                      required
                      value={participant.taxId}
                      onChange={(event) => updateParticipant(index, 'taxId', event.target.value)}
                      placeholder="CPF"
                      className="rounded-lg border px-3 py-2 text-sm"
                    />
                    <input
                      value={participant.relationship}
                      onChange={(event) => updateParticipant(index, 'relationship', event.target.value)}
                      placeholder="Parentesco"
                      className="rounded-lg border px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          <button
            disabled={busy}
            className="w-full rounded-xl bg-black px-6 py-4 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Preparando contratação...' : 'Continuar para revisão e contrato'}
          </button>
        </form>
      )}
    </main>
  );
}

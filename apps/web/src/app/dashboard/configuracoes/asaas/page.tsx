'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';

type Environment = 'SANDBOX' | 'PRODUCTION';

interface BillingStatus {
  configured: boolean;
  enabled: boolean;
  environment: Environment;
  apiKeyMasked: string | null;
  webhookConfigured: boolean;
  webhookId: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
  events: string[];
}

export default function AsaasSettingsPage() {
  const { setPageTitle } = usePageTitle();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [environment, setEnvironment] = useState<Environment>('SANDBOX');
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const data = await api('/billing/asaas');
    setStatus(data);
    setEnvironment(data.environment);
    setEnabled(data.enabled);
  }

  useEffect(() => {
    setPageTitle('Integração Asaas');
    load().catch(() => setError('Não foi possível consultar a configuração Asaas desta unidade.'));
  }, [setPageTitle]);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setMessage('');
    setError('');
    try {
      await action();
      await load();
      setMessage('Operação concluída com sucesso.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A operação não pôde ser concluída.');
    } finally {
      setBusy('');
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    return run('save', () => api('/billing/asaas', {
      method: 'PUT',
      body: JSON.stringify({ environment, enabled, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }),
    }).then(() => setApiKey('')));
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h2 className="text-xl font-semibold text-ink">Conta Asaas da unidade</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-tertiary">
          Cada unidade utiliza sua própria conta Asaas. A credencial é criptografada no banco e nunca é devolvida pela API.
        </p>
      </div>

      {message && <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{message}</div>}
      {error && <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      <form onSubmit={save} className="max-w-3xl space-y-5 rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-secondary">Ambiente</label>
            <select value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)} className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Produção</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex h-[42px] w-full items-center gap-3 rounded-lg border border-edge bg-surface-input px-3 text-sm text-ink-secondary">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-brand" />
              Integração habilitada
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-secondary">Chave da API</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status?.configured ? 'Deixe vazio para manter a chave atual' : '$aact_...'} className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
          <p className="mt-1.5 text-xs text-ink-muted">Status: {status?.configured ? `configurada (${status.apiKeyMasked})` : 'não configurada'}.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button disabled={Boolean(busy)} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy === 'save' ? 'Salvando...' : 'Salvar configuração'}</button>
          <button type="button" disabled={Boolean(busy) || !status?.configured} onClick={() => run('test', () => api('/billing/asaas/test', { method: 'POST' }))} className="rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-canvas disabled:opacity-50">{busy === 'test' ? 'Validando...' : 'Testar conexão'}</button>
          <button type="button" disabled={Boolean(busy) || !status?.configured} onClick={() => run('webhook', () => api('/billing/asaas/webhook/setup', { method: 'POST' }))} className="rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-canvas disabled:opacity-50">{busy === 'webhook' ? 'Configurando...' : status?.webhookConfigured ? 'Reconfigurar webhook' : 'Configurar webhook'}</button>
          {status?.webhookConfigured && <button type="button" disabled={Boolean(busy)} onClick={() => run('backoff', () => api('/billing/asaas/webhook/remove-backoff', { method: 'POST' }))} className="rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-canvas disabled:opacity-50">Remover fila de backoff</button>}
        </div>
      </form>

      <div className="max-w-3xl rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
        <h3 className="font-semibold text-ink">Webhook da unidade</h3>
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <div><dt className="text-ink-tertiary">Configurado</dt><dd className="mt-1 font-medium text-ink">{status?.webhookConfigured ? 'Sim' : 'Não'}</dd></div>
          <div><dt className="text-ink-tertiary">Identificador externo</dt><dd className="mt-1 break-all font-medium text-ink">{status?.webhookId || '—'}</dd></div>
          <div><dt className="text-ink-tertiary">Última validação</dt><dd className="mt-1 font-medium text-ink">{status?.lastValidatedAt ? new Date(status.lastValidatedAt).toLocaleString('pt-BR') : '—'}</dd></div>
          <div><dt className="text-ink-tertiary">Último erro</dt><dd className="mt-1 font-medium text-ink">{status?.lastError || 'Nenhum'}</dd></div>
        </dl>
        <div className="mt-5">
          <p className="text-sm font-medium text-ink-secondary">Eventos monitorados</p>
          <div className="mt-2 flex flex-wrap gap-2">{status?.events?.map((event) => <span key={event} className="rounded-full border border-edge bg-surface-canvas px-2.5 py-1 text-xs text-ink-tertiary">{event}</span>)}</div>
        </div>
      </div>
    </div>
  );
}

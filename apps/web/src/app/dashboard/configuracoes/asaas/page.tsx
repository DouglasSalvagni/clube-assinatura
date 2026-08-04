'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';

type Environment = 'SANDBOX' | 'PRODUCTION';
type ConnectionState = 'NOT_CONFIGURED' | 'DISABLED' | 'NOT_VALIDATED' | 'CONNECTED' | 'ERROR';
type WebhookState = 'NOT_CONFIGURED' | 'NOT_VALIDATED' | 'CONNECTED' | 'ERROR';

interface BillingStatus {
  configured: boolean;
  enabled: boolean;
  state: ConnectionState;
  environment: Environment;
  apiKeyMasked: string | null;
  apiKeyExpectedPrefix: string;
  remoteAccountNumber: string | null;
  webhookEmail: string;
  webhookConfigured: boolean;
  webhookState: WebhookState;
  webhookId: string | null;
  webhookUrl: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
  lastWebhookSyncAt: string | null;
  lastWebhookError: string | null;
  events: string[];
}

interface RemoteWebhookStatus {
  configured: boolean;
  reachable: boolean;
  webhookId: string | null;
  name?: string | null;
  url?: string | null;
  email?: string | null;
  enabled?: boolean | null;
  interrupted?: boolean | null;
  sendType?: string | null;
  hasAuthToken?: boolean | null;
  events?: string[];
  syncedAt?: string | null;
  error?: string | null;
}

const stateLabels: Record<ConnectionState, { label: string; detail: string; className: string }> = {
  NOT_CONFIGURED: {
    label: 'Não configurada',
    detail: 'Informe uma chave de API para iniciar.',
    className: 'border-edge bg-surface-canvas text-ink-secondary',
  },
  DISABLED: {
    label: 'Desabilitada',
    detail: 'A chave está salva, mas operações financeiras estão bloqueadas.',
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  NOT_VALIDATED: {
    label: 'Aguardando validação',
    detail: 'Salve e teste a conexão antes de usar a integração.',
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  CONNECTED: {
    label: 'Conectada',
    detail: 'A chave foi validada com sucesso no ambiente selecionado.',
    className: 'border-success/30 bg-success/10 text-success',
  },
  ERROR: {
    label: 'Com erro',
    detail: 'A última tentativa de validação falhou.',
    className: 'border-danger/30 bg-danger/10 text-danger',
  },
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não realizada';
}

export default function AsaasSettingsPage() {
  const { setPageTitle } = usePageTitle();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [remoteWebhook, setRemoteWebhook] = useState<RemoteWebhookStatus | null>(null);
  const [environment, setEnvironment] = useState<Environment>('SANDBOX');
  const [apiKey, setApiKey] = useState('');
  const [webhookEmail, setWebhookEmail] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [webhookName, setWebhookName] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [webhookSendType, setWebhookSendType] = useState<'SEQUENTIALLY' | 'NON_SEQUENTIALLY'>('SEQUENTIALLY');
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [webhookToken, setWebhookToken] = useState('');
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const tokenHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const stateInfo = useMemo(
    () => stateLabels[status?.state || 'NOT_CONFIGURED'],
    [status?.state],
  );

  async function load(loadRemote = false) {
    const data = await api('/billing/asaas') as BillingStatus;
    setStatus(data);
    setEnvironment(data.environment);
    setEnabled(data.enabled);
    setWebhookEmail(data.webhookEmail || '');

    if (loadRemote && data.webhookConfigured) {
      const webhook = await api('/billing/asaas/webhook') as RemoteWebhookStatus;
      setRemoteWebhook(webhook);
      setWebhookName(webhook.name || '');
      setWebhookEnabled(webhook.enabled !== false);
      setWebhookSendType(webhook.sendType === 'NON_SEQUENTIALLY' ? 'NON_SEQUENTIALLY' : 'SEQUENTIALLY');
      setWebhookEvents(webhook.events || data.events || []);
    } else if (!data.webhookConfigured) {
      setRemoteWebhook(null);
    }
    return data;
  }

  useEffect(() => () => {
    if (tokenHideTimer.current) clearTimeout(tokenHideTimer.current);
  }, []);

  useEffect(() => {
    setPageTitle('Integração Asaas');
    load(false)
      .then((data) => {
        if (!data.webhookConfigured) return;
        api('/billing/asaas/webhook')
          .then((webhook) => {
            const value = webhook as RemoteWebhookStatus;
            setRemoteWebhook(value);
            setWebhookName(value.name || '');
            setWebhookEnabled(value.enabled !== false);
            setWebhookSendType(value.sendType === 'NON_SEQUENTIALLY' ? 'NON_SEQUENTIALLY' : 'SEQUENTIALLY');
            setWebhookEvents(value.events || data.events || []);
          })
          .catch((remoteError) => setRemoteWebhook({
            configured: true,
            reachable: false,
            webhookId: data.webhookId,
            url: data.webhookUrl,
            error: remoteError instanceof Error
              ? remoteError.message
              : 'Não foi possível consultar o webhook no Asaas.',
          }));
      })
      .catch((loadError) => {
        setError(loadError instanceof Error
          ? loadError.message
          : 'Não foi possível consultar a configuração Asaas desta unidade.');
      });
  }, [setPageTitle]);

  async function run(label: string, action: () => Promise<unknown>, successMessage: string) {
    setBusy(label);
    setMessage('');
    setError('');
    try {
      await action();
      await load(true);
      setMessage(successMessage);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'A operação não pôde ser concluída.');
    } finally {
      setBusy('');
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const replacingKey = Boolean(apiKey.trim());
    return run(
      'save',
      async () => {
        await api('/billing/asaas', {
          method: 'PUT',
          body: JSON.stringify({
            environment,
            enabled,
            webhookEmail: webhookEmail.trim() || undefined,
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          }),
        });
        setApiKey('');
      },
      replacingKey
        ? 'Nova chave salva com segurança. Execute o teste de conexão antes de continuar.'
        : status?.configured
          ? 'Configuração atualizada. A chave armazenada foi mantida.'
          : 'Configuração salva. Agora teste a conexão.',
    );
  }

  async function configureWebhook() {
    if (!webhookEmail.trim()) {
      setError('Informe um e-mail para alertas do webhook.');
      return;
    }
    await run(
      'webhook',
      async () => {
        if (webhookEmail.trim() !== (status?.webhookEmail || '')) {
          await api('/billing/asaas', {
            method: 'PUT',
            body: JSON.stringify({ environment, enabled, webhookEmail: webhookEmail.trim() }),
          });
        }
        await api('/billing/asaas/webhook/setup', {
          method: 'POST',
          body: JSON.stringify({ email: webhookEmail.trim() }),
        });
      },
      status?.webhookConfigured
        ? 'Webhook verificado e sincronizado com o Asaas.'
        : 'Webhook criado e vinculado com sucesso.',
    );
  }

  async function saveWebhookChanges() {
    if (!webhookEmail.trim()) {
      setError('Informe um e-mail válido para o webhook.');
      return;
    }
    await run(
      'save-webhook',
      () => api('/billing/asaas/webhook', {
        method: 'PUT',
        body: JSON.stringify({
          name: webhookName.trim() || undefined,
          email: webhookEmail.trim(),
          enabled: webhookEnabled,
          sendType: webhookSendType,
          events: webhookEvents,
        }),
      }),
      'Webhook atualizado no Asaas.',
    );
  }

  async function toggleWebhookToken() {
    if (showWebhookToken) {
      setShowWebhookToken(false);
      setWebhookToken('');
      if (tokenHideTimer.current) clearTimeout(tokenHideTimer.current);
      tokenHideTimer.current = null;
      return;
    }

    setBusy('reveal-token');
    setError('');
    try {
      const result = await api('/billing/asaas/webhook/token/reveal', {
        method: 'POST',
      }) as { token: string };
      setWebhookToken(result.token);
      setShowWebhookToken(true);
      if (tokenHideTimer.current) clearTimeout(tokenHideTimer.current);
      tokenHideTimer.current = setTimeout(() => {
        setShowWebhookToken(false);
        setWebhookToken('');
        tokenHideTimer.current = null;
      }, 30_000);
    } catch (tokenError) {
      setError(tokenError instanceof Error
        ? tokenError.message
        : 'Não foi possível revelar o token do webhook.');
    } finally {
      setBusy('');
    }
  }

  async function removeWebhook() {
    if (!window.confirm('Remover este webhook da conta Asaas? Os eventos deixarão de ser enviados até uma nova configuração.')) return;
    setShowWebhookToken(false);
    setWebhookToken('');
    await run(
      'remove-webhook',
      () => api('/billing/asaas/webhook', { method: 'DELETE' }),
      'Webhook removido do Asaas e desvinculado desta unidade.',
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Conta Asaas da unidade</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-tertiary">
          Cada unidade pode usar sua própria conta Asaas. A chave é criptografada e nunca é devolvida integralmente pela API.
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid max-w-5xl gap-4 md:grid-cols-3">
        <div className={`rounded-xl border p-4 ${stateInfo.className}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">Conexão</p>
          <p className="mt-2 text-lg font-semibold">{stateInfo.label}</p>
          <p className="mt-1 text-xs opacity-80">{stateInfo.detail}</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Ambiente</p>
          <p className="mt-2 text-lg font-semibold text-ink">
            {status?.environment === 'PRODUCTION' ? 'Produção' : 'Sandbox'}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Prefixo esperado: <code>{status?.apiKeyExpectedPrefix || '—'}</code>
          </p>
        </div>
        <div className="rounded-xl border border-edge bg-surface-elevated p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Webhook</p>
          <p className="mt-2 text-lg font-semibold text-ink">
            {remoteWebhook?.reachable
              ? 'Sincronizado'
              : status?.webhookConfigured
                ? 'Requer verificação'
                : 'Não configurado'}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Última consulta: {formatDate(remoteWebhook?.syncedAt || status?.lastWebhookSyncAt)}</p>
        </div>
      </div>

      <form onSubmit={save} className="max-w-5xl space-y-5 rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-secondary">Ambiente</label>
            <select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value as Environment)}
              className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Produção</option>
            </select>
            {status?.configured && environment !== status.environment && (
              <p className="mt-1.5 text-xs text-warning">
                Ao trocar de ambiente, informe a chave correspondente. O vínculo local do webhook anterior será reiniciado.
              </p>
            )}
          </div>
          <div className="flex items-start md:items-end">
            <label className="flex min-h-[42px] w-full items-center gap-3 rounded-lg border border-edge bg-surface-input px-3 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              Integração habilitada para esta unidade
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-secondary">Chave da API</label>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={status?.configured ? 'Informe somente para substituir a chave atual' : status?.apiKeyExpectedPrefix || '$aact_hmlg_...'}
            autoComplete="new-password"
            className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span>
              {status?.configured
                ? <>Chave armazenada: <strong className="text-ink-secondary">{status.apiKeyMasked}</strong></>
                : 'Nenhuma chave armazenada.'}
            </span>
            <span>A chave completa não é exibida novamente por segurança.</span>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-secondary">E-mail para alertas do webhook</label>
          <input
            type="email"
            value={webhookEmail}
            onChange={(event) => setWebhookEmail(event.target.value)}
            placeholder="financeiro@empresa.com.br"
            className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            O Asaas utiliza este endereço para avisar sobre falhas e interrupções na entrega de eventos.
          </p>
        </div>

        <div className="rounded-lg border border-edge bg-surface-canvas p-4 text-sm">
          <p className="font-medium text-ink-secondary">URL pública do webhook</p>
          <p className="mt-1 break-all font-mono text-xs text-ink-tertiary">
            {status?.webhookUrl || 'A URL pública não pôde ser calculada. Configure PUBLIC_API_URL na API.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            disabled={Boolean(busy)}
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === 'save' ? 'Salvando...' : 'Salvar configuração'}
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || !status?.configured}
            onClick={() => run(
              'test',
              () => api('/billing/asaas/test', { method: 'POST' }),
              'Conexão validada com sucesso no Asaas.',
            )}
            className="rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-canvas disabled:opacity-50"
          >
            {busy === 'test' ? 'Validando...' : 'Testar conexão'}
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || !status?.configured || !status.enabled || status.state !== 'CONNECTED'}
            onClick={configureWebhook}
            className="rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-canvas disabled:opacity-50"
          >
            {busy === 'webhook'
              ? 'Sincronizando...'
              : status?.webhookConfigured
                ? 'Verificar e sincronizar webhook'
                : 'Configurar webhook'}
          </button>
          {status?.webhookConfigured && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run(
                'webhook-status',
                async () => {
                  const webhook = await api('/billing/asaas/webhook') as RemoteWebhookStatus;
                  setRemoteWebhook(webhook);
                  if (!webhook.reachable) throw new Error(webhook.error || 'O webhook não pôde ser consultado no Asaas.');
                },
                'Status remoto do webhook atualizado.',
              )}
              className="rounded-lg border border-edge bg-surface px-4 py-2.5 text-sm font-medium text-ink-secondary hover:bg-surface-canvas disabled:opacity-50"
            >
              {busy === 'webhook-status' ? 'Consultando...' : 'Atualizar status'}
            </button>
          )}
        </div>
        {status?.configured && status.state !== 'CONNECTED' && (
          <p className="text-xs text-warning">Teste a conexão com sucesso antes de criar ou sincronizar o webhook.</p>
        )}
        {status?.configured && status.state === 'CONNECTED' && !webhookEmail.trim() && (
          <p className="text-xs text-warning">Informe o e-mail de alertas. Ele será salvo automaticamente ao configurar o webhook.</p>
        )}
      </form>

      {status?.webhookConfigured && (
        <div className="max-w-5xl space-y-4 rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
          <div>
            <h3 className="font-semibold text-ink">Editar webhook</h3>
            <p className="mt-1 text-sm text-ink-tertiary">Edite nome, envio, estado e eventos diretamente na conta Asaas desta unidade.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-secondary">Nome</label>
              <input value={webhookName} onChange={(event) => setWebhookName(event.target.value)} className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2.5 text-sm text-ink" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-secondary">Ordem de envio</label>
              <select value={webhookSendType} onChange={(event) => setWebhookSendType(event.target.value as any)} className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2.5 text-sm text-ink">
                <option value="SEQUENTIALLY">Sequencial</option>
                <option value="NON_SEQUENTIALLY">Não sequencial</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-secondary">
              Token de autenticação do webhook
            </label>
            <div className="relative">
              <input
                type={showWebhookToken ? 'text' : 'password'}
                value={showWebhookToken ? webhookToken : '••••••••••••••••••••••••••••••••'}
                readOnly
                autoComplete="off"
                aria-label="Token de autenticação do webhook"
                className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2.5 pr-11 font-mono text-sm text-ink"
              />
              <button
                type="button"
                onClick={toggleWebhookToken}
                disabled={Boolean(busy)}
                aria-label={showWebhookToken ? 'Ocultar token' : 'Revelar token'}
                title={showWebhookToken ? 'Ocultar token' : 'Revelar token'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-tertiary hover:text-ink disabled:opacity-50"
              >
                {busy === 'reveal-token' ? (
                  <span className="text-xs">...</span>
                ) : showWebhookToken ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.7a2 2 0 002.7 2.7" />
                    <path d="M9.9 4.3A10.8 10.8 0 0112 4c5.2 0 9 4.6 9 8a7.7 7.7 0 01-2 4.4M6.6 6.7C4.4 8.2 3 10.4 3 12c0 3.4 3.8 8 9 8 1 0 2-.2 2.9-.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M3 12s3.5-8 9-8 9 8 9 8-3.5 8-9 8-9-8-9-8z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              O token é revelado somente sob solicitação e volta a ser ocultado após 30 segundos.
            </p>
          </div>
          <label className="flex items-center gap-3 text-sm text-ink-secondary">
            <input type="checkbox" checked={webhookEnabled} onChange={(event) => setWebhookEnabled(event.target.checked)} className="h-4 w-4 accent-brand" />
            Webhook habilitado no Asaas
          </label>
          <div>
            <p className="text-sm font-medium text-ink-secondary">Eventos</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(status.events || []).map((eventName) => (
                <label key={eventName} className="flex items-start gap-2 rounded-lg border border-edge bg-surface-canvas p-2 text-xs text-ink-tertiary">
                  <input
                    type="checkbox"
                    checked={webhookEvents.includes(eventName)}
                    onChange={(event) => setWebhookEvents((current) => event.target.checked ? [...new Set([...current, eventName])] : current.filter((item) => item !== eventName))}
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span className="break-all">{eventName}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={Boolean(busy) || !webhookEvents.length} onClick={saveWebhookChanges} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy === 'save-webhook' ? 'Salvando...' : 'Salvar alterações do webhook'}
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={removeWebhook} className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50">
              {busy === 'remove-webhook' ? 'Revogando...' : 'Revogar webhook'}
            </button>
          </div>
        </div>
      )}

      <div className="max-w-5xl rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ink">Diagnóstico da integração</h3>
            <p className="mt-1 text-sm text-ink-tertiary">Informações locais e estado consultado diretamente no Asaas.</p>
          </div>
          {status?.webhookConfigured && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run(
                  'backoff',
                  () => api('/billing/asaas/webhook/remove-backoff', { method: 'POST' }),
                  'Penalização de entrega removida. O Asaas poderá retomar o fluxo normal.',
                )}
                className="rounded-lg border border-edge bg-surface px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-surface-canvas disabled:opacity-50"
              >
                {busy === 'backoff' ? 'Processando...' : 'Remover penalização da fila'}
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={removeWebhook}
                className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {busy === 'remove-webhook' ? 'Removendo...' : 'Remover webhook'}
              </button>
            </div>
          )}
        </div>

        <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-ink-tertiary">Conta identificada</dt>
            <dd className="mt-1 font-medium text-ink">{status?.remoteAccountNumber || 'Aguardando validação'}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Última validação da chave</dt>
            <dd className="mt-1 font-medium text-ink">{formatDate(status?.lastValidatedAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Último erro da conexão</dt>
            <dd className={`mt-1 font-medium ${status?.lastError ? 'text-danger' : 'text-ink'}`}>
              {status?.lastError || 'Nenhum'}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Webhook remoto</dt>
            <dd className="mt-1 font-medium text-ink">
              {remoteWebhook?.reachable
                ? remoteWebhook.enabled === false
                  ? 'Encontrado, mas desabilitado'
                  : 'Encontrado e ativo'
                : status?.webhookConfigured
                  ? 'Não confirmado nesta consulta'
                  : 'Não configurado'}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Fila interrompida</dt>
            <dd className={`mt-1 font-medium ${remoteWebhook?.interrupted ? 'text-danger' : 'text-ink'}`}>
              {remoteWebhook?.interrupted === true ? 'Sim' : remoteWebhook?.interrupted === false ? 'Não' : 'Não consultado'}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Último erro do webhook</dt>
            <dd className={`mt-1 font-medium ${status?.lastWebhookError || remoteWebhook?.error ? 'text-danger' : 'text-ink'}`}>
              {remoteWebhook?.error || status?.lastWebhookError || 'Nenhum'}
            </dd>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <dt className="text-ink-tertiary">Identificador externo</dt>
            <dd className="mt-1 break-all font-medium text-ink">{remoteWebhook?.webhookId || status?.webhookId || '—'}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <p className="text-sm font-medium text-ink-secondary">Eventos monitorados</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(remoteWebhook?.events?.length ? remoteWebhook.events : status?.events || []).map((event) => (
              <span key={event} className="rounded-full border border-edge bg-surface-canvas px-2.5 py-1 text-xs text-ink-tertiary">
                {event}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

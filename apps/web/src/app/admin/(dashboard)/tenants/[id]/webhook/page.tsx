'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';

export default function TenantWebhookPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loaded, setLoaded] = useState(false);
  const { setPageTitle } = usePageTitle();
  const [webhook, setWebhook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    setPageTitle('Webhook Asaas');
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/admin/login'); return; }
    setLoaded(true);
    loadWebhook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, id, setPageTitle]);

  async function loadWebhook() {
    setLoading(true);
    try {
      const res = await api(`/admin/tenants/${id}/webhook`);
      setWebhook(res);
    } catch { setWebhook(null) }
    setLoading(false);
  }

  async function handleSetup() {
    setActionMsg('Configurando...');
    try {
      const res = await api(`/admin/tenants/${id}/webhook/setup`, { method: 'POST' });
      setActionMsg(`Webhook configurado! ID: ${res.webhookId}`);
      loadWebhook();
    } catch (err: any) {
      setActionMsg(`Erro: ${err.message}`);
    }
  }

  async function handleRemoveBackoff() {
    setActionMsg('Reativando fila...');
    try {
      await api(`/admin/tenants/${id}/webhook/remove-backoff`, { method: 'POST' });
      setActionMsg('Fila reativada com sucesso!');
      loadWebhook();
    } catch (err: any) {
      setActionMsg(`Erro: ${err.message}`);
    }
  }

  if (!loaded) return null;

  return (
    <div className="p-8">
      <button onClick={() => router.push('/admin/tenants')}
        className="mb-6 flex items-center gap-1 text-sm text-ink-tertiary hover:text-ink">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Voltar
      </button>

      {actionMsg && (
        <div className="mb-4 rounded-lg border border-info/20 bg-info/10 px-4 py-3 text-sm text-info">
          {actionMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-tertiary">Carregando...</p>
      ) : !webhook || webhook.configured === false ? (
        <div className="rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
          <p className="mb-4 text-sm text-ink-tertiary">Nenhum webhook configurado para esta tenant.</p>
          <button onClick={handleSetup}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark">
            Configurar Webhook
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-ink">Status</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-ink-tertiary">URL</span>
                <p className="text-sm text-ink break-all">{webhook.url}</p>
              </div>
              <div>
                <span className="text-xs text-ink-tertiary">Ativo</span>
                <p className="text-sm">
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                    webhook.enabled
                      ? 'border-success/20 bg-success/10 text-success'
                      : 'border-danger/20 bg-danger/10 text-danger'
                  }`}>
                    {webhook.enabled ? 'Sim' : 'Não'}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-xs text-ink-tertiary">Fila</span>
                <p className="text-sm">
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                    webhook.interrupted
                      ? 'border-danger/20 bg-danger/10 text-danger'
                      : 'border-success/20 bg-success/10 text-success'
                  }`}>
                    {webhook.interrupted ? 'Pausada' : 'Ativa'}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-xs text-ink-tertiary">Requisições Penalizadas</span>
                <p className="text-sm text-ink">{webhook.penalizedRequestsCount || 0}</p>
              </div>
              <div>
                <span className="text-xs text-ink-tertiary">Tipo de Envio</span>
                <p className="text-sm text-ink">{webhook.sendType || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-ink-tertiary">Eventos</span>
                <p className="text-sm text-ink">{(webhook.events || []).join(', ')}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {webhook.interrupted && (
              <button onClick={handleRemoveBackoff}
                className="rounded-lg bg-warning px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-warning/80">
                Reativar Fila
              </button>
            )}
            <button onClick={handleSetup}
              className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-canvas">
              Reconfigurar
            </button>
            <button onClick={loadWebhook}
              className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-canvas">
              Atualizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

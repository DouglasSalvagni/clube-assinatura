'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/page-title-context';
import { stripMask, maskPhone } from '@/lib/format';

export default function ProfilePage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const { setPageTitle } = usePageTitle();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [asaasWalletId, setAsaasWalletId] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    setPageTitle('Meu Perfil');
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/login'); return; }
    setLoaded(true);
    api('/profile').then((u) => {
      setName(u.name || '');
      setEmail(u.email || '');
      setWhatsapp(u.whatsapp || '');
      setAsaasWalletId(u.asaasWalletId || '');
    }).catch(() => {});
  }, [router, setPageTitle]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const body: any = { name, email, whatsapp, asaasWalletId };
      if (newPassword) {
        body.password = newPassword;
      }
      await api('/profile', { method: 'PATCH', body: JSON.stringify(body) });
      setMsg('Dados atualizados com sucesso!');
      setNewPassword('');
    } catch (err: any) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className="p-8 max-w-2xl">

      {msg && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
          msg.startsWith('Erro') ? 'border-danger/20 bg-danger/10 text-danger' : 'border-success/20 bg-success/10 text-success'
        }`}>
          {msg}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-ink">Informações Pessoais</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-secondary">Nome</label>
              <input required className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-secondary">Email</label>
              <input type="email" required className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-secondary">WhatsApp</label>
              <input className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                value={maskPhone(whatsapp)}
                onChange={(e) => setWhatsapp(stripMask(e.target.value).slice(0, 11))} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-ink">Asaas</h2>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-secondary">Carteira Asaas (Wallet ID)</label>
            <input className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              value={asaasWalletId} onChange={(e) => setAsaasWalletId(e.target.value)}
              placeholder="ex: 7bafd95a-e783-4a62-9be1-23999af742c6" />
            <p className="mt-1 text-xs text-ink-tertiary">ID da carteira no Asaas para recebimento de splits. <a href="https://www.asaas.com/customerConfigIntegrations/index" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Clique aqui para obter esta informação</a></p>
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-surface-elevated p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-ink">Alterar Senha</h2>
          <p className="mb-4 text-xs text-ink-tertiary">Deixe em branco para manter a senha atual.</p>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-secondary">Nova Senha</label>
              <input type="password" className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="rounded-lg bg-brand px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

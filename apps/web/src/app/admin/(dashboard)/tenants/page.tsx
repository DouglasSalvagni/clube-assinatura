'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePageTitle } from '@/lib/page-title-context';
import { PageSkeleton, TableSkeleton } from '@/components/page-skeleton';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}

type ModalMode = 'create' | 'edit' | null;

export default function TenantsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { setPageTitle } = usePageTitle();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle('Tenants', 'Gerencie os tenants da plataforma');
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/admin/login');
      return;
    }

    api('/tenants')
      .then((res) => setTenants(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router, setPageTitle]);

  function openEdit(t: Tenant) {
    setEditing(t);
    setName(t.name);
    setSlug(t.slug);
    setMode('edit');
    setError('');
  }

  function openCreate() {
    setEditing(null);
    setName('');
    setSlug('');
    setMode('create');
    setError('');
  }

  function close() {
    setMode(null);
    setEditing(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (mode === 'create') {
        const tenant = await api('/tenants', {
          method: 'POST',
          body: JSON.stringify({ name, slug }),
        });
        setTenants((prev) => [tenant, ...prev]);
      } else if (mode === 'edit' && editing) {
        const updated = await api(`/tenants/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, slug }),
        });
        setTenants((prev) => prev.map((t) => (t.id === editing.id ? updated : t)));
      }
      close();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/tenants/${id}`, { method: 'DELETE' });
      setTenants((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // ignore
    }
    setConfirmDelete(null);
  }

  if (authLoading) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-6 p-8">
      {user?.is_platform_admin && (
        <div className="flex justify-end">
          <button
            onClick={openCreate}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark"
          >
            Novo Tenant
          </button>
        </div>
      )}

      {loading ? (
        <TableSkeleton columns={4} />
      ) : tenants.length === 0 ? (
        <p className="text-sm text-ink-tertiary">Nenhum tenant encontrado.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-edge bg-surface-elevated shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-canvas/60">
              <tr className="border-b border-edge text-ink-tertiary">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">Slug</th>
                <th className="px-5 py-3 font-medium">Criado em</th>
                {user?.is_platform_admin && <th className="w-48 px-5 py-3 font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-edge/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-ink">{t.name}</td>
                  <td className="px-5 py-3 text-ink-secondary">{t.slug}</td>
                  <td className="px-5 py-3 text-ink-tertiary">
                    {new Date(t.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  {user?.is_platform_admin && (
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => router.push(`/admin/tenants/${t.id}/webhook`)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary transition hover:bg-brand/10 hover:text-brand"
                        >
                          Webhook
                        </button>
                        <button
                          onClick={() => openEdit(t)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary transition hover:bg-brand/10 hover:text-brand"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(t.id)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-ink-tertiary transition hover:bg-danger/10 hover:text-danger"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-ink">{mode === 'create' ? 'Novo Tenant' : 'Editar Tenant'}</h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">Nome</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">Slug</label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  className="block w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  required
                />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-edge px-4 py-2 text-sm text-ink-secondary transition hover:bg-surface-canvas"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
                >
                  {saving ? 'Salvando...' : mode === 'create' ? 'Criar' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-ink">Excluir Tenant</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              Tem certeza que deseja excluir este tenant? Esta ação não pode ser desfeita.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-edge px-4 py-2 text-sm text-ink-secondary transition hover:bg-surface-canvas"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition hover:bg-danger/90"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

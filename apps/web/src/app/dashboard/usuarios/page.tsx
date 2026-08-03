'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePageTitle } from '@/lib/page-title-context';

const ROLES = ['super-admin', 'administrador', 'gerente', 'representante'] as const;

const ROLE_LABELS: Record<string, string> = {
  'super-admin': 'Super Admin',
  'administrador': 'Administrador',
  'gerente': 'Gerente',
  'representante': 'Representante',
};

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  is_platform_admin: boolean;
  active: boolean;
}

type ModalMode = 'create' | 'edit' | null;

interface FormData {
  name: string;
  email: string;
  password: string;
  role: string;
  active: boolean;
}

const emptyForm: FormData = { name: '', email: '', password: '', role: 'representante', active: true };

export default function DashboardUsuariosPage() {
  const router = useRouter();
  const { user: currentUser, loading: authLoading } = useAuth();
  const { setPageTitle } = usePageTitle();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const tenantSlug = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;

  useEffect(() => {
    setPageTitle('Usuários', 'Gerencie os usuários da sua tenant');
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/login'); return; }
    load();
  }, [router, setPageTitle]);

  async function load() {
    try {
      const res = await api('/users');
      setUsers(res.data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setMode('create');
    setError('');
  }

  function openEdit(u: User) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role || 'representante', active: u.active });
    setMode('edit');
    setError('');
  }

  function close() {
    setMode(null);
    setEditing(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (mode === 'create') {
        const user = await api('/users', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password,
            role: form.role,
            tenantId: tenantSlug,
          }),
        });
        setUsers((prev) => [user, ...prev]);
      } else if (mode === 'edit' && editing) {
        const body: Record<string, unknown> = {
          name: form.name,
          email: form.email,
          role: form.role,
          active: form.active,
        };
        if (form.password) body.password = form.password;

        const updated = await api(`/users/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setUsers((prev) => prev.map((u) => (u.id === editing.id ? updated : u)));
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
      await api(`/users/${id}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      // ignore
    }
    setConfirmDelete(null);
  }

  if (authLoading) return null;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Usuários</h1>
          <p className="text-sm text-ink-tertiary">Gerencie os usuários da sua tenant</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark"
        >
          Novo Usuário
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-tertiary">Carregando...</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-ink-tertiary">Nenhum usuário encontrado.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-edge bg-surface-elevated shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-canvas/60">
              <tr className="border-b border-edge text-ink-tertiary">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Função</th>
                <th className="px-5 py-3 font-medium">Ativo</th>
                <th className="w-24 px-5 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-edge/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-ink">{u.name}</td>
                  <td className="px-5 py-3 text-ink-secondary">{u.email}</td>
                  <td className="px-5 py-3 text-ink-secondary">
                    <span className="inline-flex items-center rounded-md border border-edge bg-surface-canvas/50 px-2 py-0.5 text-xs font-medium text-ink-secondary">
                      {ROLE_LABELS[u.role] || u.role || 'Representante'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.active ? 'text-success' : 'text-ink-tertiary'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${u.active ? 'bg-success' : 'bg-ink-tertiary'}`} />
                      {u.active ? 'Sim' : 'Não'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(u)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary transition hover:bg-brand/10 hover:text-brand"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setConfirmDelete(u.id)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-ink-tertiary transition hover:bg-danger/10 hover:text-danger"
                      >
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

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-ink">{mode === 'create' ? 'Novo Usuário' : 'Editar Usuário'}</h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">Nome</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="block w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="block w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">
                  {mode === 'edit' ? 'Senha (deixe em branco para manter)' : 'Senha'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="block w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  required={mode === 'create'}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">Função</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="block w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                >
                  {ROLES.filter((r) => r !== 'super-admin').map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              {mode === 'edit' && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-ink-secondary">Usuário ativo</label>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="h-4 w-4 rounded border-edge text-brand focus:ring-brand"
                  />
                </div>
              )}
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
            <h2 className="text-lg font-semibold text-ink">Excluir Usuário</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.
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

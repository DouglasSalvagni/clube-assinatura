'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePageTitle } from '@/lib/page-title-context';
import { useAdminTenant } from '@/lib/admin-tenant-context';
import { CardListSkeleton, PageSkeleton } from '@/components/page-skeleton';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface TeamMember {
  id: string;
  userId: string;
  user: User;
}

interface Team {
  id: string;
  name: string;
  tenantId: string;
  managerId: string | null;
  manager: User | null;
  members: TeamMember[];
  createdAt: string;
}

export default function AdminTimesPage() {
  const router = useRouter();
  const { user: currentUser, loading: authLoading } = useAuth();
  const { setPageTitle } = usePageTitle();
  const { tenantHeader } = useAdminTenant();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle('Times', 'Gerencie os times da plataforma');
  }, [setPageTitle]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/admin/login'); return; }
    load();
  }, [router, tenantHeader]);

  async function load() {
    setLoading(true);
    try {
      const res = await api('/teams', { tenantId: tenantHeader });
      setTeams(res.data || []);
    } catch {
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/teams/${id}`, { method: 'DELETE', tenantId: tenantHeader });
      setTeams((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // ignore
    }
    setConfirmDelete(null);
  }

  if (authLoading) return <PageSkeleton variant="cards" />;
  if (!currentUser?.is_platform_admin) return null;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Times</h1>
        <p className="text-sm text-ink-tertiary">Visualize os times de todos os tenants</p>
      </div>

      {loading ? (
        <CardListSkeleton />
      ) : teams.length === 0 ? (
        <p className="text-sm text-ink-tertiary">Nenhum time encontrado.</p>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => (
            <div
              key={team.id}
              className="overflow-hidden rounded-xl border border-edge bg-surface-elevated shadow-sm"
            >
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-canvas/30 transition"
                onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-sm font-semibold text-brand">
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-medium text-ink">{team.name}</h3>
                    <p className="text-xs text-ink-tertiary">
                      Gerente: {team.manager?.name || '—'} &middot; {team.members?.length || 0} membro(s)
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(team.id); }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-ink-tertiary transition hover:bg-danger/10 hover:text-danger"
                >
                  Excluir
                </button>
              </div>

              {expandedTeam === team.id && (
                <div className="border-t border-edge px-5 py-4">
                  <h4 className="mb-3 text-sm font-medium text-ink-secondary">Membros</h4>
                  {team.members?.length === 0 ? (
                    <p className="text-sm text-ink-tertiary">Nenhum membro neste time.</p>
                  ) : (
                    <div className="space-y-2">
                      {team.members?.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 rounded-lg border border-edge/70 bg-surface-canvas/30 px-4 py-2.5"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-ink-secondary">
                            {member.user?.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-ink">{member.user?.name || 'Usuário'}</p>
                            <p className="text-xs text-ink-tertiary">{member.user?.email || ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-ink">Excluir Time</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              Tem certeza que deseja excluir este time?
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

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePageTitle } from '@/lib/page-title-context';
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
  managerId: string | null;
  manager: User | null;
  members: TeamMember[];
  createdAt: string;
}

type ModalMode = 'create' | 'edit' | 'add-member' | null;

export default function TimesPage() {
  const router = useRouter();
  const { user: currentUser, loading: authLoading } = useAuth();
  const { setPageTitle } = usePageTitle();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [mode, setMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle('Times', 'Organize equipes, gerentes e filas compartilhadas de oportunidades.');
    const token = localStorage.getItem('accessToken');
    if (!token) { router.push('/login'); return; }
    load();
  }, [router, setPageTitle]);

  async function load() {
    try {
      const [teamsRes, usersRes] = await Promise.all([
        api('/teams'),
        api('/users'),
      ]);
      setTeams(teamsRes.data || []);
      setUsers(usersRes.data || []);
    } catch {
      setTeams([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setTeamName('');
    setManagerId('');
    setError('');
    setMode('create');
  }

  function openEdit(team: Team) {
    setEditing(team);
    setTeamName(team.name);
    setManagerId(team.managerId || '');
    setError('');
    setMode('edit');
  }

  function openAddMember(teamId: string) {
    setSelectedTeamId(teamId);
    setNewMemberUserId('');
    setError('');
    setMode('add-member');
  }

  function close() {
    setMode(null);
    setEditing(null);
    setTeamName('');
    setManagerId('');
    setSelectedTeamId(null);
    setNewMemberUserId('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (mode === 'create') {
        const body: Record<string, unknown> = { name: teamName };
        if (managerId) body.managerId = managerId;

        const team = await api('/teams', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setTeams((prev) => [team, ...prev]);
      } else if (mode === 'edit' && editing) {
        const body: Record<string, unknown> = { name: teamName };
        if (managerId) {
          body.managerId = managerId;
        } else {
          body.managerId = null;
        }

        const updated = await api(`/teams/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setTeams((prev) => prev.map((t) => (t.id === editing.id ? updated : t)));
      }
      close();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeamId || !newMemberUserId) return;
    setError('');
    setSaving(true);

    try {
      const member = await api(`/teams/${selectedTeamId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: newMemberUserId }),
      });
      setTeams((prev) =>
        prev.map((t) => {
          if (t.id !== selectedTeamId) return t;
          const alreadyMember = t.members.some((m) => m.userId === newMemberUserId);
          return {
            ...t,
            members: alreadyMember
              ? t.members
              : [...t.members, { ...member, user: users.find((u) => u.id === newMemberUserId)! }],
          };
        }),
      );
      close();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(teamId: string, userId: string) {
    setError('');
    try {
      await api(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
      setTeams((prev) =>
        prev.map((t) => {
          if (t.id !== teamId) return t;
          return { ...t, members: t.members.filter((m) => m.userId !== userId) };
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover o membro.');
    }
  }

  async function handleDelete(id: string) {
    setError('');
    try {
      await api(`/teams/${id}`, { method: 'DELETE' });
      setTeams((prev) => prev.filter((t) => t.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o time.');
    }
    setConfirmDelete(null);
  }

  function getUserName(userId: string | undefined): string {
    if (!userId) return '—';
    const u = users.find((u) => u.id === userId);
    return u ? u.name : userId;
  }

  const commercialUsers = users.filter((user) =>
    ['administrador', 'gerente', 'representante', 'super-admin'].includes(user.role),
  );

  const managerCandidates = users.filter((user) =>
    ['administrador', 'gerente', 'super-admin'].includes(user.role),
  );

  const availableUsers = (teamId: string) =>
    commercialUsers.filter((user) => !teams.find((team) => team.id === teamId)?.members.some((member) => member.userId === user.id));

  const selectedUnitId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') || localStorage.getItem('unitId') : null;
  const currentMembership = currentUser?.memberships?.find((item) => item.active && item.unitId === selectedUnitId)
    || currentUser?.memberships?.find((item) => item.active);
  const canManageEveryTeam = Boolean(currentUser?.is_platform_admin || ['OWNER', 'ADMIN'].includes(currentMembership?.role || ''));
  const canDistributeTeam = (team: Team) => canManageEveryTeam
    || (currentMembership?.role === 'MANAGER' && team.managerId === currentUser?.id);

  const teamCountForUser = (userId: string) =>
    teams.filter((team) => team.members?.some((member) => member.userId === userId)).length;

  if (authLoading) return <PageSkeleton variant="cards" />;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Times</h1>
          <p className="text-sm text-ink-tertiary">Organize equipes, gerentes e filas compartilhadas de oportunidades.</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark"
        >
          Novo Time
        </button>
      </div>

      <div className="mb-5 rounded-xl border border-edge bg-surface-elevated p-4 text-sm text-ink-secondary">
        <p><strong>Participação e gestão de vários times:</strong> um usuário comercial pode participar de vários times e o mesmo gerente pode gerenciar mais de um time. Cada time mantém sua própria fila. Uma oportunidade com responsável individual aparece somente para ele, para o gerente formal do time e para administradores. Uma oportunidade sem responsável pertence à fila compartilhada e aparece para os membros comerciais daquele time.</p>
      </div>
      {error && <div className="mb-5 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>}

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
                <div className="flex items-center gap-2">
                  {canDistributeTeam(team) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/oportunidades/distribuicao?teamId=${team.id}`); }}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand/10"
                    >
                      Distribuir leads
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); openAddMember(team.id); }}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand/10"
                  >
                    + Membro
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(team); }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-ink-secondary transition hover:bg-brand/10 hover:text-brand"
                  >
                    Editar
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(team.id); }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-ink-tertiary transition hover:bg-danger/10 hover:text-danger"
                  >
                    Excluir
                  </button>
                </div>
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
                          className="flex items-center justify-between rounded-lg border border-edge/70 bg-surface-canvas/30 px-4 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-ink-secondary">
                              {member.user?.name?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-ink">{member.user?.name || 'Usuário'}</p>
                              <p className="text-xs text-ink-tertiary">
                                {member.user?.email || ''}
                                {teamCountForUser(member.userId) > 1 ? ` · participa de ${teamCountForUser(member.userId)} times` : ''}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveMember(team.id, member.userId)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-ink-tertiary transition hover:bg-danger/10 hover:text-danger"
                          >
                            Remover
                          </button>
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

      {(mode === 'create' || mode === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-ink">
              {mode === 'create' ? 'Novo Time' : 'Editar Time'}
            </h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">Nome do Time</label>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="block w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">Gerente (opcional)</label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className="block w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                >
                  <option value="">Sem gerente</option>
                  {managerCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink-tertiary">Somente gerentes, administradores ou proprietários podem ser responsáveis formais pelo time.</p>
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

      {mode === 'add-member' && selectedTeamId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-ink">Adicionar Membro</h2>
            <p className="mt-1 text-sm text-ink-tertiary">O mesmo usuário pode participar de mais de um time. O acesso às oportunidades respeita o responsável individual e a fila de cada time.</p>
            <form onSubmit={handleAddMember} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-secondary">Usuário</label>
                <select
                  value={newMemberUserId}
                  onChange={(e) => setNewMemberUserId(e.target.value)}
                  className="block w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  required
                >
                  <option value="">Selecione...</option>
                  {availableUsers(selectedTeamId).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink-tertiary">Um usuário pode participar de vários times. Apenas perfis comerciais aparecem nesta lista.</p>
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
                  disabled={saving || !newMemberUserId}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
                >
                  {saving ? 'Adicionando...' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-xl border border-edge bg-surface-elevated p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-ink">Excluir Time</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              Tem certeza que deseja excluir este time? Times com oportunidades vinculadas precisam ter essas oportunidades transferidas antes da exclusão.
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

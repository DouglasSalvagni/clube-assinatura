export interface FairDistributionItem {
  id: string;
  ownerUserId: string | null;
  createdAt: Date;
}

export interface FairDistributionResult {
  assignments: Map<string, string>;
  finalCounts: Record<string, number>;
}

/**
 * Distribui os itens mais antigos primeiro para o membro com menor carga.
 * Em empates, a ordem estável de memberIds evita resultados aleatórios e,
 * como a carga é atualizada a cada item, chamadas sucessivas continuam
 * alternando os responsáveis naturalmente.
 */
export function distributeFairly(
  items: FairDistributionItem[],
  memberIds: string[],
  baseCounts: Record<string, number>,
): FairDistributionResult {
  const orderedMembers = [...new Set(memberIds)];
  const counts: Record<string, number> = Object.fromEntries(
    orderedMembers.map((userId) => [userId, Number(baseCounts[userId] || 0)]),
  );
  const assignments = new Map<string, string>();
  if (!orderedMembers.length) return { assignments, finalCounts: counts };

  const orderedItems = [...items].sort((left, right) => {
    const time = left.createdAt.getTime() - right.createdAt.getTime();
    return time || left.id.localeCompare(right.id);
  });

  for (const item of orderedItems) {
    const leastLoaded = orderedMembers.reduce((best, candidate) => {
      if (counts[candidate] < counts[best]) return candidate;
      return best;
    }, orderedMembers[0]);
    const currentOwnerIsFair = Boolean(
      item.ownerUserId
      && counts[item.ownerUserId] !== undefined
      && counts[item.ownerUserId] === counts[leastLoaded],
    );
    const owner = currentOwnerIsFair ? item.ownerUserId! : leastLoaded;
    assignments.set(item.id, owner);
    counts[owner] += 1;
  }

  return { assignments, finalCounts: counts };
}

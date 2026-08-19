import 'reflect-metadata';
import AppDataSource from '../../src/database/data-source';
import {
  Contract,
  ContractStatus,
  Opportunity,
  Subscription,
} from '../../src/database/entities';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const unitArg = process.argv.find((arg) => arg.startsWith('--unit='));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const unitId = unitArg?.split('=')[1]?.trim() || null;
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : undefined;

function absent(value: unknown) {
  return value === null || value === undefined || value === '';
}

function setIfAbsent(target: Record<string, any>, key: string, value: unknown) {
  if (!absent(value) && absent(target[key])) {
    target[key] = value;
    return true;
  }
  return false;
}

async function run() {
  await AppDataSource.initialize();
  const subscriptions = AppDataSource.getRepository(Subscription);
  const contracts = AppDataSource.getRepository(Contract);
  const opportunities = AppDataSource.getRepository(Opportunity);

  const rows = await subscriptions.find({
    where: unitId ? { unitId } : {},
    order: { createdAt: 'ASC' },
    ...(limit ? { take: limit } : {}),
  });

  const report = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    scanned: rows.length,
    changed: 0,
    unchanged: 0,
    unresolved: 0,
    contractSource: 0,
    opportunityFallback: 0,
    unresolvedSubscriptions: [] as string[],
  };

  for (const subscription of rows) {
    const metadata = { ...(subscription.metadata || {}) };
    let source = 'existing';
    let contract: Contract | null = null;
    let opportunity: Opportunity | null = null;

    if (subscription.sourceOpportunityId) {
      contract = await contracts.findOne({
        where: {
          unitId: subscription.unitId,
          opportunityId: subscription.sourceOpportunityId,
          status: ContractStatus.ACCEPTED,
        },
        order: { version: 'DESC' },
      });
      opportunity = await opportunities.findOne({
        where: { unitId: subscription.unitId, id: subscription.sourceOpportunityId },
      });
    }

    const contractNegotiation = contract?.snapshot?.negotiation || null;
    const existingNegotiation = metadata.negotiationSnapshot || null;
    const opportunityNegotiation = opportunity?.negotiationSnapshot || null;
    const negotiation = contractNegotiation || existingNegotiation || opportunityNegotiation || null;

    if (contractNegotiation) source = 'accepted_contract';
    else if (!existingNegotiation && opportunityNegotiation) source = 'opportunity_fallback';

    let changed = false;
    if (contract) {
      changed = setIfAbsent(metadata, 'contractId', contract.id) || changed;
      changed = setIfAbsent(metadata, 'contractVersion', contract.version) || changed;
      changed = setIfAbsent(metadata, 'contractHash', contract.contentHash) || changed;
      changed = setIfAbsent(metadata, 'contractRelationType', contract.relationType) || changed;
    }
    if (negotiation) {
      if (!existingNegotiation) {
        metadata.negotiationSnapshot = negotiation;
        changed = true;
      }
      changed = setIfAbsent(metadata, 'customerType', negotiation.customerType || opportunity?.customerType) || changed;
      changed = setIfAbsent(metadata, 'contractedLives', negotiation.participants?.contractedLives) || changed;
      changed = setIfAbsent(metadata, 'contractedDependents', negotiation.participants?.dependentCount) || changed;
      changed = setIfAbsent(metadata, 'contractedAmount', negotiation.pricing?.finalAmount) || changed;
      changed = setIfAbsent(metadata, 'billingCycle', negotiation.cycle || opportunity?.billingCycle) || changed;
      changed = setIfAbsent(
        metadata,
        'billingType',
        negotiation.billingType || negotiation.allowedBillingTypes?.[0] || opportunity?.billingType,
      ) || changed;
    }

    const hasSafeFinancialSnapshot = !absent(metadata.negotiationSnapshot?.pricing?.finalAmount)
      && !absent(metadata.billingCycle);
    if (!hasSafeFinancialSnapshot) {
      report.unresolved += 1;
      report.unresolvedSubscriptions.push(subscription.id);
      // Não usamos PlanPrice/tabela atual como fallback: isso poderia reprecificar
      // silenciosamente contratos históricos cujo preço original não é recuperável.
      continue;
    }

    if (!changed) {
      report.unchanged += 1;
      continue;
    }

    metadata.historicalBackfill = {
      version: 1,
      source,
      appliedAt: new Date().toISOString(),
      safePriceSource: source === 'accepted_contract'
        ? 'CONTRACT_SNAPSHOT'
        : source === 'opportunity_fallback'
          ? 'OPPORTUNITY_SNAPSHOT'
          : 'EXISTING_SUBSCRIPTION_METADATA',
    };
    subscription.metadata = metadata;
    if (apply) await subscriptions.save(subscription);
    report.changed += 1;
    if (source === 'accepted_contract') report.contractSource += 1;
    if (source === 'opportunity_fallback') report.opportunityFallback += 1;
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.unresolved > 0) {
    console.warn(
      'Existem assinaturas sem snapshot financeiro histórico seguro. Elas não foram reprecificadas; revise manualmente os IDs listados.',
    );
  }
  await AppDataSource.destroy();
}

run().catch(async (error) => {
  console.error(error);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});

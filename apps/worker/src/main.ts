import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Job, Worker } from 'bullmq';
import { config as loadEnv } from 'dotenv';
import IORedis from 'ioredis';

const envCandidates = [
  resolve(__dirname, '../../../.env'),
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/0';
const apiUrl = (
  process.env.API_INTERNAL_URL ?? 'http://localhost:4003/api'
).replace(/\/$/, '');
const internalToken = process.env.INTERNAL_WORKER_TOKEN?.trim();

if (!internalToken) {
  throw new Error(
    'INTERNAL_WORKER_TOKEN is required. Define it in the monorepo root .env.',
  );
}
const workerToken: string = internalToken;

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'billing-webhooks',
  async (job: Job<{ eventId: string }>) => {
    const eventId = job.data?.eventId;

    if (!eventId) {
      throw new Error('Webhook job without eventId');
    }

    const response = await fetch(
      `${apiUrl}/internal/webhooks/${encodeURIComponent(eventId)}/process`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-worker-token': workerToken,
        },
        signal: AbortSignal.timeout(60_000),
      },
    );

    const body = await response.text();

    if (!response.ok) {
      throw new Error(
        `API returned ${response.status}: ${body.slice(0, 1000)}`,
      );
    }

    return body ? JSON.parse(body) : { ok: true };
  },
  {
    connection,
    concurrency: Number(process.env.WEBHOOK_WORKER_CONCURRENCY ?? 10),
    limiter: {
      max: Number(process.env.WEBHOOK_WORKER_RATE_LIMIT ?? 100),
      duration: 1000,
    },
  },
);

const delinquencyIntervalMs = Math.max(
  60_000,
  Number(process.env.DELINQUENCY_ENFORCEMENT_INTERVAL_MS ?? 3_600_000),
);

async function enforceDelinquencyGrace(): Promise<void> {
  try {
    const response = await fetch(`${apiUrl}/internal/subscriptions/enforce-delinquency`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-worker-token': workerToken,
      },
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${body.slice(0, 1000)}`);
    }
    console.log(`[worker] delinquency enforcement ${body || '{\"ok\":true}'}`);
  } catch (error) {
    console.error('[worker] delinquency enforcement failed', error);
  }
}

const delinquencyTimer = setInterval(() => {
  void enforceDelinquencyGrace();
}, delinquencyIntervalMs);
delinquencyTimer.unref();
setTimeout(() => void enforceDelinquencyGrace(), 15_000).unref();

worker.on('ready', () => {
  console.log('[worker] billing-webhooks ready');
});

worker.on('completed', (job) => {
  console.log(`[worker] completed ${job.id}`);
});

worker.on('failed', (job, error) => {
  console.error(`[worker] failed ${job?.id ?? 'unknown'}`, error);
});

worker.on('error', (error) => {
  console.error('[worker] error', error);
});

async function shutdown(signal: string): Promise<void> {
  clearInterval(delinquencyTimer);
  console.log(`[worker] shutting down after ${signal}`);
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

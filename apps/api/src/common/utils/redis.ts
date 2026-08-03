export interface RedisConnectionOptions {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
}

export function redisConnectionOptions(raw = process.env.REDIS_URL || 'redis://localhost:6379/0'): RedisConnectionOptions {
  const url = new URL(raw);
  const database = url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0;
  const options: RedisConnectionOptions = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number.isFinite(database) ? database : 0,
    maxRetriesPerRequest: null,
  };

  if (url.username) options.username = decodeURIComponent(url.username);
  if (url.password) options.password = decodeURIComponent(url.password);
  if (url.protocol === 'rediss:') options.tls = {};
  return options;
}

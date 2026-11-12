export interface EnvironmentConfig {
  appEnv: 'local' | 'test' | 'staging' | 'production'; environment: 'test' | 'live'; paymentMode: 'fixture' | 'paystack';
  paiMode: 'fixture' | 'sandbox' | 'disabled'; gramlMode: 'fixture' | 'readonly' | 'disabled';
  origin: string; redisUrl: string;
}
export function loadEnvironment(): EnvironmentConfig {
  const appEnv = process.env.APP_ENV;
  const environment = process.env.DATA_ENV;
  const paymentMode = process.env.PAYMENT_MODE;
  const paiMode = process.env.PAI_MODE;
  const gramlMode = process.env.GRAML_MODE;
  if (!['local', 'test', 'staging', 'production'].includes(appEnv ?? '') || !['test', 'live'].includes(environment ?? '') || !['fixture', 'paystack'].includes(paymentMode ?? '') ||
      !['fixture', 'sandbox', 'disabled'].includes(paiMode ?? '') || !['fixture', 'readonly', 'disabled'].includes(gramlMode ?? '')) {
    throw new Error('Invalid runtime environment or provider mode');
  }
  if (appEnv === 'production' && environment !== 'live') throw new Error('Production requires DATA_ENV=live');
  if (environment === 'live' && paymentMode !== 'paystack') throw new Error('Live data requires PAYMENT_MODE=paystack');
  const origin = process.env.TRUSTED_ORIGIN;
  if (!origin) throw new Error('Explicit TRUSTED_ORIGIN required');
  const url = new URL(origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid TRUSTED_ORIGIN');
  for (const key of ['DATABASE_URL', 'REDIS_URL', 'BETTER_AUTH_SECRET', 'DELIVERY_KEY']) {
    if (!process.env[key]) throw new Error(`Missing required ${key}`);
  }
  if (environment === 'test' && !process.env.FIXTURE_WEBHOOK_SECRET) throw new Error('Missing required FIXTURE_WEBHOOK_SECRET');
  if (environment === 'live' && !process.env.PAYSTACK_SECRET_KEY) throw new Error('Missing required PAYSTACK_SECRET_KEY');
  if (Buffer.from(process.env.DELIVERY_KEY!, 'base64').length !== 32) throw new Error('DELIVERY_KEY must encode 32 bytes');
  return { appEnv, environment, paymentMode, paiMode, gramlMode, origin, redisUrl: process.env.REDIS_URL! } as EnvironmentConfig;
}
export const environment = loadEnvironment();

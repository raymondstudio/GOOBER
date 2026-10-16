export interface EnvironmentConfig {
  appEnv: 'local' | 'test'; environment: 'test'; paymentMode: 'fixture';
  paiMode: 'fixture' | 'sandbox' | 'disabled'; gramlMode: 'fixture' | 'readonly' | 'disabled';
  origin: string; redisUrl: string;
}
export function loadEnvironment(): EnvironmentConfig {
  const appEnv = process.env.APP_ENV;
  const environment = process.env.DATA_ENV;
  const paymentMode = process.env.PAYMENT_MODE;
  const paiMode = process.env.PAI_MODE;
  const gramlMode = process.env.GRAML_MODE;
  if (!['local', 'test'].includes(appEnv ?? '') || environment !== 'test' || paymentMode !== 'fixture' ||
      !['fixture', 'sandbox', 'disabled'].includes(paiMode ?? '') || !['fixture', 'readonly', 'disabled'].includes(gramlMode ?? '')) {
    throw new Error('M1 supports isolated test data and fixture funding only; unsafe modes rejected');
  }
  const origin = process.env.TRUSTED_ORIGIN;
  if (!origin) throw new Error('Explicit TRUSTED_ORIGIN required');
  const url = new URL(origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid TRUSTED_ORIGIN');
  for (const key of ['DATABASE_URL', 'REDIS_URL', 'BETTER_AUTH_SECRET', 'FIXTURE_WEBHOOK_SECRET', 'DELIVERY_KEY']) {
    if (!process.env[key]) throw new Error(`Missing required ${key}`);
  }
  if (Buffer.from(process.env.DELIVERY_KEY!, 'base64').length !== 32) throw new Error('DELIVERY_KEY must encode 32 bytes');
  return { appEnv, environment, paymentMode, paiMode, gramlMode, origin, redisUrl: process.env.REDIS_URL! } as EnvironmentConfig;
}
export const environment = loadEnvironment();

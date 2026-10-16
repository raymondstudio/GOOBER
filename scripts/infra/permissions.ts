import { Client } from 'pg';
const url = process.env.DIRECT_DATABASE_URL;
if (!url || process.env.DATA_ENV !== 'test' || !['local', 'test'].includes(process.env.APP_ENV ?? '')) throw new Error('Isolated test database configuration required');
const client = new Client({ connectionString: url });
await client.connect();
try {
  const runtimeUrl = new URL(process.env.DATABASE_URL!);
  if (runtimeUrl.username !== 'goober_runtime' || !/^[a-f0-9]{64}$/.test(runtimeUrl.password)) throw new Error('Expected isolated runtime role and generated password');
  const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', ['goober_runtime']);
  if (!existing.rowCount) {
    // Password is a locally generated strict hex literal; SQL identifiers are fixed constants.
    await client.query("CREATE ROLE goober_runtime LOGIN PASSWORD '" + runtimeUrl.password + "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
  }
  await client.query('GRANT USAGE ON SCHEMA public TO goober_runtime');
  await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO goober_runtime');
  await client.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO goober_runtime');
  await client.query('REVOKE DELETE, TRUNCATE ON "Journal", "Posting", "LedgerAccount", "AuditEvent", "ProviderAttempt", "Order", "Quote", "PaymentIntent", "Inbox", "Outbox", "IdempotencyRecord", "Delivery" FROM goober_runtime');
  await client.query('REVOKE UPDATE ON "Posting", "LedgerAccount", "AuditEvent" FROM goober_runtime');
  await client.query('REVOKE ALL ON "_prisma_migrations" FROM goober_runtime');
  const role = await client.query('SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=$1', ['goober_runtime']);
  if (!role.rows[0] || Object.values(role.rows[0]).some(Boolean)) throw new Error('Runtime database role has excessive privileges');
  const owner = await client.query('SELECT 1 FROM pg_tables WHERE schemaname=$1 AND tableowner=$2', ['public', 'goober_runtime']);
  if (owner.rowCount) throw new Error('Runtime database role must not own tables');
  console.log('Runtime role granted bounded application permissions; financial mutation and migration ownership denied.');
} finally { await client.end(); }

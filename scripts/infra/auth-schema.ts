import { getSchema } from 'better-auth/db';
import { auth } from '@goober/auth/server';
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@goober/db';
// Generate the maintained auth library schema; never serialize auth configuration/secrets.
try {
  const generated = getSchema(auth.options);
  const prismaSchema = readFileSync('packages/db/prisma/schema.prisma', 'utf8');
  const checked: Record<string, unknown> = {};
  for (const [name, table] of Object.entries(generated)) {
    const model = name.charAt(0).toUpperCase() + name.slice(1);
    const body = prismaSchema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1];
    if (!body) throw new Error(`Missing generated auth model ${model}`);
    const fields: Record<string, unknown> = {};
    for (const [field, attributes] of Object.entries(table.fields)) {
      if (!new RegExp(`\\b${field}\\s+`).test(body)) throw new Error(`Missing generated auth field ${model}.${field}`);
      fields[field] = { type: attributes.type, required: attributes.required ?? false, unique: attributes.unique ?? false, references: attributes.references ?? null };
    }
    checked[model] = { fields, indexes: table.indexes ?? [] };
  }
  writeFileSync('packages/auth/auth-schema.generated.json', JSON.stringify({ generator: 'better-auth/db.getSchema', version: '1.7.10', models: checked }, null, 2) + '\n');
  console.log('Generated maintained Better Auth schema and verified every required field exists in the reviewed Prisma schema.');
} finally { await prisma.$disconnect(); }

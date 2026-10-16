import { PrismaClient } from "../generated/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

export { Prisma, PrismaClient } from "../generated/client.ts";
export type * from "../generated/client.ts";

const globalForPrisma = globalThis as unknown as { gooberPrisma?: PrismaClient };
export const prisma = globalForPrisma.gooberPrisma ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [],
});
if (process.env.NODE_ENV !== "production") globalForPrisma.gooberPrisma = prisma;

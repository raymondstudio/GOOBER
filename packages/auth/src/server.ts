import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@goober/db";

function configuration() {
  if (!["local", "test"].includes(process.env.APP_ENV ?? "") || process.env.DATA_ENV !== "test") throw new Error("Explicit local/test auth environment required");
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.TRUSTED_ORIGIN ?? process.env.BETTER_AUTH_URL;
  if (!baseURL) throw new Error("Explicit auth origin required");
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  const origin = new URL(baseURL);
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== baseURL) {
    throw new Error("APP_ORIGIN must be an exact http(s) origin");
  }
  return { secret, baseURL, secure: origin.protocol === "https:" };
}
const config = configuration();

export const auth = betterAuth({
  secret: config.secret,
  baseURL: config.baseURL,
  trustedOrigins: [config.baseURL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
  user: { additionalFields: { role: { type: "string", defaultValue: "CUSTOMER", input: false } } },
  session: {
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 15,
    freshAge: 60 * 15,
    cookieCache: { enabled: false },
  },
  advanced: {
    cookiePrefix: "goober",
    useSecureCookies: config.secure,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: config.secure },
    ipAddress: { disableIpTracking: false, ipAddressHeaders: [] },
  },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
});

/** Every API call resolves current database session and user state. */
export async function getSession(headers: Headers) {
  return auth.api.getSession({ headers, query: { disableCookieCache: true } });
}

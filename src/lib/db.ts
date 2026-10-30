import { PrismaClient } from "@prisma/client";

/** Bump after Prisma schema field removals so a long-lived Next process drops the old client. */
const PRISMA_CLIENT_REV = 6;

const globalForPrisma = globalThis as unknown as {
  prismaClient?: PrismaClient;
  prismaRev?: number;
};

/** One function instance = one pooled client. Netlify sets NETLIFY=true. */
function isServerless() {
  return process.env.NETLIFY === "true" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function withPoolParams(raw: string | undefined, opts: { pgbouncer: boolean; limit: string }) {
  if (!raw) return raw;
  const q = raw.indexOf("?");
  const base = q >= 0 ? raw.slice(0, q) : raw;
  const params = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : "");
  params.set("connection_limit", opts.limit);
  if (!params.has("pool_timeout")) params.set("pool_timeout", "10");
  if (opts.pgbouncer) {
    if (!params.has("pgbouncer")) params.set("pgbouncer", "true");
  } else {
    params.delete("pgbouncer");
  }
  return `${base}?${params.toString()}`;
}

function runtimeUrl() {
  const serverless = isServerless();
  const limit = process.env.PRISMA_CONNECTION_LIMIT ?? (serverless ? "1" : "5");
  // Queries always use the pooler (DATABASE_URL). DIRECT_URL is only for prisma migrate.
  return withPoolParams(process.env.DATABASE_URL, { pgbouncer: serverless, limit });
}

function createClient() {
  const url = runtimeUrl();
  const isDev = process.env.NODE_ENV === "development";
  const client = new PrismaClient({
    log: isDev
      ? [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "info" },
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" },
        ]
      : [{ emit: "stdout", level: "error" }],
    ...(url ? { datasources: { db: { url } } } : {}),
  });

  if (isDev) {
    client.$on("query", (e) => {
      console.log(`prisma:query ${e.duration}ms ${e.query}`);
    });
  }

  return client;
}

if (globalForPrisma.prismaRev !== PRISMA_CLIENT_REV) {
  const previous = globalForPrisma.prismaClient;
  globalForPrisma.prismaClient = undefined;
  globalForPrisma.prismaRev = PRISMA_CLIENT_REV;
  if (previous) {
    setTimeout(() => {
      previous.$disconnect().catch(() => undefined);
    }, 8_000);
  }
}

export const prisma = globalForPrisma.prismaClient ?? createClient();
globalForPrisma.prismaClient = prisma;

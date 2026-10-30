import { PrismaClient } from "@prisma/client";

/** Netlify functions are short-lived and many run at once: one connection each, through the pooler. */
function pooledUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  const serverless = process.env.NETLIFY === "true" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  url.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT ?? (serverless ? "1" : "5"));
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "10");
  if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "15");
  if (serverless && !url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
  return url.toString();
}

function createClient() {
  const url = pooledUrl();
  const client = new PrismaClient({
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
  return client;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? createClient();
globalForPrisma.prisma = prisma;

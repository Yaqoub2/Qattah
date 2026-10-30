import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  // Receipts are capped at 4 MB in storage.ts; Netlify functions accept up to 6 MB per request.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default withNextIntl(nextConfig);

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    serverActions: {
      // The canonical vehicle-document upload bound is 10 MiB
      // (MAX_VEHICLE_DOCUMENT_BYTES in services/customer-vehicle-log/documents.ts).
      // Next 15 Server Actions default to a 1 MB body limit and reject 413 before
      // our validation runs, so we must raise it. The multipart body carries the
      // file plus form fields and boundary overhead, hence the 11 MB margin —
      // enough for any canonical-valid payload (<11 MiB) while still rejecting
      // oversize bodies before the storage upload.
      bodySizeLimit: "11mb",
    },
  },
  async redirects() {
    return [
      {
        source: "/cliente",
        destination: "/demo/cliente",
        permanent: true,
      },
      {
        source: "/demo/prestador",
        destination: "/prestador",
        permanent: true,
      },
      {
        source: "/demo/prestador/atendimento/:id",
        destination: "/prestador/atendimento/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

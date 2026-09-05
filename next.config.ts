import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
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

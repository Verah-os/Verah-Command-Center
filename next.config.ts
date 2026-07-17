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
        source: "/prestador",
        destination: "/demo/prestador",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

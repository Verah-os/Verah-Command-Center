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
    ];
  },
};

export default nextConfig;

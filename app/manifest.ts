import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VERAH — Jornada Cliente Demo",
    short_name: "VERAH Demo",
    description: "Experiência cliente demonstrativa com dados sintéticos.",
    start_url: "/demo/cliente/piloto",
    scope: "/demo/cliente/piloto",
    display: "standalone",
    background_color: "#232323",
    theme_color: "#1A1A1A",
    lang: "pt-BR",
    icons: [
      {
        src: "/customer-demo-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/customer-demo-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

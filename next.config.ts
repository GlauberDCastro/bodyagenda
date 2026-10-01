import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Despesas fixas viraram aba de Configurações; o link antigo continua valendo.
  async redirects() {
    return [
      { source: "/financeiro/despesas", destination: "/configuracoes/despesas", permanent: true },
    ];
  },
};

export default nextConfig;

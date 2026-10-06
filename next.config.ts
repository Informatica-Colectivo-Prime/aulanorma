// Configuración de Next.js (research.md, R1; plan.md, «Configuración de
// Next.js»). Next.js solo atiende lo que delega la frontera HTTP de
// `server.mjs`: sin `rewrites`, `headers`, `redirects`, middleware ni `proxy`.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No revela el framework con `X-Powered-By`.
  poweredByHeader: false,
  // Sin optimizador de imágenes en `/_next/image`: no hace falta y es superficie
  // de ataque.
  images: { unoptimized: true },
  // Sin registro automático de la única URL que delega la frontera (FR-008).
  logging: { incomingRequests: { ignore: [/^\/api\/health$/] } },
};

export default nextConfig;

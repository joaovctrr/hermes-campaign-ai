import { createFileRoute } from "@tanstack/react-router";

/**
 * Catch-all do better-auth. Encaminha GET/POST de /api/auth/* para o handler.
 * Substitui os endpoints do Supabase Auth (GoTrue). Carrega a instância
 * server-only dinamicamente para não vazar `pg` ao bundle do cliente.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { auth } = await import("@/lib/auth.server");
        return auth.handler(request);
      },
      POST: async ({ request }) => {
        const { auth } = await import("@/lib/auth.server");
        return auth.handler(request);
      },
    },
  },
});

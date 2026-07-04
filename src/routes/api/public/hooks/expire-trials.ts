import { createFileRoute } from "@tanstack/react-router";
import { authorizePublicHook } from "@/lib/public-hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/expire-trials")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = authorizePublicHook(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("expire_trials_without_payment", {
          _fallback_plan: "bloqueado",
        });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: true, expired: data ?? 0 }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

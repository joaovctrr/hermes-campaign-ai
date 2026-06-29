import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/expire-trials")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

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
